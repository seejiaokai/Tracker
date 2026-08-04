/* =====================================================================
   SharePoint live-sync layer  (port of the original script #1)
   ---------------------------------------------------------------------
   - The whole app state lives as ONE JSON file in the same SharePoint
     folder as the page (default name: ocu_tracker_state.json).
   - When the page is served from SharePoint it can call the SharePoint
     REST API using the existing login. Saves are merged per key.
   - If SharePoint can't be reached (e.g. localhost / any other host),
     it silently falls back to this browser's localStorage (keys are
     prefixed "ocu:"), so the app still works for you alone.
   The only changes from the original are that DOM access (status badge,
   reload of the app) is routed through registered sinks instead of
   touching elements directly.
   ===================================================================== */
const SP = {
  fileName      : 'ocu_tracker_state.json',
  pollMs        : 10000,   // how often to check for teammates' changes
  pushDebounceMs: 800,     // wait after your last click before saving
  webOverride   : '',      // e.g. '/sites/142SQN'  or  '/teams/OCU'
  folderOverride: '',      // e.g. '/sites/142SQN/Shared Documents/OCU'
};

let statusSink = () => {};
let busyCheck = () => false;
let reloadHook = async () => {};
export function setLocalSinks(o) {
  if (o.status) statusSink = o.status;
  if (o.busy) busyCheck = o.busy;
  if (o.reload) reloadHook = o.reload;
}

/* ---- path helpers (auto-detect the SharePoint web + folder) ---- */
function web() {
  if (SP.webOverride) return SP.webOverride.replace(/\/+$/, '');
  const p = decodeURIComponent(location.pathname);
  const m = p.match(/^(\/(?:sites|teams)\/[^\/]+)/i);
  return m ? m[1] : '';
}
function folderRel() {
  if (SP.folderOverride) return SP.folderOverride.replace(/\/+$/, '');
  const p = decodeURIComponent(location.pathname);
  const dir = p.substring(0, p.lastIndexOf('/'));
  return dir || '/';
}
function fileRel() { return folderRel().replace(/\/+$/, '') + '/' + SP.fileName; }
function apiBase() { return location.origin + web() + '/_api'; }
const qesc = s => s.replace(/'/g, "''");                 // SP quote-escape

/* ---- SharePoint REST primitives ---- */
async function getDigest() {
  const r = await fetch(apiBase() + '/contextinfo', { method: 'POST',
    headers: { 'Accept': 'application/json;odata=nometadata' }, credentials: 'same-origin' });
  if (!r.ok) throw new Error('contextinfo ' + r.status);
  return (await r.json()).FormDigestValue;
}
async function readProps() {
  const url = encodeURI(apiBase() + "/web/GetFileByServerRelativeUrl('" + qesc(fileRel()) + "')?$select=ETag,TimeLastModified");
  const r = await fetch(url, { headers: { 'Accept': 'application/json;odata=nometadata' }, credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 404) return { exists: false };
  if (!r.ok) throw new Error('props ' + r.status);
  const j = await r.json();
  return { exists: true, etag: j.ETag };
}
async function readContent() {
  const url = encodeURI(apiBase() + "/web/GetFileByServerRelativeUrl('" + qesc(fileRel()) + "')/$value");
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 404) return { exists: false };
  if (!r.ok) throw new Error('read ' + r.status);
  let map = {}; const t = await r.text();
  try { map = t ? JSON.parse(t) : {}; } catch (e) { map = {}; }
  return { exists: true, map };
}
async function writeContent(map, ifMatch) {
  const digest = await getDigest();
  const body = JSON.stringify(map);
  if (ifMatch) {
    const url = encodeURI(apiBase() + "/web/GetFileByServerRelativeUrl('" + qesc(fileRel()) + "')/$value");
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'X-RequestDigest': digest, 'X-HTTP-Method': 'PUT', 'If-Match': ifMatch, 'Content-Type': 'text/plain' }, body });
    if (r.status === 412) return { conflict: true };
    if (!r.ok) throw new Error('update ' + r.status);
  } else {
    const url = encodeURI(apiBase() + "/web/GetFolderByServerRelativeUrl('" + qesc(folderRel()) + "')/Files/add(url='" + encodeURIComponent(SP.fileName) + "',overwrite=true)");
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'X-RequestDigest': digest, 'Content-Type': 'text/plain' }, body });
    if (!r.ok) throw new Error('create ' + r.status);
  }
  const p = await readProps();
  return { etag: p.etag };
}

/* ---- store state ---- */
let STORE = {}, remoteEtag = null, mode = 'init', loadedP = null;
const dirty = new Set(), tombstones = new Set();
let pushTimer = null, pushing = false, revertTimer = null;

/* ---- status badge ---- */
function setStatus(kind) {
  const M = { live: ['● live sync', 'ok'], saving: ['● saving…', 'saving'],
    synced: ['● updated from teammate', 'ok'], local: ['● local only', 'saving'],
    err: ['● sync error — retrying', 'err'], init: ['● connecting…', 'saving'] };
  const [t, c] = M[kind] || ['● ' + kind, ''];
  statusSink({ text: t, cls: c });
  if (kind === 'synced') { clearTimeout(revertTimer); revertTimer = setTimeout(() => setStatus('live'), 2500); }
}

/* ---- localStorage fallback ---- */
const LP = 'ocu:';
function loadLocal() {
  STORE = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.slice(0, LP.length) === LP) STORE[k.slice(LP.length)] = localStorage.getItem(k);
  }
}
function persistLocal() {
  try {
    for (const k of dirty) {
      if (tombstones.has(k)) localStorage.removeItem(LP + k);
      else localStorage.setItem(LP + k, STORE[k]);
    }
    dirty.clear(); tombstones.clear(); setStatus('local');
  } catch (e) {}
}

/* ---- initial load: pull file, or create it, else go local ---- */
function ensureLoaded() {
  if (loadedP) return loadedP;
  loadedP = (async () => {
    setStatus('init');
    try {
      const r = await readContent();
      if (!r.exists) { await writeContent({}, null); STORE = {}; }
      else STORE = r.map || {};
      remoteEtag = (await readProps()).etag;
      mode = 'sp'; startPolling(); setStatus('live');
    } catch (e) {
      mode = 'local'; loadLocal(); setStatus('local');
      console.warn('[OCU sync] SharePoint unavailable, using localStorage:', e.message);
    }
  })();
  return loadedP;
}

/* ---- push (debounced) with per-key merge + conflict retry ---- */
function schedulePush() {
  if (mode === 'local') { persistLocal(); return; }
  if (mode !== 'sp') { return; }
  setStatus('saving');
  clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, SP.pushDebounceMs);
}
async function pushNow() {
  if (mode !== 'sp' || pushing) return; pushing = true;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const snap = [...dirty], snapT = [...tombstones];
      const cur = await readContent();
      const base = cur.exists ? (cur.map || {}) : {};
      const etag = cur.exists ? (await readProps()).etag : null;
      const merged = { ...base };
      for (const k of snap) { if (tombstones.has(k)) delete merged[k]; else merged[k] = STORE[k]; }
      const w = await writeContent(merged, etag);
      if (w.conflict) continue;                 // someone wrote in between -> retry
      remoteEtag = w.etag;
      for (const k in merged) { if (!dirty.has(k)) STORE[k] = merged[k]; }        // adopt teammates' keys
      for (const k of Object.keys(STORE)) { if (!(k in merged) && !dirty.has(k)) delete STORE[k]; }
      snap.forEach(k => dirty.delete(k)); snapT.forEach(k => tombstones.delete(k));
      setStatus('live'); break;
    }
  } catch (e) { setStatus('err'); }
  finally { pushing = false; if (dirty.size) schedulePush(); }
}

/* ---- poll for teammates' changes ---- */
function startPolling() {
  setInterval(async () => {
    if (mode !== 'sp' || pushing || dirty.size || busyCheck()) return;
    try {
      const p = await readProps();
      if (!p.exists || !p.etag || p.etag === remoteEtag) return;   // unchanged
      const r = await readContent();
      STORE = r.map || {}; remoteEtag = (await readProps()).etag;
      await reloadHook();
      setStatus('synced');
    } catch (e) { /* transient; try again next tick */ }
  }, SP.pollMs);
}

/* ---- public hooks used by the app / buttons ---- */
export const localFlushNow = async () => { if (mode === 'sp') await pushNow(); else persistLocal(); };
export const localLoadLatest = async () => {
  if (mode !== 'sp') { setStatus('local'); return; }
  try {
    const r = await readContent(); STORE = r.map || {}; remoteEtag = (await readProps()).etag;
    await reloadHook(); setStatus('synced');
  } catch (e) { setStatus('err'); }
};

/* ---- the storage API the app expects ---- */
export const localStorageApi = {
  async get(k) { await ensureLoaded(); return (k in STORE) ? { key: k, value: STORE[k] } : null; },
  async set(k, v) { await ensureLoaded(); STORE[k] = v; tombstones.delete(k); dirty.add(k); schedulePush(); return { key: k, value: v }; },
  async delete(k) { await ensureLoaded(); delete STORE[k]; dirty.add(k); tombstones.add(k); schedulePush(); return { key: k, deleted: true }; },
  async list(prefix) { await ensureLoaded(); let keys = Object.keys(STORE); if (prefix) keys = keys.filter(x => x.slice(0, prefix.length) === prefix); return { keys }; },
};
