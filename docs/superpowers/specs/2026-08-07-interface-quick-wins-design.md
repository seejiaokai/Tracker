# Interface quick wins — design

Date: 2026-08-07 · Status: approved

First of five packages in the interface rework. Layout only: no change to marks,
students, syllabi, the saved file format, or what any edit tool does.

## The faults, as measured on the live site

Measured at 1440×900 and 390×844 on `https://seejiaokai.github.io/Tracker/`, not
read off the source.

| # | Fault | Measurement |
|---|---|---|
| 1 | `End date B` overflows the side panel | `.opt2` in the pace card: `scrollWidth` 419 vs `clientWidth` 301. `#targetIn2` right edge lands at x=1524 in a 1440-wide window — 84px off-screen. The panel is 350px wide; the phone panel is wider still and also overflows. |
| 2 | Edit toolbar covers the first event | `#arrTools` is 720×139 at (360,128). `ST-01` centres at (516,241). `document.elementFromPoint` at that point returns `#arrTools`. ST-01 cannot be clicked or dragged. |
| 3 | Edit mode reshuffles the top bar | `#fitViewBtn` and `#resetLayout` are `display:none` until `arrangeMode`, so turning edit on inserts two buttons mid-row and pushes `Marking as` to the next line. Buttons move out from under the pointer. |
| 4 | Two identical zoom controls | `#flowZoomCtl` (bottom-left, chart) and `#sideZoomCtl` (bottom-right, panel) are visually indistinguishable. |

Edit mode itself was verified working: dragging `ST-02` by (80,50) moved it (79,49),
Undo enabled, Select all picked up all 210 balls. Fault 2 is the only edit-mode defect.

## Decisions

| Question | Chosen | Rejected |
|---|---|---|
| Pace card layout | Set pace full width on row 1; End date A and B side by side on row 2 | All three stacked (too tall); default panel zoom to 70% (hides the fault, shrinks all text) |
| Edit toolbar | Dock below the header as a strip in normal flow, pushing the board down | Keep floating with top padding on the board; move to bottom edge |
| Fit / Reset layout | Move into the docked edit strip | Leave in the header |
| Zoom controls | Label them `Chart` and `Panel` | Remove the panel one; merge into one pointer-aware control |

## Changes

### 1. Pace card

`SidePanel.jsx`, the `Pace & expected end` card. Replace the single
`grid-template-columns:1fr 1fr 1fr` with two rows:

- Row 1: `Set pace` — full width, the `/wk` input and the projected end date on one line.
- Row 2: `End date A` and `End date B` side by side, `1fr 1fr`.

Both date inputs need ≥134px to render `dd/mm/yyyy` without clipping. At a 350px
panel that gives each ~145px. New class in `styles.css` rather than inline
`gridTemplateColumns`, so the phone package can restyle it in one place later.

Height cost: ~25px. Accepted — the phone squeeze is package 3's problem and has
~900px to find elsewhere.

### 2. Edit toolbar docked

`ArrangeTools.jsx` already renders between `<Header/>` and `.layout` in document
order — only `styles.css` lifts it out. So: drop `position:fixed`, the
`left/top/transform` centring and `max-width:94vw` from `.arrtools`; keep
`display:none` → `flex` on `.on`.

`.layout{height:calc(100vh - 86px)}` then breaks: the strip's height is unaccounted
for and the board overflows the viewport. The 86px is already wrong — the header
measures 135px at 1440 — so replace the fixed subtraction with a column flex
column on `body` (`min-height:100vh`) and `.layout{flex:1;min-height:0}`. The
layout then absorbs whatever the strip and header actually take, at any width.

Consequence: `#arrTools` no longer overlaps anything, so `elementFromPoint` at
ST-01 returns the ball.

### 3. Fit / Reset layout move

`Header.jsx`: delete `#fitViewBtn` and `#resetLayout`. `ArrangeTools.jsx`: add them
to the strip, same ids, same handlers (`core.fitViewClick`, `core.resetLayoutClick`).
Ids must be preserved — the smoke suite targets by id.

The header then holds the same controls in the same order regardless of edit state.

### 4. Zoom labels

`ZoomControls.jsx` / `styles.css`. Add a muted label span to each control:
`Chart` on `#flowZoomCtl`, `Panel` on `#sideZoomCtl`. Existing ids
(`#fzPct`, `#fzReset`, `#szPct`, `#szReset`) unchanged.

At ≤1050px only one control is visible at a time (`body.tab-flow` hides
`#sideZoomCtl`, `body.tab-info` hides `#flowZoomCtl`), so the labels cost nothing
on the phone but stay consistent.

## Testing

Added to `scripts/smoke.mjs`. Each must be shown red against current `main` before
the fix lands — a check that never failed has demonstrated nothing.

| Check | Asserts | Fails today because |
|---|---|---|
| Pace card fits | In the pace card, `scrollWidth <= clientWidth + 1`, and every `input[type=date]` right edge is within the panel's right edge | 419 > 301; `#targetIn2` is 84px past the window |
| ST-01 reachable in edit mode | With arrange on, `document.elementFromPoint(ST-01 centre)` resolves to an element inside `#flowSvg`, not `#arrTools` | returns `#arrTools` |
| Header stable across edit mode | The set of ids in `header .controls` is identical with arrange off and on, and `#activeSel`'s `offsetTop` is unchanged | Fit and Reset layout appear, pushing `Marking as` down a row |
| Edit strip does not overlap the board | `#arrTools` bounding box does not intersect `#board`'s | it sits 40px inside the board |
| Zoom controls distinguishable | `#flowZoomCtl` contains the text `Chart`, `#sideZoomCtl` contains `Panel` | neither has a label |

Existing coverage must stay green, in particular the arrange-mode drag checks and
the two checks that keep student data out of the repository.

## Out of scope

Packages 2–5, agreed and queued in this order:

2. Top bar — group the 22 controls into logical menus.
3. Phone — everything above the calendar on one screen; bound the chart laterally;
   extra scroll room below the last event.
4. Lull periods — click-to-set start then end, editable, per student, copyable
   between students. Existing course-wide lulls copy to every student on upgrade.
5. Open on the student's last-edited syllabus, scrolled to the last-updated event.
