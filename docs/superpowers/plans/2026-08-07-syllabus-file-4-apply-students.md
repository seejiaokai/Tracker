# Syllabus File — Plan 4 of 9: applying student data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a file's student data back into the app, without ever touching a chart.

**Architecture:** One export in `src/app/core.js`, the mirror of Plan 3's `applyCharts`. The two stay separate so neither can quietly write the other's keys.

**Tech Stack:** Vanilla ES modules, Vite, Playwright. `scripts/smoke.mjs` is the only test runner.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** 1 format → 2 read → 3 apply charts → **4 apply students** → 5 file access → 6 Open/Save → 7 Import & Save-a-copy → 8 remove old buttons → 9 changeover.

## Global Constraints

- Every markdown doc in this repo stays **under 200 lines** (`CLAUDE.md`).
- `core.js` changes normally port to `src/data/pristine.html`. **Defer that** — Plan 8 deletes that file. Note the deferral in each commit.
- Target elements by **ID** in browser tests, never by text.
- `npm run build` must pass. There is no linter.
- Prove every new check fails before its fix exists.

---

### Task 1: Apply students

**Files:** Modify `src/app/core.js` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `sSet`, `kRosterFor`, `kMarksFor`, `kDatesFor`, `kPlan`, `kCourses`, `reloadFromStore`.
- Produces: `export async function applyStudents(students)` → `{courses: string[]}`. Writes only person-shaped keys and the course list; never a syllabus or layout key.

- [ ] **Step 1: Write the failing test**

```js
const st = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  const before = await t.collectStudents();
  await t.applyStudents({ courses: ['SMOKE COURSE'], byCourse: { 'SMOKE COURSE': {
    plan: { sylName: '2026' },
    bySyllabus: { '2026': { roster: ['STUDENT Z'],
      marks: { 'STUDENT Z': { 'ST-01': { g: 'dco', f: 3 } } },
      dates: { 'STUDENT Z': { lastSyll: '2026-02-03', lastCurr: null } } } } } } });
  return { roster: localStorage['ocu:v3:SMOKE COURSE:2026:roster'],
           marks: localStorage['ocu:v3:SMOKE COURSE:2026:m:STUDENT Z'],
           hadBefore: !!before };
});
ok('applying students writes the roster', (st.roster || '').includes('STUDENT Z'));
ok('applying students writes marks and failure counts', (st.marks || '').includes('"f":3'));
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'applying students'` → both `FAIL`.

- [ ] **Step 3: Write it**

```js
/* People only. Never writes a syllabus or layout key. */
export async function applyStudents(students) {
  const courses = (students && students.courses) || [];
  for (const c of courses) {
    const cs = (students.byCourse || {})[c] || {};
    if (cs.plan) await sSet(kPlan(c), JSON.stringify(cs.plan));
    for (const n in (cs.bySyllabus || {})) {
      const b = cs.bySyllabus[n];
      await sSet(kRosterFor(c, n), JSON.stringify(b.roster || []));
      for (const s in (b.marks || {})) await sSet(kMarksFor(c, n, s), JSON.stringify(b.marks[s]));
      for (const s in (b.dates || {})) await sSet(kDatesFor(c, n, s), JSON.stringify(b.dates[s]));
    }
  }
  if (courses.length) await sSet(kCourses, JSON.stringify(courses));
  await reloadFromStore();
  return { courses: courses.slice() };
}
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js scripts/smoke.mjs
git commit -m "Apply student data from a file, separately from charts

pristine.html port deferred to Plan 8, where that file is deleted."
```
