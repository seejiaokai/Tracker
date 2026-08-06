/* ============================================================================
   MOCK DATABASE
   ----------------------------------------------------------------------------
   A drop-in stand-in for the SharePoint / cloud / localStorage stack in
   local.js + cloud.js. It implements exactly the storage API the app expects
   (get / set / delete / list) but keeps everything in a plain in-memory Map:

     - no network calls at all (so none of the SharePoint _api probes fire),
     - no localStorage writes (so a session leaves nothing behind),
     - contents vanish on reload, which is what makes it useful for demos,
       automated tests and local development against a known-clean slate.

   It is OFF by default: the live site keeps its real persistence. Turn it on
   per-session with a URL flag, or for a whole build with an env var:

     http://localhost:5173/?mock=1        one page load
     VITE_MOCK_DB=1 npm run dev           every load in that dev server
     globalThis.__OCU_MOCK_DB = true      before the app boots (tests)

   To make it the default everywhere instead, change mockDbEnabled() to
   `return true`.
   ========================================================================== */

function flagFromUrl() {
  if (typeof location === 'undefined' || !location.search) return false;
  try {
    const v = new URLSearchParams(location.search).get('mock');
    return v !== null && v !== '0' && v !== 'false';
  } catch (e) { return false; }
}

function flagFromEnv() {
  try {
    const v = import.meta.env && import.meta.env.VITE_MOCK_DB;
    return v === '1' || v === 'true';
  } catch (e) { return false; }
}

function mockDbEnabled() {
  if (typeof globalThis !== 'undefined' && globalThis.__OCU_MOCK_DB) return true;
  return flagFromUrl() || flagFromEnv();
}

/* Resolved once at module load so every caller agrees on the backend. */
export const MOCK_DB_ENABLED = mockDbEnabled();

/* ---- the store itself ---- */
const DB = new Map();

/* Values are stored exactly as handed over (the app always passes strings),
   and reads hand back the same shape the real backends return. */
export const mockStorage = {
  async get(k) { return DB.has(k) ? { key: k, value: DB.get(k) } : null; },
  async set(k, v) { DB.set(k, v); return { key: k, value: v }; },
  async delete(k) { DB.delete(k); return { key: k, deleted: true }; },
  async list(prefix) {
    let keys = [...DB.keys()];
    if (prefix) keys = keys.filter(x => x.slice(0, prefix.length) === prefix);
    return { keys };
  },
};

/* Nothing is buffered, so a flush is a no-op; there is no remote to re-read
   from, so "load latest" is one too. Both exist to match the real API. */
export const mockFlushNow = async () => {};
export const mockLoadLatest = async () => {};

/* ---- helpers for tests / the console ---- */
export function mockReset() { DB.clear(); }
export function mockSeed(obj) { for (const k of Object.keys(obj || {})) DB.set(k, obj[k]); }
export function mockDump() { return Object.fromEntries(DB); }
export function mockSize() { return DB.size; }

if (MOCK_DB_ENABLED && typeof console !== 'undefined') {
  console.info('[OCU] mock database active — nothing is persisted or sent anywhere.');
  if (typeof globalThis !== 'undefined') {
    globalThis.__ocuMock = { reset: mockReset, seed: mockSeed, dump: mockDump, size: mockSize };
  }
}
