# Syllabus File — Plan 6 of 9: the Open and Save buttons

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first thing the owner can actually press — 📁 Open and ✓ Save changes writing to a real file, with tick-boxes for charts and student data.

**Architecture:** Handlers in `src/app/core.js` over Plan 5's `fileStore.js`; controls in `src/components/Header.jsx`. Nothing is removed from the app here.

**Tech Stack:** Vanilla ES modules, Vite, React 18, Playwright. **Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** 1 format → 2 read → 3 apply charts → 4 apply students → 5 file access → **6 Open/Save** → 7 Import & Save-a-copy → 8 remove old buttons → 9 changeover. **Plan 9 must not start until this plan has shipped and the owner has saved a file, reopened it, and confirmed their charts are inside.**

## Global Constraints

- Every markdown doc stays **under 200 lines**; `npm run build` must pass; there is no linter (`CLAUDE.md`).
- `core.js` changes normally port to `src/data/pristine.html`. **Defer that** — Plan 8 deletes that file. Note the deferral in each commit.
- Target elements by **ID**, never by text: `✓ Save changes` gains a `●` when dirty.
- A file name is user-supplied and reaches the DOM: render it through React (which escapes), never raw `innerHTML`.
- A picker call **must** run inside a click handler with no `await` before it, or the browser rejects it.
- Prove every new check fails before its fix exists.

---

### Task 1: The buttons

**Files:** Modify `src/app/core.js`, `src/components/Header.jsx` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `collectCharts`, `collectStudents` (Plan 2); `applyCharts`, `applyStudents` (Plans 3–4); all of `fileStore.js`; `buildFile`, `readFile`, `describeFile` (Plan 1); `suggestedFileName` (Plan 5 Task 2).
- Produces, all exported from `core.js`:
  - `export let openFileName = null` — shown on the toolbar, escaped
  - `export let openFileHasStudents = false`
  - `export let fileDirty = false`
  - `export let saveOpts = { charts: true, students: false }`
  - `export async function openFileClick()`
  - `export async function saveToFileClick()`
  - `export function setSaveOpt(which, on)`

New controls in `Header.jsx`, beside the existing `#saveChanges`:

```jsx
<button className="sm" id="openFileBtn" title="Open your syllabus file, or start a new one" onClick={core.openFileClick}>📁 Open</button>
<button className={'sm' + (core.fileDirty ? ' dirty' : '')} id="saveFileBtn" title="Write your work into your file" onClick={core.saveToFileClick}>{core.fileDirty ? '✓ Save changes ●' : '✓ Save changes'}</button>
<span className="sub" id="openFileName">{core.openFileName ? core.openFileName : 'no file open'}</span>
{core.openFileHasStudents ? <span className="sub" id="fileHasStudents">· contains student data</span> : null}
<label className="sub"><input type="checkbox" id="optCharts" checked={core.saveOpts.charts} onChange={e => core.setSaveOpt('charts', e.target.checked)} /> Charts</label>
<label className="sub"><input type="checkbox" id="optStudents" checked={core.saveOpts.students} onChange={e => core.setSaveOpt('students', e.target.checked)} /> Students &amp; courses</label>
```

- [ ] **Step 1: Write the failing test**

```js
ok('the Open button exists', await pg.locator('#openFileBtn').count() === 1);
ok('the toolbar says when no file is open',
  (await pg.textContent('#openFileName')).includes('no file open'));
ok('the students tick-box starts unticked', !(await pg.isChecked('#optStudents')));
ok('the charts tick-box starts ticked', await pg.isChecked('#optCharts'));
ok('no student-data warning shows with no file open',
  await pg.locator('#fileHasStudents').count() === 0);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -iE 'Open button|no file open|tick-box'` → all `FAIL`.

- [ ] **Step 3: Write the handlers**

```js
export let openFileName = null, openFileHasStudents = false, fileDirty = false;
export let saveOpts = { charts: true, students: false };
let fileHandle = null;
export function setSaveOpt(which, on) { saveOpts = { ...saveOpts, [which]: !!on }; notify(); }
export function markFileDirty() { fileDirty = true; notify(); }

export async function openFileClick() {
  if (!FS.canWriteInPlace()) { await uiAlert('This browser cannot open a file directly. Use Chrome or Edge.'); return; }
  const picked = await FS.pickOpen();            /* no await before this — gesture */
  if (!picked) return;
  let obj; try { obj = JSON.parse(picked.text); } catch (_) { await uiAlert('That file is not readable as JSON.'); return; }
  let info; try { info = describeFile(obj); } catch (e) { await uiAlert(e.message); return; }
  const { charts, students } = readFile(obj);
  if (charts) await applyCharts(charts, { names: null, mode: 'replace', rename: null });
  if (students) await applyStudents(students);
  fileHandle = picked.handle;
  openFileName = picked.handle.name;
  openFileHasStudents = info.students;
  saveOpts = { charts: info.charts, students: info.students };
  fileDirty = false;
  setSaveStatus('opened ' + openFileName, 'ok'); notify();
}

export async function saveToFileClick() {
  const savedAt = new Date().toISOString();
  const name = suggestedFileName(saveOpts, savedAt);
  if (!fileHandle) {
    if (!FS.canWriteInPlace()) {
      const body = buildFile({ charts: saveOpts.charts ? await collectCharts(null) : null,
                               students: saveOpts.students ? await collectStudents() : null, savedAt });
      FS.downloadInstead(name, JSON.stringify(body, null, 2));
      setSaveStatus('downloaded a copy — this browser cannot save in place', 'ok'); return;
    }
    fileHandle = await FS.pickSave(name);        /* gesture-critical */
    if (!fileHandle) return;
  }
  if (!await FS.ensureWritable(fileHandle)) {
    setSaveStatus('not saved — permission to write your file was declined', 'err'); notify(); return;
  }
  const body = buildFile({ charts: saveOpts.charts ? await collectCharts(null) : null,
                           students: saveOpts.students ? await collectStudents() : null, savedAt });
  await FS.writeTo(fileHandle, JSON.stringify(body, null, 2));
  openFileName = fileHandle.name; openFileHasStudents = !!saveOpts.students;
  fileDirty = false; setSaveStatus('saved to ' + openFileName, 'ok'); notify();
}
```

Call `markFileDirty()` everywhere `markDirty()` is already called, and in `endDrag` (line ~1534) where positions save themselves — this closes the trap where dragging never lit the Save button.

Add the close warning once, in `init()`:

```js
  window.addEventListener('beforeunload', e => { if (fileDirty) { e.preventDefault(); e.returnValue = ''; } });
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js src/components/Header.jsx scripts/smoke.mjs
git commit -m "Add Open and Save changes, writing to a real file on disk

pristine.html port deferred to Plan 8, where that file is deleted."
```

---

### Task 2: The round trip, end to end

**Files:** Test only — `scripts/smoke.mjs`

**Interfaces:** consumes everything built in Plans 1–6. Produces nothing.

The spec's **first** listed check: *"a chart saved, closed and reopened comes back identical: every ball, every line, every arrowhead, every font size."* Playwright cannot drive the OS file picker, so this runs the whole data path either side of it — `collectCharts` → `buildFile` → JSON text → `readFile` → `applyCharts` → `collectCharts` — every line of our code a real save and open would touch.

- [ ] **Step 1: Write the failing test**

```js
/* ---- the whole round trip, minus the OS picker Playwright cannot drive ---- */
const trip = await pg.evaluate(async () => {
  const t = window.__coreForTests, F = window.__fileFormatForTests;
  const before = await t.collectCharts(null);
  const text = JSON.stringify(F.buildFile({ charts: before, students: null, savedAt: 'x' }), null, 2);
  const { charts } = F.readFile(JSON.parse(text));
  await t.applyCharts(charts, { names: null, mode: 'replace', rename: null });
  const after = await t.collectCharts(null);
  const keys = n => Object.keys(before.layouts[n] || {}).filter(k => k.startsWith('__')).sort();
  return {
    identical: JSON.stringify(before) === JSON.stringify(after),
    names: before.order.join(','),
    metaBefore: before.order.map(keys).join('|'),
    metaAfter: after.order.map(n => Object.keys(after.layouts[n] || {}).filter(k => k.startsWith('__')).sort()).join('|'),
    hasPeople: text.includes('STUDENT'),
  };
});
ok('a chart survives a full save-and-reopen unchanged', trip.identical, trip.names);
ok('drawn lines, arrowheads and font sizes survive too',
  trip.metaBefore === trip.metaAfter, `${trip.metaBefore} vs ${trip.metaAfter}`);
ok('the saved text names nobody when students are not ticked', !trip.hasPeople);
```

Extend the test hook in `init()` so the format module is reachable:

```js
  if (typeof window !== 'undefined') window.__fileFormatForTests = FMT;
```

with `import * as FMT from './fileFormat.js';` at the top of `core.js`.

- [ ] **Step 2: Prove the check bites**

Temporarily drop the metadata carry-over from `layoutSnapshotFor` (Plan 2 Task 1) — delete its `for (const k of ['__edgeMeta', …])` loop.

Run: `npm run smoke 2>&1 | grep -i 'arrowheads and font'`
Expected: `FAIL`, showing the metadata keys present before and missing after. **Restore the loop.**

- [ ] **Step 3: Confirm green**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 4: Commit**

```bash
git add src/app/core.js scripts/smoke.mjs
git commit -m "Pin the full save-and-reopen round trip, metadata included

pristine.html port deferred to Plan 8, which deletes that file."
```
