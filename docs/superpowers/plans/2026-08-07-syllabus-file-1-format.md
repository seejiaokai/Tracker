# Syllabus File — Plan 1 of 9: the file format

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure module turning the app's state into one JSON file and back, with charts and student data independently selectable.

**Architecture:** `src/app/fileFormat.js` uses no browser APIs and does not import `core.js`, so `scripts/smoke.mjs` can import it in plain Node. Later plans wire it to the UI.

**Tech Stack:** Vanilla ES modules, Vite, Playwright. `scripts/smoke.mjs` is the only test runner — there is no unit-test framework and this plan does not add one.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** 1 format → 2 read → 3 apply charts → 4 apply students → 5 file access → 6 Open/Save → 7 Import & Save-a-copy → 8 remove old buttons → 9 changeover.

## Global Constraints

- Every markdown doc in this repo stays **under 200 lines** (`CLAUDE.md`).
- Changes to `core.js` must be ported to `src/data/pristine.html` unless a plan says otherwise. This plan touches neither.
- Target elements by **ID** in browser tests, never by text.
- `npm run build` must pass. There is no linter.
- Prove every new check fails before its fix exists.

---

### Task 1: The file envelope

**Files:**
- Create: `src/app/fileFormat.js`
- Test: `scripts/smoke.mjs` — append a section immediately before the final `console.log`

**Interfaces:**
- Consumes: nothing.
- Produces: `FILE_FORMAT` (`'ocu-tracker'`), `FILE_VERSION` (`1`), `buildFile({charts, students, savedAt})` → object, `readFile(obj)` → `{charts, students, contains}` or throws `Error`, `describeFile(obj)` → `{charts, students, savedAt, syllabusNames}`.

- [ ] **Step 1: Write the failing test**

```js
/* ---- file format ---- */
const FF = await import('../src/app/fileFormat.js');
const envelope = FF.buildFile({ charts: null, students: null, savedAt: '2026-01-01T00:00:00.000Z' });
ok('envelope names its format and version',
  envelope.format === 'ocu-tracker' && envelope.version === 1);
ok('envelope records that it holds nothing',
  envelope.contains.charts === false && envelope.contains.students === false);
let rejected = false;
try { FF.readFile({ hello: 'world' }); } catch (_) { rejected = true; }
ok('a file that is not ours is rejected, not half-read', rejected);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | tail -20`
Expected: dies with `Cannot find module .../src/app/fileFormat.js`.

- [ ] **Step 3: Write the module**

```js
/* One JSON file holding the user's syllabus work. Deliberately free of browser
   APIs and of core.js, so it can be imported and checked in plain Node. */
export const FILE_FORMAT = 'ocu-tracker';
export const FILE_VERSION = 1;

export function buildFile({ charts = null, students = null, savedAt }) {
  const out = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    savedAt: savedAt || null,
    contains: { charts: !!charts, students: !!students },
  };
  if (charts) out.charts = charts;
  if (students) out.students = students;
  return out;
}

export function readFile(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== FILE_FORMAT)
    throw new Error('That file is not an OCU Tracker file.');
  if (typeof obj.version !== 'number' || obj.version > FILE_VERSION)
    throw new Error('That file was written by a newer version of the app.');
  return {
    charts: obj.charts || null,
    students: obj.students || null,
    contains: {
      charts: !!(obj.contains && obj.contains.charts),
      students: !!(obj.contains && obj.contains.students),
    },
  };
}

export function describeFile(obj) {
  const { charts, contains } = readFile(obj);
  return {
    charts: contains.charts,
    students: contains.students,
    savedAt: obj.savedAt || null,
    syllabusNames: (charts && Array.isArray(charts.order)) ? charts.order.slice() : [],
  };
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `npm run smoke 2>&1 | tail -8` → three new `PASS`, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/fileFormat.js scripts/smoke.mjs
git commit -m "Add the syllabus file envelope, with format and version checks"
```

---

### Task 2: Both halves round-trip unchanged

**Files:** Modify `src/app/fileFormat.js` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `buildFile`, `readFile`.
- Produces: no new exports. Fixes the two shapes every later plan must use:
  - `charts` = `{order: string[], syllabi: {name: event[]}, layouts: {name: object}, eventInfo: object}`
  - `students` = `{courses: string[], byCourse: {course: {plan: object, bySyllabus: {syl: {roster: string[], marks: {student: object}, dates: {student: object}}}}}}`
- Nested objects rather than joined key strings **on purpose**: course, syllabus and student names are free text and may contain any separator character.

- [ ] **Step 1: Write the failing test**

```js
const CHARTS = {
  order: ['2026'],
  syllabi: { '2026': [{ id: 'ST-01', type: 'acad', prereqs: [], seq: 0 }] },
  layouts: { '2026': { 'ST-01': { x: 60, y: 60 }, __lines: [{ a: 1 }], __font: { __all: 9 } } },
  eventInfo: { 'ST-01': { name: 'Squadron Welcome' } },
};
const STUDENTS = {
  courses: ['26ABSG'],
  byCourse: { '26ABSG': { plan: { sylName: '2026' }, bySyllabus: { '2026': {
    roster: ['STUDENT A'], marks: { 'STUDENT A': { 'ST-01': { g: 'dco', f: 2 } } },
    dates: { 'STUDENT A': { lastSyll: '2026-01-02', lastCurr: null } } } } } },
};
const both = FF.readFile(FF.buildFile({ charts: CHARTS, students: STUDENTS, savedAt: 'x' }));
ok('charts survive the round trip intact', JSON.stringify(both.charts) === JSON.stringify(CHARTS));
ok('students survive the round trip intact', JSON.stringify(both.students) === JSON.stringify(STUDENTS));

const chartsOnly = FF.buildFile({ charts: CHARTS, students: null, savedAt: 'x' });
ok('charts-only file says so', chartsOnly.contains.students === false);
ok('charts-only file has no students key', !('students' in chartsOnly));
ok('charts-only file names nobody', !JSON.stringify(chartsOnly).includes('STUDENT A'));
ok('a name containing a colon still round-trips', (() => {
  const odd = { courses: ['A:B'], byCourse: { 'A:B': { plan: {}, bySyllabus: { 'x:y': {
    roster: ['LEE J: JR'], marks: {}, dates: {} } } } } };
  return JSON.stringify(FF.readFile(FF.buildFile({ charts: null, students: odd, savedAt: 'x' })).students)
    === JSON.stringify(odd);
})());
```

- [ ] **Step 2: Prove the checks bite**

Task 1's code should already satisfy these. That makes them unproven, so temporarily replace `readFile`'s return with `{charts: null, students: null, contains}`.
Run: `npm run smoke 2>&1 | grep -E 'round trip|colon'` → expect `FAIL`. Restore `readFile`.

- [ ] **Step 3: Run the suite**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 4: Commit**

```bash
git add src/app/fileFormat.js scripts/smoke.mjs
git commit -m "Pin the syllabus file shapes: charts and students round-trip intact"
```
