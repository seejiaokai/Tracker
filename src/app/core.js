/* ============================================================================
   OCU Progress Tracker — core application state, logic and flow-board engine.
   This is a faithful port of the original single-file app's main script.
   React components subscribe via subscribe()/getVersion() and read the
   exported live bindings; the flow chart itself is rendered imperatively
   into the #board container (exactly as the original did), because its
   editor relies on direct-DOM manipulation for drag/pan performance.
   ========================================================================== */
import { SYLLABI, SYL_NAMES, DEFAULT_SYL_NAME, DEFAULT_SYL_ORDER } from '../data/syllabi.js';
import { DEFAULT_LAYOUTS } from '../data/layouts.js';
import { EVENT_INFO, EVENT_INFO_BY_SYL } from '../data/eventInfo.js';
import { SEED_STATE, SEED_STAMP } from '../data/seedState.js';
import { storage, flushNow, loadLatest, cloudButtonClick, setCloudSinks, getCloudCache, cloudCfg } from '../sync/cloud.js';
import * as FMT from './fileFormat.js';
import * as FS from './fileStore.js';
import { findEvents } from './eventOrder.js';

export { SYLLABI, SYL_NAMES, DEFAULT_SYL_NAME, DEFAULT_SYL_ORDER, DEFAULT_LAYOUTS, EVENT_INFO };
export { cloudButtonClick };

/* ---------- change notification (React integration) ---------- */
let version = 0;
const listeners = new Set();
export function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function getVersion() { return version; }
export function notify() { version++; listeners.forEach(f => { try { f(); } catch (e) {} }); }
/* the original called these to repaint the header/side panel; in React they
   are all just "something changed, re-render from state" */
const renderSide = notify;
const refreshSyl = notify;
const refreshActive = notify;
const refreshCourses = notify;

export const DEFAULT_SYLLABUS = SYLLABI[DEFAULT_SYL_NAME];
export const TYPE_COLOR = { flight: '#19b6e8', acad: '#27d64a', test: '#ff4040', sim: '#ffe000', device: '#a64bff' };
const DARKC = new Set(['sim', 'acad', 'na']); // labels needing dark text on light fills
export const GRADE_FILL = { dco: '#000000', dpco: '#1f6dff', marg: '#27d64a', na: '#cdbb8e' };
export const DONE = new Set(['dco', 'dpco', 'marg']);
export let eventInfo = {}; export let showDetails = false;
/* Keep only fields that genuinely differ from the baked base. Files used to
   carry the WHOLE info table and applyCharts stored it verbatim, freezing every
   event to the values of the day the file was saved — which sat above the
   per-syllabus profiles and quietly clobbered them. Scrubbing on load heals
   stores polluted that way; it never touches a real user edit. */
/* __kept marks fields the user typed deliberately even though they match the
   baked base. That happens on a renumbered syllabus: Tx's SA-5 ships with
   "(Refer to BCTM SA-6)" on the end, so deleting that note leaves exactly the
   base wording — indistinguishable, by value alone, from a field a file merely
   carried along. Scrubbing pruned it and the note came back on the next load.
   The marker is what tells the two apart; a file's bulk table has none, so it
   is still pruned exactly as before. */
function scrubEventInfo() {
  for (const k of Object.keys(eventInfo)) {
    const base = EVENT_INFO[k] || {}; const o = eventInfo[k]; const diff = {};
    const kept = Array.isArray(o.__kept) ? o.__kept : [];
    Object.keys(o).forEach(f => {
      if (f === '__kept') return;
      if ((o[f] || '') !== (base[f] || '') || kept.includes(f)) diff[f] = o[f];
    });
    const stillKept = kept.filter(f => f in diff);
    if (stillKept.length) diff.__kept = stillKept;
    if (Object.keys(diff).filter(f => f !== '__kept').length) eventInfo[k] = diff; else delete eventInfo[k];
  }
}
async function loadEventInfo() {
  try { const r = await sGet('v3:eventinfo'); eventInfo = r ? JSON.parse(r) : {}; } catch (e) { eventInfo = {}; }
  scrubEventInfo();
}
async function saveEventInfo() { await sSet('v3:eventinfo', JSON.stringify(eventInfo)); }
/* Base info, then the active syllabus's own profile for that id (the short
   course renumbers sorties, so e.g. its BFM-5 flies the BFM-7 profile), then
   the user's own edits on top. */
export function infoFor(id) {
  const bySyl = (EVENT_INFO_BY_SYL[curSyl()] || {})[id];
  return Object.assign({}, EVENT_INFO[id] || {}, bySyl || {}, eventInfo[id] || {});
}
/* Prereq wording for display: the free-text note if there is one, otherwise the
   actual chart links. */
export function preText(id) {
  const d = infoFor(id); if (d.pre) return d.pre;
  const e = byid[id]; const ps = e && e.prereqs || []; return ps.length ? ps.join(', ') : '';
}
export function infoHtml(id) {
  const d = infoFor(id); const rows = [];
  if (d.fmt) rows.push('<b>Type:</b> ' + escapeId(d.fmt) + (d.hrs ? ' · ' + escapeId(d.hrs) : ''));
  if (d.crew) rows.push('<b>Crew:</b> ' + escapeId(d.crew));
  { const p = preText(id); if (p) rows.push('<b>Prerequisites:</b> ' + escapeId(p)); }
  const nm = d.name ? ('<div style="font-weight:600;margin-bottom:3px">' + escapeId(d.name) + '</div>') : '';
  return nm + (rows.length ? rows.join('<br>') : '<span class="mini">No details yet — tap Edit details.</span>');
}
export const NEXT_CATS = [
  { key: 'CFT', label: 'Next CFT', pred: e => /^CFT/.test(e.id) },
  { key: 'IAT', label: 'Next IAT', pred: e => /^IAT/.test(e.id) },
  { key: 'CPT', label: 'Next CPT (sim)', pred: e => e.type === 'sim' },
  { key: 'FLT', label: 'Next Syllabus Flt', pred: e => e.type === 'flight' },
];
export const BUCKETS = [
  { key: 'flight', label: 'Flights', types: ['flight'] },
  { key: 'acad', label: 'Acad / Spec', types: ['acad'] },
  { key: 'sim', label: 'Sims', types: ['sim'] },
  { key: 'device', label: 'IAT/CFT/EPT', types: ['device'] },
  { key: 'test', label: 'Tests', types: ['test'] },
];

/* ---------- storage ---------- */
const mem = {};
async function sGet(k) { try { const r = await storage.get(k); return r ? r.value : null; } catch (e) { return mem[k] ?? null; } }
async function sSet(k, v) { mem[k] = v; setSaveStatus('', 'saving'); try { await storage.set(k, v); setSaveStatus('', 'ok'); } catch (e) { setSaveStatus('local only', 'ok'); } }

/* ---------- this browser's own preferences ----------
   Which course and which crew member you were last on is a view preference,
   not data. Everything that goes through sSet lands in ONE SharePoint file
   that the whole team shares, so storing it there would let whoever used the
   app last decide what opens for everybody else.
   The prefix matters: sync/local.js sweeps EVERY "ocu:" localStorage key into
   that shared map on its fallback path, so this deliberately sits outside it.
   Both calls swallow their errors (Safari private mode), which means a store
   that cannot be read degrades to "opens on the first course" rather than
   breaking the boot. */
const PP = 'ocuLocal:';
function prefGet(k) { try { return localStorage.getItem(PP + k); } catch (e) { return null; } }
function prefSet(k, v) { try { localStorage.setItem(PP + k, v); } catch (e) {} }

/* ---------- app state ---------- */
export let COURSES = [], course = null, active = null;
export let SYL = [], byid = {}, roster = [], marks = {}, dates = {}, plan = {};
export let lulls = {};   /* {student: [{start,end}]} for the current course */
export let lastEdit = {};   /* {student: {syl, event}} for the current course */
export let pace = {};   /* {student: {epw, target, target2}} for the current course */
export let calView = new Date();
/* True while boot migrations and course switches are writing, so they do not
   flag the user's file as having unsaved work. See touched(). */
let loading = true;
export let arrangeMode = false, layout = {}, drag = null, AUTO = {}, BORROW = null;
/* ---- per-edge routing metadata layered on top of the prereq graph ---- */
let edgeMeta = {}, merges = new Set(), unmerges = new Set(), selEdge = null, mergeFirst = null, selBalls = new Set(), redoStack = [], alignGuides = [];
function ekey(p, c) { return p + '▸' + c; }
function mkey(a, b) { return [a, b].sort().join('|'); }
/* --- crossing hops: see original comments --- */
const LK = '\u0000L';
function lkey(id) { return LK + id; }
function isLineKey(k) { return typeof k === 'string' && k.slice(0, 2) === LK; }
function hopDefault(k1, k2) { return !(isLineKey(k1) || isLineKey(k2)); }
function hasHop(k1, k2) {
  const mk = mkey(k1, k2);
  return hopDefault(k1, k2) ? !merges.has(mk) : unmerges.has(mk);
}
function setHop(k1, k2, want) {
  const mk = mkey(k1, k2);
  if (hopDefault(k1, k2)) { if (want) merges.delete(mk); else merges.add(mk); }
  else { if (want) unmerges.add(mk); else unmerges.delete(mk); }
}
function loadEdgeMeta() {
  let em = (layout && layout.__edgeMeta), mg = (layout && layout.__merges), un = (layout && layout.__unmerges);
  if (!em || !Object.keys(em).length) { /* fall back to the built-in default's routing metadata */
    const dl = DEFAULT_LAYOUTS[curSyl()];
    if (dl && dl.__edgeMeta) em = JSON.parse(JSON.stringify(dl.__edgeMeta));
    if ((!mg || !mg.length) && dl && dl.__merges) mg = JSON.parse(JSON.stringify(dl.__merges));
    /* kept-hop pairs ship with a default chart too: without this, an arrow
       crossing a shipped drawn line renders flush and reads as a junction */
    if ((!un || !un.length) && dl && dl.__unmerges) un = JSON.parse(JSON.stringify(dl.__unmerges));
  }
  edgeMeta = em || {}; merges = new Set(mg || []);
  unmerges = new Set(un || []);
}
function saveEdgeMeta() { layout.__edgeMeta = edgeMeta; layout.__merges = [...merges]; layout.__unmerges = [...unmerges]; }
function ballFontFor(id) { const f = layout.__font || {}; return f[id] || f.__all || 8.5; }
export function rowOf(id) { return Math.round((nodePos(id).y || 0) / 92); }

/* ---------- hint bar (arrhint) ---------- */
export let hintBase = 'Select: drag a box on empty space to pick several balls, then drag any of them to move the group.';
export let hintFlash = null; let hintT = null;
function flashHint(msg) {
  hintFlash = msg; notify();
  clearTimeout(hintT); hintT = setTimeout(() => { hintFlash = null; notify(); }, 1800);
}

const kCourses = 'v3:courses';
/* ---- syllabi are global (see original comments) ---- */
const SYL_NS = 'v3:master';
const kSyl = c => 'v3:' + c + ':syl';
const kRoster = c => 'v3:' + c + ':roster';                  /* legacy: whole-course roster */
const kRosterFor = (c, syl) => 'v3:' + c + ':' + syl + ':roster'; /* roster: per course, per syllabus */
const kRosterMig = c => 'v3:' + c + ':rostermig';            /* one-shot legacy-roster split flag */
const kPlan = c => 'v3:' + c + ':plan';
/* Lull periods are stretches of real time, not properties of a syllabus, so
   they hang off the course and the student — NOT off kDates, which is keyed by
   syllabus and would drop them the moment the user switched. */
const kLulls = (c, s) => 'v3:' + c + ':lulls:' + s;
/* Pace and the two end dates, per student. They used to live on the course, so
   every student on a course shared one target and one events-per-week — which is
   wrong: students run at their own rate and finish on their own date. */
const kPace = (c, s) => 'v3:' + c + ':pace:' + s;
/* Where each student was last marking, so opening the app does not start at the
   top of a 10,000px chart every time. */
const kLast = (c, s) => 'v3:' + c + ':last:' + s;
const kLastStudent = c => 'v3:' + c + ':lastStudent';
export function curSyl() { return (plan && plan.sylName) || DEFAULT_SYL_NAME; }
const kMarks = (c, s) => 'v3:' + c + ':' + curSyl() + ':m:' + s;
const kDatesOld = (c, s) => 'v3:' + c + ':d:' + s;              /* legacy: dates per course only */
const kDates = (c, s) => 'v3:' + c + ':' + curSyl() + ':d:' + s;
const kDatesFor = (c, syl, s) => 'v3:' + c + ':' + syl + ':d:' + s;
const kLayout = () => SYL_NS + ':lay:' + curSyl();
const kLayoutOwn = () => 'v3:lay:' + course + ':' + curSyl();
const kLayoutOldMaster = () => 'v3:lay:SYLLABUS EDIT:' + curSyl();
async function loadLayout() {
  let r = await sGet(kLayout());
  if (!r) { /* adopt an existing chart: previous master course first, then this course's own */
    const prev = await sGet(kLayoutOldMaster()) || await sGet(kLayoutOwn());
    if (prev) { r = prev; await sSet(kLayout(), prev); }
  }
  layout = r ? JSON.parse(r) : {}; loadLineDefaults(); loadEdgeMeta();
}
/* Adopt shipped default __lines / __derived only when the key is ABSENT. */
function loadLineDefaults() {
  const n = curSyl();
  const dl = DEFAULT_LAYOUTS[n] || (SYL_ALIAS && SYL_ALIAS[n] ? DEFAULT_LAYOUTS[SYL_ALIAS[n]] : null);
  if (!dl) return;
  if (!Array.isArray(layout.__lines) && Array.isArray(dl.__lines))
    layout.__lines = JSON.parse(JSON.stringify(dl.__lines));
  if (!Array.isArray(layout.__derived) && Array.isArray(dl.__derived))
    layout.__derived = JSON.parse(JSON.stringify(dl.__derived));
  /* shipped per-ball font sizes (wide labels) must reach a first visit too */
  if (layout.__font == null && dl.__font)
    layout.__font = JSON.parse(JSON.stringify(dl.__font));
}
async function saveLayout() { saveEdgeMeta(); await sSet(kLayout(), JSON.stringify(layout)); }

const kSyls = c => SYL_NS + ':syls';                       /* syllabus definitions: global */
const kSylsOwn = c => 'v3:' + c + ':syls';
const kSylsOldMaster = () => 'v3:SYLLABUS EDIT:syls';
const kMarksFor = (c, syl, s) => 'v3:' + c + ':' + syl + ':m:' + s;  /* marks: per course, per student */
const kLayoutFor = (c, syl) => SYL_NS + ':lay:' + syl;
/* Count only REAL node positions in a layout object, ignoring metadata keys. */
function layoutNodeCount(lay) {
  let n = 0; if (!lay) return 0;
  for (const k in lay) { if (k.indexOf('__') === 0) continue; const v = lay[k]; if (v && typeof v.x === 'number' && typeof v.y === 'number') n++; }
  return n;
}
/* Pick the built-in default layout that shares the most event IDs with the current SYL. */
function bestDefaultLayout() {
  const ids = new Set(SYL.map(e => e.id)); let best = null, bestN = 0;
  for (const k in DEFAULT_LAYOUTS) { const dl = DEFAULT_LAYOUTS[k]; if (!dl) continue; let n = 0; for (const id in dl) if (ids.has(id)) n++; if (n > bestN) { bestN = n; best = dl; } }
  return best;
}
/* Build a COMPLETE {id:{x,y}} for every event in the current SYL. */
async function snapshotLayout(srcName) {
  const out = {}; let saved = null;
  try { const r = await sGet(kLayoutFor(course, srcName)); if (r) saved = JSON.parse(r); } catch (_) {}
  const own = DEFAULT_LAYOUTS[srcName] || null, borrow = bestDefaultLayout();
  const auto = computeFlow().pos;
  SYL.forEach(e => {
    const id = e.id;
    const p = (layout && layout[id]) || (saved && saved[id]) || (own && own[id]) || (borrow && borrow[id]) || auto[id] || { x: 60, y: 60 };
    out[id] = { x: p.x, y: p.y };
  });
  /* carry over line-routing metadata so arrows/merges/fonts copy too */
  if (layout && layout.__edgeMeta) out.__edgeMeta = JSON.parse(JSON.stringify(layout.__edgeMeta));
  if (layout && layout.__merges) out.__merges = JSON.parse(JSON.stringify(layout.__merges));
  if (layout && layout.__unmerges) out.__unmerges = JSON.parse(JSON.stringify(layout.__unmerges));
  if (layout && layout.__font) out.__font = JSON.parse(JSON.stringify(layout.__font));
  if (layout && layout.__lines) out.__lines = JSON.parse(JSON.stringify(layout.__lines));
  if (layout && layout.__derived) out.__derived = JSON.parse(JSON.stringify(layout.__derived));
  return out;
}
/* Like snapshotLayout(), but for ANY syllabus: takes the event list rather than
   reading the live SYL, so a file can carry syllabi that are not on screen. */
export async function layoutSnapshotFor(name, events) {
  const out = {};
  let saved = null;
  try { const r = await sGet(kLayoutFor(course, name)); if (r) saved = JSON.parse(r); } catch (_) {}
  const own = DEFAULT_LAYOUTS[name] || null;
  const live = (name === curSyl() && layout) ? layout : null;
  const auto = (name === curSyl()) ? computeFlow().pos : {};
  (events || []).forEach(e => {
    const p = (live && live[e.id]) || (saved && saved[e.id]) || (own && own[e.id])
      || auto[e.id] || { x: 60, y: 60 };
    out[e.id] = { x: p.x, y: p.y };
  });
  for (const k of ['__edgeMeta', '__merges', '__unmerges', '__font', '__lines', '__derived']) {
    const v = (live && live[k]) || (saved && saved[k]) || (own && own[k]);
    if (v != null) out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}

export let CUSTOMS = {};
/* Built-ins can be renamed and deleted like any other syllabus. */
export let SYL_HIDDEN = [], SYL_ALIAS = {}, SYL_TOMB = {};
export function isHidden(n) { return SYL_HIDDEN.indexOf(n) >= 0; }
export function builtinOf(n) { return (SYLLABI[n] && !isHidden(n)) ? n : null; }
function sylSource(n) { return (CUSTOMS && CUSTOMS[n]) || (builtinOf(n) ? SYLLABI[n] : null); }
function firstSylName() {
  const a = allSylNames();
  if (a.includes(DEFAULT_SYL_NAME)) return DEFAULT_SYL_NAME;
  const o = orderedSylNames();
  return o[0] || a[0] || DEFAULT_SYL_NAME;
}
function applyAliasLayouts() { for (const k in SYL_ALIAS) { const b = SYL_ALIAS[k]; if (DEFAULT_LAYOUTS[b] && !DEFAULT_LAYOUTS[k]) DEFAULT_LAYOUTS[k] = DEFAULT_LAYOUTS[b]; } }
const SYL_RENAME = { 'FG JUL 26': '2026', 'Default July 26': '2026' };
function padId(id) {
  const SPECIAL = { 'IEPE': 'IEPE/IPC', 'T-9': 'T-09', 'NVG-1': 'NVG-01', 'ST-7(P)': 'ST-07(P)', 'ST-7(W)': 'ST-07(W)' };
  if (SPECIAL[id]) return SPECIAL[id];
  const m = (id + '').match(/^([A-Z()\/]+)-(\d+)([A-Z]?(\([A-Z]\))?)$/);
  if (!m) return id;
  return m[1] + '-' + (m[2].length === 1 ? ('0' + m[2]) : m[2]) + (m[3] || '');
}
function translateMarks(old, ids) {
  const out = {};
  for (const k in old) {
    let nk = null;
    if (ids.has(k)) nk = k;
    else {
      const p = padId(k); if (ids.has(p)) nk = p;
      else { const q = k.replace(/-0(\d)/, '-$1'); if (ids.has(q)) nk = q; }
    }
    if (nk) out[nk] = old[k];
  }
  return out;
}
async function loadCourses() {
  const r = await sGet(kCourses);
  COURSES = r ? JSON.parse(r) : ['26ABSG'];
  COURSES = COURSES.filter(c => c !== 'SYLLABUS EDIT');   /* retired: syllabi are global now */
  if (!COURSES.length) COURSES = ['26ABSG'];
  await sSet(kCourses, JSON.stringify(COURSES));
}
async function saveCourses() { await sSet(kCourses, JSON.stringify(COURSES)); }
/* Split the legacy flat roster into per-syllabus rosters; runs once per course. */
async function migrateRosters(c) {
  try {
    if (await sGet(kRosterMig(c))) return;
    const rr = await sGet(kRoster(c));
    if (rr == null || rr === '') {
      /* brand-new file: seed the demo pair once, on the syllabus that's showing */
      if (c === '26ABSG') {
        let any = false;
        for (const n of allSylNames()) { const r = await sGet(kRosterFor(c, n)); if (r != null && r !== '') { any = true; break; } }
        if (!any) {
          const h = (plan && plan.sylName) || DEFAULT_SYL_NAME;
          /* placeholder names only — this repository is public */
          await sSet(kRosterFor(c, h), JSON.stringify(['STUDENT A', 'STUDENT B']));
        }
      }
      await sSet(kRosterMig(c), '1'); return;
    }
    let old = []; try { old = JSON.parse(rr) || []; } catch (_) { old = []; }
    const names = allSylNames();
    const home = (plan && plan.sylName && names.includes(plan.sylName)) ? plan.sylName : (names[0] || DEFAULT_SYL_NAME);
    const per = {}; names.forEach(n => per[n] = []); if (!per[home]) per[home] = [];
    for (const st of old) {
      let placed = false;
      for (const n of names) {
        const m = await sGet(kMarksFor(c, n, st));
        if (m && m !== '' && m !== '{}') { per[n].push(st); placed = true; }
      }
      if (!placed) per[home].push(st);
    }
    for (const n in per) {
      if (!per[n].length) continue;
      const cur = await sGet(kRosterFor(c, n));
      if (cur == null || cur === '' || cur === '[]') await sSet(kRosterFor(c, n), JSON.stringify(per[n]));
    }
    await sSet(kRosterMig(c), '1');
  } catch (_) {}
}
/* restoreLastSyllabus is OFF by default and ON only from init(). loadCourse
   also runs when the user picks a syllabus themselves, and restoring there
   overwrote their choice the instant they made it — so on any course where
   something had been marked, the syllabus could not be changed at all. */
async function loadCourse(c, restoreLastSyllabus = false) {
  loading = true;
  course = c;
  /* One site covers init, switchCourse, addCourse, renCourse and delCourse.
     Raw and synchronous, so unlike sSet it never flickers the save status. */
  prefSet('lastCourse', c);
  /* A ring left over from another syllabus would re-light the moment the user
     came back to it. Cleared without redrawing: every caller renders anyway. */
  searchHit = null; searchQ = ''; searchCount = 0; searchAt = 0;
  /* History belongs to the chart it was recorded on. Switching COURSE never
     went through clearDirty, so an Undo pressed afterwards stamped the old
     course's chart onto the new one's syllabus and saved it immediately. */
  undoStack = []; redoStack = [];
  const pr = await sGet(kPlan(c)); plan = pr ? JSON.parse(pr) : { lulls: [], mode: 'pace', epw: 2, target: null, sylName: DEFAULT_SYL_NAME, custom: false };
  if (!plan.sylName) plan.sylName = DEFAULT_SYL_NAME;
  const cs = await sGet(kSyls(c)); CUSTOMS = cs ? JSON.parse(cs) : {};
  { /* adopt custom syllabi stored before syllabi went global */
    let added = false;
    for (const key of [kSylsOldMaster(), kSylsOwn(c)]) {
      const raw = await sGet(key); if (!raw) continue;
      const L = JSON.parse(raw);
      for (const k in L) { if (!CUSTOMS[k] && !isHidden(k) && !SYL_TOMB[k]) { CUSTOMS[k] = L[k]; added = true; } }
    }
    if (added) await sSet(kSyls(c), JSON.stringify(CUSTOMS));
  }
  /* legacy: single edited syllabus stored under kSyl -> import into named customs */
  if (plan.custom) {
    const sr = await sGet(kSyl(c));
    if (sr) {
      const nm = (SYL_RENAME[plan.sylName] || plan.sylName) + ' (edited)';
      if (!CUSTOMS[nm] && !isHidden(nm) && !SYL_TOMB[nm]) CUSTOMS[nm] = JSON.parse(sr);
      await sSet(kSyls(c), JSON.stringify(CUSTOMS)); plan.sylName = nm;
    }
    plan.custom = false; await savePlan();
  }
  /* rename migration: legacy syllabus names -> 2026 */
  if (SYL_RENAME[plan.sylName]) { plan.__oldSyl = plan.sylName; plan.sylName = SYL_RENAME[plan.sylName]; await savePlan(); }
  /* Open on whatever was last marked. Done here, before the roster and layout
     load, so it costs no second pass and writes nothing. Only when the app is
     starting: everywhere else the caller has already decided the syllabus. */
  const __lastS = await sGet(kLastStudent(c));
  if (__lastS && restoreLastSyllabus) {
    try {
      const rec = JSON.parse(await sGet(kLast(c, __lastS)) || 'null');
      if (rec && rec.syl && sylSource(rec.syl)) plan.sylName = rec.syl;
    } catch (_) {}
  }
  let __src = sylSource(plan.sylName);
  if (!__src) { /* named syllabus vanished -> fall back cleanly */
    plan.sylName = firstSylName();
    await savePlan(); __src = sylSource(plan.sylName) || DEFAULT_SYLLABUS;
  }
  /* With no charts shipped in the code and none opened yet, DEFAULT_SYLLABUS is
     undefined and JSON.parse(JSON.stringify(undefined)) throws, which aborted
     loadCourse half-way and left the app looking broken. An empty board is the
     correct state here: the user has simply not opened their file yet. */
  SYL = __src ? JSON.parse(JSON.stringify(__src)) : [];
  byid = {}; SYL.forEach(e => byid[e.id] = e);
  await migrateRosters(c);
  const rr = await sGet(kRosterFor(c, plan.sylName));
  roster = rr ? JSON.parse(rr) : [];
  /* Your own last pick first, then the last person anyone GRADED on this course
     (kLastStudent), then whoever is at the top. The roster is per syllabus, so
     the includes() guard quietly handles remembering someone who is not on the
     syllabus being opened. */
  const __myS = prefGet('lastCrew:' + c);
  active = (__myS && roster.includes(__myS)) ? __myS
    : ((__lastS && roster.includes(__lastS)) ? __lastS : (roster[0] || null));
  await loadLayout();
  await loadStudent();
  /* one-time marks + layout migration from the old syllabus name */
  if (plan.__oldSyl) {
    const ids = new Set(SYL.map(e => e.id));
    for (const s of roster) {
      if (Object.keys(marks[s] || {}).length === 0) {
        const om = await sGet(kMarksFor(course, plan.__oldSyl, s));
        if (om) { marks[s] = translateMarks(JSON.parse(om), ids); await saveMarks(s); }
      }
    }
    if (!Object.keys(layout).length) {
      const ol = await sGet(kLayoutFor(course, plan.__oldSyl));
      if (ol) {
        const l = JSON.parse(ol); const nl = {};
        for (const k in l) { const nk = ids.has(k) ? k : padId(k); if (ids.has(nk)) nl[nk] = l[k]; }
        layout = nl; await saveLayout();
      }
    }
    delete plan.__oldSyl; await savePlan();
  }
  /* self-heal: a custom syllabus whose stored layout doesn't cover its events */
  if (SYL.length && !DEFAULT_LAYOUTS[plan.sylName]) {
    const bd = bestDefaultLayout();
    if (bd && layoutNodeCount(layout) < SYL.length) {
      layout = await snapshotLayout(plan.sylName);
      await saveLayout();
    }
  }
  loading = false;
}
/* Every write of the user's own work goes through one of the four functions
   below, so flagging the file unsaved here catches marking an event, a date, a
   pace, a lull and a student alike — including anything added later. Doing it in
   each caller instead is how marking a student came to leave the file clean:
   Save changes wrote the file anyway, so nothing was lost while the button was
   always on screen, but it never showed the unsaved dot and could not be hidden
   safely. `loading` keeps boot-time migrations and course switches from
   flagging work the user has not done. */
function touched() { if (!loading) markFileDirty(); }
async function saveSyl() { await sSet(kSyl(course), JSON.stringify(SYL)); touched(); }
async function saveRoster() { await sSet(kRosterFor(course, plan.sylName), JSON.stringify(roster)); touched(); }
async function savePlan() { await sSet(kPlan(course), JSON.stringify(plan)); touched(); }
async function loadStudent() {
  marks = {}; dates = {}; lulls = {}; lastEdit = {}; pace = {};
  for (const s of roster) {
    const m = await sGet(kMarks(course, s)); marks[s] = m ? JSON.parse(m) : {};
    let d = await sGet(kDates(course, s));
    if (d == null || d === '') { const od = await sGet(kDatesOld(course, s)); if (od) { d = od; await sSet(kDates(course, s), od); } }
    dates[s] = d ? JSON.parse(d) : { lastSyll: null, lastCurr: null };
    /* Everyone inherits a copy of the old course-wide set the first time. The
       original is left in plan.lulls, unread, so an older saved file migrates
       exactly the same way when it is opened. */
    try { lastEdit[s] = JSON.parse(await sGet(kLast(course, s)) || 'null') || null; } catch (_) { lastEdit[s] = null; }
    /* Everyone inherits the old course-wide pace and end dates the first time.
       plan.epw / plan.target / plan.target2 are left in place, unread, so an
       older saved file migrates the same way when it is opened. */
    let pr = null;
    try { pr = JSON.parse(await sGet(kPace(course, s)) || 'null'); } catch (_) {}
    pace[s] = pr || { epw: plan.epw ?? 2, target: plan.target ?? null, target2: plan.target2 ?? null };
    const l = await sGet(kLulls(course, s));
    if (l == null || l === '') lulls[s] = (plan.lulls || []).map(x => ({ start: x.start, end: x.end }));
    else { try { lulls[s] = JSON.parse(l); } catch (_) { lulls[s] = []; } }
  }
}
async function saveLulls(s) { await sSet(kLulls(course, s), JSON.stringify(lulls[s] || [])); touched(); }
async function savePace(s) { await sSet(kPace(course, s), JSON.stringify(pace[s] || {})); touched(); }
/* Always a shape, even for a student added since load. */
export function paceOf(s) { return (pace && pace[s]) || { epw: 2, target: null, target2: null }; }
/* The box holds whatever the user is part-way through typing, so the maths needs
   its own reading. Clearing it to type a new number used to snap it back to 2. */
export function epwOf(s) { const n = parseFloat(paceOf(s).epw); return n > 0 ? n : 2; }
async function saveMarks(s) { await sSet(kMarks(course, s), JSON.stringify(marks[s])); touched(); }
async function saveDates(s) { await sSet(kDates(course, s), JSON.stringify(dates[s])); touched(); }

/* ---------- in-page dialogs (promise-based, rendered by <DlgModal/>) ---------- */
export let dlg = null; export let dlgSerial = 0;
let _dlgRes = null;
function _dlgShow(msg, { input = false, def = '', cancel = true, ok = 'OK', alt = null } = {}) {
  return new Promise(res => {
    _dlgRes = res;
    dlg = { msg, input, def, cancel, ok, alt };
    dlgSerial++;
    notify();
  });
}
export function dlgClose(val) {
  dlg = null;
  const r = _dlgRes; _dlgRes = null; notify(); if (r) r(val);
}
export async function uiConfirm(msg) { return await _dlgShow(msg); }
export async function uiPrompt(msg, def) { const v = await _dlgShow(msg, { input: true, def }); return v === null ? null : (v + ''); }
export async function uiAlert(msg) { await _dlgShow(msg, { cancel: false }); }
/* Three-way ask: returns 'ok', 'alt' or 'cancel'. */
export async function uiChoice(msg, okLabel, altLabel) {
  const r = await _dlgShow(msg, { ok: okLabel, alt: altLabel });
  return r === '__alt__' ? 'alt' : (r === true ? 'ok' : 'cancel');
}

/* ---------- helpers ---------- */
export const gradeOf = (s, id) => (marks[s] && marks[s][id] && marks[s][id].g) || 0;
export const failOf = (s, id) => (marks[s] && marks[s][id] && marks[s][id].f) || 0;
export const isDone = (s, id) => DONE.has(gradeOf(s, id));
/* Escapes for both text and attribute contexts: the result is interpolated into
   attribute values (e.g. data-id="…"), so quotes must be escaped too or a name
   containing one breaks out and injects arbitrary attributes. */
export function escapeId(s) { return (s + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

/* annulus sector path (deg, clockwise, y-down) */
function sector(cx, cy, rO, rI, a0, a1) {
  const rad = d => d * Math.PI / 180;
  const p = (r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  if (Math.abs(a1 - a0) >= 359.9) { /* full ring (e.g. single student) -> proper annulus */
    const [ax, ay] = p(rO, 0), [bx, by] = p(rO, 180), [cxi, cyi] = p(rI, 0), [dxi, dyi] = p(rI, 180);
    return `M${ax.toFixed(2)} ${ay.toFixed(2)} A${rO} ${rO} 0 1 1 ${bx.toFixed(2)} ${by.toFixed(2)} A${rO} ${rO} 0 1 1 ${ax.toFixed(2)} ${ay.toFixed(2)} Z ` +
      `M${cxi.toFixed(2)} ${cyi.toFixed(2)} A${rI} ${rI} 0 1 0 ${dxi.toFixed(2)} ${dyi.toFixed(2)} A${rI} ${rI} 0 1 0 ${cxi.toFixed(2)} ${cyi.toFixed(2)} Z`;
  }
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  const [o0x, o0y] = p(rO, a0), [o1x, o1y] = p(rO, a1), [i1x, i1y] = p(rI, a1), [i0x, i0y] = p(rI, a0);
  return `M${o0x.toFixed(2)} ${o0y.toFixed(2)} A${rO} ${rO} 0 ${large} 1 ${o1x.toFixed(2)} ${o1y.toFixed(2)} L${i1x.toFixed(2)} ${i1y.toFixed(2)} A${rI} ${rI} 0 ${large} 0 ${i0x.toFixed(2)} ${i0y.toFixed(2)} Z`;
}
/* student i wedge centred so student 0 is at TOP */
function wedge(i, n) { const step = 360 / n; const c = -90 + i * step; return [c - step / 2, c + step / 2]; }

export function isAvail(s, ev) { return !isDone(s, ev.id) && gradeOf(s, ev.id) !== 'na' && ev.prereqs.every(p => isDone(s, p) || gradeOf(s, p) === 'na' || !byid[p]); }
export function availableNow(s) { return SYL.filter(e => isAvail(s, e)).sort((a, b) => a.seq - b.seq); }

function trunc(s, n) { s = (s == null ? '' : '' + s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function detScale() { return { sx: 1, sy: 1 }; }
function nodePos(id) {
  let b;
  if (layout[id]) b = layout[id];
  else { const dl = DEFAULT_LAYOUTS[curSyl()] || BORROW; b = (dl && dl[id]) ? dl[id] : (AUTO[id] || { x: 60, y: 60 }); }
  const sc = detScale();
  return (sc.sx === 1 && sc.sy === 1) ? b : { x: b.x * sc.sx, y: b.y * sc.sy };
}

/* Paper course-map shape language: rect=acad, hexagon=device, oval=sim,
   jet=flight, test=rect. */
function innerShape(type, cx, cy) {
  const f = TYPE_COLOR[type], st = 'stroke="#0007" stroke-width="0.8"';
  if (type === 'sim') return `<ellipse cx="${cx}" cy="${cy}" rx="18" ry="10.5" fill="${f}" ${st}/>`;
  if (type === 'device') {
    const pts = [[-18, 0], [-11, -9], [11, -9], [18, 0], [11, 9], [-11, 9]].map(q => (cx + q[0]) + ',' + (cy + q[1])).join(' ');
    return `<polygon points="${pts}" fill="${f}" ${st}/>`;
  }
  if (type === 'flight') {
    const pj = [[0, -16], [2.6, -6], [15, 1.5], [4, 5], [7.5, 13], [0, 9.5], [-7.5, 13], [-4, 5], [-15, 1.5], [-2.6, -6]]
      .map(q => (cx + q[0]) + ',' + (cy + q[1])).join(' ');
    return `<polygon points="${pj}" fill="${f}" ${st} stroke-linejoin="round"/>`;
  }
  /* acad + test: rectangle */
  return `<rect x="${cx - 16}" y="${cy - 9}" width="32" height="18" rx="2.5" fill="${f}" ${st}/>`;
}
function ballGroup(ev, available) {
  const p = nodePos(ev.id), size = 58, cx = size / 2, cy = size / 2, rO = size * 0.47, rI = size * 0.33, x = p.x, y = p.y;
  const n = Math.max(1, roster.length); let segs = '';
  for (let i = 0; i < n; i++) {
    const s = roster[i]; const g = gradeOf(s, ev.id);
    const fill = (g && g !== 'na' && g !== 0) ? GRADE_FILL[g] : (g === 'na' ? GRADE_FILL.na : '#ffffff');
    const [a0, a1] = wedge(i, n);
    segs += `<path d="${sector(cx, cy, rO, rI, a0, a1)}" fill="${fill}" stroke="#111" stroke-width="0.8"/>`;
    /* No failure ticks on an event marked N.A. — it never had to be flown, so
       red marks against it read as a contradiction. The count is only hidden,
       not thrown away; it comes back if the grade does. */
    const f = (g === 'na') ? 0 : failOf(s, ev.id);
    if (f > 0) {
      const shown = Math.min(f, 6); const span = Math.abs(a1 - a0); const gap = Math.min(9, span / (shown + 1)); const mid = (a0 + a1) / 2; const first = mid - (shown - 1) / 2 * gap;
      for (let t = 0; t < shown; t++) {
        const ang = first + t * gap, rad = ang * Math.PI / 180;
        const x1 = cx + rO * 0.80 * Math.cos(rad), y1 = cy + rO * 0.80 * Math.sin(rad), x2 = cx + (rO + 3) * Math.cos(rad), y2 = cy + (rO + 3) * Math.sin(rad);
        segs += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ff2b2b" stroke-width="2.2" stroke-linecap="round"/>`;
      }
    }
  }
  const dark = DARKC.has(ev.type) ? 'lbl' : 'lbl lbll';
  let hl = available ? `<circle cx="${cx}" cy="${cy}" r="${rO + 3}" fill="none" stroke="#ffd23f" stroke-width="2.6" class="avail"/>` : '';
  /* The search ring sits at rO+8. Its inner edge is 34.06, clear of the yellow
     available ring's outer edge even when svg.perf fattens that to 31.96, so
     the two can never touch or be read as one mark. */
  if (searchHit === ev.id) hl += `<circle cx="${cx}" cy="${cy}" r="${rO + 8}" fill="none" stroke="#00e5c8" stroke-width="2.4" class="found"/>`;
  if (arrangeMode && connectSrc === ev.id) hl += `<circle cx="${cx}" cy="${cy}" r="${rO + 5}" fill="none" stroke="#36c2ff" stroke-width="3"/>`;
  if (arrangeMode && selBalls.has(ev.id)) hl += `<circle cx="${cx}" cy="${cy}" r="${rO + 5}" fill="none" stroke="#36c2ff" stroke-width="1.6" stroke-dasharray="3 2"/>`;
  const num = (ev.num != null && ev.num !== '') ? `<circle cx="${size - 5}" cy="5" r="8.5" class="numbg"/><text class="numbadge" x="${size - 5}" y="8" text-anchor="middle">${escapeId(ev.num)}</text>` : '';
  const label = escapeId(ev.label || ev.id);
  let cap = '';
  /* one invisible disc so the whole ball hit-tests as a single shape — without it the
     gap between the wedge ring and the inner icon fires pointerleave/enter as you cross it */
  const hit = `<circle cx="${cx}" cy="${cy}" r="${(rO + 1).toFixed(2)}" fill="none" pointer-events="all"/>`;
  return `<g class="ball" data-id="${escapeId(ev.id)}" transform="translate(${(x - cx).toFixed(1)},${(y - cy).toFixed(1)})">
  ${hit}${hl}${segs}${innerShape(ev.type, cx, cy)}
  <text class="${dark}" x="${cx}" y="${cy + 3}" text-anchor="middle" style="font-size:${ballFontFor(ev.id)}px">${label}</text>${num}${cap}</g>`;
}

/* Continuous top-to-bottom flow following the real prerequisite graph. */
function computeFlow() {
  const COL = 84, ROW = 92, R = 29;
  const level = {};
  /* `busy` breaks prerequisite loops. Without it a chart where A waits for B
     and B waits for A recurses until the stack gives out, and because
     renderBoard calls this every time, the board never draws again — the app
     looks dead. Files are refused before they get here (fileFormat.checkCharts)
     but the JSON editor and older stored charts can still hold a loop, so the
     engine treats one as "already placed" and carries on drawing. */
  const busy = {};
  function lvl(id) {
    if (level[id] != null) return level[id];
    if (busy[id]) return 0;
    const e = byid[id]; if (!e) return 0;
    const ps = (e.prereqs || []).filter(p => byid[p]); if (!ps.length) return level[id] = 0;
    busy[id] = 1;
    let m = 0; ps.forEach(p => { m = Math.max(m, lvl(p) + 1); });
    delete busy[id];
    return level[id] = m;
  }
  SYL.forEach(e => lvl(e.id));
  // place root 'feeder' events (no prereqs but feed a mid-chain node) just above what they feed
  const _kids = {}; SYL.forEach(e => (e.prereqs || []).forEach(p => { if (byid[p]) (_kids[p] = _kids[p] || []).push(e.id); }));
  SYL.forEach(e => { if ((e.prereqs || []).filter(p => byid[p]).length === 0) { const ch = _kids[e.id] || []; if (ch.length) { level[e.id] = Math.max(0, Math.min(...ch.map(c => level[c])) - 1); } } });
  const byLevel = {}; let maxL = 0;
  SYL.forEach(e => { const L = level[e.id]; (byLevel[L] = byLevel[L] || []).push(e); maxL = Math.max(maxL, L); });
  const slot = {};
  Object.keys(byLevel).forEach(L => { byLevel[L].sort((a, b) => a.seq - b.seq); byLevel[L].forEach((e, i) => slot[e.id] = i); });
  const kids = {}; SYL.forEach(e => (e.prereqs || []).forEach(p => { if (byid[p]) (kids[p] = kids[p] || []).push(e.id); }));
  for (let pass = 0; pass < 8; pass++) {
    for (let L = 1; L <= maxL; L++) {
      const arr = byLevel[L] || [];
      arr.forEach(e => { const ps = (e.prereqs || []).filter(p => byid[p]).map(p => slot[p]); e._b = ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : slot[e.id]; });
      arr.sort((a, b) => a._b - b._b || a.seq - b.seq); arr.forEach((e, i) => slot[e.id] = i);
    }
    for (let L = maxL - 1; L >= 0; L--) {
      const arr = byLevel[L] || [];
      arr.forEach(e => { const cs = (kids[e.id] || []).map(c => slot[c]); e._b = cs.length ? cs.reduce((x, y) => x + y, 0) / cs.length : slot[e.id]; });
      arr.sort((a, b) => a._b - b._b || a.seq - b.seq); arr.forEach((e, i) => slot[e.id] = i);
    }
  }
  let maxSlots = 1; Object.keys(byLevel).forEach(L => maxSlots = Math.max(maxSlots, byLevel[L].length));
  const pos = {};
  Object.keys(byLevel).forEach(L => {
    const arr = byLevel[L]; const n = arr.length; const off = (maxSlots - n) / 2;
    arr.forEach((e, i) => { pos[e.id] = { x: (off + i) * COL + COL / 2 + 20, y: (+L) * ROW + ROW / 2 + 14 }; });
  });
  return { pos, bands: [], W: maxSlots * COL + 40, H: (maxL + 1) * ROW + 30 };
}

/* orthogonal (right-angle) connector, honouring per-edge side/bend metadata. */
const BR = 30; /* ball anchor radius */
function anc(pt, side) { return side === 'N' ? { x: pt.x, y: pt.y - BR } : side === 'S' ? { x: pt.x, y: pt.y + BR } : side === 'E' ? { x: pt.x + BR, y: pt.y } : { x: pt.x - BR, y: pt.y }; }
function dedupe(pts) { const o = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = o[o.length - 1], b = pts[i]; if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) o.push(b); } return o; }
function orthConnect(s2, fs, e2, ts) {
  const hs = (fs === 'E' || fs === 'W'), he = (ts === 'E' || ts === 'W');
  if (Math.abs(s2.x - e2.x) < 0.5 || Math.abs(s2.y - e2.y) < 0.5) return [s2, e2];
  if (hs && he) { const mx = (s2.x + e2.x) / 2; return [s2, { x: mx, y: s2.y }, { x: mx, y: e2.y }, e2]; }
  if (!hs && !he) { const my = s2.y < e2.y ? e2.y - 16 : e2.y + 16; return [s2, { x: s2.x, y: my }, { x: e2.x, y: my }, e2]; }
  if (hs && !he) return [s2, { x: e2.x, y: s2.y }, e2];
  return [s2, { x: s2.x, y: e2.y }, e2];
}
function orthVia(s2, e2, mid) {
  return dedupe([s2, { x: s2.x, y: mid.y }, { x: mid.x, y: mid.y }, { x: mid.x, y: e2.y }, e2]);
}
function edgePts(p, c) {
  const a = nodePos(p), b = nodePos(c), m = edgeMeta[ekey(p, c)] || {};
  const dx = b.x - a.x, dy = b.y - a.y;
  let fs = m.fromSide, ts = m.toSide;
  if (!fs) fs = Math.abs(dy) < 0.5 ? (dx >= 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
  if (!ts) ts = Math.abs(dy) < 0.5 ? (dx >= 0 ? 'W' : 'E') : (dy > 0 ? 'N' : 'S');
  if (!m.fromSide && !m.toSide && m.flip) { /* flip the primary axis of the elbow */
    fs = (fs === 'N' || fs === 'S') ? (dx >= 0 ? 'E' : 'W') : (dy >= 0 ? 'S' : 'N');
    ts = (ts === 'N' || ts === 'S') ? (dx >= 0 ? 'W' : 'E') : (dy >= 0 ? 'N' : 'S');
  }
  const s2 = anc(a, fs), e2 = anc(b, ts);
  let route = m.mid ? orthVia(s2, e2, m.mid) : orthConnect(s2, fs, e2, ts);
  if (!(m.fromSide || m.toSide || m.mid || m.flip)) {
    const obs = []; SYL.forEach(e => { if (e.id === p || e.id === c) return; obs.push(nodePos(e.id)); });
    const pad = 28; let bh = routeHits(route, obs, pad);
    if (bh > 0 && (fs === 'S' || fs === 'N') && (ts === 'N' || ts === 'S')) {
      const gut = 92, dn = s2.y < e2.y, y1 = dn ? s2.y + 16 : s2.y - 16, y2 = dn ? e2.y - 16 : e2.y + 16;
      [(a.x + b.x) / 2, (3 * a.x + b.x) / 4, (a.x + 3 * b.x) / 4, a.x + 46, a.x - 46, b.x + 46, b.x - 46, Math.max(a.x, b.x) + gut, Math.min(a.x, b.x) - gut].forEach(gx => {
        const cd = dedupe([s2, { x: s2.x, y: y1 }, { x: gx, y: y1 }, { x: gx, y: y2 }, { x: b.x, y: y2 }, e2]);
        const h = routeHits(cd, obs, pad); if (h < bh) { bh = h; route = cd; }
      });
    }
    if (bh > 0 && (fs === 'E' || fs === 'W')) {
      const gut = 92, gxr = Math.max(a.x, b.x) + gut, gxl = Math.min(a.x, b.x) - gut;
      const sE = anc(a, 'E'), eE = anc(b, 'E'), sW = anc(a, 'W'), eW = anc(b, 'W');
      [dedupe([sE, { x: gxr, y: sE.y }, { x: gxr, y: eE.y }, eE]), dedupe([sW, { x: gxl, y: sW.y }, { x: gxl, y: eW.y }, eW])].forEach(cd => { const h = routeHits(cd, obs, pad); if (h < bh) { bh = h; route = cd; } });
    }
  }
  return dedupe(route);
}
function segHits(a, b, obs, pad) {
  let h = 0; const vv = Math.abs(a.x - b.x) < 0.5;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (vv) { if (Math.abs(o.x - a.x) < pad && o.y > Math.min(a.y, b.y) - 0.1 && o.y < Math.max(a.y, b.y) + 0.1) h++; }
    else { if (Math.abs(o.y - a.y) < pad && o.x > Math.min(a.x, b.x) - 0.1 && o.x < Math.max(a.x, b.x) + 0.1) h++; }
  }
  return h;
}
function routeHits(pts, obs, pad) { let h = 0; for (let i = 0; i < pts.length - 1; i++) h += segHits(pts[i], pts[i + 1], obs, pad); return h; }
function edgeList() {
  const L = []; const cov = lineCoveredPairs();
  SYL.forEach(ev => ev.prereqs.forEach(p => {
    if (!byid[p]) return; const k = ekey(p, ev.id); if (cov.has(k)) return;
    L.push({ p, c: ev.id, k: k, pts: edgePts(p, ev.id) });
  }));
  return L;
}
function vertSegs(list) {
  const v = [];
  list.forEach(o => {
    const pts = o.pts;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (Math.abs(a.x - b.x) < 0.5) v.push({ x: a.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y), k: o.k }); }
  });
  return v;
}
/* build path string; horizontal segments hop (inverted-U) over crossing verticals */
function edgePath(o, vs) {
  const pts = o.pts; let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5) {
      const y = a.y, dir = b.x > a.x ? 1 : -1; let xs = [];
      vs.forEach(sg => {
        if (sg.k === o.k) return; if (!hasHop(o.k, sg.k)) return;
        if (sg.y1 < y - 0.5 && sg.y2 > y + 0.5) { const cx = sg.x; if (cx > Math.min(a.x, b.x) + 3 && cx < Math.max(a.x, b.x) - 3) xs.push(cx); }
      });
      xs.sort((m, n) => dir > 0 ? m - n : n - m);
      xs.forEach(cx => { d += ` L${(cx - dir * 5).toFixed(1)} ${y.toFixed(1)} A5 5 0 0 ${dir > 0 ? 1 : 0} ${(cx + dir * 5).toFixed(1)} ${y.toFixed(1)}`; });
      d += ` L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    } else d += ` L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}
/* ---------- Free-drawn 90-degree lines (Line tool) ---------- */
let selLine = null, drawing = null, lineDrag = null;
function LINES() { if (!layout.__lines || !Array.isArray(layout.__lines)) layout.__lines = []; return layout.__lines; }
/* Pull near-parallel merged free lines flush into one straight run. */
function snapStraight(k1, k2, tol) {
  tol = tol || 6;
  if (!isLineKey(k1) || !isLineKey(k2)) return false;
  const A = lineById(k1.slice(LK.length)), B = lineById(k2.slice(LK.length));
  if (!A || !B || !A.pts || !B.pts || A.pts.length < 2 || B.pts.length < 2) return false;
  const segs = L => {
    const P = L.pts, out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (Math.abs(a.x - b.x) < 0.5) out.push({ v: true, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), i: i });
      else if (Math.abs(a.y - b.y) < 0.5) out.push({ v: false, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), i: i });
    }
    return out;
  };
  const sa = segs(A), sb = segs(B); let changed = false;
  sa.forEach(x => sb.forEach(y => {
    if (x.v !== y.v) return;                                    /* perpendicular: a real crossing */
    const gap = Math.abs(x.c - y.c);
    if (gap < 0.01 || gap > tol) return;                        /* already flush, or genuinely apart */
    if (y.hi < x.lo - tol || y.lo > x.hi + tol) return;         /* nowhere near along the run */
    const P = B.pts;
    if (y.v) { P[y.i].x = x.c; P[y.i + 1].x = x.c; } else { P[y.i].y = x.c; P[y.i + 1].y = x.c; }
    y.c = x.c; changed = true;
  }));
  return changed;
}
/* Merge / Unmerge pairing, shared by prerequisite arrows and free lines. */
function mergeClick(k) {
  const pick = key => {
    if (isLineKey(key)) { selLine = key.slice(LK.length); selEdge = null; }
    else { selEdge = key; selLine = null; }
  };
  if (!mergeFirst) {
    mergeFirst = k; pick(k); renderBoard();
    flashHint('Now click the crossing line to ' + tool + '.'); return;
  }
  if (mergeFirst !== k) {
    pushUndo();
    setHop(mergeFirst, k, tool === 'unmerge');
    if (tool === 'merge') snapStraight(mergeFirst, k);
    markDirty(); saveLayout();
  }
  mergeFirst = null; selEdge = null; selLine = null; renderBoard();
}
function lineArrow(L) { return (L.arrow == null) ? ((L.b && L.b.t === 'ball') ? 0 : 2) : L.arrow; }
function lineById(id) { const a = LINES(); for (let i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function newLineId() { return 'L' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }

/* direction of the last committed segment, so corners alternate naturally */
function lastDir(out) {
  if (out.length < 2) return null;
  const a = out[out.length - 2], b = out[out.length - 1];
  if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5) return 'h';
  if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) return 'v';
  return null;
}
/* force a polyline to be strictly horizontal/vertical by inserting corners */
function normOrtho(pts) {
  if (!pts || pts.length < 2) return (pts || []).map(p => ({ x: p.x, y: p.y }));
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], b = pts[i];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (dx < 0.5 || dy < 0.5) { out.push({ x: b.x, y: b.y }); continue; }
    const ld = lastDir(out);
    const vFirst = ld === 'h' ? true : ld === 'v' ? false : dy > dx;
    out.push(vFirst ? { x: a.x, y: b.y } : { x: b.x, y: a.y });
    out.push({ x: b.x, y: b.y });
  }
  return dedupe(out);
}
/* where an anchor currently sits; falls back to the stored point */
function anchorPt(an, fallback, depth) {
  depth = depth || 0;
  if (!an || depth > 6) return fallback;
  if (an.t === 'ball') { if (!byid[an.id]) return fallback; return anc(nodePos(an.id), an.side || 'N'); }
  if (an.t === 'line') {
    const h = lineById(an.id); if (!h) return fallback;
    const hp = linePts(h, depth + 1); if (hp.length < 2) return fallback;
    const i = Math.max(0, Math.min(hp.length - 2, an.i | 0));
    const a = hp[i], b = hp[i + 1], u = Math.max(0, Math.min(1, an.u == null ? 0.5 : an.u));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  if (an.t === 'edge') {
    if (!byid[an.p] || !byid[an.c]) return fallback;
    const ep = edgePts(an.p, an.c); if (ep.length < 2) return fallback;
    const i = Math.max(0, Math.min(ep.length - 2, an.i | 0));
    const a = ep[i], b = ep[i + 1], u = Math.max(0, Math.min(1, an.u == null ? 0.5 : an.u));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  return fallback;
}
/* resolved, orthogonal points for a line */
function linePts(L, depth) {
  const raw = (L.pts || []).map(p => ({ x: p.x, y: p.y }));
  if (raw.length < 2) return raw;
  raw[0] = anchorPt(L.a, raw[0], depth);
  raw[raw.length - 1] = anchorPt(L.b, raw[raw.length - 1], depth);
  const out = normOrtho(raw);
  if (!depth) L.pts = out.map(p => ({ x: p.x, y: p.y }));
  return out;
}
function nearestLinePoint(pt, maxD, skipId) {
  let best = null, bd = maxD * maxD;
  LINES().forEach(L => {
    if (L.id === skipId) return; const P = linePts(L, 1);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y, ll = vx * vx + vy * vy; if (ll < 1e-6) continue;
      let u = ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / ll; u = Math.max(0, Math.min(1, u));
      const qx = a.x + vx * u, qy = a.y + vy * u, dd = (qx - pt.x) * (qx - pt.x) + (qy - pt.y) * (qy - pt.y);
      if (dd < bd) { bd = dd; best = { t: 'line', id: L.id, i: i, u: u, x: qx, y: qy }; }
    }
  });
  return best;
}
/* nearest LOOSE end of another drawn line - the junction dot */
function nearestLooseEnd(pt, maxD, skipId) {
  let best = null, bd = maxD * maxD;
  LINES().forEach(L => {
    if (L.id === skipId) return; const P = linePts(L, 1); if (P.length < 2) return;
    [['a', 0], ['b', P.length - 1]].forEach(([k, i]) => {
      if (L[k]) return;
      const q = P[i], dd = (q.x - pt.x) * (q.x - pt.x) + (q.y - pt.y) * (q.y - pt.y);
      if (dd < bd) { bd = dd; best = { t: 'line', id: L.id, i: i === 0 ? 0 : P.length - 2, u: i === 0 ? 0 : 1, x: q.x, y: q.y }; }
    });
  });
  return best;
}
/* nearest point on a drawn prerequisite arrow */
function nearestEdgePoint(pt, maxD) {
  let best = null, bd = maxD * maxD;
  edgeList().forEach(o => {
    const P = o.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y, ll = vx * vx + vy * vy; if (ll < 1e-6) continue;
      let u = ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / ll; u = Math.max(0, Math.min(1, u));
      const qx = a.x + vx * u, qy = a.y + vy * u, dd = (qx - pt.x) * (qx - pt.x) + (qy - pt.y) * (qy - pt.y);
      if (dd < bd) { bd = dd; best = { t: 'edge', p: o.p, c: o.c, i: i, u: u, x: qx, y: qy }; }
    }
  });
  return best;
}
function snapAnchor(pt, skipId) {
  const np = nearestPort(pt, 12);
  if (np) { const q = anc(nodePos(np.id), np.side); return { an: { t: 'ball', id: np.id, side: np.side }, x: q.x, y: q.y }; }
  const le = nearestLooseEnd(pt, 16, skipId);
  if (le) return { an: { t: 'line', id: le.id, i: le.i, u: le.u }, x: le.x, y: le.y };
  const lp = nearestLinePoint(pt, 10, skipId);
  if (lp) return { an: { t: 'line', id: lp.id, i: lp.i, u: lp.u }, x: lp.x, y: lp.y };
  const ep = nearestEdgePoint(pt, 10);
  if (ep) return { an: { t: 'edge', p: ep.p, c: ep.c, i: ep.i, u: ep.u }, x: ep.x, y: ep.y };
  return null;
}
/* Every route on the board in one list. */
function allRoutes() {
  const list = edgeList();
  LINES().forEach(L => {
    const P = linePts(L); if (P.length < 2) return;
    list.push({ line: L, k: lkey(L.id), pts: P });
  });
  return list;
}
function buildFreeLines(routes, vs) {
  let o = '';
  routes.forEach(r => {
    if (!r.line) return; const L = r.line, P = r.pts;
    const d = edgePath(r, vs);
    const on = (selLine === L.id);
    const av = lineArrow(L);
    const mk = av === 0 ? ' marker-end="url(#arr)"' : av === 1 ? ' marker-start="url(#arr)"' : '';
    o += '<path id="lp_' + escapeId(L.id) + '" d="' + d + '" fill="none" stroke="' + (on ? '#36c2ff' : '#39404e') + '" stroke-width="' + (on ? 2.4 : 1.3) + '"' + mk + '/>';
    if (arrangeMode) {
      o += '<path class="linehit" id="lh_' + escapeId(L.id) + '" data-lid="' + escapeId(L.id) + '" d="' + d + '" fill="none" stroke="transparent" stroke-width="12"/>';
      if (!L.a) o += '<circle cx="' + P[0].x.toFixed(1) + '" cy="' + P[0].y.toFixed(1) + '" r="4" fill="#ffb84d" stroke="#7a4b00" stroke-width="1"/>';
      if (!L.b) o += '<circle cx="' + P[P.length - 1].x.toFixed(1) + '" cy="' + P[P.length - 1].y.toFixed(1) + '" r="4" fill="#ffb84d" stroke="#7a4b00" stroke-width="1"/>';
    }
  });
  return o;
}
function drawPreviewD() {
  if (!drawing || !drawing.pts.length) return '';
  const P = normOrtho(drawing.pts.concat(drawing.cur ? [drawing.cur] : []));
  if (P.length < 2) return '';
  return P.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
}
function refreshPreview() {
  const el = document.getElementById('drawPrev'); if (!el) return;
  el.setAttribute('d', drawPreviewD());
  const s = document.getElementById('drawStart');
  if (s && drawing && drawing.pts.length) { s.setAttribute('cx', drawing.pts[0].x.toFixed(1)); s.setAttribute('cy', drawing.pts[0].y.toFixed(1)); s.setAttribute('r', '4'); }
  else if (s) s.setAttribute('r', '0');
}
/* redraw one line in place, without rebuilding the whole board */
function refreshLine(id) {
  const L = lineById(id); if (!L) return;
  const P = linePts(L); if (P.length < 2) return;
  let d;
  const kk = lkey(id);
  if ([...unmerges].some(mk => (mk + '').split('|').indexOf(kk) >= 0)) {
    const routes = allRoutes(), vs = vertSegs(routes), me = routes.filter(r => r.k === kk)[0];
    d = me ? edgePath(me, vs) : P.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
  } else d = P.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
  const a = document.getElementById('lp_' + id), b = document.getElementById('lh_' + id);
  if (a) a.setAttribute('d', d); if (b) b.setAttribute('d', d);
  P.forEach((p, i) => {
    const h = document.querySelector('#flowSvg .lend[data-lid="' + id + '"][data-i="' + i + '"]');
    if (h) { h.setAttribute('cx', p.x.toFixed(1)); h.setAttribute('cy', p.y.toFixed(1)); }
    const v = document.querySelector('#flowSvg .lvert[data-lid="' + id + '"][data-i="' + i + '"]');
    if (v) { v.setAttribute('x', (p.x - 5).toFixed(1)); v.setAttribute('y', (p.y - 5).toFixed(1)); }
  });
}
/* true when the current tool may reshape a free line */
function lineEditable() { return arrangeMode && (tool === 'line' || tool === 'editlines'); }
function freeLineOverlay() {
  let o = '';
  if (tool === 'line') {
    o += '<path id="drawPrev" d="' + drawPreviewD() + '" fill="none" stroke="#36c2ff" stroke-width="2" stroke-dasharray="6 4"/>';
    o += '<circle id="drawStart" cx="0" cy="0" r="0" fill="#36c2ff"/>';
  }
  const L = lineById(selLine);
  if (L) {
    const P = linePts(L);
    P.forEach((p, i) => {
      const end = (i === 0 || i === P.length - 1);
      if (end) o += '<circle class="lend" data-lid="' + escapeId(L.id) + '" data-i="' + i + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="6" fill="#fff" stroke="#e67e22" stroke-width="2.4"/>';
      else o += '<rect class="lvert" data-lid="' + escapeId(L.id) + '" data-i="' + i + '" x="' + (p.x - 5).toFixed(1) + '" y="' + (p.y - 5).toFixed(1) + '" width="10" height="10" fill="#fff" stroke="#2b6cb0" stroke-width="2"/>';
    });
  }
  return o;
}
/* Which way a drawn line flows. */
function lineFlow(L) {
  const ar = lineArrow(L);
  if (ar === 0) return { s: 'a', d: 'b' };
  if (ar === 1) return { s: 'b', d: 'a' };
  const P = linePts(L, 1);
  if (P.length >= 2 && Math.abs(P[0].y - P[P.length - 1].y) > 4)
    return P[0].y < P[P.length - 1].y ? { s: 'a', d: 'b' } : { s: 'b', d: 'a' };
  return { s: 'a', d: 'b' };
}
/* Group lines into components; collect the balls feeding each component. */
function lineComponents() {
  const ls = LINES(); if (!ls.length) return { comps: {}, tapped: new Set() };
  const idx = {}; ls.forEach((L, i) => { idx[L.id] = i; });
  const par = ls.map((_, i) => i);
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const tapped = new Set();
  ls.forEach((L, i) => {
    ['a', 'b'].forEach(k => {
      const an = L[k];
      if (!an) return;
      if (an.t === 'line' && idx[an.id] != null) uni(i, idx[an.id]);
      if (an.t === 'edge') tapped.add(ekey(an.p, an.c));
    });
  });
  const comps = {};
  ls.forEach((L, i) => {
    const r = find(i), f = lineFlow(L);
    const S = L[f.s], D = L[f.d];
    const c = comps[r] = comps[r] || { src: new Set(), dst: new Set() };
    if (S && S.t === 'ball' && byid[S.id]) c.src.add(S.id);
    if (S && S.t === 'edge' && byid[S.p]) c.src.add(S.p);
    if (D && D.t === 'ball' && byid[D.id]) c.dst.add(D.id);
    if (D && D.t === 'edge' && byid[D.c]) c.dst.add(D.c);
  });
  return { comps, tapped };
}
/* prerequisite pairs the drawn lines already represent on screen */
function lineCoveredPairs() {
  const { comps, tapped } = lineComponents();
  const cov = new Set();
  Object.keys(comps).forEach(r => {
    const c = comps[r];
    c.src.forEach(p => {
      c.dst.forEach(q => {
        if (p === q) return; const k = ekey(p, q);
        if (!tapped.has(k)) cov.add(k);
      });
    });
  });
  return cov;
}
/* prerequisite pairs the drawn lines created */
function DERIVED() { if (!layout.__derived || !Array.isArray(layout.__derived)) layout.__derived = []; return layout.__derived; }
function deriveLineLinks() {
  const { comps } = lineComponents();
  const want = new Set();
  Object.keys(comps).forEach(r => {
    const c = comps[r];
    c.src.forEach(p => { c.dst.forEach(q => { if (p !== q && byid[p] && byid[q]) want.add(ekey(p, q)); }); });
  });
  const added = []; const der = DERIVED();
  /* first take back line-created prerequisites the drawing no longer implies */
  for (let i = der.length - 1; i >= 0; i--) {
    const k = der[i];
    if (want.has(k)) continue;
    const p = k.split('▸')[0], c = k.split('▸')[1];
    if (byid[c]) byid[c].prereqs = (byid[c].prereqs || []).filter(x => x !== p);
    der.splice(i, 1);
  }
  /* then add what it implies now; hand-entered prerequisites are never claimed */
  want.forEach(k => {
    const p = k.split('▸')[0], c = k.split('▸')[1];
    byid[c].prereqs = byid[c].prereqs || [];
    if (byid[c].prereqs.indexOf(p) >= 0) return;
    if (wouldCycle(p, c)) return;
    byid[c].prereqs.push(p); der.push(k); added.push(p + ' → ' + c);
  });
  return added;
}
/* Rebuild a line's points while one end is being dragged. */
function endDragRebuild(base, first, o, pt) {
  if (base.length < 2) return base.map(p => ({ x: p.x, y: p.y }));
  if (first) {
    const nxt = base[1];
    const corner = o === 'v' ? { x: nxt.x, y: pt.y } : { x: pt.x, y: nxt.y };
    return dedupe([{ x: pt.x, y: pt.y }, corner].concat(base.slice(1).map(p => ({ x: p.x, y: p.y }))));
  }
  const k = base.length - 1, prv = base[k - 1];
  const corner = o === 'v' ? { x: prv.x, y: pt.y } : { x: pt.x, y: prv.y };
  return dedupe(base.slice(0, k).map(p => ({ x: p.x, y: p.y })).concat([corner, { x: pt.x, y: pt.y }]));
}
/* add a corner to an existing line at the clicked point */
function insertBend(id, pt) {
  const L = lineById(id); if (!L) return false;
  const P = linePts(L); if (P.length < 2) return false;
  let bi = -1, bd = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y, ll = vx * vx + vy * vy; if (ll < 1e-6) continue;
    let u = ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / ll; u = Math.max(0, Math.min(1, u));
    const qx = a.x + vx * u, qy = a.y + vy * u, dd = (qx - pt.x) * (qx - pt.x) + (qy - pt.y) * (qy - pt.y);
    if (dd < bd) { bd = dd; bi = i; }
  }
  if (bi < 0) return false;
  pushUndo();
  L.pts = P.slice(0, bi + 1).concat([{ x: pt.x, y: pt.y }], P.slice(bi + 1));
  markDirty(); saveLayout(); renderBoard();
  return true;
}
function finishLine(commit) {
  const d = drawing; drawing = null;
  if (!d || !commit || d.pts.length < 2) { renderBoard(); return; }
  pushUndo();
  const L = { id: newLineId(), pts: normOrtho(d.pts), a: d.a || null, b: d.b || null };
  LINES().push(L); selLine = L.id;
  const made = deriveLineLinks();
  markDirty(); saveLayout(); renderBoard(); renderSide();
  flashHint(made.length ? ('Linked ' + made.join(', ')) : 'Line drawn. Loose ends stay unlinked until you connect them.');
}
function deleteLine(id) {
  const ls = LINES(); const i = ls.findIndex(l => l.id === id); if (i < 0) return;
  pushUndo();
  ls.splice(i, 1);
  /* anything anchored to it becomes loose rather than dangling on a ghost */
  ls.forEach(L => { ['a', 'b'].forEach(k => { if (L[k] && L[k].t === 'line' && L[k].id === id) L[k] = null; }); });
  if (selLine === id) selLine = null;
  deriveLineLinks();
  markDirty(); saveLayout(); renderBoard(); renderSide();
  flashHint('Line deleted — any prerequisites it created are removed with it.');
}

function buildEdges() {
  const routes = allRoutes(), vs = vertSegs(routes); let out = '';
  routes.forEach(o => {
    if (o.line) return; const d = edgePath(o, vs); const m = edgeMeta[o.k] || {}; const ar = (m.arrow == null) ? 0 : m.arrow;
    const mk2 = ar === 0 ? ' marker-end="url(#arr)"' : ar === 1 ? ' marker-start="url(#arr)"' : '';
    const on = (selEdge === o.k);
    const style = on ? ' stroke="#36c2ff" stroke-width="2.4"' : ' stroke="#39404e" stroke-width="1.3"';
    out += `<path d="${d}" fill="none"${style}${mk2}/>`;
    if (arrangeMode) out += `<path class="edgehit" data-p="${escapeId(o.p)}" data-c="${escapeId(o.c)}" data-k="${escapeId(o.k)}" d="${d}" fill="none" stroke="transparent" stroke-width="12"/>`;
  });
  return out + buildFreeLines(routes, vs);
}
/* blue N/E/S/W snap ports on every ball + handles for the selected line */
function ballPorts() {
  let o = '';
  SYL.forEach(e => {
    const p = nodePos(e.id);
    ['N', 'E', 'S', 'W'].forEach(sd => { const a = anc(p, sd); o += `<circle class="port" data-id="${escapeId(e.id)}" data-side="${sd}" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="4.5" fill="#36c2ff" fill-opacity="0.85" stroke="#fff" stroke-width="1"/>`; });
  });
  return o;
}
function nearestPort(pt, maxD) {
  let best = null, bd = maxD * maxD;
  SYL.forEach(e => {
    const q = nodePos(e.id);
    ['N', 'E', 'S', 'W'].forEach(sd => { const a = anc(q, sd); const dx = a.x - pt.x, dy = a.y - pt.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { id: e.id, side: sd }; } });
  });
  return best;
}
function wouldCycle(src, dst) {
  const kids = {}; SYL.forEach(e => (e.prereqs || []).forEach(pp => { (kids[pp] = kids[pp] || []).push(e.id); }));
  const st = [dst], seen = new Set();
  while (st.length) { const n = st.pop(); if (n === src) return true; if (seen.has(n)) continue; seen.add(n); (kids[n] || []).forEach(x => st.push(x)); }
  return false;
}
function buildOverlay() {
  if (!lineEditable()) return '';
  let o = ballPorts() + freeLineOverlay();
  if (tool !== 'editlines') return o;
  if (selEdge) {
    const oe = edgeList().find(x => x.k === selEdge);
    if (oe) {
      const pts = oe.pts, s0 = pts[0], sN = pts[pts.length - 1]; const m = edgeMeta[oe.k] || {};
      let hx, hy; if (m.mid) { hx = m.mid.x; hy = m.mid.y; } else { const mp = pts[Math.floor(pts.length / 2)]; hx = mp.x; hy = mp.y; }
      o += `<rect class="linehandle" x="${(hx - 6).toFixed(1)}" y="${(hy - 6).toFixed(1)}" width="12" height="12" fill="#fff" stroke="#2b6cb0" stroke-width="2"/>`;
      o += `<circle class="endhandle" data-end="from" cx="${s0.x.toFixed(1)}" cy="${s0.y.toFixed(1)}" r="6" fill="#fff" stroke="#e67e22" stroke-width="2.4"/>`;
      o += `<circle class="endhandle" data-end="to" cx="${sN.x.toFixed(1)}" cy="${sN.y.toFixed(1)}" r="6" fill="#fff" stroke="#e67e22" stroke-width="2.4"/>`;
    }
  }
  return o;
}
function highlightPort(pt) {
  const np = nearestPort(pt, 12);
  document.querySelectorAll('#flowSvg .port').forEach(c => {
    const on = np && c.dataset.id === np.id && c.dataset.side === np.side;
    c.setAttribute('r', on ? '7' : '4.5'); c.setAttribute('fill', on ? '#0af' : '#36c2ff');
  });
}
function applyEndSnap(end, pt) {
  const oe = edgeList().find(x => x.k === selEdge); if (!oe) { renderBoard(); return; }
  const p = oe.p, c = oe.c; const np = nearestPort(pt, 22); if (!np) { renderBoard(); return; }
  if (end === 'to') {
    if (np.id === c) { pushUndo(); edgeMeta[selEdge] = { ...(edgeMeta[selEdge] || {}), toSide: np.side }; markDirty(); }
    else {
      if (np.id === p) { flashHint('A link can’t start and end on the same event.'); renderBoard(); return; }
      if ((byid[np.id].prereqs || []).includes(p)) { flashHint('That link already exists.'); renderBoard(); return; }
      if (wouldCycle(p, np.id)) { flashHint('That would create a loop.'); renderBoard(); return; }
      pushUndo(); byid[c].prereqs = (byid[c].prereqs || []).filter(x => x !== p); byid[np.id].prereqs = byid[np.id].prereqs || []; byid[np.id].prereqs.push(p);
      const nk = ekey(p, np.id); edgeMeta[nk] = { ...(edgeMeta[selEdge] || {}), toSide: np.side }; delete edgeMeta[selEdge]; selEdge = nk; markDirty();
    }
  } else { /* from = prerequisite end */
    if (np.id === p) { pushUndo(); edgeMeta[selEdge] = { ...(edgeMeta[selEdge] || {}), fromSide: np.side }; markDirty(); }
    else {
      if (np.id === c) { flashHint('A link can’t start and end on the same event.'); renderBoard(); return; }
      if ((byid[c].prereqs || []).includes(np.id)) { flashHint('That link already exists.'); renderBoard(); return; }
      if (wouldCycle(np.id, c)) { flashHint('That would create a loop.'); renderBoard(); return; }
      pushUndo(); byid[c].prereqs = (byid[c].prereqs || []).filter(x => x !== p); byid[c].prereqs.push(np.id);
      const nk = ekey(np.id, c); edgeMeta[nk] = { ...(edgeMeta[selEdge] || {}), fromSide: np.side }; delete edgeMeta[selEdge]; selEdge = nk; markDirty();
    }
  }
  saveLayout(); renderBoard();
}
function bounds() { let W = 480, H = 480; SYL.forEach(ev => { const p = nodePos(ev.id); W = Math.max(W, p.x + 70); H = Math.max(H, p.y + 70); }); return { W, H }; }

/* ---------- board (with editor-style pan / zoom / connect in arrange mode) ---------- */
let view = { x: 0, y: 0, k: 1 };
export let tool = 'move'; let connectSrc = null, undoStack = [], pan = null;
function pushUndo() { undoStack.push({ syl: JSON.stringify(SYL), lay: JSON.stringify(layout) }); if (undoStack.length > 60) undoStack.shift(); redoStack = []; }
function applyHist(u) { SYL = JSON.parse(u.syl); byid = {}; SYL.forEach(e => byid[e.id] = e); layout = JSON.parse(u.lay); loadEdgeMeta(); selEdge = null; markDirty(); saveLayout(); renderBoard(); renderSide(); }
export async function doUndo() { const u = undoStack.pop(); if (!u) return; redoStack.push({ syl: JSON.stringify(SYL), lay: JSON.stringify(layout) }); applyHist(u); }
export async function doRedo() { const u = redoStack.pop(); if (!u) return; undoStack.push({ syl: JSON.stringify(SYL), lay: JSON.stringify(layout) }); applyHist(u); }
export function setTool(t) {
  tool = t; connectSrc = null; mergeFirst = null; marquee = null; drawing = null;
  if (t !== 'line' && t !== 'editlines' && t !== 'delball') selLine = null;
  if (t !== 'editlines' && t !== 'merge' && t !== 'unmerge') selEdge = null;
  if (t !== 'select' && t !== 'delball') selBalls = new Set();
  const svg = document.getElementById('flowSvg'); if (svg) svg.style.cursor = t === 'move' ? '' : 'crosshair';
  renderBoard();
  const hints = { move: 'Move: drag a ball (snap-aligns to others). Drag empty space to pan.', select: 'Select: drag a box on empty space to pick several balls, then drag any of them to move the group.', connect: 'Connect: click the prerequisite first, then the event that depends on it.', delball: 'Delete: removes whatever is selected — selected events or the selected line. With nothing selected, click an event, a drawn line, or a prerequisite arrow to delete it. Undo restores them.', text: 'Text: click a ball to edit its text / type / number.', line: 'Line: click to start, then click where it should end — two clicks and it is done. Right angles are automatic. Ends snap to a ball port, onto another line, or onto an existing arrow — tapping an arrow feeds the event it points at; a loose end (amber dot) links nothing until you connect it. Click a line to select it, then drag its squares to reshape, or double-click it in Edit lines to add a bend. Delete removes it. Arrow cycles its arrowhead, and the arrowhead is what decides which way the link runs.', editlines: 'Edit lines: blue N/E/S/W points appear on every ball. Click a line, then drag its ends onto a blue point to snap/reconnect.', merge: 'Merge: click one line, then a crossing line — the hop is removed and near-parallel drawn lines snap flush into one straight run. Works on drawn lines and prerequisite arrows.', unmerge: 'Unmerge: click one line, then a crossing line — the crossing gets an inverted-U hop. Drawn lines cross flat until you do this.' };
  if (hints[t]) { hintBase = hints[t]; hintFlash = null; }
  notify();
}
function applyView() {
  const vp = document.getElementById('viewport'); if (!vp) return;
  const t = `translate(${view.x.toFixed(1)}px,${view.y.toFixed(1)}px) scale(${view.k.toFixed(3)})`;
  vp.style.transformOrigin = '0 0'; vp.style.transform = t;
  vp.setAttribute('transform', `translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);
}
let _vRAF = 0, _dRAF = 0;
/* Pan is driven from window-level listeners, attached once. */
let _panWired = false;
function installGlobalPan() {
  if (_panWired) return; _panWired = true;
  window.addEventListener('pointermove', e => {
    if (!arrangeMode || !pan) return;
    if (pinching) { pan = null; return; }
    view.x = pan.vx + (e.clientX - pan.x0); view.y = pan.vy + (e.clientY - pan.y0); applyView();
  });
  const end = () => { if (!pan) return; pan = null; const s = document.getElementById('flowSvg'); if (s) s.style.cursor = 'grab'; perfOff(); };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
function perfOn() { const s = document.getElementById('flowSvg'); if (s) s.classList.add('perf'); }
function perfOff() { const s = document.getElementById('flowSvg'); if (s) s.classList.remove('perf'); }
function schedView() { applyView(); }
function flushView() { applyView(); }
function schedDragPaint() {
  if (_dRAF) return;
  _dRAF = requestAnimationFrame(() => {
    _dRAF = 0;
    const el = document.getElementById('edgeLayer'); if (el) el.innerHTML = buildEdges(); drawGuides();
  });
}
function flushDragPaint() {
  if (_dRAF) { cancelAnimationFrame(_dRAF); _dRAF = 0; }
  const el = document.getElementById('edgeLayer'); if (el) el.innerHTML = buildEdges(); drawGuides();
}
export function fitView() {
  const board = document.getElementById('board'), b = bounds();
  const cw = board.clientWidth - 24, ch = board.clientHeight - 24;
  view.k = Math.min(cw / b.W, ch / b.H, 1.4); view.x = (cw - b.W * view.k) / 2; view.y = 8; applyView();
}
/* --- keep the view steady when toggling Arrange --- */
function captureViewFromScroll() {
  const board = document.getElementById('board'); if (!board) return;
  view.k = flowZoom;
  view.x = -board.scrollLeft;
  view.y = -board.scrollTop;
}
function restoreScrollFromView() {
  const board = document.getElementById('board'); if (!board) return;
  flowZoom = Math.min(3, Math.max(0.1, view.k));
  applyFlowZoom();
  board.scrollLeft = Math.max(0, -view.x);
  board.scrollTop = Math.max(0, -view.y);
}
export function renderBoard() {
  const board = document.getElementById('board');
  if (!board) return;
  BORROW = null;
  if (!DEFAULT_LAYOUTS[curSyl()]) BORROW = bestDefaultLayout();
  const hasPlaced = layoutNodeCount(layout) > 0;
  const f = computeFlow(); AUTO = f.pos;
  const bd = bounds(); const W = Math.max(f.W, bd.W), H = (hasPlaced || DEFAULT_LAYOUTS[curSyl()] || BORROW) ? bd.H : Math.max(f.H, bd.H);
  const s = active;
  let nodes = ''; SYL.forEach(e => { nodes += ballGroup(e, isAvail(s, e)); });
  let svgW = W, svgH = H;
  if (arrangeMode) { svgW = Math.max(300, board.clientWidth - 24); svgH = Math.max(300, board.clientHeight - 24); }
  else { view = { x: 0, y: 0, k: 1 }; }
  board.innerHTML = `<div class="flowwrap"><svg id="flowSvg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" class="${arrangeMode ? 'arrange' : ''}">
   <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 Z" fill="#5a6172"/></marker></defs>
   <g id="viewport"><g id="bandLayer"></g><g id="edgeLayer">${buildEdges()}</g><g id="nodeLayer">${nodes}</g><g id="overlayLayer">${buildOverlay()}</g></g></svg></div>`;
  applyView();
  wireBoard();
  hideDetailBubble();
  fitPhoneWidth(svgW);
  applyFlowZoom();
  notify();   /* header event count etc. */
}
export let flowZoom = 1;
let zoomIsMine = false;   /* the user has taken the zoom over; stop auto-fitting */

/* A phone gets the chart scaled to its own width. At 100% an 880px chart on a
   390px screen leaves 522px of sideways wander that the desktop does not have,
   which is what makes scrolling straight down so awkward. Fitting the width
   makes scrollWidth equal clientWidth, so the only direction left is down.
   The zoom buttons still work — this is a starting point, not a lock. */
const PHONE = 1050;
function fitPhoneWidth(chartW) {
  if (typeof window === 'undefined' || arrangeMode || zoomIsMine) return;
  const board = document.getElementById('board'); if (!board || !chartW) return;
  if (window.innerWidth > PHONE) { flowZoom = 1; return; }
  const cs = getComputedStyle(board);
  const avail = board.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  if (avail > 0) flowZoom = Math.min(1, Math.max(0.1, Math.floor((avail / chartW) * 100) / 100));
}
function applyFlowZoom() {
  const w = document.querySelector('#board .flowwrap'); if (w) w.style.zoom = arrangeMode ? 1 : flowZoom;
}
/* Anchored at the middle of the current view, the same way pinch zoom anchors
   under the fingers. Without the scroll correction, CSS zoom rescales the whole
   page under an unchanged scroll position and the viewport lands on a different
   part of the chart. */
export function setFlowZoom(z) {
  zoomIsMine = true;
  const board = document.getElementById('board');
  if (board && !arrangeMode && flowZoom > 0) {
    const ox = board.clientWidth / 2, oy = board.clientHeight / 2;
    const cx = (board.scrollLeft + ox) / flowZoom, cy = (board.scrollTop + oy) / flowZoom;
    flowZoom = z; applyFlowZoom();
    void board.scrollWidth; /* force reflow, or the new scroll range is stale and clamps */
    board.scrollLeft = cx * z - ox; board.scrollTop = cy * z - oy;
  } else { flowZoom = z; applyFlowZoom(); }
  notify();
}
function wireBoard() {
  const svg = document.getElementById('flowSvg');
  document.querySelectorAll('#flowSvg .ball').forEach(g => {
    if (arrangeMode) {
      g.style.touchAction = 'none';
      g.addEventListener('pointerdown', startDrag);
      g.addEventListener('click', e => { if (tool === 'connect') { e.stopPropagation(); connectClick(g.dataset.id); } else if (tool === 'text') { e.stopPropagation(); openEdit(g.dataset.id); } else if (tool === 'delball') { e.stopPropagation(); deleteEventById(g.dataset.id); } });
      g.addEventListener('dblclick', () => openEdit(g.dataset.id));
    } else if (showDetails) {
      g.addEventListener('click', ev => { ev.stopPropagation(); showDetailBubble(g.dataset.id, g); });
      g.addEventListener('pointerenter', () => showDetailBubble(g.dataset.id, g));
      g.addEventListener('pointerleave', hideDetailBubble);
    } else { g.addEventListener('click', ev => openPop(g.dataset.id, ev)); }
  });
  if (arrangeMode) {
    document.querySelectorAll('#flowSvg .edgehit').forEach(p => {
      p.addEventListener('click', async e => {
        e.stopPropagation();
        const pr = p.dataset.p, ch = p.dataset.c, k = ekey(pr, ch);
        if (tool === 'delball') {
          if (!await uiConfirm('Remove link ' + pr + ' → ' + ch + ' ?')) return;
          pushUndo(); const ev = byid[ch]; if (ev) ev.prereqs = (ev.prereqs || []).filter(x => x !== pr);
          delete edgeMeta[k]; markDirty(); saveLayout(); renderBoard(); renderSide(); return;
        }
        if (tool === 'merge' || tool === 'unmerge') { mergeClick(k); return; }
        /* editlines / any other tool: just select the line */
        selEdge = k; renderBoard();
        if (tool === 'editlines') flashHint('Drag either end (orange) onto a blue point to reconnect, or drag the blue square to bend.');
      });
    });
    /* drag the orange bend handle (Edit lines) */
    const lh = document.querySelector('#flowSvg .linehandle');
    if (lh && selEdge) {
      lh.addEventListener('pointerdown', e => {
        e.stopPropagation();
        const key = selEdge; pushUndo();
        const mv = ev2 => { const pt = svgPt(ev2); edgeMeta[key] = { ...(edgeMeta[key] || {}), mid: { x: Math.round(pt.x), y: Math.round(pt.y) } }; schedDragPaint(); };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); markDirty(); saveLayout(); wireBoard(); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    }
    /* drag a line end onto a blue N/E/S/W point to snap / reconnect */
    document.querySelectorAll('#flowSvg .endhandle').forEach(h => {
      h.addEventListener('pointerdown', e => {
        e.stopPropagation(); const end = h.dataset.end;
        const mv = ev2 => { const pt = svgPt(ev2); h.setAttribute('cx', pt.x.toFixed(1)); h.setAttribute('cy', pt.y.toFixed(1)); highlightPort(pt); };
        const up = ev2 => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); applyEndSnap(end, svgPt(ev2)); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    });
    document.querySelectorAll('#flowSvg .linehit').forEach(h => {
      h.addEventListener('dblclick', e => {
        if (tool !== 'editlines') return;
        e.preventDefault(); e.stopPropagation();
        selLine = h.dataset.lid;
        if (insertBend(selLine, svgPt(e))) flashHint('Bend added — drag the blue square to shape it.');
      });
      h.addEventListener('pointerdown', e => {
        if (tool === 'line' && drawing) return;
        if (tool === 'delball') { e.stopPropagation(); deleteLine(h.dataset.lid); return; }
        if (tool === 'merge' || tool === 'unmerge') { e.stopPropagation(); e.preventDefault(); mergeClick(lkey(h.dataset.lid)); return; }
        if (!lineEditable()) return;
        e.stopPropagation(); selLine = h.dataset.lid; renderBoard();
      });
    });
    document.querySelectorAll('#flowSvg .lvert').forEach(h => {
      h.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        const id = h.dataset.lid, i = +h.dataset.i, L = lineById(id); if (!L) return;
        const P0 = L.pts.map(p => ({ x: p.x, y: p.y }));
        const prevV = i > 0 && Math.abs(P0[i].x - P0[i - 1].x) < 0.5;
        const nextV = i < P0.length - 1 && Math.abs(P0[i].x - P0[i + 1].x) < 0.5;
        let moved = false;
        const mv = ev2 => {
          const pt = svgPt(ev2); moved = true; const p = L.pts;
          if (i > 0) { if (prevV) p[i - 1].x = pt.x; else p[i - 1].y = pt.y; }
          if (i < p.length - 1) { if (nextV) p[i + 1].x = pt.x; else p[i + 1].y = pt.y; }
          p[i].x = pt.x; p[i].y = pt.y; refreshLine(id);
        };
        const up = () => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          if (moved) { pushUndo(); markDirty(); saveLayout(); } renderBoard();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    });
    document.querySelectorAll('#flowSvg .lend').forEach(h => {
      h.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        const id = h.dataset.lid, i = +h.dataset.i, L = lineById(id); if (!L) return;
        const first = (i === 0), key = first ? 'a' : 'b';
        const base = linePts(L).map(p => ({ x: p.x, y: p.y }));
        const o = first
          ? (Math.abs(base[0].x - base[1].x) < 0.5 ? 'v' : 'h')
          : (Math.abs(base[base.length - 1].x - base[base.length - 2].x) < 0.5 ? 'v' : 'h');
        L[key] = null;
        const mv = ev2 => {
          const pt = svgPt(ev2);
          L.pts = endDragRebuild(base, first, o, pt); refreshLine(id);
          h.setAttribute('cx', pt.x.toFixed(1)); h.setAttribute('cy', pt.y.toFixed(1));
          highlightPort(pt);
        };
        const up = ev2 => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          pushUndo();
          const pt = svgPt(ev2), sn = snapAnchor(pt, id);
          const dst = sn ? { x: sn.x, y: sn.y } : pt;
          L.pts = endDragRebuild(base, first, o, dst);
          L[key] = sn ? sn.an : null;
          const made = deriveLineLinks();
          markDirty(); saveLayout(); renderBoard(); renderSide();
          flashHint(made.length ? ('Linked ' + made.join(', ')) : (sn ? 'End connected.' : 'End left loose — nothing linked yet.'));
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    });
  } else {
    svg.addEventListener('pointerdown', e => { if (!e.target.closest('.ball')) hideDetailBubble(); });
  }
  if (arrangeMode) {
    /* arrange: pan the viewport transform, wheel to zoom */
    svg.addEventListener('pointerdown', e => {
      if (tool === 'line') {
        if (e.target.closest('.lend') || e.target.closest('.lvert')) return;
        e.preventDefault(); e.stopPropagation();
        const pt = svgPt(e);
        if (!drawing) {
          const hit = e.target.closest('.linehit');
          if (hit) { selLine = hit.dataset.lid; renderBoard(); return; }
          const sn = snapAnchor(pt, null);
          drawing = { pts: [sn ? { x: sn.x, y: sn.y } : pt], a: sn ? sn.an : null, b: null, cur: null };
          selLine = null; renderBoard();
          flashHint('Now click where it ends — on a ball port, on another line, or in empty space to leave it loose. Loose ends (amber dots) are junction points — other lines snap onto them, and everything meeting there flows top to bottom.');
          return;
        }
        /* second click always ends the line */
        const s0 = drawing.pts[0];
        if (Math.abs(pt.x - s0.x) < 12) pt.x = s0.x; else if (Math.abs(pt.y - s0.y) < 12) pt.y = s0.y;
        const sn = snapAnchor(pt, null);
        if (sn) { drawing.pts.push({ x: sn.x, y: sn.y }); drawing.b = sn.an; }
        else { drawing.pts.push(pt); drawing.b = null; }
        finishLine(true);
        return;
      }
      if (e.target.closest('.ball') || e.target.closest('.edgehit') || e.target.closest('.port') || e.target.closest('.endhandle') || e.target.closest('.linehandle')) return;
      if (tool === 'select') { startMarquee(e, svg); return; }
      pan = { x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y }; svg.style.cursor = 'grabbing'; perfOn();
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    });
    installGlobalPan();
    svg.addEventListener('pointermove', e => {
      if (tool === 'line' && drawing) {
        const cp = svgPt(e); const c0 = drawing.pts[0];
        if (Math.abs(cp.x - c0.x) < 12) cp.x = c0.x; else if (Math.abs(cp.y - c0.y) < 12) cp.y = c0.y;
        drawing.cur = cp; refreshPreview(); highlightPort(cp); return;
      }
      if (pinching) { pan = null; return; } if (!pan) return;
      view.x = pan.vx + (e.clientX - pan.x0); view.y = pan.vy + (e.clientY - pan.y0); schedView();
    });
    const endPan = () => { if (pan) flushView(); pan = null; svg.style.cursor = 'grab'; perfOff(); };
    svg.addEventListener('pointerup', endPan); svg.addEventListener('pointercancel', endPan);
    svg.addEventListener('dblclick', e => { if (tool === 'line' && drawing) { e.preventDefault(); e.stopPropagation(); finishLine(drawing.pts.length >= 2); } });
    svg.style.cursor = 'grab';
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const f = Math.pow(1.0015, -e.deltaY); const k2 = Math.min(4, Math.max(0.1, view.k * f));
      view.x = mx - (mx - view.x) * (k2 / view.k); view.y = my - (my - view.y) * (k2 / view.k); view.k = k2; schedView();
    }, { passive: false });
  } else {
    /* view mode: the board scrolls, so grab empty space and drag to scroll it */
    dragScroll(document.getElementById('board'),
      e => !!(e.target.closest('.ball') || e.target.closest('.edgehit')));
  }
  enableHScroll(document.getElementById('board'));
  enablePinchZoom(document.getElementById('board'));   /* two-finger zoom, both modes */
}
/* Two-finger pinch zoom on the flow chart. */
let pinching = false;
function enablePinchZoom(el) {
  if (!el || el.__pinch) return; el.__pinch = true;
  const pts = new Map(); let start = null;
  const dist = a => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  const mid = a => ({ x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 });
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const a = [...pts.values()], r = el.getBoundingClientRect(), m = mid(a);
      pinching = true; perfOn();
      start = { d: dist(a) || 1, m,
        k: view.k, vx: view.x, vy: view.y,
        z: flowZoom, sl: el.scrollLeft, st: el.scrollTop,
        ox: m.x - r.left, oy: m.y - r.top };
    }
  }, { passive: false });
  el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size !== 2 || !start) return;
    e.preventDefault();
    const a = [...pts.values()];
    const f = (dist(a) || 1) / start.d;
    if (arrangeMode) {
      const k2 = Math.min(4, Math.max(0.1, start.k * f));
      view.k = k2;
      view.x = start.ox - (start.ox - start.vx) * (k2 / start.k);
      view.y = start.oy - (start.oy - start.vy) * (k2 / start.k);
      schedView();
    } else {
      const z2 = Math.min(3, Math.max(0.1, +(start.z * f).toFixed(3)));
      const cx = (start.sl + start.ox) / start.z, cy = (start.st + start.oy) / start.z;
      flowZoom = z2; applyFlowZoom();
      el.scrollLeft = cx * z2 - start.ox; el.scrollTop = cy * z2 - start.oy;
    }
  }, { passive: false });
  const drop = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) {
      start = null;
      if (pinching) { pinching = false; flushView(); perfOff(); notify(); }
    }
  };
  el.addEventListener('pointerup', drop); el.addEventListener('pointercancel', drop); el.addEventListener('pointerleave', drop);
}
/* Left/right scrolling for the flow board. */
function enableHScroll(el) {
  if (!el || el.__hscroll) return; el.__hscroll = true;
  const canH = () => el.scrollWidth - el.clientWidth > 1;
  el.addEventListener('wheel', e => {
    if (arrangeMode || !canH()) return;
    const dx = e.deltaX, dy = e.deltaY;
    let amt = 0;
    if (Math.abs(dx) > Math.abs(dy)) return;              /* let the browser do native deltaX */
    if (e.shiftKey) amt = dy;
    else {
      const atTop = el.scrollTop <= 0, atBot = el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
      const noV = el.scrollHeight - el.clientHeight <= 1;
      if (noV || (dy < 0 && atTop) || (dy > 0 && atBot)) amt = dy; else return;
    }
    if (!amt) return;
    const before = el.scrollLeft;
    el.scrollLeft = before + amt;
    if (el.scrollLeft !== before) e.preventDefault();
  }, { passive: false });
  el.tabIndex = el.tabIndex >= 0 ? el.tabIndex : 0;
  el.style.outline = 'none';
  el.addEventListener('keydown', e => {
    if (arrangeMode) return;
    const t = e.target, tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || (t && t.isContentEditable)) return;
    const step = e.shiftKey ? 400 : 90;
    if (e.key === 'ArrowRight') { el.scrollLeft += step; e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { el.scrollLeft -= step; e.preventDefault(); }
    else if (e.key === 'Home') { el.scrollLeft = 0; e.preventDefault(); }
    else if (e.key === 'End') { el.scrollLeft = el.scrollWidth; e.preventDefault(); }
  });
}
/* Grab-and-drag scrolling for any overflow container. */
export function dragScroll(el, skip) {
  if (!el || el.__dragScroll) return; el.__dragScroll = true;
  let st = null;
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', e => {
    if (arrangeMode) return;   /* arrange mode pans the SVG viewport itself */
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const t = e.target, tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button' || tag === 'option' || (t && t.isContentEditable)) return;
    if (t && t.closest && (t.closest('button') || t.closest('input') || t.closest('select') || t.closest('a') || t.closest('[data-rm]') || t.closest('[data-lull]'))) return;
    if (skip && skip(e)) return;
    st = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop, moved: false, id: e.pointerId };
  });
  el.addEventListener('pointermove', e => {
    if (arrangeMode) { st = null; el.classList.remove('dragging'); return; }
    if (pinching) { st = null; el.classList.remove('dragging'); return; }
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.moved) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return; st.moved = true;
      el.classList.add('dragging'); try { el.setPointerCapture(st.id); } catch (_) {}
    }
    el.scrollLeft = st.l - dx; el.scrollTop = st.t - dy;
    e.preventDefault();
  });
  const stop = e => {
    if (!st) return; const moved = st.moved; st = null; el.classList.remove('dragging');
    if (moved) { /* swallow the click that follows a drag */
      const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener('click', kill, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', kill, true), 0);
    }
  };
  el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('pointerleave', stop);
}
function svgPt(ev) {
  const svg = document.getElementById('flowSvg'); const r = svg.getBoundingClientRect();
  return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
}
function connectClick(id) {
  if (!connectSrc) { connectSrc = id; renderBoard(); return; }
  if (connectSrc === id) { connectSrc = null; renderBoard(); return; }
  const src = connectSrc, dst = id; connectSrc = null;
  const ev = byid[dst];
  if ((ev.prereqs || []).includes(src)) { uiAlert('That link already exists.'); renderBoard(); return; }
  /* cycle guard: dst must not already reach src */
  const kids = {}; SYL.forEach(e => (e.prereqs || []).forEach(p => { (kids[p] = kids[p] || []).push(e.id); }));
  const st = [dst], seen = new Set(); let cyc = false;
  while (st.length) { const n = st.pop(); if (n === src) { cyc = true; break; } if (seen.has(n)) continue; seen.add(n); (kids[n] || []).forEach(c => st.push(c)); }
  if (cyc) { uiAlert('That link would create a loop (“' + src + '” already comes after “' + dst + '”).'); renderBoard(); return; }
  pushUndo(); ev.prereqs = ev.prereqs || []; ev.prereqs.push(src);
  markDirty(); renderBoard(); renderSide();
}
export async function addModule(type) {
  let id = ((await uiPrompt('Name for the new ' + type + ' event:')) || '').trim();
  if (!id) return;
  if (byid[id]) { await uiAlert('An event with that name already exists.'); return; }
  pushUndo();
  const maxSeq = SYL.reduce((m, e) => Math.max(m, e.seq || 0), 0);
  SYL.push({ id, type, seq: maxSeq + 1, prereqs: [], phase: 'Custom' });
  byid = {}; SYL.forEach(e => byid[e.id] = e);
  const board = document.getElementById('board');
  layout[id] = { x: (board.clientWidth / 2 - view.x) / view.k, y: (board.clientHeight / 2 - view.y) / view.k };
  markDirty(); await saveLayout(); renderBoard(); renderSide();
}
let groupDrag = null, marquee = null;
function startMarquee(e, svg) {
  const p0 = svgPt(e); marquee = { x0: p0.x, y0: p0.y, rect: null }; try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  const mv = ev => {
    const p = svgPt(ev); const x = Math.min(marquee.x0, p.x), y = Math.min(marquee.y0, p.y), w = Math.abs(p.x - marquee.x0), h = Math.abs(p.y - marquee.y0); marquee.rect = { x, y, w, h };
    const gl = document.getElementById('bandLayer'); if (gl) gl.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(54,194,255,0.12)" stroke="#36c2ff" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  };
  const up = () => {
    svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up);
    const gl = document.getElementById('bandLayer'); if (gl) gl.innerHTML = '';
    const r = marquee && marquee.rect; marquee = null;
    if (!r || (r.w < 3 && r.h < 3)) { selBalls = new Set(); renderBoard(); return; }
    const sel = new Set(); SYL.forEach(e2 => { const q = nodePos(e2.id); if (q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h) sel.add(e2.id); });
    selBalls = sel; renderBoard(); flashHint(sel.size + ' selected — drag any one of them to move the group.');
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up);
}
function startGroupDrag(ev) {
  perfOn(); ev.preventDefault(); const g = ev.currentTarget, id = g.dataset.id; if (!selBalls.has(id)) selBalls = new Set([id]);
  const p = svgPt(ev), start = {}; selBalls.forEach(bid => { const bp = nodePos(bid); start[bid] = { x: bp.x, y: bp.y }; });
  groupDrag = { px: p.x, py: p.y, start, moved: false, snap: { syl: JSON.stringify(SYL), lay: JSON.stringify(layout) }, pushed: false }; try { g.setPointerCapture(ev.pointerId); } catch (e) {}
  g.addEventListener('pointermove', onGroupDrag); g.addEventListener('pointerup', endGroupDrag); g.addEventListener('pointercancel', endGroupDrag);
}
function onGroupDrag(ev) {
  if (!groupDrag) return; const p = svgPt(ev); const dx = p.x - groupDrag.px, dy = p.y - groupDrag.py;
  if (!groupDrag.moved && !groupDrag.pushed) { undoStack.push(groupDrag.snap); if (undoStack.length > 60) undoStack.shift(); redoStack = []; groupDrag.pushed = true; }
  groupDrag.moved = true;
  selBalls.forEach(bid => {
    const st = groupDrag.start[bid]; const nx = st.x + dx, ny = st.y + dy; layout[bid] = { x: nx, y: ny };
    const el = document.querySelector('#flowSvg .ball[data-id="' + bid + '"]'); if (el) el.setAttribute('transform', `translate(${(nx - 29).toFixed(1)},${(ny - 29).toFixed(1)})`);
  });
  schedDragPaint();
}
function endGroupDrag(ev) {
  if (!groupDrag) return; const g = ev.currentTarget;
  g.removeEventListener('pointermove', onGroupDrag); g.removeEventListener('pointerup', endGroupDrag); g.removeEventListener('pointercancel', endGroupDrag);
  const moved = groupDrag.moved; groupDrag = null; flushDragPaint(); perfOff(); if (moved) { saveLayout(); renderBoard(); }
}
function startDrag(ev) {
  if (!arrangeMode) return; if (tool === 'select') { startGroupDrag(ev); return; } if (tool !== 'move') return;
  ev.preventDefault(); const g = ev.currentTarget, id = g.dataset.id, p = svgPt(ev), cur = nodePos(id);
  drag = { id, g, dx: p.x - cur.x, dy: p.y - cur.y, moved: false, snap: { syl: JSON.stringify(SYL), lay: JSON.stringify(layout) }, pushed: false }; perfOn(); try { g.setPointerCapture(ev.pointerId); } catch (e) {}
  g.addEventListener('pointermove', onDrag); g.addEventListener('pointerup', endDrag); g.addEventListener('pointercancel', endDrag);
}
function onDrag(ev) {
  if (!drag) return; const p = svgPt(ev); let nx = p.x - drag.dx, ny = p.y - drag.dy;
  if (!drag.moved && !drag.pushed) { undoStack.push(drag.snap); if (undoStack.length > 60) undoStack.shift(); redoStack = []; drag.pushed = true; }
  /* smart-align: snap to any other ball's x or y within threshold */
  const TH = 6; alignGuides = []; let gx = null, gy = null;
  SYL.forEach(e => {
    if (e.id === drag.id) return; const q = nodePos(e.id);
    if (gx === null && Math.abs(q.x - nx) < TH) { nx = q.x; gx = q.x; }
    if (gy === null && Math.abs(q.y - ny) < TH) { ny = q.y; gy = q.y; }
  });
  if (gx !== null) alignGuides.push({ v: true, p: gx }); if (gy !== null) alignGuides.push({ v: false, p: gy });
  layout[drag.id] = { x: nx, y: ny }; drag.moved = true; drag.g.setAttribute('transform', `translate(${(nx - 29).toFixed(1)},${(ny - 29).toFixed(1)})`);
  schedDragPaint();
}
function drawGuides() {
  const gl = document.getElementById('bandLayer'); if (!gl) return; const bd = bounds();
  gl.innerHTML = alignGuides.map(g => g.v ? `<line x1="${g.p}" y1="0" x2="${g.p}" y2="${bd.H}" stroke="#36c2ff" stroke-width="0.7" stroke-dasharray="4 4"/>` : `<line x1="0" y1="${g.p}" x2="${bd.W}" y2="${g.p}" stroke="#36c2ff" stroke-width="0.7" stroke-dasharray="4 4"/>`).join('');
}
function endDrag(ev) {
  if (!drag) return; const g = drag.g;
  g.removeEventListener('pointermove', onDrag); g.removeEventListener('pointerup', endDrag); g.removeEventListener('pointercancel', endDrag);
  const moved = drag.moved; drag = null; alignGuides = []; flushDragPaint(); const gl = document.getElementById('bandLayer'); if (gl) gl.innerHTML = ''; perfOff(); if (moved) { saveLayout(); markFileDirty(); wireBoard(); }
}

/* ---------- inline ball editor (text / colour / number) — state for <EditModal/> ---------- */
export let editId = null;
export function openEdit(id) { const ev = byid[id]; if (!ev) return; editId = id; notify(); }
export function closeEdit() { editId = null; notify(); }
/* Values from the modal; returns an error string, or null on success. */
export async function saveEdit(vals) {
  const ev = byid[editId]; if (!ev) { closeEdit(); return null; }
  /* --- validate the prereq links before touching anything --- */
  const raw = vals.links;
  const list = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
  const bad = list.filter(p => !byid[p]);
  if (bad.length) return 'No such event: ' + bad.join(', ');
  if (list.includes(ev.id)) return 'An event cannot be its own prerequisite.';
  /* cycle guard: with the new links applied, ev must not reach itself */
  {
    const kids = {}; SYL.forEach(e => {
      const ps = (e.id === ev.id) ? list : (e.prereqs || []);
      ps.forEach(p => { (kids[p] = kids[p] || []).push(e.id); });
    });
    const stack = [...(kids[ev.id] || [])], seen = new Set(); let cyc = false;
    while (stack.length) {
      const n = stack.pop(); if (n === ev.id) { cyc = true; break; }
      if (seen.has(n)) continue; seen.add(n); (kids[n] || []).forEach(c => stack.push(c));
    }
    if (cyc) return 'Those links would create a loop.';
  }
  pushUndo();
  const t = vals.text.trim();
  ev.label = (t && t !== ev.id) ? t : (t === ev.id ? undefined : (t || undefined));
  if (t === ev.id) ev.label = undefined;
  ev.type = vals.type;
  const num = vals.num.trim();
  ev.num = num === '' ? undefined : num;
  /* drop edge styling for links that no longer exist, then apply the new set */
  (ev.prereqs || []).forEach(p => { if (!list.includes(p)) delete edgeMeta[ekey(p, ev.id)]; });
  ev.prereqs = list;
  /* crew + prereq note are event-info overrides: merge, don't clobber name/fmt/hrs */
  {
    const cur = infoFor(editId);
    const o = { name: cur.name || '', fmt: cur.fmt || '', hrs: cur.hrs || '',
      crew: vals.crew.trim(), pre: vals.pre.trim() };
    const base = EVENT_INFO[editId] || {}; const diff = {};
    Object.keys(o).forEach(k => { if (o[k] !== (base[k] || '')) diff[k] = o[k]; });
    if (Object.keys(diff).length) eventInfo[editId] = diff; else delete eventInfo[editId];
    await saveEventInfo();
  }
  markDirty(); await saveLayout(); closeEdit(); refreshSyl(); renderBoard(); renderSide();
  return null;
}
export async function deleteFromEditModal() {
  const rid = editId; if (!rid || !byid[rid]) return;
  closeEdit(); await deleteEventById(rid);
}

/* ---------- stats ---------- */
/* Each entry carries `ready`. When nothing in a category can be flown yet this
   still names what is coming, but says so — rendered identically to a genuine
   next event, four unflyable suggestions sat under the words "either can be
   flown next" on a chart with nothing marked at all. */
export function nextOfCat(s, pred) {
  const cands = SYL.filter(e => pred(e) && !isDone(s, e.id) && gradeOf(s, e.id) !== 'na');
  if (!cands.length) return [];
  const avail = cands.filter(e => e.prereqs.every(p => isDone(s, p) || gradeOf(s, p) === 'na' || !byid[p]));
  let pool, ready;
  if (avail.length) { pool = avail.slice(); ready = true; }
  else {
    const first = cands.slice().sort((a, b) => a.seq - b.seq)[0];
    const sibs = cands.filter(e => e !== first && JSON.stringify(e.prereqs) === JSON.stringify(first.prereqs));
    pool = [first, ...sibs]; ready = false;
  }
  return pool.sort((a, b) => a.seq - b.seq).slice(0, 3).map(e => ({ id: e.id, seq: e.seq, ready }));
}
export function stats(s) {
  const r = { buckets: {}, totDone: 0, totAct: 0 };
  BUCKETS.forEach(b => {
    let total = 0, done = 0, na = 0;
    SYL.filter(e => b.types.includes(e.type)).forEach(e => {
      const g = gradeOf(s, e.id);
      if (g === 'na') { na++; return; } total++; if (DONE.has(g)) done++;
    });
    r.buckets[b.key] = { label: b.label, total, done, na, pct: total ? done / total : 0 };
    r.totDone += done; r.totAct += total;
  });
  r.totPct = r.totAct ? r.totDone / r.totAct : 0;
  r.remaining = r.totAct - r.totDone;
  return r;
}

/* date utils */
export const DAY = 864e5;
export function parseD(s) { if (!s) return null; const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); const d = mm ? new Date(+mm[1], +mm[2] - 1, +mm[3]) : new Date(s); return isNaN(d) ? null : d; }
export function fmt(d) { if (!d) return '—'; return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
export function daysBetween(a, b) { return Math.floor((b - a) / DAY); }
function overlapDays(s, e, a, b) { const lo = Math.max(s, a), hi = Math.min(e, b); return Math.max(0, (hi - lo) / DAY); }
export function lullDaysIn(s, a, b) { return ((lulls && lulls[s]) || []).reduce((t, l) => { const s = parseD(l.start), e = parseD(l.end); if (!s || !e) return t; return t + overlapDays(s.getTime(), e.getTime() + DAY, a, b); }, 0); }
export function flexFor(days) {
  if (days == null) return { txt: 'No flight date set', color: 'var(--grey)' };
  if (days < 7) return { txt: 'Current — no flex required', color: 'var(--marg)' };
  if (days <= 13) return { txt: '1 Optional Flex', color: 'var(--orange)' };
  if (days <= 20) return { txt: '1 Mando Flex (Convertible)', color: 'var(--red)' };
  if (days <= 30) return { txt: '2 Mando Flex (1 Mando, 1 Convertible)', color: 'var(--red)' };
  if (days <= 59) return { txt: '2 Mando Flex (2 Mando)', color: 'var(--red)' };
  if (days <= 119) return { txt: 'Short Refresher Course', color: 'var(--grey)' };
  return { txt: 'Re-course', color: 'var(--grey)' };
}
export function landingCurrency(days) {
  if (days == null) return { txt: 'No currency date set', color: 'var(--grey)' };
  if (days < 7) return { txt: 'Landing Current — No IP Required', color: 'var(--marg)' };
  return { txt: 'Landing Not Current — IP Required', color: 'var(--red)' };
}
export function sliceBg(cols) {
  if (!cols.length) return ''; if (cols.length === 1) return cols[0];
  const step = 100 / cols.length, st = [];
  cols.forEach((c, i) => st.push(`${c} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`));
  return `linear-gradient(90deg,${st.join(',')})`;
}

/* ---------- side panel actions (inputs live in <SidePanel/>) ---------- */
export async function setLastSyll(s, v) { dates[s].lastSyll = v; dates[s].lastCurr = v; await saveDates(s); renderSide(); }
export async function setLastCurr(s, v) { dates[s].lastCurr = v; await saveDates(s); renderSide(); }
export async function setDownDays(s, v) { dates[s].downDays = v; await saveDates(s); renderSide(); }
export async function setUpchit(s, v) { dates[s].upchit = v; await saveDates(s); renderSide(); }
/* v is kept verbatim — an empty or half-typed box must stay as typed. epwOf()
   does the coercion for the arithmetic. */
export async function setEpw(s, v) { pace[s] = { ...paceOf(s), epw: v }; await savePace(s); renderSide(); }
export async function setTarget(s, v) { pace[s] = { ...paceOf(s), target: v }; await savePace(s); renderSide(); }
export async function setTarget2(s, v) { pace[s] = { ...paceOf(s), target2: v }; await savePace(s); renderSide(); }
export async function removeLull(s, i) {
  (lulls[s] = lulls[s] || []).splice(i, 1); await saveLulls(s); renderSide();
}
export function calPrev() { calView = new Date(calView.getFullYear(), calView.getMonth() - 1, 1); notify(); }
export function calNext() { calView = new Date(calView.getFullYear(), calView.getMonth() + 1, 1); notify(); }

/* ---------- the lull calendar ----------
   One pop-up serves both making a period and changing one: first day click sets
   the start, second sets the end and saves. Paging the month must never count
   as a day click — deciding which month to look at is not choosing a date, and
   the old "set mode to Lull start, click, set mode to Lull end, click" pair is
   exactly what made this unusable. */
export let lullPick = null;   /* {student, index, start} while the pop-up is up */
export function openLullPicker(s, index) {
  const cur = (index != null) ? (lulls[s] || [])[index] : null;
  lullPick = { student: s, index: (index == null ? -1 : index), start: null };
  if (cur && cur.start) { const d = parseD(cur.start); if (d) calView = new Date(d.getFullYear(), d.getMonth(), 1); }
  notify();
}
export function closeLullPicker() { lullPick = null; notify(); }
export async function lullDayClick(iso) {
  if (!lullPick) return;
  if (!lullPick.start) { lullPick = { ...lullPick, start: iso }; notify(); return; }
  let a = lullPick.start, b = iso;
  if (parseD(b) < parseD(a)) { const t = a; a = b; b = t; }   /* clicked backwards */
  const s = lullPick.student;
  lulls[s] = lulls[s] || [];
  if (lullPick.index >= 0) lulls[s][lullPick.index] = { start: a, end: b };
  else lulls[s].push({ start: a, end: b });
  lulls[s].sort((x, y) => (x.start < y.start ? -1 : 1));
  lullPick = null;
  await saveLulls(s); renderSide();
}

/* ---------- copying periods between students ---------- */
export let lullCopy = null;   /* {from, picked:[...]} while the tick-list is up */
export function openLullCopy(from) { lullCopy = { from, picked: [] }; notify(); }
export function closeLullCopy() { lullCopy = null; notify(); }
export function toggleLullCopy(s, on) {
  if (!lullCopy) return;
  const picked = on ? [...new Set([...lullCopy.picked, s])] : lullCopy.picked.filter(x => x !== s);
  lullCopy = { ...lullCopy, picked }; notify();
}
export async function applyLullCopy() {
  if (!lullCopy) return;
  const src = (lulls[lullCopy.from] || []).map(l => ({ start: l.start, end: l.end }));
  for (const s of lullCopy.picked) { lulls[s] = src.map(l => ({ ...l })); await saveLulls(s); }
  lullCopy = null; renderSide();
}


/* The names are the information; the ring is only a key. It used to be drawn the
   other way round — a big ring with 11px names — so shrinking the whole thing to
   fit a phone made the names unreadable. Small ring, large names. */
export function renderKeyBall() {
  const n = Math.max(1, roster.length); const cx = 75, cy = 75, rO = 38, rI = 25;
  let segs = '', labels = '';
  for (let i = 0; i < n; i++) {
    const [a0, a1] = wedge(i, n); const on = roster[i] === active;
    segs += `<path d="${sector(cx, cy, rO, rI, a0, a1)}" fill="${on ? '#16384a' : '#fff'}" stroke="${on ? '#36c2ff' : '#111'}" stroke-width="${on ? 2 : 1}"/>`;
    const mid = (a0 + a1) / 2 * Math.PI / 180; const lr = rO + 10;
    const x = cx + lr * Math.cos(mid), y = cy + lr * Math.sin(mid);
    const anchor = Math.cos(mid) > 0.3 ? 'start' : Math.cos(mid) < -0.3 ? 'end' : 'middle';
    labels += `<text x="${x.toFixed(0)}" y="${(y + 7).toFixed(0)}" text-anchor="${anchor}" font-size="${on ? 21 : 19}" font-weight="${on ? 800 : 700}" fill="${on ? '#5ec8ff' : '#e9ecf2'}">${escapeId(roster[i])}</text>`;
  }
  /* Wide and short: the names run out to either side, so the box wants the shape
     of a name, not of a circle. */
  return `<div style="text-align:center;margin-top:6px"><svg viewBox="-95 6 340 140" width="340" height="140" style="max-width:100%;height:auto">
  ${segs}<circle cx="${cx}" cy="${cy}" r="${rI}" fill="#f6c21a" stroke="#0007"/>
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700">${escapeId(course)}</text>${labels}</svg></div>`;
}

/* ---------- popover ---------- */
export let pop = null;               /* {id, x, y} */
export let popFlightDate = '';
export function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function isoToday() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return isoOf(new Date()); } }
export function openPop(id, evt) {
  pop = { id, x: evt.clientX, y: evt.clientY };
  const isFlight = byid[id] && byid[id].type === 'flight';
  popFlightDate = isFlight ? isoToday() : '';
  notify();
}
export function closePop() { pop = null; notify(); }

/* ---------- where each student was last marking ---------- */
async function noteLastEdit(s, id) {
  if (!s || !id) return;
  lastEdit[s] = { syl: curSyl(), event: id };
  await sSet(kLast(course, s), JSON.stringify(lastEdit[s]));
  await sSet(kLastStudent(course), s);
}
/* Scrolls the board so an event sits in the middle. The browser clamps to the
   real scroll range, so an event near an edge simply comes as close as it can. */
export function scrollToEvent(id) {
  const bd = document.getElementById('board'); if (!bd || !id) return false;
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === id);
  if (!g) return false;
  const r = g.getBoundingClientRect(), b = bd.getBoundingClientRect();
  bd.scrollTop += (r.top + r.height / 2) - (b.top + b.height / 2);
  bd.scrollLeft += (r.left + r.width / 2) - (b.left + b.width / 2);
  return true;
}
/* ---------- find an event on the board ----------
   The ring is baked into the SVG string, so changing the hit means redrawing
   the board, not just notifying React. */
export let searchHit = null, searchQ = '', searchCount = 0, searchAt = 0;
/* App.jsx owns the phone's Flow/Info tab. Searching from the Info tab would
   measure a display:none board and scroll to nowhere, so the search switches
   back first — same sink arrangement as setCloudSinks. */
let tabSink = null;
export function setTabSink(fn) { tabSink = fn; }
function jumpTo(id) {
  searchHit = id || null;
  if (id && tabSink) { try { tabSink('flow'); } catch (_) {} }
  renderBoard();
  if (!id) return false;
  /* After the frame, so the balls exist and applyFlowZoom's scale has landed —
     measuring in the same tick reads a stale one. Same reason init() defers. */
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => scrollToEvent(id));
  else scrollToEvent(id);
  return true;
}
export function runSearch(q, step) {
  searchQ = q == null ? '' : q;
  const hits = findEvents(SYL, searchQ);
  searchCount = hits.length;
  if (!hits.length) {
    /* A search that finds nothing is not "another search": the board stays put
       and whatever was ringed stays ringed. */
    searchAt = 0; notify(); return false;
  }
  searchAt = step ? ((searchAt + 1) % hits.length) : 0;
  const done = jumpTo(hits[searchAt].id);
  notify(); return done;
}
export function clearSearch() {
  searchQ = ''; searchCount = 0; searchAt = 0;
  if (searchHit) { searchHit = null; renderBoard(); }
  notify();
}
/* Only when the record belongs to the syllabus on screen. Switching syllabus
   under the user to chase a mark would be a surprise, and would prompt about
   unsaved flow edits into the bargain. */
export function showLastEdit(s) {
  const rec = lastEdit[s];
  if (!rec || !rec.event || rec.syl !== curSyl()) return false;
  return scrollToEvent(rec.event);
}
export async function popGrade(v) {
  const s = active; const popId = pop && pop.id; if (!popId) return;
  if (v === 'cancel') { closePop(); return; }
  /* A syllabus with nobody on its roster leaves active null, and grading threw
     on marks[null][id]. Clicking an event on an empty course should do nothing,
     not break the page. */
  if (!s) { closePop(); return; }
  await noteLastEdit(s, popId);
  marks[s] = marks[s] || {};
  marks[s][popId] = marks[s][popId] || { g: 0, f: 0 }; marks[s][popId].g = v === '0' ? 0 : v;
  await saveMarks(s);
  if (byid[popId] && byid[popId].type === 'flight' && DONE.has(v)) {
    const d = popFlightDate || isoToday(); dates[s] = dates[s] || { lastSyll: null, lastCurr: null };
    dates[s].lastCurr = d; dates[s].lastSyll = d; await saveDates(s);
  }
  renderBoard(); renderSide(); closePop();
}
export async function popFail(delta) {
  const s = active; const popId = pop && pop.id; if (!popId || !s) return;
  marks[s] = marks[s] || {};
  marks[s][popId] = marks[s][popId] || { g: 0, f: 0 };
  /* Not applicable means it never has to be flown, so it cannot be failed.
     Counting up was allowed and the ball then wore red failure ticks over the
     N/A colour. Existing counts are kept, not wiped — mark it back to a real
     grade and the history is still there. */
  if (delta > 0 && gradeOf(s, popId) === 'na') { flashHint('“' + popId + '” is marked N.A., so it cannot be failed.'); return; }
  marks[s][popId].f = Math.max(0, (marks[s][popId].f || 0) + delta);
  await saveMarks(s); renderBoard(); renderSide();
}
export async function popFlightChanged(v) {
  const s = active; const popId = pop && pop.id;
  popFlightDate = v; notify();
  if (!popId || !byid[popId] || byid[popId].type !== 'flight') return;
  const g = gradeOf(s, popId); const d = v || isoToday(); dates[s] = dates[s] || { lastSyll: null, lastCurr: null };
  if (DONE.has(g)) { dates[s].lastCurr = d; dates[s].lastSyll = d; await saveDates(s); renderSide(); }
}
function hideDetailBubble() { const b = document.getElementById('detailBubble'); if (b) b.style.display = 'none'; }
function showDetailBubble(id, anchorEl) {
  let b = document.getElementById('detailBubble');
  if (!b) { b = document.createElement('div'); b.id = 'detailBubble'; document.body.appendChild(b); }
  b.innerHTML = `<div class="dbId">${escapeId(id)}</div>${infoHtml(id)}`;
  b.style.display = 'block'; b.style.left = '-9999px'; b.style.top = '0px';
  const r = anchorEl.getBoundingClientRect();
  const bw = b.offsetWidth, bh = b.offsetHeight, gap = 8, vw = innerWidth, vh = innerHeight;
  let left, top, sided = true;
  if (r.right + gap + bw <= vw - 6) { left = r.right + gap; }                 /* prefer right of the ball */
  else if (r.left - gap - bw >= 6) { left = r.left - gap - bw; }              /* else left */
  else { sided = false; left = Math.min(Math.max(6, r.left + r.width / 2 - bw / 2), vw - bw - 6); }
  if (sided) { top = Math.min(Math.max(6, r.top + r.height / 2 - bh / 2), vh - bh - 6); }
  else { top = (r.bottom + gap + bh <= vh - 6) ? r.bottom + gap : Math.max(6, r.top - gap - bh); }
  b.style.left = left + 'px'; b.style.top = top + 'px';
}
export function toggleDetails() {
  showDetails = !showDetails;
  if (!showDetails) hideDetailBubble();
  notify(); renderBoard();
}
/* ---------- event info editor ---------- */
export let infoId = null;
export function openInfo(id) { infoId = id; notify(); }
export function closeInfo() { infoId = null; notify(); }
/* the id-explicit forms — used by the inline editor in the Show All list */
export async function saveInfoFor(id, vals) {
  if (!id) return;
  const t = v => (v == null ? '' : String(v)).trim();
  const o = { name: t(vals.name), fmt: t(vals.fmt), hrs: t(vals.hrs), crew: t(vals.crew), pre: t(vals.pre) };
  /* Compare against what the box was FILLED with — base plus this syllabus's own
     profile — not the base alone. The editor pre-fills from infoFor(), so on a
     renumbered syllabus (Tx) an untouched field differs from the global base and
     used to be stored as a global override, pushing Tx wording onto every chart.
     One save of SA-5 on Tx did exactly that. */
  const base = Object.assign({}, EVENT_INFO[id] || {}, (EVENT_INFO_BY_SYL[curSyl()] || {})[id] || {});
  const plain = EVENT_INFO[id] || {};
  const diff = {}; const kept = [];
  Object.keys(o).forEach(k => {
    if (o[k] === (base[k] || '')) return;
    diff[k] = o[k];
    /* Deliberate, but equal to the baked base — only a marker keeps the scrub
       on the next load from deciding it was redundant and dropping it. */
    if (o[k] === (plain[k] || '')) kept.push(k);
  });
  if (kept.length) diff.__kept = kept;
  if (Object.keys(diff).filter(k => k !== '__kept').length) eventInfo[id] = diff; else delete eventInfo[id];
  /* Event details ride in the user's file, so changing them is unsaved work.
     Without this the Save button never lit and the file quietly fell behind. */
  await saveEventInfo(); markFileDirty(); renderBoard(); renderSide();
}
export async function resetInfoFor(id) {
  if (!id) return;
  delete eventInfo[id]; await saveEventInfo(); markFileDirty(); renderBoard(); notify();
}
export async function saveInfo(vals) {
  const id = infoId; if (!id) return;
  await saveInfoFor(id, vals); closeInfo();
}
export async function resetInfo() { await resetInfoFor(infoId); }
/* ---------- Show All ---------- */
export let showAllOpen = false;
export function openShowAll() { showAllOpen = true; notify(); }
export function closeShowAll() { showAllOpen = false; notify(); }

/* ---------- roster / course ops ---------- */
export async function addStudent() {
  const v = ((await uiPrompt('Student callsign:')) || '').trim().toUpperCase(); if (!v) return;
  if (!roster.includes(v)) {
    roster.push(v); marks[v] = {}; dates[v] = { lastSyll: null, lastCurr: null };
    await saveRoster(); await saveMarks(v); await saveDates(v);
  }
  active = v; refreshActive(); renderBoard(); renderSide();
}
export async function removeStudent(v) {
  if (!await uiConfirm('Remove ' + v + ' from ' + plan.sylName + '?\n\nTheir marks, dates, pace and lull periods on this syllabus are deleted.')) return;
  roster = roster.filter(x => x !== v); delete marks[v]; delete dates[v];
  await saveRoster();
  /* Deleting the roster entry alone left their name and every mark sitting in
     storage — and on a shared tracker, in the file the whole team reads. Worse,
     adding the same callsign back handed them the old pace and lull periods
     while the marks started clean, which is the most confusing outcome of all. */
  await delKey(kMarksFor(course, plan.sylName, v));
  await delKey(kDatesFor(course, plan.sylName, v));
  await delKey(kDatesOld(course, v));
  await delKey(kLast(course, v));
  /* Pace and lulls belong to the course; only drop them once this person is
     off every syllabus in it, or removing them from one chart would wipe the
     pacing they still need on another. */
  let elsewhere = false;
  for (const sn of [...new Set([...SYL_NAMES, ...Object.keys(CUSTOMS || {})])]) {
    if (sn === plan.sylName) continue;
    try { const rr = await sGet(kRosterFor(course, sn)); if ((rr ? JSON.parse(rr) : []).includes(v)) { elsewhere = true; break; } } catch (_) {}
  }
  if (!elsewhere) { await delKey(kPace(course, v)); await delKey(kLulls(course, v)); delete pace[v]; delete lulls[v]; }
  if ((await sGet(kLastStudent(course))) === v) await delKey(kLastStudent(course));
  if (prefGet('lastCrew:' + course) === v) prefSet('lastCrew:' + course, '');
  if (active === v) active = roster[0] || null;
  refreshActive(); renderBoard(); renderSide();
}
export function setActive(v) {
  active = v; renderSide();
  /* Merely looking at someone counts. Before this, only grading was remembered,
     so picking a crew member and coming back tomorrow forgot them. */
  prefSet('lastCrew:' + course, v);
  /* Jump to where this student was last marked, so picking someone halfway
     through their course does not land at the top of the chart. */
  showLastEdit(v);
}

/* ---- syllabus display order ---- */
const kSylOrder = () => SYL_NS + ':sylorder';
export let SYL_ORDER = DEFAULT_SYL_ORDER.slice();
async function loadSylOrder() { try { const r = await sGet(kSylOrder()); const a = r ? JSON.parse(r) : null; SYL_ORDER = (Array.isArray(a) && a.length) ? a : DEFAULT_SYL_ORDER.slice(); } catch (e) { SYL_ORDER = DEFAULT_SYL_ORDER.slice(); } }
async function saveSylOrder() { await sSet(kSylOrder(), JSON.stringify(SYL_ORDER)); }
const kSylHidden = () => SYL_NS + ':sylhidden';
const kSylAlias = () => SYL_NS + ':sylalias';
const kSylTomb = () => SYL_NS + ':syltomb';
async function loadSylPrefs() {
  try { const r = await sGet(kSylHidden()); SYL_HIDDEN = r ? JSON.parse(r) : []; } catch (e) { SYL_HIDDEN = []; }
  try { const r = await sGet(kSylAlias()); SYL_ALIAS = r ? JSON.parse(r) : {}; } catch (e) { SYL_ALIAS = {}; }
  if (!Array.isArray(SYL_HIDDEN)) SYL_HIDDEN = [];
  if (!SYL_ALIAS || typeof SYL_ALIAS !== 'object') SYL_ALIAS = {};
  try { const r = await sGet(kSylTomb()); SYL_TOMB = r ? JSON.parse(r) : {}; } catch (e) { SYL_TOMB = {}; }
  if (!SYL_TOMB || typeof SYL_TOMB !== 'object') SYL_TOMB = {};
  applyAliasLayouts();
}
async function saveSylPrefs() { await sSet(kSylHidden(), JSON.stringify(SYL_HIDDEN)); await sSet(kSylAlias(), JSON.stringify(SYL_ALIAS)); await sSet(kSylTomb(), JSON.stringify(SYL_TOMB)); }
/* Scrub a syllabus name out of the LEGACY storage keys. */
async function purgeLegacySyl(nm) {
  const keys = [kSylsOldMaster(), ...COURSES.map(c => kSylsOwn(c))];
  for (const k of keys) {
    try {
      const raw = await sGet(k); if (!raw) continue;
      const L = JSON.parse(raw);
      if (L && Object.prototype.hasOwnProperty.call(L, nm)) { delete L[nm]; await sSet(k, JSON.stringify(L)); }
    } catch (_) {}
  }
}
async function delKey(k) { try { if (storage && storage.delete) { await storage.delete(k); } else { await sSet(k, ''); } } catch (_) { try { await sSet(k, ''); } catch (e) {} } }
/* Move (newNm set) or purge (newNm null) every trace of a syllabus name. */
async function moveSylData(oldNm, newNm) {
  for (const c of COURSES) {
    let rs = [];
    try { const rr = await sGet(kRosterFor(c, oldNm)); rs = rr ? JSON.parse(rr) : []; } catch (_) { rs = []; }
    try { const lr = await sGet(kRoster(c)); if (lr) rs = [...new Set([...rs, ...(JSON.parse(lr) || [])])]; } catch (_) {}
    if (c === course && plan && plan.sylName === oldNm) rs = [...new Set([...rs, ...roster])];
    for (const s of rs) {
      const m = await sGet(kMarksFor(c, oldNm, s));
      if (m != null && m !== '') { if (newNm) await sSet(kMarksFor(c, newNm, s), m); await delKey(kMarksFor(c, oldNm, s)); }
      const d = await sGet(kDatesFor(c, oldNm, s));
      if (d != null && d !== '') { if (newNm) await sSet(kDatesFor(c, newNm, s), d); await delKey(kDatesFor(c, oldNm, s)); }
    }
    {
      const r = await sGet(kRosterFor(c, oldNm));
      if (r != null && r !== '') { if (newNm) await sSet(kRosterFor(c, newNm), r); await delKey(kRosterFor(c, oldNm)); }
    }
    const l = await sGet(kLayoutFor(c, oldNm));
    if (l != null && l !== '') { if (newNm) await sSet(kLayoutFor(c, newNm), l); await delKey(kLayoutFor(c, oldNm)); }
    try {
      const pr = await sGet(kPlan(c));
      if (pr) {
        const p = JSON.parse(pr);
        if (p.sylName === oldNm) { p.sylName = newNm || firstSylName(); await sSet(kPlan(c), JSON.stringify(p)); }
      }
    } catch (_) {}
  }
}
export function allSylNames() { return [...new Set([...SYL_NAMES.filter(n => !isHidden(n)), ...Object.keys(CUSTOMS || {})])]; }
export function orderedSylNames() {
  const all = allSylNames();
  const ranked = SYL_ORDER.filter(n => all.includes(n));
  const rest = all.filter(n => !ranked.includes(n));
  return [...ranked, ...rest];
}
export async function switchSyllabus(v) {
  if (sylDirty && !await uiConfirm('You have unsaved flow edits on “' + plan.sylName + '”.\nDiscard them and switch to “' + v + '”?')) { refreshSyl(); return; }
  clearDirty(); plan.sylName = v; plan.custom = false; await savePlan(); await loadCourse(course);
  refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide(); setSaveStatus('switched to ' + v, 'ok');
}
/* ---------- reorder syllabi, courses or crew (modal is <OrdModal/>) ----------
   One mode variable, so only one list can ever be open and the modal keeps a
   single stable set of ids. The three openers take no argument on purpose:
   Header.jsx passes them straight to onClick, so a single openOrd(mode) would
   silently receive the click event as its mode. */
export let ordMode = null;               /* null | 'syllabus' | 'course' | 'crew' */
export function openOrd() { ordMode = 'syllabus'; notify(); }
export function openOrdCourse() { ordMode = 'course'; notify(); }
export function openOrdCrew() { ordMode = 'crew'; notify(); }
export function closeOrd() { ordMode = null; notify(); }
/* Rank against what actually exists now, the way orderedSylNames does: a
   teammate can add a course or a student over SharePoint while the modal sits
   open, and dropping them would delete their work rather than reorder it. */
function reranked(list, live) {
  const ranked = list.filter(n => live.includes(n));
  return [...ranked, ...live.filter(n => !ranked.includes(n))];
}
export async function saveOrderList(list) {
  SYL_ORDER = [...list]; await saveSylOrder();
  closeOrd(); refreshSyl();
  setSaveStatus('syllabus order saved', 'ok');
}
/* COURSES is itself the display order, so there is no separate ranking key. */
export async function saveCourseOrder(list) {
  COURSES = reranked(list, COURSES); await saveCourses();
  closeOrd(); refreshCourses();
  setSaveStatus('course order saved', 'ok');
}
/* renderBoard is NOT optional: wedge(i,n) slices every ball's ring by roster
   index, so without it the key re-orders while the balls keep the old
   assignment until the next grade. */
export async function saveCrewOrder(list) {
  roster = reranked(list, roster); await saveRoster();
  closeOrd(); refreshActive(); renderBoard(); renderSide();
  setSaveStatus('crew order saved', 'ok');
}
export async function restoreHiddenSyl(n) {
  SYL_HIDDEN = SYL_HIDDEN.filter(x => x !== n);
  delete SYL_TOMB[n];
  await saveSylPrefs();
  refreshSyl();
  setSaveStatus('restored built-in “' + n + '”', 'ok');
}
export async function switchCourse(v) {
  /* Picking a different course is like opening the app on it, so it does
     restore that course's last-marked syllabus. Picking a syllabus does not. */
  await loadCourse(v, true); refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
}
export async function addCourse() {
  const v = ((await uiPrompt('New course name (e.g. 26BBSG):')) || '').trim().toUpperCase(); if (!v) return;
  /* Front, not back: the newest course is the one being set up, so it should be
     the one the dropdown offers first and the one the app falls back to. */
  if (!COURSES.includes(v)) { COURSES.unshift(v); await saveCourses(); }
  const chosen = curSyl(); const useName = allSylNames().indexOf(chosen) >= 0 ? chosen : firstSylName();
  await sSet(kPlan(v), JSON.stringify({ lulls: [], mode: 'pace', epw: 2, target: null, sylName: useName, custom: false }));
  for (const sn of allSylNames()) await sSet(kRosterFor(v, sn), JSON.stringify([]));
  await sSet(kRosterMig(v), '1');   /* clean start: add students yourself, no marks carried over */
  await loadCourse(v); refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  setSaveStatus('course ' + v + ' created on the ' + useName + ' syllabus — add students to begin', 'ok');
}
export async function renCourse() {
  const old = course;
  const v = ((await uiPrompt('Rename course “' + old + '” to:', old)) || '').trim().toUpperCase();
  if (!v || v === old) return;
  if (COURSES.includes(v)) { await uiAlert('A course named ' + v + ' already exists.'); return; }
  const sylNames = [...new Set([...SYL_NAMES, ...Object.keys(CUSTOMS || {}), plan.sylName])];
  const move = async (a, b) => { const val = await sGet(a); if (val != null) await sSet(b, val); };
  await move(kPlan(old), kPlan(v));
  await move(kRoster(old), kRoster(v));
  await move(kRosterMig(old), kRosterMig(v));
  for (const sn of sylNames) {
    await move(kRosterFor(old, sn), kRosterFor(v, sn));
    let rs = [];
    try { const rr = await sGet(kRosterFor(old, sn)); rs = rr ? JSON.parse(rr) : []; } catch (_) { rs = []; }
    if (sn === plan.sylName) rs = [...new Set([...rs, ...roster])];
    for (const s of rs) {
      await move(kMarksFor(old, sn, s), kMarksFor(v, sn, s));
      await move(kDatesFor(old, sn, s), kDatesFor(v, sn, s));
    }
  }
  for (const s of roster) await move(kDatesOld(old, s), kDatesOld(v, s));
  /* Pace, target dates and lull periods hang off the COURSE, not a syllabus,
     so the per-syllabus loop above never reached them and a rename silently
     wiped every student's pacing. Gather everyone who appears on any roster of
     the old course, not just the one on screen. */
  const everyone = new Set(roster);
  for (const sn of sylNames) {
    try { const rr = await sGet(kRosterFor(old, sn)); (rr ? JSON.parse(rr) : []).forEach(s => everyone.add(s)); } catch (_) {}
  }
  for (const s of everyone) {
    await move(kPace(old, s), kPace(v, s));
    await move(kLulls(old, s), kLulls(v, s));
    await move(kLast(old, s), kLast(v, s));
  }
  await move(kLastStudent(old), kLastStudent(v));
  const myCrew = prefGet('lastCrew:' + old);
  if (myCrew) prefSet('lastCrew:' + v, myCrew);
  COURSES = COURSES.map(c => c === old ? v : c); await saveCourses();
  await loadCourse(v); refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  setSaveStatus('renamed ' + old + ' → ' + v, 'ok');
}
export async function delCourse() {
  if (COURSES.length <= 1) { await uiAlert('Keep at least one course.'); return; }
  if (!await uiConfirm('Delete course ' + course + '? (marks remain in storage)')) return;
  COURSES = COURSES.filter(c => c !== course); await saveCourses();
  await loadCourse(COURSES[0]); refreshCourses(); refreshActive(); renderBoard(); renderSide();
}

/* ---------- syllabus editor (JSON modal) ---------- */
export let sylModalOpen = false;
export function openModal() { sylModalOpen = true; notify(); }
export function closeModal() { sylModalOpen = false; notify(); }
/* Returns an error string, or null on success. */
export async function saveSylText(text) {
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('Must be a JSON array');
    arr.forEach((e, i) => {
      if (!e.id || !e.type) throw new Error('Event ' + i + ' needs id and type');
      e.phase = e.phase || 'Unphased'; e.seq = (e.seq != null) ? e.seq : i; e.prereqs = e.prereqs || [];
    });
    pushUndo(); SYL = arr; byid = {}; SYL.forEach(e => byid[e.id] = e); markDirty(); closeModal(); refreshSyl(); renderBoard(); renderSide();
    return null;
  } catch (err) { return err.message; }
}

/* ---------- arrange mode, editor tools, duplicate & save changes ---------- */
export let sylDirty = false;
function markDirty() { sylDirty = true; markFileDirty(); notify(); }
/* Both stacks. Leaving redoStack behind let a Redo pressed after a syllabus
   change write the PREVIOUS chart's positions over the new one and save them
   on the spot — four moved boxes on 2026 landed on Tx 2026 under test. */
function clearDirty() { sylDirty = false; undoStack = []; redoStack = []; notify(); }

export async function persistSyl() {
  if (!sylDirty && CUSTOMS[plan.sylName]) { setSaveStatus('no changes to save', 'ok'); return true; }
  const nm = plan.sylName;
  /* Built-ins are editable: the saved version is stored as a master override
     under the SAME name and takes precedence when the syllabus is loaded. */
  CUSTOMS[nm] = JSON.parse(JSON.stringify(SYL));
  await sSet(kSyls(course), JSON.stringify(CUSTOMS));
  clearDirty(); refreshSyl(); renderBoard(); renderSide();
  setSaveStatus('syllabus “' + nm + '” saved' + (SYLLABI[nm] ? ' (overrides the built-in)' : ''), 'ok');
  return true;
}

export async function dupSyl() {
  const src = plan.sylName;
  const nm = ((await uiPrompt('Name for the duplicated syllabus:', src + ' copy')) || '').trim();
  if (!nm) return;
  if (allSylNames().includes(nm)) { await uiAlert('A syllabus with that name already exists.'); return; }
  try {
    if (SYL_TOMB[nm]) { delete SYL_TOMB[nm]; await saveSylPrefs(); }
    /* 1) flow: copy exactly what's on screen now (captures any unsaved arrange edits) */
    CUSTOMS[nm] = JSON.parse(JSON.stringify(SYL));
    await sSet(kSyls(course), JSON.stringify(CUSTOMS));
    /* 2) layout: snapshot a COMPLETE set of positions for every event */
    await sSet(kLayoutFor(course, nm), JSON.stringify(await snapshotLayout(src)));
    /* 3) marks: copy every student's progress from the source syllabus */
    for (const s of roster) {
      const m = await sGet(kMarksFor(course, src, s)); if (m) await sSet(kMarksFor(course, nm, s), m);
      const d = await sGet(kDatesFor(course, src, s)); if (d) await sSet(kDatesFor(course, nm, s), d);
    }
    await sSet(kRosterFor(course, nm), JSON.stringify(roster));   /* same students on the copy */
    /* 4) switch to the copy, flush to storage, then reload cleanly */
    plan.sylName = nm; plan.custom = false; await savePlan();
    if (typeof flushNow === 'function') { try { await flushNow(); } catch (_) {} }
    clearDirty(); await loadCourse(course);
    refreshSyl(); refreshActive(); renderBoard(); renderSide();
    setSaveStatus('duplicated as “' + nm + '”', 'ok');
  } catch (err) {
    delete CUSTOMS[nm];
    await uiAlert('Could not duplicate the syllabus — nothing was changed.\n\n' + ((err && err.message) || err));
    await loadCourse(course); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  }
}

/* Add syllabus: a brand-new EMPTY sheet (no events, no marks). */
export async function addSyl() {
  const nm = ((await uiPrompt('Name for the new (empty) syllabus:', 'New syllabus')) || '').trim();
  if (!nm) return;
  if (allSylNames().includes(nm)) { await uiAlert('A syllabus with that name already exists.'); return; }
  try {
    if (SYL_TOMB[nm]) { delete SYL_TOMB[nm]; await saveSylPrefs(); }
    CUSTOMS[nm] = [];                         /* empty event list */
    await sSet(kSyls(course), JSON.stringify(CUSTOMS));
    await sSet(kLayoutFor(course, nm), JSON.stringify({}));  /* blank canvas */
    await sSet(kRosterFor(course, nm), JSON.stringify([]));  /* no students yet */
    plan.sylName = nm; plan.custom = false; await savePlan();
    if (typeof flushNow === 'function') { try { await flushNow(); } catch (_) {} }
    clearDirty(); await loadCourse(course);
    refreshSyl(); refreshActive(); renderBoard(); renderSide();
    setSaveStatus('added empty syllabus “' + nm + '”', 'ok');
    if (!arrangeMode) flashHint('Empty sheet ready — hit “✎ Edit”, then use + Flight / + Acad / + Test / + Sim / + CFT to add events.');
  } catch (err) {
    delete CUSTOMS[nm];
    await uiAlert('Could not add the syllabus — nothing was changed.\n\n' + ((err && err.message) || err));
    await loadCourse(course); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  }
}

/* Rename syllabus: works on built-ins too. */
export async function renSyl() {
  const old = plan.sylName;
  const nm = ((await uiPrompt('Rename syllabus “' + old + '” to:', old)) || '').trim();
  if (!nm || nm === old) return;
  if (allSylNames().includes(nm)) { await uiAlert('A syllabus named “' + nm + '” already exists.'); return; }
  try {
    if (SYL_TOMB[nm]) delete SYL_TOMB[nm];
    const snap = await snapshotLayout(old);
    CUSTOMS[nm] = JSON.parse(JSON.stringify(SYL));
    delete CUSTOMS[old];
    await sSet(kSyls(course), JSON.stringify(CUSTOMS));
    SYL_TOMB[old] = 1;
    await purgeLegacySyl(old);
    await moveSylData(old, nm);
    await sSet(kLayoutFor(course, nm), JSON.stringify(snap));
    const base = SYL_ALIAS[old] || (SYLLABI[old] ? old : null);
    if (base) { SYL_ALIAS[nm] = base; if (DEFAULT_LAYOUTS[base]) DEFAULT_LAYOUTS[nm] = DEFAULT_LAYOUTS[base]; }
    delete SYL_ALIAS[old];
    if (SYLLABI[old] && !isHidden(old)) SYL_HIDDEN.push(old);
    await saveSylPrefs();
    SYL_ORDER = SYL_ORDER.map(n => n === old ? nm : n); await saveSylOrder();
    plan.sylName = nm; plan.custom = false; await savePlan();
    if (typeof flushNow === 'function') { try { await flushNow(); } catch (_) {} }
    clearDirty(); await loadCourse(course);
    refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
    setSaveStatus('renamed “' + old + '” → “' + nm + '”', 'ok');
  } catch (err) {
    await uiAlert('Could not rename the syllabus.\n\n' + ((err && err.message) || err));
    await loadCourse(course); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  }
}

/* Delete syllabus: removes ANY syllabus - custom or built-in. */
export async function delSyl() {
  const nm = plan.sylName, isB = !!builtinOf(nm);
  if (allSylNames().length <= 1) { await uiAlert('Keep at least one syllabus.'); return; }
  let confirmed = false;
  if (isB && CUSTOMS[nm]) {
    const c = await uiChoice('“' + nm + '” is a built-in syllabus that has saved edits.\n\nDelete it outright, or just throw away your edits and keep the shipped version?',
      'Delete it', 'Revert edits only');
    if (c === 'cancel') return;
    if (c === 'ok') confirmed = true;
    if (c === 'alt') {
      delete CUSTOMS[nm];
      await sSet(kSyls(course), JSON.stringify(CUSTOMS));
      if (typeof flushNow === 'function') { try { await flushNow(); } catch (_) {} }
      clearDirty(); await loadCourse(course);
      refreshSyl(); refreshActive(); renderBoard(); renderSide();
      setSaveStatus('“' + nm + '” reverted to built-in', 'ok');
      return;
    }
  }
  if (!confirmed && !await uiConfirm('Delete syllabus “' + nm + '”?\n\nThis removes its flow, its layout and every student’s marks on it, in every course.' +
    (isB ? '\n\nIt is a built-in — you can bring it back later from ⇅ Reorder.' : '\nThis cannot be undone.'))) return;
  try {
    delete CUSTOMS[nm];
    await sSet(kSyls(course), JSON.stringify(CUSTOMS));
    if (SYLLABI[nm] && !isHidden(nm)) SYL_HIDDEN.push(nm);
    SYL_TOMB[nm] = 1;
    if (SYL_ALIAS[nm]) delete DEFAULT_LAYOUTS[nm];   /* alias copy only - never the shipped one */
    delete SYL_ALIAS[nm];
    await purgeLegacySyl(nm);
    await moveSylData(nm, null);
    await saveSylPrefs();
    SYL_ORDER = SYL_ORDER.filter(n => n !== nm); await saveSylOrder();
    plan.sylName = firstSylName(); plan.custom = false; await savePlan();
    if (typeof flushNow === 'function') { try { await flushNow(); } catch (_) {} }
    clearDirty(); await loadCourse(course);
    refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
    setSaveStatus('deleted syllabus “' + nm + '”', 'ok');
  } catch (err) {
    await uiAlert('Could not delete the syllabus.\n\n' + ((err && err.message) || err));
    await loadCourse(course); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  }
}

export function toggleArrange() {
  arrangeMode = !arrangeMode;
  /* Capture the framing FIRST (see original comments). */
  if (arrangeMode) { captureViewFromScroll(); setTool('move'); renderBoard(); applyView(); }
  else {
    connectSrc = null; const keep = { x: view.x, y: view.y, k: view.k }; renderBoard(); view = keep; restoreScrollFromView();
    if (sylDirty) setSaveStatus('unsaved flow edits — hit “Save changes”', 'saving');
  }
  notify();
}
export function fitViewClick() { if (arrangeMode) fitView(); }
/* Escape finishes an in-progress line */
export function handleEscapeKey(e) {
  if (e.key !== 'Escape') return;
  /* Escape abandons a half-picked lull period rather than saving one end of it. */
  if (lullCopy) { e.preventDefault(); closeLullCopy(); return; }
  if (lullPick) { e.preventDefault(); closeLullPicker(); return; }
  if (!arrangeMode || tool !== 'line' || !drawing) return;
  e.preventDefault(); finishLine(drawing.pts.length >= 2);
}
/* Delete / Backspace removes the current selection while arranging */
export async function handleDeleteKey(e) {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (!arrangeMode) return;
  if (selLine && !selBalls.size) {
    const t0 = e.target, g0 = (t0 && t0.tagName || '').toLowerCase();
    if (g0 === 'input' || g0 === 'textarea' || g0 === 'select' || (t0 && t0.isContentEditable)) return;
    e.preventDefault(); deleteLine(selLine); return;
  }
  if (!selBalls.size) return;
  const t = e.target, tag = (t && t.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
  if (editId != null || sylModalOpen) return;
  e.preventDefault();
  await deleteEvents([...selBalls]);
}
/* Toolbar: tool select with delete-selection shortcut behaviour */
export async function toolButtonClick(t) {
  if (t === 'delball' && selBalls.size) { await deleteEvents([...selBalls]); return; }
  if (t === 'delball' && selLine) { deleteLine(selLine); return; }
  setTool(t);
}
export function arrowClick() {
  const FL = lineById(selLine);
  if (FL) {
    pushUndo(); FL.arrow = (lineArrow(FL) + 1) % 3;
    const made = deriveLineLinks();
    markDirty(); saveLayout(); renderBoard(); renderSide();
    const where = FL.arrow === 0 ? 'Arrow at the finish end.' : FL.arrow === 1 ? 'Arrow at the start end.' : 'No arrow — using the direction it was drawn in.';
    flashHint(made.length ? (where + ' Linked ' + made.join(', ')) : where); return;
  }
  if (!selEdge) { flashHint('Select a line first — Line or Edit lines, then click the line.'); return; }
  pushUndo(); const m = edgeMeta[selEdge] = edgeMeta[selEdge] || {}; m.arrow = ((m.arrow == null ? 0 : m.arrow) + 1) % 3; markDirty(); saveLayout(); renderBoard();
}
export function selectAllClick() {
  if (!arrangeMode) return;
  if (selBalls.size === SYL.length) selBalls = new Set(); else selBalls = new Set(SYL.map(e => e.id));
  renderBoard(); flashHint(selBalls.size ? 'All balls selected — change the Font box to resize their labels.' : 'Selection cleared.');
}
export function setFont(v) {
  v = parseFloat(v) || 8.5;
  pushUndo(); layout.__font = layout.__font || {};
  if (selBalls.size) selBalls.forEach(id => layout.__font[id] = v); else layout.__font.__all = v;
  markDirty(); saveLayout(); renderBoard();
}
export async function resetLayoutClick() {
  /* Name the lines. "Manual moves" read as "the boxes I dragged", but this
     empties the whole layout — every hand-drawn line goes with it, and once any
     later edit saves the empty state the shipped lines stop coming back. */
  const nLines = (layout.__lines || []).length;
  const what = nLines
    ? 'Reset this syllabus back to the course-map layout?\n\nThis puts every box back where the map has it AND deletes all ' + nLines + ' lines drawn on this chart.'
    : 'Reset your manual moves and return to the course-map layout for this syllabus?';
  if (!await uiConfirm(what)) return;
  pushUndo();                    /* so ↶ Undo can actually take it back */
  layout = {}; await saveLayout(); renderBoard();
}
async function deleteEvents(ids) {
  const list = [...new Set((ids || []).filter(id => id && byid[id]))];
  if (!list.length) return;
  const names = list.map(id => byid[id].label || id);
  const preview = names.slice(0, 12).join(', ') + (names.length > 12 ? ' … (+' + (names.length - 12) + ' more)' : '');
  const msg = list.length === 1
    ? 'Delete ' + names[0] + ' from this syllabus?'
    : 'Delete these ' + list.length + ' events from this syllabus?\n\n' + preview;
  if (!await uiConfirm(msg)) return;
  pushUndo();
  const kill = new Set(list);
  SYL = SYL.filter(e => !kill.has(e.id));
  SYL.forEach(e => { e.prereqs = (e.prereqs || []).filter(p => !kill.has(p)); });
  LINES().forEach(L => {
    ['a', 'b'].forEach(k => {
      const an = L[k]; if (!an) return;
      if (an.t === 'ball' && kill.has(an.id)) L[k] = null;
      else if (an.t === 'edge' && (kill.has(an.p) || kill.has(an.c))) L[k] = null;
    });
  });
  if (layout.__derived) layout.__derived = layout.__derived.filter(k => { const p = k.split('▸')[0], c = k.split('▸')[1]; return !kill.has(p) && !kill.has(c); });
  byid = {}; SYL.forEach(e => byid[e.id] = e);
  kill.forEach(id => {
    delete layout[id];
    if (layout.__font) delete layout.__font[id];
  });
  for (const k in edgeMeta) { const parts = k.split('▸'); if (kill.has(parts[0]) || kill.has(parts[1])) delete edgeMeta[k]; }
  {
    const live = ek => {
      if (isLineKey(ek)) return true;   /* free-line keys aren't event pairs */
      const parts = ek.split('▸'); return !kill.has(parts[0]) && !kill.has(parts[1]);
    };
    merges = new Set([...merges].filter(mk => (mk + '').split('|').every(live)));
    unmerges = new Set([...unmerges].filter(mk => (mk + '').split('|').every(live)));
  }
  selBalls = new Set();
  markDirty(); await saveLayout(); refreshSyl(); renderBoard(); renderSide();
  setSaveStatus(list.length + ' event' + (list.length === 1 ? '' : 's') + ' deleted — Undo restores them', 'ok');
}
async function deleteEventById(rid) {
  /* clicking a ball that belongs to the current selection removes the whole group */
  if (selBalls.size > 1 && selBalls.has(rid)) return deleteEvents([...selBalls]);
  return deleteEvents([rid]);
}

/* ---------- save status + backup (auto-save + manual backup button) ---------- */
/* Starts blank, not "saved". A fresh load has saved nothing, and claiming it
   spends the one indicator the user has for whether their work is safe. */
export let saveStat = { text: '', cls: '' };
/* A bare green "saved" used to be shown for EVERY 'ok', whatever had actually
   happened — so switching syllabus reported "saved", and a successful syllabus
   write reported the same words as a successful file write. Sat next to the
   orange "Save changes" button (which watches a different flag) it told the
   user their work was both safe and at risk in the same six pixels.
   Now only a caller that passes no message gets the bare word; anything that
   names what it did says so. Three callers rely on the empty form. */
function setSaveStatus(msg, cls) {
  saveStat = {
    text: (cls === 'saving' ? (msg ? '● ' + msg : '● saving…')
      : cls === 'ok' ? (msg ? '● ' + msg : '● saved')
        : '● ' + msg),
    cls: cls || ''
  };
  notify();
}

/* Seed a brand-new browser from SEED_STATE, once.

   It used to delete every stored syllabus and layout first, so that a freshly
   baked standalone HTML would show its own charts rather than the viewer's
   saved overrides. That export is gone, and with it the only reason to do
   something so destructive: bumping SEED_STAMP would now wipe the user's own
   charts out of their browser. Seeding only adds. */
async function applyBundle() {
  if (typeof SEED_STAMP === 'undefined' || !SEED_STAMP) return;
  let cur = null; try { cur = await sGet('v3:seedstamp'); } catch (e) {}
  if (cur === SEED_STAMP) return;
  for (const k in (SEED_STATE || {})) { try { await sSet(k, SEED_STATE[k]); } catch (_) {} }
  try { await sSet('v3:seedstamp', SEED_STAMP); } catch (e) {}
}

/* ---------- cloud button state + sync integration ---------- */
export let cloudBtn = { text: '☁ Cloud', title: 'Connect this tool to a shared database so everyone sees the same live data', mode: 'dialog' };
export { loadLatest };
function isUiBusy() {
  try {
    if (arrangeMode) return true;
    if (drag) return true;
    if (editId != null || sylModalOpen) return true;
    if (pop) return true;
  } catch (e) {}
  return false;
}
/* re-render the app from a refreshed store (used by both sync layers + import) */
async function reloadFromStore() {
  const keepActive = active;
  const keepCal = calView;
  await loadCourses();
  try { await loadSylPrefs(); } catch (_) {}
  await loadSylOrder();
  await loadEventInfo();
  const c = (COURSES.indexOf(course) >= 0) ? course : COURSES[0];
  await loadCourse(c);
  if (keepActive && roster.indexOf(keepActive) >= 0) active = keepActive;
  if (keepCal) calView = keepCal;
  refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
}

/* ---------- reading state out, for the user's file ----------
   Two halves that never mix: charts draw the flow and name nobody; students
   name and grade people and hold no chart. See
   docs/superpowers/specs/2026-08-07-syllabus-file-design.md */

/* Charts: everything that draws the flow. Never a person. */
export async function collectCharts(names) {
  const list = (names && names.length) ? names : orderedSylNames();
  const syllabi = {}, layouts = {}, order = [];
  for (const n of list) {
    const src = sylSource(n); if (!src) continue;
    order.push(n);
    syllabi[n] = JSON.parse(JSON.stringify(src));
    layouts[n] = await layoutSnapshotFor(n, syllabi[n]);
  }
  const ei = JSON.parse(JSON.stringify(EVENT_INFO));
  for (const k in (eventInfo || {})) ei[k] = Object.assign({}, ei[k] || {}, eventInfo[k]);
  return { order, syllabi, layouts, eventInfo: ei };
}

/* Students: everything that names or grades a person. Never a chart. */
export async function collectStudents() {
  const byCourse = {};
  for (const c of COURSES) {
    const bySyllabus = {};
    for (const n of orderedSylNames()) {
      const rRaw = await sGet(kRosterFor(c, n));
      let roster = []; try { roster = rRaw ? JSON.parse(rRaw) : []; } catch (_) { roster = []; }
      if (!roster.length) continue;
      const marks = {}, dates = {};
      for (const s of roster) {
        const m = await sGet(kMarksFor(c, n, s)); if (m) { try { marks[s] = JSON.parse(m); } catch (_) {} }
        const d = await sGet(kDatesFor(c, n, s)); if (d) { try { dates[s] = JSON.parse(d); } catch (_) {} }
      }
      bySyllabus[n] = { roster, marks, dates };
    }
    let planObj = {};
    try { const p = await sGet(kPlan(c)); if (p) planObj = JSON.parse(p); } catch (_) {}
    /* Lulls hang off the course, not a syllabus, so they ride beside plan
       rather than inside bySyllabus. Purely additive: an older file simply has
       no key here and migrates from plan.lulls when it is opened. */
    const lullsOut = {}, paceOut = {};
    for (const n of orderedSylNames()) {
      const rRaw = await sGet(kRosterFor(c, n));
      let rr = []; try { rr = rRaw ? JSON.parse(rRaw) : []; } catch (_) { rr = []; }
      for (const st of rr) {
        if (lullsOut[st]) continue;
        const l = await sGet(kLulls(c, st));
        if (l) { try { lullsOut[st] = JSON.parse(l); } catch (_) {} }
        const pc = await sGet(kPace(c, st));
        if (pc) { try { paceOut[st] = JSON.parse(pc); } catch (_) {} }
      }
    }
    byCourse[c] = { plan: planObj, lulls: lullsOut, pace: paceOut, bySyllabus };
  }
  return { courses: COURSES.slice(), byCourse };
}

/* ---------- writing state back in, from the user's file ---------- */

/* Charts only. Writes syllabus definitions, layouts and event info — and
   nothing filed under a student. THE RULE: no roster, mark or date key may be
   written here, so importing a chart can never disturb anyone's progress.
   scripts/smoke.mjs pins that by watching every localStorage write. */
export async function applyCharts(charts, opts) {
  const o = opts || {};
  const list = (o.names && o.names.length) ? o.names : (charts.order || Object.keys(charts.syllabi || {}));
  const applied = [];
  for (const src of list) {
    const events = (charts.syllabi || {})[src];
    if (!events) continue;
    const target = (o.mode === 'add' && o.rename && o.rename.from === src) ? o.rename.to : src;
    CUSTOMS[target] = JSON.parse(JSON.stringify(events));
    const lay = (charts.layouts || {})[src];
    if (lay) await sSet(kLayoutFor(course, target), JSON.stringify(lay));
    if (SYL_TOMB[target]) delete SYL_TOMB[target];
    if (SYL_HIDDEN.indexOf(target) >= 0) SYL_HIDDEN = SYL_HIDDEN.filter(n => n !== target);
    if (!SYL_ORDER.includes(target)) SYL_ORDER.push(target);
    applied.push(target);
  }
  /* The file records the order the user put their charts in. It was written on
     save and never read back, so opening the file elsewhere gave the shipped
     order with the extras tacked on the end. Only on a whole-file open —
     importing one syllabus must not reshuffle everything else. */
  if (!o.names && Array.isArray(charts.order) && charts.order.length) {
    const rest = SYL_ORDER.filter(n => !charts.order.includes(n));
    SYL_ORDER = [...charts.order, ...rest];
  }
  await sSet(kSyls(course), JSON.stringify(CUSTOMS));
  if (charts.eventInfo) {
    for (const k in charts.eventInfo) eventInfo[k] = Object.assign({}, eventInfo[k] || {}, charts.eventInfo[k]);
    scrubEventInfo(); /* the file carries the whole table; keep only real edits */
    await saveEventInfo();
  }
  await saveSylPrefs(); await saveSylOrder();
  await loadCourse(course);
  refreshSyl(); renderBoard(); renderSide();
  return { applied };
}

/* People only. Never writes a syllabus or layout key. */
export async function applyStudents(students) {
  const courses = (students && students.courses) || [];
  for (const c of courses) {
    const cs = (students.byCourse || {})[c] || {};
    if (cs.plan) await sSet(kPlan(c), JSON.stringify(cs.plan));
    for (const st in (cs.lulls || {})) await sSet(kLulls(c, st), JSON.stringify(cs.lulls[st]));
    for (const st in (cs.pace || {})) await sSet(kPace(c, st), JSON.stringify(cs.pace[st]));
    for (const n in (cs.bySyllabus || {})) {
      const b = cs.bySyllabus[n];
      await sSet(kRosterFor(c, n), JSON.stringify(b.roster || []));
      for (const s in (b.marks || {})) await sSet(kMarksFor(c, n, s), JSON.stringify(b.marks[s]));
      for (const s in (b.dates || {})) await sSet(kDatesFor(c, n, s), JSON.stringify(b.dates[s]));
    }
  }
  /* Merge, never replace. Overwriting the list dropped every course of the
     person doing the opening: their marks stayed in storage but the course was
     no longer in the dropdown, so there was no way back to them. Their own
     courses stay first; the file's are appended. */
  if (courses.length) {
    const mine = COURSES.slice();
    const merged = [...mine, ...courses.filter(c => !mine.includes(c))];
    await sSet(kCourses, JSON.stringify(merged));
  }
  await reloadFromStore();
  return { courses: courses.slice() };
}

/* ---------- the user's file: Open and Save changes ----------
   Saving is manual on purpose, so the file always holds a version the user
   chose. To make forgetting hard rather than silent, the Save button carries a
   dot whenever there is unsaved work and closing the tab warns first. */
export let openFileName = null, openFileHasStudents = false, fileDirty = false, lastSavedAt = null;
/* Both on by default: this file is the owner's working save and their backup,
   so it should hold everything unless they choose otherwise. The handover case
   is ⤓ Save a copy, which starts with students OFF — that is where the
   send-it-to-someone risk lives, not here. */
export let saveOpts = { charts: true, students: true };
let fileHandle = null;

export function setSaveOpt(which, on) { saveOpts = { ...saveOpts, [which]: !!on }; notify(); }
/* Called from markDirty() and from endDrag(): dragging a ball saves its own
   position, so before this it never lit the Save button — an easy way to think
   work was saved when the file had not been touched. */
export function markFileDirty() { if (!fileDirty) { fileDirty = true; notify(); } }

async function fileBody(opts, savedAt) {
  return FMT.buildFile({
    charts: opts.charts ? await collectCharts(null) : null,
    students: opts.students ? await collectStudents() : null,
    savedAt,
  });
}

export async function openFileClick() {
  if (!FS.canWriteInPlace()) { await uiAlert('This browser cannot open a file directly.\n\nUse Chrome or Edge.'); return; }
  const picked = await FS.pickOpen();          /* no await before this — gesture */
  if (!picked) return;
  lastSavedAt = null;
  let obj; try { obj = JSON.parse(picked.text); } catch (_) { await uiAlert('That file is not readable as JSON.'); return; }
  let info; try { info = FMT.describeFile(obj); } catch (e) { await uiAlert(e.message); return; }
  const { charts, students } = FMT.readFile(obj);
  if (charts) await applyCharts(charts, { names: null, mode: 'replace', rename: null });
  if (students) await applyStudents(students);
  fileHandle = picked.handle;
  openFileName = picked.handle.name;
  openFileHasStudents = info.students;
  /* Turn boxes ON to match the file, never OFF. Downgrading here would mean
     opening a charts-only file silently drops everyone's marks out of the next
     save — losing them from the very file being relied on as the backup. */
  saveOpts = { charts: saveOpts.charts || info.charts, students: saveOpts.students || info.students };
  fileDirty = false;
  setSaveStatus('opened ' + openFileName, 'ok'); notify();
}

/* ---------- Save a copy: the handover case ----------
   Students start OFF and are reset OFF on every open, not just the first. This
   is the moment a file leaves the owner's hands, so it begins clean and they
   have to opt in — the safety measure agreed when tick-boxes were chosen over
   two files that cannot mix. */
export let copyOpen = false, copyOpts = { charts: true, students: false }, copyPick = {};
export function openCopy() {
  copyOpts = { charts: true, students: false };
  copyPick = {}; orderedSylNames().forEach(n => { copyPick[n] = (n === curSyl()); });
  copyOpen = true; notify();
}
export function closeCopy() { copyOpen = false; notify(); }
export function setCopyOpt(which, on) { copyOpts = { ...copyOpts, [which]: !!on }; notify(); }
export function setCopyPick(name, on) { copyPick = { ...copyPick, [name]: !!on }; notify(); }

export async function saveCopyClick() {
  const names = Object.keys(copyPick).filter(n => copyPick[n]);
  if (!copyOpts.charts && !copyOpts.students) { await uiAlert('Tick charts, students, or both.'); return; }
  if (copyOpts.charts && !names.length) { await uiAlert('Tick at least one syllabus.'); return; }
  const savedAt = new Date().toISOString();
  const opts = { ...copyOpts };
  const name = FMT.suggestedFileName(opts, savedAt);
  let handle = null;
  if (FS.canWriteInPlace()) { handle = await FS.pickSave(name); if (!handle) return; }
  const text = JSON.stringify(FMT.buildFile({
    charts: opts.charts ? await collectCharts(names) : null,
    students: opts.students ? await collectStudents() : null, savedAt }), null, 2);
  try {
    if (handle) await FS.writeTo(handle, text); else FS.downloadInstead(name, text);
  } catch (err) {
    closeCopy(); setSaveStatus('copy NOT saved — ' + ((err && err.message) || err), 'err'); notify(); return;
  }
  closeCopy();
  setSaveStatus('', 'ok'); notify();
  await uiAlert('Copy saved as “' + (handle ? handle.name : name) + '”.\n\n'
    + (opts.students ? 'It CONTAINS student names and marks.' : 'It contains charts only — no student names or marks.'));
}

/* Take one syllabus out of another file and drop it into what is already here —
   for when a new syllabus is issued. Marks are never touched either way:
   applyCharts writes no roster, mark or date key, which smoke.mjs pins by
   watching every storage write. */
export async function importSyllabusClick() {
  if (!FS.canWriteInPlace()) { await uiAlert('This browser cannot open a file directly.\n\nUse Chrome or Edge.'); return; }
  const picked = await FS.pickOpen();          /* no await before this — gesture */
  if (!picked) return;
  let obj; try { obj = JSON.parse(picked.text); } catch (_) { await uiAlert('That file is not readable as JSON.'); return; }
  let info; try { info = FMT.describeFile(obj); } catch (e) { await uiAlert(e.message); return; }
  if (!info.charts || !info.syllabusNames.length) { await uiAlert('That file holds no charts.'); return; }
  const { charts } = FMT.readFile(obj);
  const done = [];
  for (const name of info.syllabusNames) {
    if (!allSylNames().includes(name)) {
      await applyCharts(charts, { names: [name], mode: 'replace', rename: null });
      done.push(name); continue;
    }
    const c = await uiChoice(
      '“' + name + '” already exists.\n\nReplace it, or add the incoming one under a new name?',
      'Replace it', 'Add as new');
    if (c === 'cancel') continue;
    if (c === 'ok') {
      await applyCharts(charts, { names: [name], mode: 'replace', rename: null });
      done.push(name); continue;
    }
    const to = ((await uiPrompt('Name for the incoming syllabus:', name + ' (new)')) || '').trim();
    if (!to || allSylNames().includes(to)) { await uiAlert('That name is blank or already taken.'); continue; }
    await applyCharts(charts, { names: [name], mode: 'add', rename: { from: name, to } });
    done.push(to);
  }
  if (done.length) { markFileDirty(); setSaveStatus('', 'ok'); }
  await uiAlert(done.length
    ? 'Brought in: ' + done.join(', ') + '.\n\nEveryone’s marks are untouched.\nPress Save changes to write this into your file.'
    : 'Nothing was brought in.');
  notify();
}

/* One Save button, not two. It saves the syllabus into the browser as it always
   did, and then writes your file — which is where the work really lives. */
export async function saveChangesClick() {
  /* Ask for write permission FIRST, before anything else awaits. Opening a file
     only grants read, so saving has to ask — and the browser only allows that
     question while the click that started it is still live. Doing any other work
     first spends that click and the request fails, which is what made this
     button look dead after opening a file. */
  if (fileHandle && !await FS.ensureWritable(fileHandle)) {
    setSaveStatus('not saved — allow the browser to write to your file, then press Save again', 'err');
    notify(); return;
  }
  await persistSyl();
  await saveToFileClick();
}

export async function saveToFileClick() {
  const savedAt = new Date().toISOString();
  const name = FMT.suggestedFileName(saveOpts, savedAt);
  if (!fileHandle) {
    if (!FS.canWriteInPlace()) {
      FS.downloadInstead(name, JSON.stringify(await fileBody(saveOpts, savedAt), null, 2));
      setSaveStatus('downloaded a copy — this browser cannot save in place', 'ok');
      fileDirty = false; notify(); return;
    }
    fileHandle = await FS.pickSave(name);      /* gesture-critical */
    /* Cancelling used to return in silence: the user had just been told their
       work was unsaved, pressed Save, and been told nothing at all. Say what
       did and did not happen — the syllabus write above this already ran. */
    if (!fileHandle) {
      setSaveStatus('no file chosen — nothing written to disk', 'err');
      notify(); return;
    }
  }
  if (!await FS.ensureWritable(fileHandle)) {
    setSaveStatus('not saved — permission to write your file was declined', 'err'); notify(); return;
  }
  /* Any failure here must be loud. This file may be the user's only copy, so
     reporting success when nothing was written is the worst thing the app can
     do — worse than crashing, because they would never know to try again. */
  const text = JSON.stringify(await fileBody(saveOpts, savedAt), null, 2);
  try {
    await FS.writeTo(fileHandle, text);
  } catch (err) {
    fileDirty = true; lastSavedAt = null;
    setSaveStatus('NOT SAVED — ' + ((err && err.message) || err) + ' — try Save again', 'err');
    notify(); return;
  }
  openFileName = fileHandle.name; openFileHasStudents = !!saveOpts.students;
  fileDirty = false;
  /* The shared status widget rewrites every 'ok' message to a bare "saved", so
     the proof that a real write happened goes next to the file name instead. */
  const kb = Math.round(new Blob([text]).size / 1024);
  lastSavedAt = `saved ${kb} KB at ${new Date().toLocaleTimeString()}`;
  setSaveStatus('', 'ok'); notify();
}

/* ---------- init ---------- */
export let ready = false;
const cloudCfgFn = () => { try { return cloudCfg(); } catch (e) { return null; } };
let initStarted = false;
export async function init() {
  if (initStarted) return; initStarted = true;
  setCloudSinks({
    status: s => { saveStat = s; notify(); },
    btn: b => { cloudBtn = { ...cloudBtn, ...b }; notify(); },
    busy: isUiBusy,
    reload: reloadFromStore,
  });
  await applyBundle();
  await loadCourses();
  await loadSylPrefs();
  /* After loadCourses, which is what fills COURSES — a course that was deleted,
     renamed, or only ever existed in someone else's browser simply fails the
     membership test and falls back to the top of the list. */
  const __want = prefGet('lastCourse');
  await loadCourse((__want && COURSES.includes(__want)) ? __want : COURSES[0], true);
  await loadEventInfo(); await loadSylOrder();
  ready = true;
  refreshCourses(); refreshSyl(); refreshActive(); renderBoard(); renderSide();
  /* After the first paint, so the balls exist to measure. */
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => showLastEdit(active));
  else showLastEdit(active);
  /* Unsaved work must not vanish quietly when the tab closes. */
  if (typeof window !== 'undefined')
    window.addEventListener('beforeunload', e => { if (fileDirty) { e.preventDefault(); e.returnValue = ''; } });
  /* Turning a phone sideways changes how much chart fits, so re-fit unless the
     user has set the zoom themselves. */
  if (typeof window !== 'undefined') {
    let t = null;
    window.addEventListener('resize', () => {
      if (zoomIsMine || arrangeMode) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const svg = document.getElementById('flowSvg'); if (!svg) return;
        fitPhoneWidth(parseFloat(svg.getAttribute('width')) || 0);
        applyFlowZoom(); notify();
      }, 120);
    });
  }
  /* The board is rendered imperatively and this module exports nothing to the
     page, so scripts/smoke.mjs has no other way to reach these. */
  if (typeof window !== 'undefined') {
    window.__coreForTests = { layoutSnapshotFor, collectCharts, collectStudents,
      applyCharts, applyStudents, SYLLABI, DEFAULT_LAYOUTS };
    window.__fileFormatForTests = FMT;
    window.__fileStoreForTests = FS;
    /* Playwright cannot drive the OS file picker, so smoke.mjs injects a stub
       handle to exercise the save path — including the permission refusal that
       made Save appear dead after opening a file. */
    window.__setFileHandleForTests = h => { fileHandle = h; openFileName = h ? h.name : null; notify(); };
    /* Save changes is only on screen while there is unsaved work, so a test that
       wants to press it has to put the app in that state first. */
    window.__markFileDirtyForTests = () => markFileDirty();
  }
}
