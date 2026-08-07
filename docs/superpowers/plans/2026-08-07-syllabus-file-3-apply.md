# Syllabus File — Plan 3 of 9: applying charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a file's charts back into the app, able to *add* or *replace* a single syllabus without touching anyone's marks.

**Architecture:** One export in `src/app/core.js`, mirroring Plan 2's readers. It is deliberately per-syllabus so Plan 7's Import button is a thin wrapper, not a second implementation.

**Tech Stack:** Vanilla ES modules, Vite, Playwright. `scripts/smoke.mjs` is the only test runner.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** 1 format → 2 read → **3 apply charts** → 4 apply students → 5 file access → 6 Open/Save → 7 Import & Save-a-copy → 8 remove old buttons → 9 changeover.

## Global Constraints

- Every markdown doc in this repo stays **under 200 lines** (`CLAUDE.md`).
- `core.js` changes normally port to `src/data/pristine.html`. **Defer that** — Plan 8 deletes that file. Note the deferral in each commit.
- Target elements by **ID** in browser tests, never by text.
- `npm run build` must pass. There is no linter.
- Prove every new check fails before its fix exists.

## The rule this plan exists to protect

From the spec, and measured rather than assumed: *"importing one syllabus leaves all other syllabi, students and marks untouched."* Marks live under `v3:<course>:<syllabus>:m:<student>`, entirely apart from the drawing. **`applyCharts` must never write a roster, mark or date key.** Task 2's check is what holds that true.

---

### Task 1: Apply charts, adding or replacing one syllabus at a time

**Files:** Modify `src/app/core.js` · Test `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `CUSTOMS`, `sSet`, `kSyls`, `kLayoutFor`, `SYL_TOMB`, `SYL_ORDER`, `saveSylPrefs`, `saveSylOrder`, `loadCourse`, `eventInfo`, `saveEventInfo` — all already in `core.js`.
- Produces: `export async function applyCharts(charts, opts)` where `opts` is `{names: string[] | null, mode: 'replace' | 'add', rename: {from: string, to: string} | null}`. Returns `{applied: string[]}`.
  - `mode: 'replace'` overwrites a syllabus of the same name, keeping its marks.
  - `mode: 'add'` writes under `rename.to`, leaving any existing syllabus alone.

- [ ] **Step 1: Write the failing test**

Add to the browser section of `scripts/smoke.mjs`. Extend `window.__coreForTests` with `applyCharts`.

```js
/* ---- applying charts never disturbs people ---- */
const applied = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  const marksBefore = Object.fromEntries(
    Object.keys(localStorage).filter(k => k.includes(':m:')).map(k => [k, localStorage.getItem(k)]));
  const charts = await t.collectCharts(['2026']);
  charts.syllabi['2026'] = charts.syllabi['2026'].slice(0, 5);   /* a much smaller chart */
  await t.applyCharts(charts, { names: ['2026'], mode: 'replace', rename: null });
  const marksAfter = Object.fromEntries(
    Object.keys(localStorage).filter(k => k.includes(':m:')).map(k => [k, localStorage.getItem(k)]));
  return { same: JSON.stringify(marksBefore) === JSON.stringify(marksAfter),
           count: JSON.parse(localStorage['ocu:v3:master:syls'])['2026'].length };
});
ok('replacing a syllabus writes the new chart', applied.count === 5, `${applied.count} events`);
ok('replacing a syllabus leaves every mark untouched', applied.same);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'replacing a syllabus'`
Expected: both `FAIL` — `applyCharts is not a function`.

- [ ] **Step 3: Write it**

```js
/* Charts only. Writes syllabus definitions, layouts and event info — and
   nothing filed under a student. See this plan's "rule this plan exists to
   protect": no roster, mark or date key may be written here. */
export async function applyCharts(charts, opts) {
  const o = opts || {};
  const list = (o.names && o.names.length) ? o.names : (charts.order || Object.keys(charts.syllabi || {}));
  const applied = [];
  for (const src of list) {
    const events = (charts.syllabi || {})[src];
    if (!events) continue;
    const target = (o.mode === 'add' && o.rename && o.rename.from === src) ? o.rename.to : src;
    CUSTOMS[target] = JSON.parse(JSON.stringify(events));
    const lay = (charts.layouts || {})[src];
    if (lay) await sSet(kLayoutFor(course, target), JSON.stringify(lay));
    if (SYL_TOMB[target]) { delete SYL_TOMB[target]; }
    if (!SYL_ORDER.includes(target)) SYL_ORDER.push(target);
    applied.push(target);
  }
  await sSet(kSyls(course), JSON.stringify(CUSTOMS));
  if (charts.eventInfo) {
    for (const k in charts.eventInfo) eventInfo[k] = Object.assign({}, eventInfo[k] || {}, charts.eventInfo[k]);
    await saveEventInfo();
  }
  await saveSylPrefs(); await saveSylOrder();
  await loadCourse(course);
  refreshSyl(); renderBoard(); renderSide();
  return { applied };
}
```

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` → both new checks pass, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core.js scripts/smoke.mjs
git commit -m "Apply charts from a file without touching anyone's marks

pristine.html port deferred to Plan 8, where that file is deleted."
```

---

### Task 2: Prove the no-people rule bites

**Files:** Test only — `scripts/smoke.mjs`

**Interfaces:** consumes `applyCharts` from Task 1. Produces nothing.

A check that has never failed has proven nothing. Task 1's check would pass even if `applyCharts` wrote roster keys, as long as it happened to write back identical values. This task makes it bite.

- [ ] **Step 1: Add the sharper check**

```js
const noPeople = await pg.evaluate(async () => {
  const t = window.__coreForTests;
  const written = [];
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { written.push(k); return realSet.call(this, k, v); };
  try { await t.applyCharts(await t.collectCharts(['2026']), { names: ['2026'], mode: 'replace', rename: null }); }
  finally { Storage.prototype.setItem = realSet; }
  return written.filter(k => /:m:|:d:|:roster/.test(k));
});
ok('applying charts writes no roster, mark or date key', noPeople.length === 0,
  noPeople.slice(0, 3).join(', '));
```

- [ ] **Step 2: Prove it fails when the rule is broken**

Temporarily add this line inside `applyCharts`, just before its `return`:

```js
  await sSet(kRosterFor(course, applied[0]), JSON.stringify(['SHOULD NOT BE HERE']));
```

Run: `npm run smoke 2>&1 | grep -i 'writes no roster'`
Expected: `FAIL — ocu:v3:...:roster`. **Now remove that line again.**

- [ ] **Step 3: Confirm green**

Run: `npm run smoke 2>&1 | tail -8` → `0 failed`.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs
git commit -m "Pin the rule that applying charts never writes a person's key"
```
