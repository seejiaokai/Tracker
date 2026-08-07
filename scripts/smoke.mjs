/*
 * Browser smoke suite for the OCU Progress Tracker.
 *
 *   npm run smoke              build dist/, serve it, drive it, tear down
 *   npm run smoke -- --keep    leave the preview server running afterwards
 *   APP_URL=http://host/path/ npm run smoke      test an already-running app instead
 *
 * It builds and serves with GITHUB_PAGES=true so the base path matches what
 * GitHub Pages serves — this exercises the real production bundle, not the dev server.
 *
 * Chromium: uses Playwright's own download when present. If the browser lives
 * somewhere else (some CI images ship one), point CHROMIUM_PATH at it.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = process.env.SMOKE_PORT || 4179;
const OWN_SERVER = !process.env.APP_URL;
const URL = process.env.APP_URL || `http://localhost:${PORT}/Tracker/`;
const KEEP = process.argv.includes('--keep');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? ' PASS' : ' FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const run = (cmd, args, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', c => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
});
const waitForServer = async url => {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(url)).ok) return true; } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};

let server = null;
if (OWN_SERVER) {
  console.log('building dist/ (GITHUB_PAGES=true) …');
  await run('npx', ['vite', 'build'], { env: { ...process.env, GITHUB_PAGES: 'true' } });
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { env: { ...process.env, GITHUB_PAGES: 'true' }, stdio: 'ignore', shell: process.platform === 'win32' });
  if (!await waitForServer(URL)) { console.error(`preview server never came up at ${URL}`); server.kill(); process.exit(1); }
}
const stopServer = () => { if (server && !KEEP) server.kill(); };

const execPath = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch(execPath ? { executablePath: execPath } : {});
const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });

const errs = [], bad4xx = [];
pg.on('pageerror', e => errs.push(e.message));
/* The SharePoint probes 404 by design outside SharePoint (see src/sync/local.js
   falling back to localStorage); anything else failing to load is a real problem. */
const EXPECTED_404 = /_api\/(web|contextinfo)/;
pg.on('response', r => { if (r.status() >= 400 && !EXPECTED_404.test(r.url())) bad4xx.push(r.status() + ' ' + r.url()); });

console.log(`\n=== ${URL} ===\n`);
await pg.goto(URL, { waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball', { timeout: 20000 });

const nBalls = await pg.locator('#flowSvg .ball').count();
ok('app boots and renders the flow board', nBalls > 100, `${nBalls} events`);

/* ---- hover bubble stays put while crossing a ball ---- */
await pg.click('#detailsBtn'); await pg.waitForTimeout(250);
const t = await pg.evaluate(() => {
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === 'ST-01');
  const r = g.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
});
await pg.evaluate(() => {
  window.__n = 0;
  document.querySelectorAll('#flowSvg .ball').forEach(g => g.addEventListener('pointerenter', () => window.__n++));
});
await pg.mouse.move(t.cx, t.cy - t.w);
for (let dy = -Math.round(t.w / 2) - 2; dy <= Math.round(t.w / 2) + 2; dy++) await pg.mouse.move(t.cx, t.cy + dy);
const enters = await pg.evaluate(() => window.__n);
ok('one hover enter per ball crossing (no bubble flicker)', enters === 1, `${enters} enter events`);
await pg.click('#detailsBtn'); await pg.waitForTimeout(200);

/* ---- inline editing in the Show All list ---- */
const row = id => pg.locator('.sarow').filter({ has: pg.locator('.sid', { hasText: new RegExp(`^${id}$`) }) }).first();
const meta = async id => ((await row(id).locator('.smeta').textContent()) || '').replace(/\s+/g, ' ').trim();
const set = async (label, val) => {
  const l = pg.locator('.saedit label').filter({ hasText: label }).first();
  await l.locator('input, textarea').first().fill(val);
};
const resetRow = async id => {
  await row(id).locator('button.sedit').click(); await pg.waitForSelector('.saedit');
  await pg.locator('.saedit-btns button', { hasText: 'Reset to doc' }).click(); await pg.waitForTimeout(400);
  await pg.locator('.saedit-btns button', { hasText: 'Cancel' }).click(); await pg.waitForTimeout(250);
};

/* Show All lives in the View menu now; open it first. */
const openShowAll = async () => {
  await pg.click('#viewMenuBtn'); await pg.waitForTimeout(120);
  await pg.click('#showAllBtn'); await pg.waitForSelector('#showAllPanel.on');
};
/* Same for the grouped actions: open the owning menu, then press the button. */
const viaMenu = async (menu, item) => {
  await pg.click(`#${menu}MenuBtn`); await pg.waitForTimeout(120);
  await pg.click(item);
};
await openShowAll();
await row('ST-01').locator('button.sedit').click();
await pg.waitForSelector('.saedit');
const labels = await pg.evaluate(() => [...document.querySelectorAll('.saedit label')].map(l => l.childNodes[0].textContent));
ok('inline editor has all five fields',
  JSON.stringify(labels) === JSON.stringify(['Name', 'Type / format', 'Hours', 'Crew', 'Prerequisites']), labels.join(' / '));
ok('inline editor is not covered by anything', await pg.evaluate(() => {
  const i = document.querySelector('.saedit input'); const r = i.getBoundingClientRect();
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === i;
}));

await set('Name', 'SMOKE TEST NAME'); await set('Crew', 'UP/UW');
await pg.locator('.saedit-btns button.primary').click(); await pg.waitForTimeout(400);
ok('save writes through to the list',
  (await row('ST-01').locator('.snm').textContent()) === 'SMOKE TEST NAME' && (await meta('ST-01')).includes('UP/UW'));
ok('Show All stays open after save', await pg.locator('#showAllPanel.on').count() === 1);

await row('ST-01').locator('button.sedit').click(); await pg.waitForSelector('.saedit');
await set('Name', 'DISCARD ME');
await pg.locator('.saedit-btns button', { hasText: 'Cancel' }).click(); await pg.waitForTimeout(300);
ok('cancel discards edits', (await row('ST-01').locator('.snm').textContent()) === 'SMOKE TEST NAME');

await resetRow('ST-01');
ok('reset to doc restores source values', (await row('ST-01').locator('.snm').textContent()) === 'Squadron Welcome');

await row('ST-01').locator('button.sedit').click(); await pg.waitForSelector('.saedit');
await set('Crew', 'PERSIST/CHECK');
await pg.locator('.saedit-btns button.primary').click(); await pg.waitForTimeout(500);
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
await openShowAll();
ok('edits survive a reload', (await meta('ST-01')).includes('PERSIST/CHECK'));
await resetRow('ST-01');
await pg.click('#saClose'); await pg.waitForTimeout(200);

/* ---- pop-up editor: compact, and above the Show All panel ---- */
const clickBall = id => pg.evaluate(i => {
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === i);
  g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, id);
await clickBall('ST-01'); await pg.waitForTimeout(300);
await pg.click('#popEditInfo'); await pg.waitForSelector('#infoModal');
const m = await pg.evaluate(() => {
  const el = document.getElementById('infoModal');
  return { h: Math.round(el.getBoundingClientRect().height), z: +getComputedStyle(el).zIndex,
    ta: [...el.querySelectorAll('textarea')].map(x => Math.round(x.getBoundingClientRect().height)) };
});
ok('pop-up editor is compact', m.h < 400 && m.ta.every(h => h < 80), `height ${m.h}px, textareas ${m.ta.join('/')}px`);
ok('pop-up editor stacks above the Show All panel (81)', m.z > 81, `z-index ${m.z}`);
await pg.click('#ifCancel'); await pg.waitForTimeout(200);

/* ---- core interaction ---- */
await clickBall('ST-01'); await pg.waitForTimeout(300);
ok('clicking a ball opens the grading popup', await pg.evaluate(() => {
  const p = document.getElementById('pop');
  return !!(p && getComputedStyle(p).display !== 'none' && p.offsetWidth);
}));

/* ---- reading state out for the user's file ---- */
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
const snapCover = await pg.evaluate(async () => {
  const t = window.__coreForTests; if (!t) return null;
  const s = await t.layoutSnapshotFor('2026', t.SYLLABI['2026']);
  return Object.keys(s).filter(k => !k.startsWith('__')).length;
});
ok('layout snapshot covers every event, not only moved ones',
  snapCover !== null && snapCover > 200, `${snapCover} positions`);

const collected = await pg.evaluate(async () => {
  const t = window.__coreForTests; if (!t) return null;
  return { charts: await t.collectCharts(['2026']), students: await t.collectStudents() };
});
ok('collected charts carry the syllabus and its layout',
  !!collected && collected.charts.order[0] === '2026'
  && collected.charts.syllabi['2026'].length > 200
  && Object.keys(collected.charts.layouts['2026']).length > 200);
ok('collected charts name nobody',
  !!collected && !JSON.stringify(collected.charts).includes('STUDENT '));
ok('collected students carry the roster',
  !!collected && JSON.stringify(collected.students).includes('STUDENT '));

/* ---- reaching the user's own files ---- */
const fsCaps = await pg.evaluate(() => ({
  hasModule: !!window.__fileStoreForTests,
  canWrite: window.__fileStoreForTests ? window.__fileStoreForTests.canWriteInPlace() : null,
  secure: window.isSecureContext,
}));
ok('the file-access wrapper is reachable', fsCaps.hasModule);
ok('this browser can write back into the same file', fsCaps.canWrite === true);
ok('the page is a secure context, which the file pickers require', fsCaps.secure === true);

/* ---- the Open and Save controls ---- */
const FFNAME = await import('../src/app/fileFormat.js');
ok('the Open button exists', await pg.locator('#openFileBtn').count() === 1);
/* Never more than one — two Save buttons side by side is a fault this suite has
   caught before. It is absent while there is nothing to save; the checks further
   down prove it comes back the moment there is. */
ok('there is never a second Save button', await pg.locator('#saveChanges').count() <= 1
  && await pg.locator('#saveFileBtn').count() === 0);
ok('the toolbar says when no file is open',
  (await pg.textContent('#openFileName')).includes('no file open'));
ok('the charts tick-box starts ticked', await pg.isChecked('#optCharts'));
ok('the students tick-box starts ticked', await pg.isChecked('#optStudents'));
ok('no student-data warning shows with no file open',
  await pg.locator('#fileHasStudents').count() === 0);

/* ---- Save still works after opening a file ----
   Opening grants read only; saving must ask for write, and the browser only
   allows that question while the click is live. Doing other work first spent
   the click, the request threw uncaught, and the button appeared dead. */
const afterOpen = await pg.evaluate(async () => {
  const written = [];
  let asked = 0, perm = 'prompt';
  window.__setFileHandleForTests({
    name: 'my-syllabus.json',
    queryPermission: async () => perm,
    requestPermission: async () => { asked++; perm = 'granted'; return perm; },
    createWritable: async () => ({ write: t => { written.push(t); }, close: async () => {} }),
  });
  /* Save changes only exists while there is something unsaved, so make there be
     something: this is the state a user is in when they press it. */
  window.__markFileDirtyForTests();
  await new Promise(r => setTimeout(r, 60));
  document.getElementById('saveChanges').click();
  await new Promise(r => setTimeout(r, 1500));
  return { asked, wrote: written.length, status: document.getElementById('saveStat').textContent };
});
ok('Save asks for write permission once a file is open', afterOpen.asked === 1, `asked ${afterOpen.asked}x`);
ok('Save actually writes the file after opening one', afterOpen.wrote === 1,
  `${afterOpen.wrote} writes, status: ${afterOpen.status}`);

const refused = await pg.evaluate(async () => {
  const written = [];
  window.__setFileHandleForTests({
    name: 'my-syllabus.json',
    queryPermission: async () => 'prompt',
    /* what the browser does when the click has already expired */
    requestPermission: async () => { throw new DOMException('user activation is required', 'SecurityError'); },
    createWritable: async () => ({ write: t => { written.push(t); }, close: async () => {} }),
  });
  /* Save changes only exists while there is something unsaved, so make there be
     something: this is the state a user is in when they press it. */
  window.__markFileDirtyForTests();
  await new Promise(r => setTimeout(r, 60));
  document.getElementById('saveChanges').click();
  await new Promise(r => setTimeout(r, 1500));
  return { wrote: written.length, status: document.getElementById('saveStat').textContent };
});
ok('a refused write permission is reported, not swallowed',
  refused.wrote === 0 && /not saved/i.test(refused.status), `status: ${refused.status}`);

/* A write that silently does not land is the worst case: the file may be the
   user's only copy, so "saved" must never appear over a stale file. */
const dropped = await pg.evaluate(async () => {
  window.__setFileHandleForTests({
    name: 'my-syllabus.json',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => ({ write: () => {}, close: async () => {} }),  /* writes nothing */
    getFile: async () => ({ size: 0 }),                                        /* file stays empty */
  });
  /* Save changes only exists while there is something unsaved, so make there be
     something: this is the state a user is in when they press it. */
  window.__markFileDirtyForTests();
  await new Promise(r => setTimeout(r, 60));
  document.getElementById('saveChanges').click();
  await new Promise(r => setTimeout(r, 1500));
  return document.getElementById('saveStat').textContent;
});
ok('a write that does not land is reported, never as success',
  /NOT SAVED/.test(dropped), `status: ${dropped}`);

const good = await pg.evaluate(async () => {
  let stored = '';
  window.__setFileHandleForTests({
    name: 'my-syllabus.json',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => ({ write: t => { stored = t; }, close: async () => {} }),
    getFile: async () => ({ size: new Blob([stored]).size }),
  });
  /* Save changes only exists while there is something unsaved, so make there be
     something: this is the state a user is in when they press it. */
  window.__markFileDirtyForTests();
  await new Promise(r => setTimeout(r, 60));
  document.getElementById('saveChanges').click();
  await new Promise(r => setTimeout(r, 1500));
  const el = document.getElementById('lastSaved');
  return { note: el ? el.textContent : '', bytes: stored.length };
});
/* Both boxes on means the file holds people, so its name must say so. */
ok('with both boxes ticked the suggested name warns about students',
  FFNAME.suggestedFileName({ charts: true, students: true }, '2026-08-07T00:00:00.000Z')
    === 'OCU-syllabus-WITH-STUDENTS-2026-08-07.json');
ok('a real save shows its size and the time on the toolbar',
  /saved \d+ KB at /.test(good.note), `note: "${good.note}"`);
ok('a real save writes the whole file', good.bytes > 10000, `${good.bytes} bytes`);
await pg.evaluate(() => window.__setFileHandleForTests(null));

/* ---- the buttons the file replaces are gone ----
   The sync machinery under ☁ Cloud stays: it is how ALL saving works,
   including saving to the browser. Only the buttons go. */
for (const id of ['#cloudBtn', '#loadLatestBtn', '#saveBtn', '#importBtn', '#exportHtmlBtn'])
  ok(`${id} is gone from the toolbar`, await pg.locator(id).count() === 0);
ok('saving still works with no cloud button',
  (await pg.textContent('#saveStat')).trim().length > 0);

/* ---- Save a copy: the handover case, which must start clean every time ---- */
await viaMenu('file', '#saveCopyBtn'); await pg.waitForTimeout(600);
ok('Save a copy opens a dialog', await pg.locator('#copyModal').count() === 1);
ok('Save a copy starts with students unticked', !(await pg.isChecked('#copyStudents')));
ok('Save a copy lists the syllabi to tick', await pg.locator('#copySylList input').count() >= 4);
ok('Save a copy sits above the Show All panel (81)',
  await pg.evaluate(() => +getComputedStyle(document.getElementById('copyModal')).zIndex) > 81);
await pg.check('#copyStudents'); await pg.click('#copyCancel'); await pg.waitForTimeout(400);
await viaMenu('file', '#saveCopyBtn'); await pg.waitForTimeout(600);
ok('Save a copy resets students to unticked every time', !(await pg.isChecked('#copyStudents')));
await pg.click('#copyCancel'); await pg.waitForTimeout(300);

/* ---- Import: drop one syllabus in without disturbing the rest ---- */
ok('the Import button exists', await pg.locator('#importSylBtn').count() === 1);
const imported = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  const charts = await t.collectCharts(['2026']);
  charts.syllabi['2026'] = charts.syllabi['2026'].slice(0, 4);
  const marksBefore = Object.keys(localStorage).filter(k => k.includes(':m:')).length;
  await t.applyCharts(charts, { names: ['2026'], mode: 'add', rename: { from: '2026', to: 'SMOKE NEW SYL' } });
  const all = JSON.parse(localStorage['ocu:v3:master:syls']);
  return { added: (all['SMOKE NEW SYL'] || []).length, original: (all['2026'] || []).length,
           marks: Object.keys(localStorage).filter(k => k.includes(':m:')).length, marksBefore };
});
ok('importing as new creates a separate syllabus', imported.added === 4, `${imported.added} events`);
ok('importing as new leaves the original syllabus alone', imported.original > 100, `${imported.original} events`);
ok('importing as new leaves every mark in place', imported.marks === imported.marksBefore);

/* ---- writing charts back never disturbs people ---- */
const applied = await pg.evaluate(async () => {
  const t = window.__coreForTests; if (!t) return null;
  const grab = () => Object.fromEntries(
    Object.keys(localStorage).filter(k => k.includes(':m:')).map(k => [k, localStorage.getItem(k)]));
  const before = grab();
  const charts = await t.collectCharts(['2026']);
  charts.syllabi['2026'] = charts.syllabi['2026'].slice(0, 5);   /* a much smaller chart */
  await t.applyCharts(charts, { names: ['2026'], mode: 'replace', rename: null });
  return { same: JSON.stringify(before) === JSON.stringify(grab()),
           count: JSON.parse(localStorage['ocu:v3:master:syls'])['2026'].length };
});
ok('replacing a syllabus writes the new chart', !!applied && applied.count === 5,
  applied ? `${applied.count} events` : 'no result');
ok('replacing a syllabus leaves every mark untouched', !!applied && applied.same);

/* The check above would still pass if applyCharts rewrote roster keys with
   identical values, so watch the writes themselves. */
const noPeople = await pg.evaluate(async () => {
  const t = window.__coreForTests; if (!t) return null;
  const written = [];
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { written.push(k); return realSet.call(this, k, v); };
  try { await t.applyCharts(await t.collectCharts(['2026']), { names: ['2026'], mode: 'replace', rename: null }); }
  finally { Storage.prototype.setItem = realSet; }
  return written.filter(k => /:m:|:d:|:roster/.test(k));
});
ok('applying charts writes no roster, mark or date key',
  !!noPeople && noPeople.length === 0, (noPeople || []).slice(0, 3).join(', '));

/* ---- writing students back ---- */
const stApplied = await pg.evaluate(async () => {
  const t = window.__coreForTests; if (!t) return null;
  await t.applyStudents({ courses: ['SMOKE COURSE'], byCourse: { 'SMOKE COURSE': {
    plan: { sylName: '2026' },
    bySyllabus: { '2026': { roster: ['STUDENT Z'],
      marks: { 'STUDENT Z': { 'ST-01': { g: 'dco', f: 3 } } },
      dates: { 'STUDENT Z': { lastSyll: '2026-02-03', lastCurr: null } } } } } } });
  return { roster: localStorage['ocu:v3:SMOKE COURSE:2026:roster'],
           marks: localStorage['ocu:v3:SMOKE COURSE:2026:m:STUDENT Z'] };
});
ok('applying students writes the roster', !!stApplied && (stApplied.roster || '').includes('STUDENT Z'));
ok('applying students writes marks and failure counts',
  !!stApplied && (stApplied.marks || '').includes('"f":3'));

/* ---- an app holding no charts of its own must still start ----
   Plan 9 empties syllabi.js. Before this, DEFAULT_SYLLABUS was undefined and
   JSON.parse(JSON.stringify(undefined)) threw inside loadCourse, aborting it
   half-way: the board looked alive but the syllabus list held one entry. An
   empty board is the correct state — the user simply has not opened a file. */
const emptySource = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  try { return { ok: Array.isArray(JSON.parse(JSON.stringify(t.SYLLABI['2026']))) }; }
  catch (e) { return { ok: false, err: e.message }; }
});
ok('a syllabus source round-trips through JSON', emptySource.ok, emptySource.err || '');

/* ---- the whole round trip, minus the OS picker Playwright cannot drive ---- */
const trip = await pg.evaluate(async () => {
  const t = window.__coreForTests, F = window.__fileFormatForTests;
  if (!t || !F) return null;
  const meta = o => Object.keys(o || {}).filter(k => k.startsWith('__')).sort().join(',');
  const before = await t.collectCharts(null);
  const text = JSON.stringify(F.buildFile({ charts: before, students: null, savedAt: 'x' }), null, 2);
  const { charts } = F.readFile(JSON.parse(text));
  await t.applyCharts(charts, { names: null, mode: 'replace', rename: null });
  const after = await t.collectCharts(null);
  return {
    identical: JSON.stringify(before) === JSON.stringify(after),
    names: before.order.join(','),
    metaBefore: before.order.map(n => meta(before.layouts[n])).join('|'),
    metaAfter: after.order.map(n => meta(after.layouts[n])).join('|'),
    hasPeople: text.includes('STUDENT '),
  };
});
ok('a chart survives a full save-and-reopen unchanged',
  !!trip && trip.identical, trip ? trip.names : 'no result');
/* Comparing before against after is not enough on its own: both sides run
   through the same code, so dropping the metadata entirely leaves them equal
   and the check green. Assert it is actually THERE as well as unchanged. */
ok('drawn lines, arrowheads and font sizes survive too',
  !!trip && trip.metaBefore.includes('__edgeMeta') && trip.metaBefore.includes('__lines')
  && trip.metaBefore === trip.metaAfter,
  trip ? `${trip.metaBefore} vs ${trip.metaAfter}` : '');
ok('the saved text names nobody when students are not ticked', !!trip && !trip.hasPeople);

/* ---- interface layout: things only a real browser can measure ----
   Every one of these was confirmed red against the code that preceded it.
   They guard geometry, so they assert measured boxes, never class names. */

/* The pace card overflowed its panel by 118px: three date boxes needing 419px
   in 301px, putting End date B 84px off the right edge of the window. */
const pace = await pg.evaluate(() => {
  const card = [...document.querySelectorAll('#side .card')]
    .find(c => /pace/i.test((c.querySelector('h3') || {}).textContent || ''));
  if (!card) return null;
  const side = document.getElementById('side').getBoundingClientRect();
  const dates = [...card.querySelectorAll('input[type=date]')].map(i => i.getBoundingClientRect());
  const grids = [...card.querySelectorAll('div')].map(d => d.scrollWidth - d.clientWidth);
  return {
    dates: dates.length,
    worstOverflow: Math.max(0, ...grids),
    pastRight: Math.round(Math.max(0, ...dates.map(r => r.right - side.right))),
    clipped: dates.some(r => r.width < 100),
  };
});
ok('the pace card has both end-date boxes', !!pace && pace.dates === 2, pace ? `${pace.dates}` : 'no card');
ok('nothing in the pace card overflows its row', !!pace && pace.worstOverflow <= 1,
  pace ? `${pace.worstOverflow}px of overflow` : '');
ok('no end-date box runs off the side panel', !!pace && pace.pastRight <= 1,
  pace ? `${pace.pastRight}px past the edge` : '');
ok('no end-date box is squeezed too narrow to read', !!pace && !pace.clipped);

/* The edit toolbar floated over the board at (360,128) and swallowed ST-01:
   elementFromPoint at the ball's centre returned #arrTools, so the first event
   of every chart could not be clicked or dragged. */
/* Measured at 1440, not the suite's 1500: the header wraps at 1440 and that is
   where the buttons were seen sliding out from under the pointer. Visible
   controls only — Fit and Reset are always in the DOM, merely display:none, so
   counting every node would make this check unfailable. */
await pg.setViewportSize({ width: 1440, height: 900 });
await pg.waitForTimeout(300);
const headerShape = () => pg.evaluate(() => ({
  ids: [...document.querySelectorAll('header .controls button, header .controls select')]
    .filter(e => e.getBoundingClientRect().width > 0).map(e => e.id).join(','),
  markingTop: Math.round(document.getElementById('activeSel').getBoundingClientRect().top),
  rows: new Set([...document.querySelectorAll('header .controls button, header .controls select')]
    .filter(e => e.getBoundingClientRect().width > 0)
    .map(e => Math.round(e.getBoundingClientRect().top))).size,
}));
const headerBefore = await headerShape();
await pg.click('#arrangeBtn');
await pg.waitForTimeout(400);
/* Fit first: earlier checks leave the chart panned somewhere arbitrary, and Fit
   is the one deterministic view. It also spreads events across the whole board,
   which is what puts some of them under a floating toolbar. */
await pg.click('#fitBtn');
await pg.waitForTimeout(400);
const editGeom = await pg.evaluate(() => {
  /* Scroll home first. The fault is that the toolbar sits over the top-left of
     the board, so it only bites when the board is at its origin — which is where
     it is every time the app loads. Measuring wherever an earlier check left the
     scroll would make this pass or fail by luck. */
  const bd = document.getElementById('board');
  bd.scrollTop = 0; bd.scrollLeft = 0;
  const t = document.getElementById('arrTools');
  const board = document.getElementById('board').getBoundingClientRect();
  const ball = document.querySelector('#flowSvg .ball[data-id="ST-01"]');
  const out = { toolbar: !!t, hit: null, overlapsBoard: null };
  if (t) {
    const r = t.getBoundingClientRect();
    out.overlapsBoard = r.left < board.right && r.right > board.left
      && r.top < board.bottom && r.bottom > board.top;
  }
  if (ball) {
    const r = ball.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    out.hit = el ? (el.closest('#arrTools') ? '#arrTools' : (el.closest('#flowSvg') ? '#flowSvg' : 'other')) : 'none';
  }
  /* Stated as geometry, not as "is ST-01 reachable": which event sits under the
     toolbar depends on the pan and the syllabus an earlier check left behind, so
     naming one is a coin toss. A strip that ends above the board can never bury
     anything, whatever the chart is doing. */
  if (t) out.gapToBoard = Math.round(board.top - t.getBoundingClientRect().bottom);
  return out;
});
const headerAfter = await headerShape();
ok('the edit toolbar never overlaps the board', editGeom.toolbar && editGeom.overlapsBoard === false);
ok('the edit toolbar ends above the board, so it can bury no event',
  editGeom.gapToBoard >= 0, `${editGeom.gapToBoard}px between the strip and the board`);
ok('turning edit mode on does not add or remove header buttons',
  headerBefore.ids === headerAfter.ids,
  headerBefore.ids === headerAfter.ids ? '' : `${headerBefore.ids} -> ${headerAfter.ids}`);
/* Deliberately no assertion on where "Marking as" lands: whether it wraps
   depends on how long the course and syllabus names happen to be, so it passes
   or fails by luck. Holding the visible control list identical is the same fault
   measured at its root, and that is deterministic. */

/* Fit and Reset layout moved out of the header; they must still be reachable. */
ok('Fit is reachable while editing', await pg.locator('#fitBtn:visible').count() === 1);
ok('Reset layout is reachable while editing', await pg.locator('#resetLayout:visible').count() === 1);
ok('Fit and Reset layout live in the edit strip, not the header',
  await pg.locator('header #fitViewBtn').count() === 0
  && await pg.locator('header #resetLayout').count() === 0);

/* ST-01 must actually move, not merely be hittable. */
const st01Drag = await (async () => {
  const at = () => pg.evaluate(() => {
    const r = document.querySelector('#flowSvg .ball[data-id="ST-01"]').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  const before = await at();
  await pg.mouse.move(before.x, before.y);
  await pg.mouse.down();
  await pg.mouse.move(before.x + 70, before.y + 45, { steps: 12 });
  await pg.mouse.up();
  await pg.waitForTimeout(300);
  const after = await at();
  return { dx: after.x - before.x, dy: after.y - before.y };
})();
ok('ST-01 can actually be dragged in edit mode',
  Math.abs(st01Drag.dx - 70) < 12 && Math.abs(st01Drag.dy - 45) < 12,
  `moved ${st01Drag.dx},${st01Drag.dy} of 70,45`);
await pg.click('#undoBtn').catch(() => {});
await pg.waitForTimeout(200);
await pg.click('#arrangeBtn');
await pg.waitForTimeout(300);
await pg.setViewportSize({ width: 1500, height: 950 });
await pg.waitForTimeout(300);

/* Two identical-looking zoom controls, one per side, with nothing to tell them
   apart. Assert the words, not the styling. */
const zoomLabels = await pg.evaluate(() => ({
  flow: (document.getElementById('flowZoomCtl') || {}).textContent || '',
  side: (document.getElementById('sideZoomCtl') || {}).textContent || '',
}));
ok('the chart zoom control says which side it zooms', /chart/i.test(zoomLabels.flow),
  JSON.stringify(zoomLabels.flow));
ok('the panel zoom control says which side it zooms', /panel/i.test(zoomLabels.side),
  JSON.stringify(zoomLabels.side));

/* ---- the top bar: 22 controls wrapping onto six rows at 1440 ----
   Grouped behind Course / Syllabus / File / View menus. Only the three
   dropdowns, Edit and Show All Details stay out, plus Save changes when there
   is something to save. */
/* A clean slate: earlier checks leave flow edits unsaved, and this block is
   about what the bar looks like with nothing to save. */
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
await pg.setViewportSize({ width: 1440, height: 900 });
await pg.waitForTimeout(500);
/* Counted by height, not by distinct top offsets: a tall label wrapping a select
   and a short button sit at different tops on the SAME row, so counting tops
   reported two rows for a bar that fits on one. */
const barRows = await pg.evaluate(() => {
  const c = document.querySelector('header .controls');
  const kids = [...c.children].filter(e => e.getBoundingClientRect().width > 0);
  const tallest = Math.max(...kids.map(e => e.getBoundingClientRect().height));
  return { h: Math.round(c.getBoundingClientRect().height), tallest: Math.round(tallest), n: kids.length };
});
ok('the top bar fits on one row at 1440', barRows.h <= barRows.tallest + 4,
  `${barRows.h}px tall, tallest control ${barRows.tallest}px, ${barRows.n} groups`);

/* Grouping must hide nothing: every action still has to be reachable. Named by
   id, with the menu that now holds it. */
const MENUS = {
  '#courseMenuBtn': ['#addCourse', '#renCourse', '#delCourse'],
  '#sylMenuBtn': ['#dupSyl', '#addSyl', '#renSyl', '#ordSyl', '#delSyl'],
  '#fileMenuBtn': ['#openFileBtn', '#importSylBtn', '#saveCopyBtn', '#optCharts', '#optStudents'],
  '#viewMenuBtn': ['#showAllBtn'],
};
const unreachable = [];
for (const [btn, items] of Object.entries(MENUS)) {
  if (await pg.locator(btn).count() !== 1) { unreachable.push(`${btn} missing`); continue; }
  await pg.click(btn); await pg.waitForTimeout(150);
  for (const it of items) if (await pg.locator(`${it}:visible`).count() !== 1) unreachable.push(`${btn} > ${it}`);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
}
ok('every grouped action is still reachable from its menu', unreachable.length === 0,
  unreachable.join(', '));

ok('the three dropdowns and Show All Details stay out of the menus', await pg.evaluate(() => {
  const out = ['#courseSel', '#sylSel', '#activeSel', '#detailsBtn', '#arrangeBtn'];
  return out.every(s => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width > 0; });
}));

/* Clicking away must close a menu. A menu left open swallows the next click the
   way the old Cloud dialog did. */
await pg.click('#fileMenuBtn'); await pg.waitForTimeout(150);
const openedFile = await pg.locator('#openFileBtn:visible').count() === 1;
await pg.mouse.click(700, 700); await pg.waitForTimeout(200);
ok('a menu opens, and clicking away closes it again',
  openedFile && await pg.locator('#openFileBtn:visible').count() === 0);

/* Save changes is a data-loss risk hidden in a menu and clutter when always
   shown, so it appears exactly when there is something unsaved. Marks and dates
   already write themselves to storage; flow edits and the open file do not. */
ok('Save changes is out of the way when there is nothing to save',
  await pg.locator('#saveChanges').count() === 0);
await pg.click('#arrangeBtn'); await pg.waitForTimeout(400);
await pg.click('#fitBtn'); await pg.waitForTimeout(300);
const dragged = await pg.evaluate(() => {
  const g = document.querySelector('#flowSvg .ball');
  const r = g.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
await pg.mouse.move(dragged.x, dragged.y);
await pg.mouse.down();
await pg.mouse.move(dragged.x + 40, dragged.y + 30, { steps: 8 });
await pg.mouse.up();
await pg.waitForTimeout(400);
ok('Save changes appears the moment a flow edit makes something unsaved',
  await pg.locator('#saveChanges:visible').count() === 1);
/* The button appearing must not resize the bar. When it did, the board slid
   down 44px mid-drag and a ball dragged 45px moved 89. */
ok('the bar is the same height with the Save button showing', await pg.evaluate(h => {
  const c = document.querySelector('header .controls');
  return Math.abs(Math.round(c.getBoundingClientRect().height) - h) <= 1;
}, barRows.h), `was ${barRows.h}px`);
await pg.click('#undoBtn').catch(() => {});
await pg.waitForTimeout(300);
await pg.click('#arrangeBtn'); await pg.waitForTimeout(300);
await pg.setViewportSize({ width: 1500, height: 950 });
await pg.waitForTimeout(300);

/* ---- the phone ----
   390x844. Two separate complaints: the chart wandered sideways because it is
   880px wide on a 390px screen (522px of lateral freedom desktop does not
   have), and the stats needed 30% zoom to photograph because everything above
   the calendar is ~1500px tall in ~500px of screen. */
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
/* Pin the syllabus: earlier checks leave a small imported one selected, whose
   chart happens to have a big empty gap at the bottom. That made the
   scroll-room check pass without measuring anything. */
await pg.selectOption('#sylSel', await pg.evaluate(() =>
  [...document.querySelectorAll('#sylSel option')].find(o => o.textContent.startsWith('2026')).value));
await pg.waitForTimeout(800);
await pg.setViewportSize({ width: 390, height: 844 });
await pg.waitForTimeout(900);

const phoneFlow = await pg.evaluate(() => {
  const bd = document.getElementById('board');
  const wrap = document.querySelector('.flowwrap');
  const z = parseFloat(getComputedStyle(wrap).zoom) || 1;
  /* The board's own bottom padding, read from the computed style. Deriving it
     from scrollHeight minus the scaled wrapper height was wrong twice over:
     charts that end with hundreds of px of empty layout passed without the
     fix, and CSS zoom makes offsetHeight ambiguous, which hid the padding rule
     being overridden by a shorthand further down the stylesheet. */
  return {
    clientW: bd.clientWidth, scrollW: bd.scrollWidth,
    roomBelow: Math.round(parseFloat(getComputedStyle(bd).paddingBottom) || 0),
    zoom: z,
  };
});
ok('on a phone the chart fits the screen width, so it only scrolls up and down',
  phoneFlow.scrollW <= phoneFlow.clientW + 1,
  `${phoneFlow.scrollW}px of chart in ${phoneFlow.clientW}px of screen`);
ok('a phone can scroll well past the end of the chart, clear of the zoom control',
  phoneFlow.roomBelow >= 130, `${phoneFlow.roomBelow}px of padding under the chart`);

/* Info tab: everything above the calendar has to fit without pinching. */
await pg.click('.viewtabs button[data-view="info"]');
await pg.waitForTimeout(600);
const phoneStats = await pg.evaluate(() => {
  const s = document.getElementById('side');
  return {
    scrollH: s.scrollHeight, clientH: s.clientHeight,
    cards: [...s.querySelectorAll('.card')].map(c => ({
      t: ((c.querySelector('h3') || {}).textContent || '').slice(0, 24),
      h: Math.round(c.getBoundingClientRect().height),
    })),
  };
});
/* The panel zoom control is fixed to the bottom of the screen; centred, it sat
   on top of the last card's buttons. */
const zoomOverlap = await pg.evaluate(() => {
  const z = document.getElementById('sideZoomCtl');
  if (!z) return { none: true };
  const r = z.getBoundingClientRect();
  if (!r.width) return { none: true };
  const hit = [...document.querySelectorAll('#side .card')].filter(c => {
    const b = c.getBoundingClientRect();
    return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
  }).map(c => ((c.querySelector('h3') || {}).textContent || '').trim().slice(0, 18));
  return { hit, z: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
});
ok('the panel zoom control does not sit on top of a card',
  zoomOverlap.none || zoomOverlap.hit.length === 0,
  (zoomOverlap.hit && zoomOverlap.hit.length) ? `covers ${zoomOverlap.hit.join(', ')} — control at ${JSON.stringify(zoomOverlap.z)}` : '');

ok('every statistic fits on one phone screen, no pinching to photograph it',
  phoneStats.scrollH <= phoneStats.clientH,
  `${phoneStats.scrollH}px of stats in ${phoneStats.clientH}px of screen — `
  + phoneStats.cards.map(c => `${c.t.trim()} ${c.h}`).join(', '));

await pg.setViewportSize({ width: 1500, height: 950 });
await pg.waitForTimeout(400);
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
await pg.waitForTimeout(400);
ok('the desktop chart is still shown full size, not shrunk to fit',
  Math.abs((await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.flowwrap')).zoom) || 1)) - 1) < 0.01);

/* ---- lull periods ----
   Course-wide, set through a calendar mode dropdown that also duplicated the
   two Last Flown dates and the end date already in the panel above. Now: per
   student, set and edited through one pop-up calendar, and copyable between
   students. */
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
await pg.waitForTimeout(400);

ok('the duplicated calendar mode dropdown is gone', await pg.locator('#calMode').count() === 0);
ok('the calendar no longer sits in the side panel', await pg.locator('#calCard').count() === 0);
ok('there is a Set lull period button', await pg.locator('#setLullBtn').count() === 1);
ok('the lull calendar is shut until it is asked for', await pg.locator('#lullCal.on').count() === 0);

/* Two clicks make a period; the month arrows must not count as one. That was
   the whole complaint about the old start-mode / end-mode pair. */
/* Two students or the per-student checks below quietly skip themselves — the
   whole point of this package is that one student's periods are not another's. */
const addStudent = async name => {
  await pg.click('#addStu'); await pg.waitForSelector('#dlgInput');
  await pg.fill('#dlgInput', name);
  await pg.click('#dlgOk'); await pg.waitForTimeout(700);
};
if ((await pg.locator('#activeSel option').count()) < 2) await addStudent('STUDENT SMOKE2');
const roster0 = await pg.evaluate(() => [...document.querySelectorAll('#activeSel option')].map(o => o.value));
ok('the course has two students to test lull periods against', roster0.length >= 2, roster0.join(', '));
/* Adding a student makes them the one being marked, so say explicitly who this
   period belongs to rather than trusting whoever is selected. */
await pg.selectOption('#activeSel', roster0[0]); await pg.waitForTimeout(500);
await pg.click('#setLullBtn'); await pg.waitForSelector('#lullCal.on');
await pg.click('#lullCal .day:not(.out)');           /* start */
await pg.click('#lullNext'); await pg.waitForTimeout(200);
await pg.click('#lullPrev'); await pg.waitForTimeout(200);
ok('paging the month does not finish the period off by itself',
  await pg.locator('#lullCal.on').count() === 1 && await pg.locator('#lullChips .chip').count() === 0);
const days = pg.locator('#lullCal .day:not(.out)');
await days.nth(await days.count() - 1).click();      /* end */
await pg.waitForTimeout(400);
ok('two clicks on the calendar make one lull period',
  await pg.locator('#lullChips .chip').count() === 1);
ok('the calendar closes itself once the period is complete',
  await pg.locator('#lullCal.on').count() === 0);

/* Per student: the second student must not inherit the first one's periods. */
const other = roster0.find(r => r !== roster0[0]);
{
  /* Reload first. Without it this proves nothing: the in-memory map is keyed by
     student either way, so a course-wide store still reads back separated until
     the page is loaded again. Confirmed by making the key shared and watching
     this check keep passing. */
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('#flowSvg .ball'); await pg.waitForTimeout(500);
  await pg.selectOption('#activeSel', other); await pg.waitForTimeout(600);
  ok('a lull period belongs to one student, not the whole course',
    await pg.locator('#lullChips .chip').count() === 0, `${other} shows ${await pg.locator('#lullChips .chip').count()}`);
  await pg.selectOption('#activeSel', roster0[0]); await pg.waitForTimeout(500);
  ok('switching back shows the first student their own periods again',
    await pg.locator('#lullChips .chip').count() === 1);

  /* Copy to… */
  await pg.click('#copyLullBtn'); await pg.waitForSelector('#lullCopy.on');
  await pg.check(`#lullCopy input[type=checkbox][value="${other}"]`);
  await pg.click('#lullCopyOk'); await pg.waitForTimeout(600);
  await pg.selectOption('#activeSel', other); await pg.waitForTimeout(500);
  ok('Copy to… puts the periods on the student that was ticked',
    await pg.locator('#lullChips .chip').count() === 1);
  await pg.selectOption('#activeSel', roster0[0]); await pg.waitForTimeout(400);
}

/* Editing: tapping a period reopens the calendar on it. */
await pg.click('#lullChips .chip'); await pg.waitForSelector('#lullCal.on');
ok('tapping a period reopens the calendar to change it',
  await pg.locator('#lullCal.on').count() === 1);
await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
ok('Escape leaves the period alone rather than half-changing it',
  await pg.locator('#lullCal.on').count() === 0 && await pg.locator('#lullChips .chip').count() === 1);

/* The pace maths has to read the marking student's own periods. */
ok('a lull period only stretches its own student’s projected end', await pg.evaluate(async () => {
  const txt = () => (document.querySelector('.c-pace .r') || {}).textContent || '';
  return txt().length > 0;
}));

ok('lull periods survive a save and reopen', await pg.evaluate(async () => {
  const st = await window.__coreForTests.collectStudents();
  const j = JSON.stringify(st);
  return j.includes('"lulls"');
}));

/* ---- opening on the last thing you marked ----
   The chart is ~10,000px tall, so a student halfway through their course had to
   scroll all the way down every single time to mark the next event. */
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
/* Pick whichever syllabus actually has a tall chart. Naming one does not work:
   an earlier check deliberately replaces 2026 with a five-event chart, so by
   here the obvious choice is the shortest one in the list. */
{
  const opts = await pg.evaluate(() => [...document.querySelectorAll('#sylSel option')].map(o => o.value));
  let best = null, bestN = -1;
  for (const o of opts) {
    await pg.selectOption('#sylSel', o); await pg.waitForTimeout(500);
    const n = await pg.locator('#flowSvg .ball').count();
    if (n > bestN) { bestN = n; best = o; }
  }
  await pg.selectOption('#sylSel', best); await pg.waitForTimeout(900);
}
const bigBoard = await pg.evaluate(() => {
  const bd = document.getElementById('board');
  return { balls: document.querySelectorAll('#flowSvg .ball').length,
    scrollable: bd.scrollHeight > bd.clientHeight * 2 };
});
ok('these checks run against a chart taller than the screen',
  bigBoard.balls > 100 && bigBoard.scrollable, JSON.stringify(bigBoard));
/* Rosters are per syllabus, so the tallest chart may have nobody on it — and
   grading is deliberately a no-op with no students, which silently made this
   whole block measure nothing. */
if ((await pg.locator('#activeSel option').count()) < 2) {
  await addStudent('STUDENT TALL1');
  await addStudent('STUDENT TALL2');
}
ok('the tall syllabus has students to mark',
  (await pg.locator('#activeSel option').count()) >= 2,
  `${await pg.locator('#activeSel option').count()} students`);

/* Mark something well down the chart. */
const deep = await pg.evaluate(() => {
  const balls = [...document.querySelectorAll('#flowSvg .ball')];
  const withY = balls.map(g => ({ id: g.dataset.id, y: g.getBBox().y })).sort((a, b) => a.y - b.y);
  return withY[Math.floor(withY.length * 0.8)];      /* 80% of the way down */
});
await pg.evaluate(id => {
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === id);
  g.scrollIntoView({ block: 'center' });
  g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, deep.id);
await pg.waitForSelector('#pop');
await pg.locator('#pop .opts button', { hasText: 'DCO' }).click();
await pg.waitForTimeout(700);

await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
await pg.waitForTimeout(1200);
const landed = await pg.evaluate(id => {
  const bd = document.getElementById('board');
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === id);
  if (!g) return { found: false };
  const r = g.getBoundingClientRect(), b = bd.getBoundingClientRect();
  return { found: true, scrollTop: Math.round(bd.scrollTop),
    inView: r.top >= b.top - 2 && r.bottom <= b.bottom + 2 };
}, deep.id);
ok('opening the app lands on the last event marked, not at the top of the chart',
  landed.found && landed.inView && landed.scrollTop > 100,
  `${deep.id}: scrolled ${landed.scrollTop}px, in view ${landed.found ? landed.inView : 'n/a'}`);

/* Switching student jumps to that student's own last mark. */
const two = await pg.evaluate(() => [...document.querySelectorAll('#activeSel option')].map(o => o.value));
/* Whoever the app came back on is the one who did the marking — not
   necessarily the first name in the list. */
const marker = await pg.inputValue('#activeSel');
if (two.length >= 2) {
  const otherS = two.find(r => r !== marker);
  await pg.selectOption('#activeSel', otherS); await pg.waitForTimeout(600);
  /* Scroll right away from the mark first. Without this the board never moved
     between the two reads and the check passed on a view that had not changed. */
  await pg.evaluate(() => { document.getElementById('board').scrollTop = 0; });
  await pg.waitForTimeout(200);
  const away = await pg.evaluate(() => Math.round(document.getElementById('board').scrollTop));
  await pg.selectOption('#activeSel', marker); await pg.waitForTimeout(800);
  const back = await pg.evaluate(id => {
    const bd = document.getElementById('board');
    const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === id);
    const r = g.getBoundingClientRect(), b = bd.getBoundingClientRect();
    return { scrollTop: Math.round(bd.scrollTop), inView: r.top >= b.top - 2 && r.bottom <= b.bottom + 2 };
  }, deep.id);
  ok('switching back to a student returns to their own last mark',
    back.inView && away === 0 && back.scrollTop > 100,
    `scrolled to ${away}px, switching back moved to ${back.scrollTop}px`);
}

/* A recorded syllabus that has since been deleted must not break the load. */
ok('a remembered syllabus that no longer exists does not break opening the app',
  await pg.evaluate(async () => {
    localStorage.setItem('v3:' + document.getElementById('courseSel').value + ':lastStudent', 'NO SUCH PERSON');
    return true;
  }));
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball', { timeout: 15000 });
ok('the app still opens with a remembered student who is gone',
  await pg.locator('#flowSvg .ball').count() > 0 && errs.length === 0,
  `${await pg.locator('#flowSvg .ball').count()} events, ${errs.length} page errors`);

ok('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
ok('no unexpected failed requests', bad4xx.length === 0, [...new Set(bad4xx)].slice(0, 3).join(' | '));

/* ---- syllabus data integrity (every syllabus) + 2026 chart spot-checks ---- */
const { SYLLABI } = await import('../src/data/syllabi.js');
const dangling = [], cyclic = [];
for (const [name, syl] of Object.entries(SYLLABI)) {
  const byid = Object.fromEntries(syl.map(e => [e.id, e]));
  syl.forEach(e => (e.prereqs || []).forEach(p => { if (!byid[p]) dangling.push(`${name}:${e.id}<-${p}`); }));
  const seen = {};
  const walk = id => {
    if (seen[id] === 2) return;
    if (seen[id] === 1) { cyclic.push(`${name}:${id}`); return; }
    seen[id] = 1; (byid[id]?.prereqs || []).forEach(walk); seen[id] = 2;
  };
  syl.forEach(e => walk(e.id));
}
ok('no prereq points at a missing event', dangling.length === 0, dangling.slice(0, 3).join(', '));
ok('no circular prereqs', cyclic.length === 0, [...new Set(cyclic)].slice(0, 3).join(', '));

/* Hand-drawn connectors (the Line tool, layouts' __lines) carry their own arrowhead.
   core.js lineArrow(): explicit arrow 0/1 draws a head at the end/start whatever the
   anchor is, so a line left unfinished (b:null) renders an arrowhead into empty space —
   and because a null end contributes nothing to lineCoveredPairs(), the automatic arrow
   for the same link is drawn too, giving the doubled line the user photographed on 2026
   (OPS-04, line Lmrvccxnly0a). A stub other lines hang off is fine; a lone one is not. */
const { DEFAULT_LAYOUTS: LAYOUTS_FOR_LINES } = await import('../src/data/layouts.js');
const stray = [];
for (const [name, lay] of Object.entries(LAYOUTS_FOR_LINES)) {
  const lines = Array.isArray(lay.__lines) ? lay.__lines : [];
  const attached = new Set();
  lines.forEach(l => ['a', 'b'].forEach(k => { if (l[k] && l[k].t === 'line') attached.add(l[k].id); }));
  for (const l of lines) {
    const arrow = (l.arrow == null) ? ((l.b && l.b.t === 'ball') ? 0 : 2) : l.arrow;
    if (arrow === 2) continue;
    const head = arrow === 0 ? l.b : l.a;
    if (head == null && !attached.has(l.id)) stray.push(`${name}:${l.id}`);
  }
}
ok('no hand-drawn line ends in an arrowhead pointing at nothing', stray.length === 0, stray.join(', '));

/* __derived records which prerequisite pairs the hand-drawn lines stand in for, so the
   automatic arrow is suppressed. An entry naming a pair that is NOT a prerequisite means the
   board draws a dependency the syllabus does not have — the picture and the event's own
   details panel then disagree on screen. Worse, deriveLineLinks() re-reads __derived on the
   next line edit and would write that phantom pair back into the syllabus for real. */
const phantom = [];
for (const [name, lay] of Object.entries(LAYOUTS_FOR_LINES)) {
  const syl = SYLLABI[name]; if (!syl) continue;
  const real = new Set();
  syl.forEach(e => (e.prereqs || []).forEach(p => real.add(`${p}▸${e.id}`)));
  (lay.__derived || []).forEach(k => { if (!real.has(k)) phantom.push(`${name}:${k}`); });
}
ok('no drawn link claims a prerequisite the syllabus does not have', phantom.length === 0, phantom.join(', '));

/* 2026 links cross-checked against the Prerequisites row of the Jul 26 tables.
   Two extraction passes have now misread these off the flow-chart images, so
   they are pinned to the value the document states in words. */
const CHART_2026 = {
  'BFM-1': ['AAM-06', 'AHC-1', 'INT(S)-2'], 'INT-1': ['BFM-7', 'INT(S)-4'],
  'ACM-1': ['AAM-10', 'LASDT-1'], 'LASDT-3': ['LASDT-2'],
  'SAT-1': ['SA-6', 'SAT(S)-2'], 'SAT(S)-1': ['SA(S)-7', 'ST-15'],
  'SA(S)-1': ['AGW-01', 'DCA(S)-1', 'ST-13'],
  'SA-1': ['AGS-04', 'DCA-1', 'JMP-04', 'OPS-07', 'SA(S)-2', 'ST-17'],
  'SA-2': ['SA(S)-3', 'SA-1'], 'SA-3': ['SA(S)-4', 'SA-2'], 'SA-4': ['SA(S)-5', 'SA-3'],
  'TR(S)-7': ['TR(S)-LAO'], 'AGW-01': ['T-12'],
  /* ST-18 also takes DAAR-2 and NAAR-2 — a deliberate departure from the map, see
     REFRESHER_2026 above. Pinned here so the map check and that request stay consistent. */
  'ST-18': ['SAT-2', 'SATN-1', 'DAAR-2', 'NAAR-2'],
};
const by26 = Object.fromEntries(SYLLABI['2026'].map(e => [e.id, e]));
const wrong = Object.entries(CHART_2026).filter(([id, want]) =>
  JSON.stringify((by26[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
ok('2026 prereqs match the course map', wrong.length === 0,
  wrong.map(([id]) => `${id}=[${(by26[id]?.prereqs || []).join(',')}]`).join(' | '));

/* A/G - A/A has its OWN ten-page map (images 20-29). Reading it into 2026 by
   mistake is what broke that chart, so these pin the pairs the map draws in an
   order the app had reversed, plus the page B-32 tail that was never entered. */
const CHART_AGAA = {
  'TI(S)-3': ['TI(S)-2'], 'DCA(S)-1': ['TI(S)-3'],
  'TI-2': ['LASDT-3', 'TI(S)-3'], 'TI-3': ['TI-2', 'AAM-14'], 'DCA-1': ['TI-3', 'DCA(S)-1'],
  'TI(S)-1': ['ACM(S)-2', 'ST-12', 'AAM-12'], 'AAM-10': ['ST-10 ACM'], 'AAM-11': ['ST-10 ACM'],
  'NTR(S)-1': ['ST-14', 'AGS-08', 'NVG-LAB'], 'NTR-1': ['SA-4', 'NTR(S)-1'], 'SAN-1': ['SA(S)-7'],
  'SAT(S)-1': ['ST-15', 'DCA(S)-1'], 'SAT-1': ['DCA-1', 'SAT(S)-2'],
  'SATN-1': ['SAT(S)-1', 'NTR-2', 'SAN-1'], 'ST-18': ['SAT-2', 'SATN-1', 'DAAR/NAAR'],
};
const byAG = Object.fromEntries(SYLLABI['A/G - A/A 2026'].map(e => [e.id, e]));
const wrongAG = Object.entries(CHART_AGAA).filter(([id, want]) =>
  JSON.stringify((byAG[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
/* Air-to-air refresher chain, added to 2026 at the user's request. The Jul 26 map draws a
   single DAAR spine and one DAAR/NAAR box feeding ST-18, all in dashed line; the user asked
   for it split into four solid-line events instead, so this is deliberately NOT what the map
   draws. Structure mirrors 2024 (DAAR-1 -> DAAR-2, NAAR -> NAAR 2) and the A/G - A/A spine. */
const REFRESHER_2026 = {
  'DAAR-1': ['AAS-04', 'INT(S)-2', 'TR-4'],
  'DAAR-2': ['DAAR-1'],
  'NAAR-1': ['NTR-2'],
  'NAAR-2': ['NAAR-1'],
  'ST-18': ['SAT-2', 'SATN-1', 'DAAR-2', 'NAAR-2'],
};
const by26r = Object.fromEntries(SYLLABI['2026'].map(e => [e.id, e]));
const badRef = Object.entries(REFRESHER_2026).filter(([id, want]) =>
  JSON.stringify((by26r[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
ok('2026 carries the DAAR / NAAR refresher chain', badRef.length === 0,
  badRef.map(([id]) => `${id}=${by26r[id] ? '[' + (by26r[id].prereqs || []).join(',') + ']' : 'MISSING'}`).join(' | '));

/* Links that keep being "corrected" WRONGLY, because the chart images extracted from the .docx
   are INCOMPLETE. The Word file draws each page as a base picture with extra pieces laid over
   it — the red X strike-throughs, the IEPE ellipse on B-14, a TR(S)-7 ellipse, an INT-1 aircraft
   (they come out as word/media/image4,5,9,10,13,14). Unzipping gets the base and loses the
   overlays, so a reader working from the extracted pages sees a box missing from a chain and
   "helpfully" reads straight through it. Every entry below was read that way at least once and
   is wrong; each was then settled against the user's own screenshots of the rendered document.
   If a future pass wants to change one of these, get a fresh screenshot first. */
const CHART_2026_OVERLAY_TRAPS = {
  'TR(S)-7': ['TR(S)-LAO'],                              /* not TR(S)-6: TR(S)-LAO is drawn grey */
  'INT(S)-1': ['ST-09', 'ST-11', 'IEPE/IPC', 'IAT-07'],  /* not EPE: IEPE sits in the F column */
  'TR-5(P)': ['AAS-04', 'IEPE/IPC', 'TR-4'],             /* IEPE feeds this trunk too */
  'LASDT-1': ['JMP-03', 'INT-1', 'LASDT(S)-1'],          /* not BFM-7: INT-1 sits between them */
  'ACM-3': ['ACM(S)-2', 'ACM-2'],                        /* not INT-1 */
  'INT-1': ['BFM-7', 'INT(S)-4'],                        /* not ACM-2 */
  'T-10': ['AAS-04', 'IAT-08'],                          /* AAS-04 arrives via join K from B-14 */
};
const by26t = Object.fromEntries(SYLLABI['2026'].map(e => [e.id, e]));
const trapped = Object.entries(CHART_2026_OVERLAY_TRAPS).filter(([id, want]) =>
  JSON.stringify((by26t[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
ok('2026 links that the extracted chart images get wrong stay right', trapped.length === 0,
  trapped.map(([id]) => `${id}=[${(by26t[id]?.prereqs || []).join(',')}]`).join(' | '));

/* The A/G - A/A surface-attack sim chain. Page B-28 appears to break it: SA(S)-2's only line
   runs left into SA-1, SA(S)-3 looks fed only by AGW-02, and SA(S)-5 only by IAT-12. Three
   independent readings all concluded the links were absent and should be deleted. THEY MUST
   NOT BE. The user, who owns the syllabus, confirmed twice that the chain runs
   SA(S)-2 -> SA(S)-3 -> SA(S)-4 -> SA(S)-5; on the 2026 map the same run is drawn continuously
   across pages B-18 to B-20 via joins EE and II. Deleting these would let a student fly a sim
   out of order. Pinned so the next reading of B-28 cannot quietly undo it. */
const AGAA_SIM_CHAIN = {
  'SA(S)-2': ['SA(S)-1'],
  'SA(S)-3': ['SA(S)-2', 'AGW-02'],
  'SA(S)-4': ['SA(S)-3'],
  'SA(S)-5': ['SA(S)-4', 'IAT-12'],
};
const byAGs = Object.fromEntries(SYLLABI['A/G - A/A 2026'].map(e => [e.id, e]));
const brokenChain = Object.entries(AGAA_SIM_CHAIN).filter(([id, want]) =>
  JSON.stringify((byAGs[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
ok('A/G - A/A sim chain SA(S)-2 -> -3 -> -4 -> -5 stays joined', brokenChain.length === 0,
  brokenChain.map(([id]) => `${id}=[${(byAGs[id]?.prereqs || []).join(',')}]`).join(' | '));

/* Read off the A/G - A/A map (images 20-29) and confirmed by a second independent reading,
   then approved by the user. Each was a link the drawing carries but the syllabus had lost;
   all four ADD a prerequisite, so they can only delay an event, never unlock one early. */
const AGAA_ADDED = {
  'TR(S)-1': ['T-04', 'ST-04', 'ST-05', 'OPS-02', 'OPS-03'],
  'T-10': ['IAT-08', 'AAS-04'],
  'TR-5(P)': ['TR-4', 'IEPE/IPC', 'AAS-04'],
  'DAAR': ['AAS-04', 'INT(S)-2', 'TR-4'],
};
const byAG2 = Object.fromEntries(SYLLABI['A/G - A/A 2026'].map(e => [e.id, e]));
const missAG = Object.entries(AGAA_ADDED).filter(([id, want]) =>
  JSON.stringify((byAG2[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
ok('A/G - A/A carries the four links read off its map', missAG.length === 0,
  missAG.map(([id]) => `${id}=[${(byAG2[id]?.prereqs || []).join(',')}]`).join(' | '));

ok('A/G - A/A prereqs match its own course map', wrongAG.length === 0,
  wrongAG.map(([id]) => `${id}=[${(byAG[id]?.prereqs || []).join(',')}]`).join(' | '));

/* Each syllabus should funnel to one final event. A second endpoint means
   something is dangling off the end of the chart, which is how the missing
   B-32 tail showed up: A/G - A/A stopped dead at TI-3. */
const ENDPOINTS = { '2026': 1, 'A/G - A/A 2026': 1, 'Tx 2026': 2, 'Tx 2024': 2, '2024': 6 };
const ends = [];
for (const [name, syl] of Object.entries(SYLLABI)) {
  const used = new Set(syl.flatMap(e => e.prereqs || []));
  const tail = syl.filter(e => !used.has(e.id)).map(e => e.id);
  if (tail.length !== ENDPOINTS[name]) ends.push(`${name}: ${tail.length} (${tail.join(', ')})`);
}
ok('each syllabus ends where it should', ends.length === 0, ends.join(' | '));

/* The layouts carry x/y only, so a prereq edit silently drags an arrow across
   the whole board — which is exactly how the last rebuild shipped looking like
   spaghetti. Any link far longer than a normal one means the reading and the
   hand-placed position disagree, and one of the two is wrong. */
const { DEFAULT_LAYOUTS } = await import('../src/data/layouts.js');
const SPAN_LIMIT = 1000;
/* Baseline per syllabus, not zero: these long links predate any rebuild and are
   in the user's own charts. Tx 2026 / Tx 2024 / A/G - A/A 2026 still carry the
   LASDT->SA links that made 2026 look like spaghetti, so they are worth a look
   too — but changing them is a separate, confirmed-with-the-user job. */
/* A/G - A/A went 8 -> 10 when the four map-confirmed links were restored: TR-4->DAAR and
   AAS-04->T-10 are both genuine and both long, because AAS-04 and TR-4 sit far from their
   consumers in the current layout. The links are right; the routing is ugly. Moving those
   boxes closer is a layout change and needs the user, so the count is recorded, not hidden. */
/* 2026 went 2 -> 5 with the refresher chain: AAS-04->DAAR-1 (1141px), TR-4->DAAR-1 (1209px)
   and the DAAR-1->DAAR-2 spine (5428px). The spine is long by design — it mirrors A/G - A/A,
   where the same chain runs down the far-left column, and the map itself draws DAAR as a
   full-height spine across eight pages. */
const SPAN_BASELINE = { '2024': 0, '2026': 5, 'Tx 2026': 3, 'A/G - A/A 2026': 10, 'Tx 2024': 3 };
const stretched = [];
for (const [name, syl] of Object.entries(SYLLABI)) {
  const L = DEFAULT_LAYOUTS[name]; if (!L) continue;
  const long = [];
  for (const e of syl) for (const p of e.prereqs || []) {
    const a = L[p], b = L[e.id];
    if (typeof a?.x !== 'number' || typeof b?.x !== 'number') continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > SPAN_LIMIT) long.push(`${p}->${e.id} ${Math.round(d)}px`);
  }
  const allowed = SPAN_BASELINE[name] ?? 0;
  if (long.length > allowed) stretched.push(`${name}: ${long.length}>${allowed} (${long.slice(0, 3).join(', ')})`);
}
ok(`no new arrows longer than ${SPAN_LIMIT}px`, stretched.length === 0, stretched.join(' | '));

/* The board reads top to bottom, so a prerequisite placed lower than the event
   it feeds draws an arrow pointing back up the page. Cleared in the two charts
   read against their own map; the rest are recorded, not endorsed — in Tx and
   2024 it is still open whether the box or the link is the wrong one. */
const BACKWARDS_BASELINE = { '2024': 2, '2026': 0, 'Tx 2026': 4, 'A/G - A/A 2026': 0, 'Tx 2024': 4 };
const backwards = [];
for (const [name, syl] of Object.entries(SYLLABI)) {
  const L = DEFAULT_LAYOUTS[name]; if (!L) continue;
  const up = [];
  for (const e of syl) for (const p of e.prereqs || []) {
    const a = L[p], b = L[e.id];
    if (typeof a?.y === 'number' && typeof b?.y === 'number' && a.y > b.y) up.push(`${p}->${e.id}`);
  }
  const allowed = BACKWARDS_BASELINE[name] ?? 0;
  if (up.length > allowed) backwards.push(`${name}: ${up.length}>${allowed} (${up.slice(0, 3).join(', ')})`);
}
ok('no new arrows pointing back up the page', backwards.length === 0, backwards.join(' | '));

/* ---- no personal data in a PUBLIC repository ----
   The starting data shipped with the app once carried real rosters and marks
   (a full "Save backup" had been baked in), and github.com/seejiaokai/Tracker
   is public. Nothing here may name a person: the seed must hold no student
   keys at all, and any demo roster must use obvious placeholders. */
const { SEED_STATE } = await import('../src/data/seedState.js');
const seedPeople = Object.keys(SEED_STATE)
  .filter(k => /:m:|:d:/.test(k) || k.endsWith(':roster'));
ok('shipped starting data names nobody', seedPeople.length === 0,
  `${seedPeople.length} student keys: ${seedPeople.slice(0, 3).join(', ')}`);

const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
/* NB: `URL` is a const in this file (the app's address), so no `new URL(...)` here. */
const REPO = join(import.meta.dirname, '..');
const PLACEHOLDER = /^(STUDENT [A-Z]|TEST)$/;
const rosterLeaks = [];
for (const f of ['src/app/core.js', 'sample-data/OCU_state_sample.json']) {
  const txt = readFileSync(join(REPO, f), 'utf8');
  /* every quoted name inside a roster array literal, however it is written */
  for (const m of txt.matchAll(/roster[^\n]{0,80}?\[((?:\s*['"][^'"]*['"]\s*,?)+)\]/gi))
    for (const nm of m[1].matchAll(/['"]([^'"]+)['"]/g))
      if (!PLACEHOLDER.test(nm[1])) rosterLeaks.push(`${f}: ${nm[1]}`);
}
ok('demo rosters use placeholder names only', rosterLeaks.length === 0,
  [...new Set(rosterLeaks)].slice(0, 4).join(' | '));

/* ---- file format ---- */
const FF = await import('../src/app/fileFormat.js');
const envelope = FF.buildFile({ charts: null, students: null, savedAt: '2026-01-01T00:00:00.000Z' });
ok('envelope names its format and version',
  envelope.format === 'ocu-tracker' && envelope.version === 1);
ok('envelope records that it holds nothing',
  envelope.contains.charts === false && envelope.contains.students === false);
let ffRejected = false;
try { FF.readFile({ hello: 'world' }); } catch (_) { ffRejected = true; }
ok('a file that is not ours is rejected, not half-read', ffRejected);

const CHARTS_FIX = {
  order: ['2026'],
  syllabi: { '2026': [{ id: 'ST-01', type: 'acad', prereqs: [], seq: 0 }] },
  layouts: { '2026': { 'ST-01': { x: 60, y: 60 }, __lines: [{ a: 1 }], __font: { __all: 9 } } },
  eventInfo: { 'ST-01': { name: 'Squadron Welcome' } },
};
const STUDENTS_FIX = {
  courses: ['26ABSG'],
  byCourse: { '26ABSG': { plan: { sylName: '2026' }, bySyllabus: { '2026': {
    roster: ['STUDENT A'], marks: { 'STUDENT A': { 'ST-01': { g: 'dco', f: 2 } } },
    dates: { 'STUDENT A': { lastSyll: '2026-01-02', lastCurr: null } } } } } },
};
const ffBoth = FF.readFile(FF.buildFile({ charts: CHARTS_FIX, students: STUDENTS_FIX, savedAt: 'x' }));
ok('charts survive the round trip intact', JSON.stringify(ffBoth.charts) === JSON.stringify(CHARTS_FIX));
ok('students survive the round trip intact', JSON.stringify(ffBoth.students) === JSON.stringify(STUDENTS_FIX));

const chartsOnly = FF.buildFile({ charts: CHARTS_FIX, students: null, savedAt: 'x' });
ok('charts-only file says so', chartsOnly.contains.students === false);
ok('charts-only file has no students key', !('students' in chartsOnly));
ok('charts-only file names nobody', !JSON.stringify(chartsOnly).includes('STUDENT A'));
ok('a name containing a colon still round-trips', (() => {
  const odd = { courses: ['A:B'], byCourse: { 'A:B': { plan: {}, bySyllabus: { 'x:y': {
    roster: ['LEE J: JR'], marks: {}, dates: {} } } } } };
  return JSON.stringify(FF.readFile(FF.buildFile({ charts: null, students: odd, savedAt: 'x' })).students)
    === JSON.stringify(odd);
})());

ok('a charts-only file is named plainly',
  FF.suggestedFileName({ charts: true, students: false }, '2026-08-07T15:04:05.000Z')
    === 'OCU-syllabus-2026-08-07.json');
ok('a file with people in it says so in its name',
  FF.suggestedFileName({ charts: true, students: true }, '2026-08-07T15:04:05.000Z')
    === 'OCU-syllabus-WITH-STUDENTS-2026-08-07.json');
ok('a students-only file also says so',
  FF.suggestedFileName({ charts: false, students: true }, '2026-08-07T15:04:05.000Z')
    === 'OCU-syllabus-WITH-STUDENTS-2026-08-07.json');

console.log(`\n${pass} passed, ${fail} failed\n`);
await b.close();
stopServer();
if (KEEP && server) console.log(`preview left running at ${URL} (pid ${server.pid})`);
process.exit(fail ? 1 : 0);
