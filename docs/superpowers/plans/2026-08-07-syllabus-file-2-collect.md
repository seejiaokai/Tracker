# Syllabus File — Plan 2 of 9: reading the app's state

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the app's live state into the `charts` and `students` shapes from Plan 1. Reading only — Plan 3 writes them back.

**Architecture:** New exports in `src/app/core.js`, beside the existing storage-key helpers. Separate from the buttons so the risky part is testable before any UI exists.

**Tech Stack:** Vanilla ES modules, Vite, Playwright. `scripts/smoke.mjs` is the only test runner.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** 1 format → **2 read** → 3 apply charts → 4 apply students → 5 file access → 6 Open/Save → 7 Import & Save-a-copy → 8 remove old buttons → 9 changeover. Never start 9 before 6 has shipped and the owner has confirmed their own file.

## Global Constraints

- Every markdown doc in this repo stays **under 200 lines** (`CLAUDE.md`).
- `core.js` changes normally port to `src/data/pristine.html`. **Defer that** — Plan 8 deletes that file with ⤓ Save as new HTML, so porting now is wasted. Note the deferral in each commit.
- Target elements by **ID** in browser tests, never by text.
- `npm run build` must pass. There is no linter.
- Prove every new check fails before its fix exists.

## Key facts about the existing code

Storage keys, from `src/app/core.js` lines 119–159 — use the existing helpers
(`kSyls`, `kLayoutFor`, `kRosterFor`, `kMarksFor`, `kDatesFor`, `kPlan`,
`kCourses`, `'v3:eventinfo'`); do not re-derive the strings. Note that syllabus
definitions and layouts are **global**, not per course.

`snapshotLayout(srcName)` at line 173 **only works for the syllabus currently loaded** — it iterates the live `SYL`, not `srcName`'s events. Task 1 adds a variant that takes the event list, and the existing function is left alone.

---

### Task 1: A complete layout for any syllabus

**Files:** Modify `src/app/core.js` (add beside `snapshotLayout`, ~line 191) · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `DEFAULT_LAYOUTS`, `sGet`, `kLayoutFor`, `computeFlow`, `layout`, `curSyl` — all already in `core.js`.
- Produces: `export async function layoutSnapshotFor(name, events)` → object mapping every event id to `{x, y}`, plus the `__`-prefixed metadata keys (`__lines`, `__edgeMeta`, `__merges`, `__unmerges`, `__font`, `__derived`).

Spec: *"the position of every ball, not only the ones you have moved."*

- [ ] **Step 1: Write the failing test**

Add to the browser section of `scripts/smoke.mjs`, after the app has booted:

```js
/* ---- layout snapshots are complete, not just the balls you dragged ---- */
const snap = await pg.evaluate(async () => {
  const c = await import('/Tracker/assets/core.js').catch(() => null);
  return window.__coreForTests
    ? await window.__coreForTests.layoutSnapshotFor('2026', window.__coreForTests.SYLLABI['2026'])
    : null;
});
ok('layout snapshot covers every event, not only moved ones',
  snap && Object.keys(snap).filter(k => !k.startsWith('__')).length > 200,
  snap ? `${Object.keys(snap).filter(k => !k.startsWith('__')).length} positions` : 'no snapshot');
```

Add this line at the end of `init()` in `core.js` so tests can reach the module (the app is rendered imperatively and exports nothing to `window` today):

```js
  if (typeof window !== 'undefined') window.__coreForTests = { layoutSnapshotFor, SYLLABI, DEFAULT_LAYOUTS };
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'layout snapshot'`
Expected: `FAIL — no snapshot`.

- [ ] **Step 3: Write it**

```js
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
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → the new check passes, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js scripts/smoke.mjs
git commit -m "Snapshot a complete layout for any syllabus, not just the open one

pristine.html port deferred to Plan 8, where that file is deleted."
```

---

### Task 2: Collect charts and students out of storage

**Files:** Modify `src/app/core.js` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `layoutSnapshotFor` (Task 1), `orderedSylNames`, `sylSource`, `EVENT_INFO`, `eventInfo`, `COURSES`, `sGet`, and the key helpers.
- Produces:
  - `export async function collectCharts(names)` → the `charts` shape from Plan 1 Task 2.
  - `export async function collectStudents()` → the `students` shape from Plan 1 Task 2.

- [ ] **Step 1: Write the failing test**

```js
const collected = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  return { charts: await t.collectCharts(['2026']), students: await t.collectStudents() };
});
ok('collected charts carry the syllabus and its layout',
  collected.charts.order[0] === '2026' &&
  collected.charts.syllabi['2026'].length > 200 &&
  Object.keys(collected.charts.layouts['2026']).length > 200);
ok('collected charts name nobody',
  !JSON.stringify(collected.charts).includes('STUDENT A'));
ok('collected students carry the roster',
  JSON.stringify(collected.students).includes('STUDENT A'));
```

Extend the `window.__coreForTests` object from Task 1 with `collectCharts` and `collectStudents`.

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'collected'` → three `FAIL`s, `collectCharts is not a function`.

- [ ] **Step 3: Write them**

```js
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
    byCourse[c] = { plan: planObj, bySyllabus };
  }
  return { courses: COURSES.slice(), byCourse };
}
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js scripts/smoke.mjs
git commit -m "Collect charts and student data separately, never mixed

pristine.html port deferred to Plan 8, where that file is deleted."
```
