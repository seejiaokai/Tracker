# Interface rework, packages 2–5 — design

Date: 2026-08-07 · Status: approved

Package 1 (End date B overflow, docked edit toolbar, zoom labels) has its own
spec: `2026-08-07-interface-quick-wins-design.md`. This covers the rest.

Delivery: one branch, each package merged to `main` once green so the live site
can be checked for real. No end-of-run PR — everything will already be on `main`.

## Package 2 — top bar

22 controls wrapping onto six rows at 1440px. Replace with four pop-up menus.

| Always visible | Behind a menu |
|---|---|
| Course, Syllabus, Marking as (selects) | **Course ▾** + Course · Rename · Del Course |
| 📋 Show All Details | **Syllabus ▾** ⧉ Duplicate · + Add · ✎ Rename · ⇅ Reorder · 🗑 Delete |
| ✎ Edit | **File ▾** 📁 Open · ⊕ Import syllabus · ⤓ Save a copy · Charts / Students checkboxes · file name · last-saved |
| ✓ Save changes — **only when dirty** | **View ▾** ☰ Show All |

`✓ Save changes` renders only when `sylDirty || fileDirty`. Marks, dates and
students already auto-save to storage; only flow edits and the open file need it,
so a hidden button is a data-loss risk and an always-present one is clutter.
Showing it exactly when it matters resolves both.

Menus are `<div>` panels toggled by a button, closed by outside click or Escape,
`z-index` below `#showAllPanel` (81). Ids preserved throughout — the smoke suite
targets `#addStu`, `#dupSyl`, `#openFileBtn`, `#saveCopyBtn`, `#showAllBtn`,
`#detailsBtn`, `#saveChanges`, `#editSyl`, `#undoBtn` by id.

Checks: header occupies one row at 1440px; every old id still reachable (opening
its menu first); `#saveChanges` absent when clean and present after a flow edit.

## Package 3 — phone

Two separate problems.

### Chart fits the width

At 390px the board is `scrollWidth` 912 vs `clientWidth` 390 — 522px of lateral
wander that desktop does not have. On first render at ≤1050px, set `flowZoom` so
the chart width fits the board (≈0.44 for an 880px chart), giving
`scrollWidth === clientWidth` and pure vertical scrolling. The zoom control still
works; the fit is only the starting point, not a lock.

Add ~140px of padding below the last event so the bottom-left zoom control never
covers it.

Check: at 390×844, `board.scrollWidth <= board.clientWidth + 1` on load, and the
lowest ball's bottom edge sits at least 100px above `board.scrollHeight`.

### Stats fit one screen

Everything above the calendar is 1645px; the visible area is 758px. Savings agreed:

| Source | Now | Saving |
|---|---|---|
| Calendar leaves the panel entirely (package 4) | 450px | 450px |
| Students key-ball ring diagram — small version on phone | 274px | ~180px |
| Currency & flex date fields two-across | 376px | ~150px |
| Header collapses to one compact row on phone | 281px | ~180px |
| Next event / Plannable now tightened | 268px | ~80px |

That is ~1040px against a ~900px gap. Target: at 390×844 with the Info tab open,
`side.scrollHeight <= side.clientHeight`. If it lands slightly over, the header
saving is the lever to push further.

## Package 4 — lull periods

### Per student

`plan.lulls` (per course) becomes per course **and** student, in a new store key
`v3:<course>:lulls:<student>` and a module-level `lulls = {student: [...]}`.

Not `dates[s].lulls`: `kDates` is `v3:<course>:<syllabus>:d:<student>`, so
anything kept there is per-syllabus and would disappear when the user switches
syllabus. A student's lull periods are stretches of real time, not properties of a
syllabus, so they belong at course level.

Migration on load: a student with no stored lulls inherits a copy of `plan.lulls`.
`plan.lulls` is left in place, unread, so an older saved file migrates identically.

`lullDaysIn(a, b)` reads `plan.lulls` today and is called three times from
`SidePanel.jsx` for the active student. It becomes `lullDaysIn(s, a, b)`.

File format: `students.byCourse[<course>].lulls = {student: [{start,end}]}`, a new
key alongside the existing `plan` and `bySyllabus`. Purely additive —
`FILE_VERSION` stays 1, older files simply lack the key and migrate on load, and
`readFile` passes the `students` object through whole so nothing else changes.
Cover it with a round-trip check in the plain-Node `fileFormat` tests.

### Pop-up calendar

The side-panel calendar card is deleted. In its place, the Lull periods card gets
a **Set lull period** button, and each existing lull pill is tappable.

One shared pop-up calendar serves both:

- Opened by **Set lull period** → first day click sets the start, second sets the
  end and saves. Month arrows (`‹` `›`) change the month only and must never
  count as a day click.
- Opened by tapping a pill → same two clicks, replacing that pill's dates.
- Escape or clicking outside closes it without saving a half-finished period.

`z-index` 70 — above `.overlay` (55) and `.modal`/`.pop` (60) so it clears the side
panel and any pop, and below `#dlgModal` (71) so a confirm prompt raised from it
still lands on top. It never opens over `#showAllPanel` (81), so it does not need
to clear that rung of the ladder in `CLAUDE.md`.

### Copy to other students

A **Copy to…** button on the Lull periods card opens a tick-list of the other
students on the course plus a "select all" row. Copying replaces the target
student's lulls with a copy of the source student's set.

Checks: two students hold different lull sets independently; copy moves them;
month arrows do not set an end date; a lull created on one student does not change
another's projected end date.

## Package 5 — opening view

Track per student: `dates[s].lastSyl` and `dates[s].lastEvent`, written whenever a
mark is set. Also track the last active student per course.

On load: restore the last active student → switch to `dates[s].lastSyl` if it still
exists → scroll the board so `dates[s].lastEvent` is in view, vertically centred
where possible. Switching student does the same.

Falls back silently to today's behaviour when nothing is recorded, when the
recorded syllabus has been deleted, or when the recorded event is not in the
current syllabus.

Checks: mark an event low in the chart, reload, and the board is scrolled to it
rather than to the top; a deleted recorded syllabus does not break the load.

## Testing discipline

Every check above must be shown failing against the code before its fix, then
passing after. `npm run smoke` green before each commit; `npm run live` after each
package reaches `main` and Pages finishes publishing.
