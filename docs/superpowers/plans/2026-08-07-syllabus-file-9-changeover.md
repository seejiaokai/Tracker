# Syllabus File — Plan 9 of 9: the changeover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the five built-in syllabi out of the app's code, so the app ships empty and a clean handover needs no cleanup.

**Architecture:** `src/data/syllabi.js` and `src/data/layouts.js` become empty. Before that, a one-time rescue prompt offers to write everything the browser currently holds into a file.

**Tech Stack:** Vanilla ES modules, Vite, React 18, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

## STOP — do not start this plan yet

This is the step that can destroy work. Any syllabus the owner has never edited exists **only** in the code Task 2 deletes; their browser holds no copy of it.

Task 2 may not begin until **all** of these are true:

1. Plan 6 has shipped to `main` and the Pages deploy has finished.
2. Task 1 of this plan has shipped and the owner has seen the rescue prompt.
3. **The owner has saved their file, reopened it, and confirmed in their own words that every syllabus they care about is inside it.**

Point 3 cannot be automated or assumed. No check can stand in for it — the file is on their machine, not in CI. If a subagent reaches Task 2 without an explicit confirmation in the conversation, it must stop and ask, not proceed.

## Global Constraints

- Every markdown doc in this repo stays **under 200 lines** (`CLAUDE.md`).
- `src/data/pristine.html` was deleted in Plan 8; the porting rule no longer applies.
- Target elements by **ID** in browser tests, never by text.
- `npm run build` must pass. There is no linter.
- Prove every new check fails before its fix exists.

---

### Task 1: The one-time rescue offer

**Files:** Modify `src/app/core.js`, `src/components/Modals.jsx` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `collectCharts`, `collectStudents`, `buildFile`, `suggestedFileName`, `pickSave`, `writeTo`, `canWriteInPlace`, `sGet`, `sSet`.
- Produces: `export let rescueOpen = false`, `export async function checkRescue()`, `export async function doRescue()`, `export async function dismissRescue()`. Marker key: `v3:rescued` — set to `'1'` once the owner has saved or dismissed, so the prompt never returns.

- [ ] **Step 1: Write the failing test**

```js
/* ---- one-time rescue prompt ---- */
await pg.evaluate(() => localStorage.removeItem('ocu:v3:rescued'));
await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForTimeout(1800);
ok('the rescue prompt appears for someone who has not saved a file yet',
  await pg.locator('#rescueModal').count() === 1);
ok('the rescue prompt says why it is asking',
  (await pg.textContent('#rescueModal')).toLowerCase().includes('only place'));
await pg.click('#rescueLater'); await pg.waitForTimeout(500);
await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForTimeout(1800);
ok('the rescue prompt does not come back once dismissed',
  await pg.locator('#rescueModal').count() === 0);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'rescue prompt'` → all `FAIL`.

- [ ] **Step 3: Write it**

```js
/* Shown once, before the built-in charts leave the code. For anyone who has
   never saved a file, this browser is the only place their work exists. */
export let rescueOpen = false;
export async function checkRescue() {
  try { if (await sGet('v3:rescued')) return; } catch (_) { return; }
  rescueOpen = true; notify();
}
export async function doRescue() {
  const savedAt = new Date().toISOString();
  const body = buildFile({ charts: await collectCharts(null), students: await collectStudents(), savedAt });
  const text = JSON.stringify(body, null, 2);
  const name = suggestedFileName({ charts: true, students: true }, savedAt);
  if (!FS.canWriteInPlace()) { FS.downloadInstead(name, text); }
  else { const h = await FS.pickSave(name); if (!h) return; await FS.writeTo(h, text); }
  await sSet('v3:rescued', '1');
  rescueOpen = false;
  setSaveStatus('saved — now open that file and check your syllabi are in it', 'ok'); notify();
}
export async function dismissRescue() { await sSet('v3:rescued', '1'); rescueOpen = false; notify(); }
```

Call `await checkRescue();` at the end of `init()`. Add a `<RescueModal/>` to `Modals.jsx` with `id="rescueModal"`, `z-index: 91`, containing this copy verbatim (the test greps for "only place"):

> **Save your work to a file first.** Your syllabus charts are about to move out of the app and into a file you keep. Right now this browser is the **only place** some of them exist. Save them now, then open the file and check everything is there.

with `#rescueSave` → `core.doRescue` and `#rescueLater` → `core.dismissRescue`.

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 5: Commit and ship, then STOP**

```bash
git add src/app/core.js src/components/Modals.jsx scripts/smoke.mjs
git commit -m "Offer once to rescue existing work into a file before the changeover"
```

Ship this to `main`, wait for the Pages deploy, then **stop and ask the owner to save their file, reopen it, and confirm their syllabi are inside.** Do not continue without that confirmation.

---

### Task 2: Empty the shipped charts

**Files:** Modify `src/data/syllabi.js`, `src/data/layouts.js`, `src/data/eventInfo.js`, `scripts/smoke.mjs`, `CLAUDE.md`

**Interfaces:** no code changes — only the data those three modules export. `core.js` already tolerates an empty `SYLLABI`: `loadCourses()` (line 228) falls back to `['26ABSG']`, and `allSylNames()` unions the built-ins with `CUSTOMS`, so a browser holding saved charts keeps showing them.

**Do not start without the confirmation described at the top of this plan.**

- [ ] **Step 1: Write the failing test**

```js
/* ---- the app ships with no charts of its own ---- */
const { SYLLABI: SHIPPED } = await import('../src/data/syllabi.js');
ok('the app ships no syllabus of its own', Object.keys(SHIPPED).length === 0,
  Object.keys(SHIPPED).join(', '));
ok('the app starts without looking broken when it holds nothing', await pg.evaluate(() => {
  const h = document.getElementById('courseTitle');
  return !!h && h.textContent.trim().length > 0;
}));
ok('the empty app still offers Open so there is a way forward',
  await pg.locator('#openFileBtn').count() === 1);
```

Every existing smoke check that reads `SYLLABI['2026']` must first load the fixture — see Step 3.

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'ships no syllabus'`
Expected: `FAIL — 2024, 2026, Tx 2026, A/G - A/A 2026, Tx 2024`.

- [ ] **Step 3: Move the charts to a test fixture, then empty the modules**

The chart-shape checks written across this repo's history are worth keeping. Move the current contents of `syllabi.js` and `layouts.js` to `scripts/fixtures/syllabi.json` and `scripts/fixtures/layouts.json`, and change the existing checks to read those instead of `../src/data/syllabi.js`. Then:

```js
/* src/data/syllabi.js — the app ships with no charts of its own.
   Charts live in the file the user opens. See
   docs/superpowers/specs/2026-08-07-syllabus-file-design.md */
export const SYLLABI = {};
export const SYL_NAMES = [];
export const DEFAULT_SYL_NAME = 'Syllabus';
export const DEFAULT_SYL_ORDER = [];
```

```js
/* src/data/layouts.js — positions travel in the user's file. */
export const DEFAULT_LAYOUTS = {};
```

```js
/* src/data/eventInfo.js — event names and hours travel in the user's file. */
export const EVENT_INFO = {};
```

In `CLAUDE.md`, replace the `syllabi.js` / `layouts.js` / `eventInfo.js` bullets under **Architecture** with a line saying charts now live in the user's file and the fixtures under `scripts/fixtures/` are what the checks read.

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`, and `npm run build` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Ship the app with no charts of its own

The five built-in syllabi move out of the code and into the file the
owner keeps, so handing a clean build to engineers needs no cleanup and
no pretend wipe button. Done only after the owner saved a file, reopened
it, and confirmed their syllabi were inside. The chart-shape checks now
read scripts/fixtures/ instead of the shipped modules."
```

- [ ] **Step 6: Verify on the deployed site**

Ship to `main`, wait for the Pages run, then `npm run live` and look at the screenshot. Expect an app with no syllabus loaded, a working 📁 Open button, and no errors. Confirm with the owner that opening their file brings everything back.
