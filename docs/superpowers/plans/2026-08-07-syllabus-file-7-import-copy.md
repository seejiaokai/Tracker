# Syllabus File — Plan 7 of 9: Import and Save a copy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop one new syllabus into an existing setup, and save a handover copy that starts clean.

**Architecture:** Both buttons are thin wrappers over Plans 3–6. Removing ⤓ Save as new HTML lets `src/data/pristine.html` — a second copy of the app — be deleted, which is why earlier plans deferred porting to it.

**Tech Stack:** Vanilla ES modules, Vite, React 18, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** … 6 Open/Save → **7 Import & Save-a-copy** → 8 remove old buttons → 9 changeover.

## Global Constraints

- Every markdown doc stays **under 200 lines**; target elements by **ID**, never by text; `npm run build` must pass; there is no linter (`CLAUDE.md`).
- `core.js` changes normally port to `src/data/pristine.html`. **Defer that** — Plan 8 deletes that file.
- The app uses its own modal (`#dlgModal` / `#dlgInput` / `#dlgOk`), not native `prompt()`. Playwright's dialog handler will not catch it.
- Anything new opening over Show All must clear `z-index` 81.
- Prove every new check fails before its fix exists.

---

### Task 1: Import one syllabus

**Files:** Modify `src/app/core.js`, `src/components/Header.jsx` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `pickOpen` (Plan 5); `readFile`, `describeFile` (Plan 1); `applyCharts` (Plan 3); `uiChoice`, `uiPrompt`, `uiAlert` (already in `core.js`).
- Produces: `export async function importSyllabusClick()`.

Spec: *"Asks whether to add it as new or replace an existing one."* Marks survive either way — Plan 3 Task 2 pins that.

- [ ] **Step 1: Write the failing test**

```js
ok('the Import button exists', await pg.locator('#importSylBtn').count() === 1);
const imported = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  const charts = await t.collectCharts(['2026']);
  charts.syllabi['2026'] = charts.syllabi['2026'].slice(0, 4);
  const before = Object.keys(localStorage).filter(k => k.includes(':m:')).length;
  await t.applyCharts(charts, { names: ['2026'], mode: 'add', rename: { from: '2026', to: 'SMOKE NEW SYL' } });
  return { added: JSON.parse(localStorage['ocu:v3:master:syls'])['SMOKE NEW SYL'].length,
           original: JSON.parse(localStorage['ocu:v3:master:syls'])['2026'].length,
           marks: Object.keys(localStorage).filter(k => k.includes(':m:')).length, before };
});
ok('importing as new creates a separate syllabus', imported.added === 4);
ok('importing as new leaves the original syllabus alone', imported.original > 100);
ok('importing as new leaves every mark in place', imported.marks === imported.before);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'Import button\|importing as new'` → all `FAIL`.

- [ ] **Step 3: Write it**

```js
export async function importSyllabusClick() {
  const picked = await FS.pickOpen();          /* no await before this — gesture */
  if (!picked) return;
  let obj; try { obj = JSON.parse(picked.text); } catch (_) { await uiAlert('That file is not readable as JSON.'); return; }
  let info; try { info = describeFile(obj); } catch (e) { await uiAlert(e.message); return; }
  if (!info.charts || !info.syllabusNames.length) { await uiAlert('That file holds no charts.'); return; }
  const { charts } = readFile(obj);
  for (const name of info.syllabusNames) {
    const exists = allSylNames().includes(name);
    if (!exists) { await applyCharts(charts, { names: [name], mode: 'replace', rename: null }); continue; }
    const c = await uiChoice(
      '“' + name + '” already exists.\n\nReplace it, or add the incoming one under a new name?',
      'Replace it', 'Add as new');
    if (c === 'cancel') continue;
    if (c === 'ok') { await applyCharts(charts, { names: [name], mode: 'replace', rename: null }); continue; }
    const to = ((await uiPrompt('Name for the incoming syllabus:', name + ' (new)')) || '').trim();
    if (!to || allSylNames().includes(to)) { await uiAlert('That name is blank or already taken.'); continue; }
    await applyCharts(charts, { names: [name], mode: 'add', rename: { from: name, to } });
  }
  setSaveStatus('imported from ' + picked.handle.name, 'ok'); notify();
}
```

In `Header.jsx`, beside `#openFileBtn`:

```jsx
<button className="sm" id="importSylBtn" title="Drop one syllabus from another file into this one" onClick={core.importSyllabusClick}>⊕ Import syllabus</button>
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js src/components/Header.jsx scripts/smoke.mjs
git commit -m "Import one syllabus from a file, adding or replacing

pristine.html port deferred to Plan 8, which deletes that file."
```

---

### Task 2: Save a copy, starting clean every time

**Files:** Modify `src/app/core.js`, `src/components/Header.jsx` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `collectCharts`, `collectStudents`, `buildFile`, `suggestedFileName`, `pickSave`, `writeTo`, `downloadInstead`, `canWriteInPlace`.
- Produces: `export let copyOpts = {charts: true, students: false}`, `export let copyPick = {}` (syllabus name → boolean), `export function setCopyOpt(which, on)`, `export function setCopyPick(name, on)`, `export async function saveCopyClick()`.

Spec, and this is the safety property: *"the students tick-box is off by default."* It resets on **every** open, not just the first.

- [ ] **Step 1: Write the failing test**

```js
await pg.click('#saveCopyBtn'); await pg.waitForTimeout(500);
ok('Save a copy starts with students unticked', !(await pg.isChecked('#copyStudents')));
await pg.check('#copyStudents'); await pg.click('#copyCancel'); await pg.waitForTimeout(400);
await pg.click('#saveCopyBtn'); await pg.waitForTimeout(500);
ok('Save a copy resets students to unticked every time', !(await pg.isChecked('#copyStudents')));
ok('Save a copy lists the syllabi to tick', await pg.locator('#copySylList input').count() >= 4);
await pg.click('#copyCancel');
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'Save a copy'` → all `FAIL`.

- [ ] **Step 3: Write it**

```js
export let copyOpen = false, copyOpts = { charts: true, students: false }, copyPick = {};
export function openCopy() {
  copyOpts = { charts: true, students: false };          /* reset every time — safety */
  copyPick = {}; orderedSylNames().forEach(n => { copyPick[n] = (n === curSyl()); });
  copyOpen = true; notify();
}
export function closeCopy() { copyOpen = false; notify(); }
export function setCopyOpt(which, on) { copyOpts = { ...copyOpts, [which]: !!on }; notify(); }
export function setCopyPick(name, on) { copyPick = { ...copyPick, [name]: !!on }; notify(); }

export async function saveCopyClick() {
  const names = Object.keys(copyPick).filter(n => copyPick[n]);
  if (copyOpts.charts && !names.length) { await uiAlert('Tick at least one syllabus.'); return; }
  const savedAt = new Date().toISOString();
  const body = buildFile({
    charts: copyOpts.charts ? await collectCharts(names) : null,
    students: copyOpts.students ? await collectStudents() : null, savedAt });
  const text = JSON.stringify(body, null, 2);
  const name = suggestedFileName(copyOpts, savedAt);
  if (!FS.canWriteInPlace()) { FS.downloadInstead(name, text); closeCopy(); setSaveStatus('copy downloaded', 'ok'); return; }
  const handle = await FS.pickSave(name);
  if (!handle) return;
  await FS.writeTo(handle, text);
  closeCopy(); setSaveStatus('copy saved as ' + handle.name, 'ok'); notify();
}
```

Add `<CopyModal/>` to `Modals.jsx`: `id="copyModal"`, `z-index: 91` (above Show All's 81), holding `#copyCharts`, `#copyStudents`, a `#copySylList` of checkboxes from `core.copyPick`, `#copyCancel` → `closeCopy`, `#copyOk` → `saveCopyClick`. Add `<button className="sm" id="saveCopyBtn" onClick={core.openCopy}>⤓ Save a copy</button>` to `Header.jsx`.

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js src/components/Header.jsx src/components/Modals.jsx scripts/smoke.mjs
git commit -m "Add Save a copy, with students off by default every time"
```
