# Syllabus File — Plan 5 of 9: reaching the user’s files

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wrapper over the browser's file access, with an honest fallback where it is missing. No UI yet — Plan 6 adds the buttons.

**Architecture:** `src/app/fileStore.js` wraps the File System Access API. Kept apart from `core.js` so the browser-capability edges are testable on their own.

**Tech Stack:** Vanilla ES modules, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** 1 format → 2 read → 3 apply charts → 4 apply students → **5 file access** → 6 Open/Save → 7 Import & Save-a-copy → 8 remove old buttons → 9 changeover.

## Global Constraints

- Every markdown doc in this repo stays **under 200 lines** (`CLAUDE.md`).
- `core.js` changes normally port to `src/data/pristine.html`. **Defer that** — Plan 8 deletes that file. Note the deferral in each commit.
- Target elements by **ID** in browser tests, never by text.
- `npm run build` must pass. There is no linter.
- Prove every new check fails before its fix exists.

## Verified environment facts

Measured in the served production build, not assumed:

- `window.showSaveFilePicker` and `window.showOpenFilePicker` are functions in Chromium 141, and `window.isSecureContext` is `true` on both the Pages site and the local preview.
- Safari and Firefox lack both. The fallback must download and say so.
- A picker call **must** happen inside a user gesture (a click handler), or the browser rejects it. Do not `await` anything before calling it.

---

### Task 1: The file-access wrapper

**Files:** Create `src/app/fileStore.js` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: nothing from the app.
- Produces:
  - `canWriteInPlace()` → boolean
  - `async pickSave(suggestedName)` → handle or `null` if cancelled
  - `async pickOpen()` → `{handle, text}` or `null` if cancelled
  - `async ensureWritable(handle)` → boolean (false when the user declines)
  - `async writeTo(handle, text)` → `true`, or throws
  - `downloadInstead(name, text)` → void

- [ ] **Step 1: Write the failing test**

```js
/* ---- file access wrapper ---- */
const fs = await pg.evaluate(() => ({
  hasModule: !!window.__fileStoreForTests,
  canWrite: window.__fileStoreForTests ? window.__fileStoreForTests.canWriteInPlace() : null,
}));
ok('the file-access wrapper is reachable', fs.hasModule);
ok('this browser can write back into the same file', fs.canWrite === true);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'file-access wrapper'` → `FAIL`.

- [ ] **Step 3: Write the module**

```js
/* Wraps the browser's File System Access API. Chrome and Edge can write back
   into the same file; Safari and Firefox cannot, so those get a download and
   are told so plainly rather than being left to think a save happened. */
const TYPES = [{ description: 'OCU Tracker file', accept: { 'application/json': ['.json'] } }];

export function canWriteInPlace() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/* Must be called directly from a click handler — awaiting first loses the gesture. */
export async function pickSave(suggestedName) {
  try { return await window.showSaveFilePicker({ suggestedName, types: TYPES }); }
  catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
}

export async function pickOpen() {
  try {
    const [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false });
    const text = await (await handle.getFile()).text();
    return { handle, text };
  } catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
}

/* Browsers drop write permission between sessions. Returns false when declined,
   so the caller can say so instead of failing silently. */
export async function ensureWritable(handle) {
  if (!handle || !handle.queryPermission) return false;
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
  return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
}

export async function writeTo(handle, text) {
  const w = await handle.createWritable();
  await w.write(text); await w.close();
  return true;
}

export function downloadInstead(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
```

In `core.js`'s `init()`, extend the test hook added in Plan 2:

```js
  if (typeof window !== 'undefined') window.__fileStoreForTests = FS;
```

with `import * as FS from './fileStore.js';` at the top of `core.js`.

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → both new checks pass, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/fileStore.js src/app/core.js scripts/smoke.mjs
git commit -m "Wrap the browser's file access, with a download fallback

pristine.html port deferred to Plan 8, where that file is deleted."
```

---

### Task 2: The file names itself honestly

**Files:** Modify `src/app/fileFormat.js` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `suggestedFileName(contains, savedAt)` → string. Plans 6, 7 and 9 all call this; none invents its own naming.

Spec: *"a file containing people gets a name that says so, visible in File Explorer and when attaching it to a message."* This is a safety feature, not cosmetics — it is how the owner notices they are about to send student data.

- [ ] **Step 1: Write the failing test**

Add to the file-format section of `scripts/smoke.mjs` created in Plan 1:

```js
ok('a charts-only file is named plainly',
  FF.suggestedFileName({ charts: true, students: false }, '2026-08-07T15:04:05.000Z')
    === 'OCU-syllabus-2026-08-07.json');
ok('a file with people in it says so in its name',
  FF.suggestedFileName({ charts: true, students: true }, '2026-08-07T15:04:05.000Z')
    === 'OCU-syllabus-WITH-STUDENTS-2026-08-07.json');
ok('a students-only file also says so',
  FF.suggestedFileName({ charts: false, students: true }, '2026-08-07T15:04:05.000Z')
    === 'OCU-syllabus-WITH-STUDENTS-2026-08-07.json');
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'named plainly\|says so'` → three `FAIL`, `suggestedFileName is not a function`.

- [ ] **Step 3: Write it**

```js
/* The name is a safety feature: a file holding people must look different in
   File Explorer and in an email attachment list. */
export function suggestedFileName(contains, savedAt) {
  const day = (savedAt || '').slice(0, 10) || 'undated';
  const flag = (contains && contains.students) ? 'WITH-STUDENTS-' : '';
  return `OCU-syllabus-${flag}${day}.json`;
}
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → three new `PASS`, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/fileFormat.js scripts/smoke.mjs
git commit -m "Name files holding student data so the risk is visible"
```
