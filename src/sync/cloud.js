/* ============================================================================
   CLOUD SYNC  (port of the original script #2)
   ----------------------------------------------------------------------------
   Two backends are supported. Pick one with the "☁ Cloud" button in the
   toolbar, or fill the config in below.

     dataverse  Microsoft Dataverse (Power Platform). One row per saved key.
     firebase   Google Firestore. Live push updates, generous free tier.

   Leave backend blank and the tool behaves exactly as before: offline,
   this-browser-only (via the SharePoint/localStorage layer in local.js).
   DOM access (status badge, cloud button, app reload) goes through
   registered sinks; everything else is a faithful port.
   ========================================================================== */
import { localStorageApi, localFlushNow, localLoadLatest, setLocalSinks } from './local.js';

/*==OCU-CLOUD:BEGIN==*/
const CLOUD_CONFIG = {
  backend: "",              /* "" | "dataverse" | "firebase" */

  /* --- Dataverse --- */
  envUrl:   "",             /* https://yourorg.crm5.dynamics.com  (blank = this page's own site) */
  table:    "cr123_ocustores",  /* the table's plural name from the API */
  keyCol:   "cr123_key",
  valCol:   "cr123_value",
  clientId: "",             /* Entra app id — only needed when running standalone */
  tenantId: "organizations",
  pollMs:   8000,           /* how often to check for teammates' changes */

  /* --- Firebase --- */
  apiKey: "", authDomain: "", projectId: "", appId: "",
  workspace: "default", signIn: "anonymous"
};
/*==OCU-CLOUD:END==*/

const LOCAL = localStorageApi, LOCALFLUSH = localFlushNow;
const CACHE = {}, mine = new Set();
let cfg = null, drv = null, live = false, readyP = null, renderT = null;

let statusSink = () => {};
let btnSink = () => {};
let busyCheck = () => false;
let reloadHook = async () => {};
export function setCloudSinks(o) {
  if (o.status) statusSink = o.status;
  if (o.btn) btnSink = o.btn;
  if (o.busy) busyCheck = o.busy;
  if (o.reload) reloadHook = o.reload;
  /* the SharePoint/local layer shares the same sinks */
  setLocalSinks({ status: o.status, busy: o.busy, reload: o.reload });
}
export function getCloudCache() { return CACHE; }
export let cloudError = null;

/* ---- config: a per-browser override wins over what is baked into the file ---- */
function effCfg() {
  let c = null;
  try { const r = localStorage.getItem('ocu:cloudcfg'); if (r) c = JSON.parse(r); } catch (e) {}
  if (!(c && c.backend) && typeof CLOUD_CONFIG !== 'undefined' && CLOUD_CONFIG && CLOUD_CONFIG.backend) c = CLOUD_CONFIG;
  if (!c || !c.backend) return null;
  if (c.backend === 'firebase' && !(c.apiKey && c.projectId)) return null;
  if (c.backend === 'dataverse' && !c.table) return null;
  return c;
}
export const cloudCfg = effCfg;

function status(kind) {
  const M = { live: ['● cloud — live', 'ok'], saving: ['● saving…', 'saving'],
    synced: ['● updated from teammate', 'ok'], local: ['● local only', 'saving'],
    signin: ['● sign in to sync', 'err'], offline: ['● offline — local only', 'saving'],
    init: ['● connecting…', 'saving'], err: ['● sync error', 'err'] };
  const m = M[kind] || ['● ' + kind, ''];
  statusSink({ text: m[0], cls: m[1] });
  if (kind === 'synced') { clearTimeout(status._t); status._t = setTimeout(() => status('live'), 2500); }
}
/* the toolbar button carries the connection state */
let pendingSignIn = null;
function setBtn(t, title, signIn) {
  pendingSignIn = signIn || null;
  btnSink({ text: t, title: title || '', mode: signIn ? 'signin' : 'dialog' });
}

function loadScript(u) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = u; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('cannot reach ' + u));
    document.head.appendChild(s);
  });
}

/* =========================== DATAVERSE DRIVER =========================== */
function dataverseDriver(c) {
  const base = (c.envUrl || location.origin).replace(/\/+$/, '');
  const API = base + '/api/data/v9.2/';
  const SET = c.table, K = c.keyCol || 'ocu_key', V = c.valCol || 'ocu_value';
  let token = null, msalApp = null, since = null;
  const embedded = (function () { try { return !!(window.Xrm || (window.parent && window.parent.Xrm)); } catch (e) { return false; } })();

  async function getToken() {
    if (embedded || !c.clientId) return null;             /* cookie auth inside Power Platform */
    if (typeof msal === 'undefined')
      await loadScript('https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js');
    if (!msalApp) {
      msalApp = new msal.PublicClientApplication({ auth: {
        clientId: c.clientId,
        authority: 'https://login.microsoftonline.com/' + (c.tenantId || 'organizations'),
        redirectUri: location.origin + location.pathname } });
      if (msalApp.initialize) await msalApp.initialize();
    }
    const scopes = [base + '/user_impersonation'];
    let acct = (msalApp.getAllAccounts() || [])[0];
    try {
      if (!acct) throw new Error('no account');
      const r = await msalApp.acquireTokenSilent({ scopes, account: acct });
      return r.accessToken;
    } catch (e) {
      const r = await msalApp.loginPopup({ scopes });
      return r.accessToken;
    }
  }
  async function api(path, opts) {
    opts = opts || {};
    const h = { 'Accept': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
    if (opts.body) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = 'Bearer ' + token;
    const r = await fetch(API + path, { method: opts.method || 'GET', headers: h, body: opts.body,
      credentials: token ? 'omit' : 'same-origin', cache: 'no-store' });
    if (r.status === 204 || r.status === 404) return { status: r.status, data: null };
    const t = await r.text();
    let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) {
      const msg = (d && d.error && d.error.message) || ('HTTP ' + r.status);
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return { status: r.status, data: d };
  }
  const ref = k => SET + '(' + K + "='" + encodeURIComponent(String(k).replace(/'/g, "''")) + "')";

  return {
    name: 'Dataverse',
    async connect() { token = await getToken(); },
    async readAll() {
      const out = {};
      let path = SET + '?$select=' + K + ',' + V + ',modifiedon';
      while (path) {
        const r = await api(path);
        const rows = (r.data && r.data.value) || [];
        rows.forEach(x => {
          out[x[K]] = x[V] == null ? '' : x[V];
          if (x.modifiedon && (!since || x.modifiedon > since)) since = x.modifiedon;
        });
        const nx = r.data && r.data['@odata.nextLink'];
        path = nx ? nx.slice(API.length) : null;
      }
      return out;
    },
    async write(k, v) {
      const body = {}; body[V] = v; body[K] = k;
      await api(ref(k), { method: 'PATCH', body: JSON.stringify(body) });   /* upsert */
    },
    async remove(k) {
      try { await api(ref(k), { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
    },
    /* poll for rows other people touched since we last looked */
    async poll() {
      const mark = since;
      let path = SET + '?$select=' + K + ',' + V + ',modifiedon';
      if (mark) path += '&$filter=modifiedon gt ' + encodeURIComponent(mark);
      const r = await api(path);
      const rows = (r.data && r.data.value) || [];
      const changed = [];
      rows.forEach(x => {
        const k = x[K], v = x[V] == null ? '' : x[V];
        if (x.modifiedon && (!since || x.modifiedon > since)) since = x.modifiedon;
        if (CACHE[k] !== v) { CACHE[k] = v; if (!mine.has(k)) changed.push(k); }
        mine.delete(k);
      });
      return changed.length > 0;
    }
  };
}

/* =========================== FIREBASE DRIVER ============================ */
function firebaseDriver(c) {
  const VER = '12.16.0';
  const SDK = ['app', 'auth', 'firestore'].map(m => 'https://www.gstatic.com/firebasejs/' + VER + '/firebase-' + m + '-compat.js');
  let col = null, auth = null, uid = null;
  const enc = k => encodeURIComponent(k), dec = i => decodeURIComponent(i);
  function waitAuth() {
    return new Promise(res => {
      let done = false;
      auth.onAuthStateChanged(async u => {
        if (done) return;
        if (u) { done = true; return res(u.uid); }
        if ((c.signIn || 'anonymous') === 'google') { done = true; return res(null); }
        try { await auth.signInAnonymously(); } catch (e) { done = true; res(null); }
      });
    });
  }
  return {
    name: 'Firebase',
    needsInteractiveSignIn: false,
    async connect() {
      if (typeof firebase === 'undefined') for (const u of SDK) await loadScript(u);
      if (!firebase.apps || !firebase.apps.length)
        firebase.initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId });
      const db = firebase.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
      auth = firebase.auth();
      uid = await waitAuth();
      if (!uid) {
        this.needsInteractiveSignIn = true;
        this.signIn = async () => { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); location.reload(); };
        throw Object.assign(new Error('sign-in required'), { signin: true });
      }
      col = db.collection('workspaces').doc(c.workspace || 'default').collection('store');
    },
    async readAll() {
      return new Promise((res, rej) => {
        let first = true;
        col.onSnapshot(snap => {
          const out = {}; let remote = false;
          snap.docChanges().forEach(ch => {
            const k = dec(ch.doc.id);
            if (ch.type === 'removed') delete CACHE[k];
            else CACHE[k] = ((ch.doc.data() || {}).v) || '';
            if (!first && !mine.has(k)) remote = true;
            mine.delete(k);
          });
          if (first) { first = false; Object.keys(CACHE).forEach(k => out[k] = CACHE[k]); return res(out); }
          if (remote) scheduleRender();
        }, err => { if (first) { first = false; return rej(err); } status('err'); });
      });
    },
    async write(k, v) { await col.doc(enc(k)).set({ v: v, by: uid, t: firebase.firestore.FieldValue.serverTimestamp() }); },
    async remove(k) { await col.doc(enc(k)).delete(); },
    async poll() { return false; }   /* push-based, nothing to poll */
  };
}

/* ============================ shared plumbing =========================== */
function busy() { try { return !!busyCheck(); } catch (e) { return false; } }
function scheduleRender() {
  clearTimeout(renderT);
  renderT = setTimeout(async () => {
    if (busy()) return scheduleRender();
    try { await reloadHook(); status('synced'); } catch (e) {}
  }, 400);
}
function startPolling() {
  const ms = Math.max(3000, (cfg && cfg.pollMs) || 8000);
  setInterval(async () => {
    if (!live || busy()) return;
    try { if (await drv.poll()) scheduleRender(); } catch (e) {}
  }, ms);
}

function ensure() {
  if (readyP) return readyP;
  readyP = (async () => {
    cfg = effCfg();
    if (!cfg) { status('local'); return; }
    status('init');
    try {
      drv = (cfg.backend === 'dataverse') ? dataverseDriver(cfg) : firebaseDriver(cfg);
      await drv.connect();
      const all = await drv.readAll();
      Object.keys(all).forEach(k => CACHE[k] = all[k]);
      live = true; status('live');
      setBtn('☁ Live', drv.name + ' — connected. Click to change.');
      startPolling();
    } catch (e) {
      live = false;
      if (e && e.signin) {
        status('signin');
        setBtn('⚠ Sign in', 'Click to sign in and start syncing.', () => { try { drv.signIn(); } catch (_) {} });
      } else {
        status('offline');
        setBtn('☁ Offline', 'Cloud is configured but unreachable — working locally. Click for details.');
        cloudError = e && e.message;
        console.warn('[OCU cloud]', e && e.message);
      }
    }
  })();
  return readyP;
}

/* ---- the storage API the app talks to; falls back to the local shim ---- */
export const storage = {
  async get(k) { await ensure(); if (!live) return LOCAL.get(k);
    return (k in CACHE) ? { key: k, value: CACHE[k] } : null; },
  async set(k, v) { await ensure(); if (!live) return LOCAL.set(k, v);
    CACHE[k] = v; mine.add(k); status('saving');
    try { await drv.write(k, v); }
    catch (e) { status('err'); setBtn('☁ Error', (e && e.message) || 'Write failed.'); }
    return { key: k, value: v }; },
  async delete(k) { await ensure(); if (!live) return LOCAL.delete(k);
    delete CACHE[k]; mine.add(k);
    try { await drv.remove(k); } catch (e) { status('err'); }
    return { key: k, deleted: true }; },
  async list(prefix) { await ensure(); if (!live) return LOCAL.list(prefix);
    let keys = Object.keys(CACHE);
    if (prefix) keys = keys.filter(x => x.slice(0, prefix.length) === prefix);
    return { keys }; }
};
export const flushNow = async () => { await ensure(); if (!live && typeof LOCALFLUSH === 'function') return LOCALFLUSH(); };
export const loadLatest = async () => {
  await ensure();
  if (!live) { return localLoadLatest(); }
  try {
    if (drv.poll) await drv.poll();
    const all = await drv.readAll();
    Object.keys(all).forEach(k => CACHE[k] = all[k]);
    await reloadHook(); status('synced');
  } catch (e) { status('err'); }
};

/* the click action for the toolbar's ☁ button */
export function cloudButtonClick() {
  if (pendingSignIn) { try { pendingSignIn(); } catch (_) {} return; }
  openCloudDialog();
}

/* ------------------------------ setup dialog ---------------------------- */
export function openCloudDialog() {
  const c = effCfg() || (typeof CLOUD_CONFIG !== 'undefined' ? CLOUD_CONFIG : {}) || {};
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;font:13px system-ui,sans-serif';
  const inp = 'width:100%;background:#11141a;color:#cfe;border:1px solid #38414f;border-radius:6px;padding:6px;box-sizing:border-box';
  const btn = 'padding:7px 12px;border-radius:6px;border:1px solid #38414f;background:#222833;color:#e8ecf3;cursor:pointer';
  wrap.innerHTML = '<div style="background:#1b1f27;color:#e8ecf3;border:1px solid #38414f;border-radius:10px;padding:18px;width:min(600px,93vw);max-height:88vh;overflow:auto">'
    + '<div style="font-size:15px;font-weight:600;margin-bottom:10px">Cloud sync</div>'
    + (cloudError ? '<div style="background:#3a1d1d;border:1px solid #7a3b3b;border-radius:6px;padding:8px;margin-bottom:10px;line-height:1.4">Last error: ' + String(cloudError).replace(/</g, '&lt;') + '</div>' : '')
    + '<label>Backend<br><select id="cbEnd" style="' + inp + '"><option value="">Off — local only</option><option value="dataverse">Microsoft Dataverse</option><option value="firebase">Google Firebase</option></select></label>'
    + '<div id="cbDV" style="margin-top:12px;display:none">'
      + '<label>Environment URL<br><input id="dvUrl" placeholder="https://yourorg.crm5.dynamics.com" style="' + inp + '"></label>'
      + '<div style="opacity:.7;margin:4px 0 8px">Leave blank if this page is hosted inside Power Platform.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<label style="flex:2;min-width:170px">Table (plural API name)<br><input id="dvTbl" placeholder="cr123_ocustores" style="' + inp + '"></label>'
        + '<label style="flex:1;min-width:120px">Key column<br><input id="dvKey" style="' + inp + '"></label>'
        + '<label style="flex:1;min-width:120px">Value column<br><input id="dvVal" style="' + inp + '"></label>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
        + '<label style="flex:2;min-width:170px">App (client) ID<br><input id="dvCid" placeholder="only for standalone use" style="' + inp + '"></label>'
        + '<label style="flex:1;min-width:120px">Tenant<br><input id="dvTid" style="' + inp + '"></label>'
      + '</div>'
    + '</div>'
    + '<div id="cbFB" style="margin-top:12px;display:none">'
      + '<div style="opacity:.75;margin-bottom:6px">Paste the <b>firebaseConfig</b> block from Firebase → Project settings → Your apps.</div>'
      + '<textarea id="fbTa" spellcheck="false" style="' + inp + ';height:130px;font:12px ui-monospace,monospace"></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
        + '<label style="flex:1;min-width:150px">Workspace<br><input id="fbWs" style="' + inp + '"></label>'
        + '<label style="flex:1;min-width:150px">Sign-in<br><select id="fbSi" style="' + inp + '"><option value="anonymous">Anonymous</option><option value="google">Google account</option></select></label>'
      + '</div>'
    + '</div>'
    + '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button id="cbCancel" style="' + btn + '">Cancel</button>'
    + '<button id="cbSave" style="' + btn + ';border-color:#2b6cb0;background:#2b6cb0;color:#fff">Save &amp; connect</button>'
    + '</div></div>';
  document.body.appendChild(wrap);
  const $ = id => wrap.querySelector('#' + id);
  $('cbEnd').value = c.backend || '';
  $('dvUrl').value = c.envUrl || ''; $('dvTbl').value = c.table || '';
  $('dvKey').value = c.keyCol || 'cr123_key'; $('dvVal').value = c.valCol || 'cr123_value';
  $('dvCid').value = c.clientId || ''; $('dvTid').value = c.tenantId || 'organizations';
  if (c.projectId) $('fbTa').value = JSON.stringify({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId }, null, 2);
  $('fbWs').value = c.workspace || 'default'; $('fbSi').value = c.signIn || 'anonymous';
  const sync = () => {
    const v = $('cbEnd').value;
    $('cbDV').style.display = (v === 'dataverse') ? '' : 'none';
    $('cbFB').style.display = (v === 'firebase') ? '' : 'none';
  };
  $('cbEnd').onchange = sync; sync();
  $('cbCancel').onclick = () => wrap.remove();
  $('cbSave').onclick = () => {
    const v = $('cbEnd').value;
    if (!v) { try { localStorage.removeItem('ocu:cloudcfg'); } catch (e) {} wrap.remove(); location.reload(); return; }
    let o = { backend: v };
    if (v === 'dataverse') {
      o.envUrl = $('dvUrl').value.trim().replace(/\/+$/, '');
      o.table = $('dvTbl').value.trim();
      o.keyCol = $('dvKey').value.trim(); o.valCol = $('dvVal').value.trim();
      o.clientId = $('dvCid').value.trim(); o.tenantId = $('dvTid').value.trim() || 'organizations';
      o.pollMs = c.pollMs || 8000;
      if (!o.table || !o.keyCol || !o.valCol) { alert('Table, key column and value column are required.'); return; }
    } else {
      let raw = $('fbTa').value.trim().replace(/^[^{]*/, '').replace(/;?\s*$/, '');
      raw = raw.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,(\s*})/g, '$1');
      let f = null; try { f = JSON.parse(raw); } catch (e) { alert('That does not look like a firebaseConfig block.'); return; }
      if (!f.projectId || !f.apiKey) { alert('Missing projectId or apiKey.'); return; }
      o = Object.assign(o, { apiKey: f.apiKey, authDomain: f.authDomain, projectId: f.projectId, appId: f.appId,
        workspace: $('fbWs').value.trim() || 'default', signIn: $('fbSi').value });
    }
    try { localStorage.setItem('ocu:cloudcfg', JSON.stringify(o)); } catch (e) {}
    wrap.remove(); location.reload();
  };
}
