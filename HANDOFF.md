# Handoff: OCU Progress Tracker — 8 Aug 2026

## Read this first

**The user is not a programmer** (see `CLAUDE.md`). Plain language, always — in every
reply, not just summaries.

**Their bug reports have never been wrong.** Reproduce before theorising. Every fault they
reported this session was confirmed by measurement, to the pixel.

**Verify by driving the app, not by reading the diff.** Two faults this session were
invisible to a green suite and obvious in a screenshot: the whole page scrolling 9,600px
instead of the board, and a third of the phone rules never applying because they sat
earlier in the stylesheet than the rules they override.

**A check that passes first time has probably measured nothing.** Nine of them did this
session — see *The traps* below. Every one had to be rewritten.

**The repository is public.** `github.com/seejiaokai/Tracker`. No student name, mark or
date may enter it. Two smoke checks enforce this.

## Where things stand

`npm run smoke` is **176 checks, green**. All five interface packages are merged and
verified live. **Run `npm run live` and look at the screenshot before anything else.**

### Fixed after the user tested it live (8 Aug)

| Reported | Cause |
|---|---|
| Phone menus dead | Panels clipped by the scrolling header; now `position:fixed`, placed by JS |
| Pace stuck at 2 | `parseFloat(v) \|\| 2` ate the empty box; raw text stored, coerced only for arithmetic |
| Each student independent | Pace, end dates, lulls per student (`v3:<course>:pace:<student>`) |
| **Syllabus stuck on marked course** | "Open on last-marked" ran on every `loadCourse`, overwriting the user's own choice. Now opt-in: `init()` / `switchCourse` |
| End dates off-screen on phone | Panel opens at the old 80%; pace boxes on one row, dates contained |

**Not reproduced: "ACG-06 puck snapping".** Nothing moved under test; best theory is the
syllabus was flipping back under them (since fixed). Ask them to retry.

### What shipped (the five interface packages)

Edit toolbar docked below the top bar; Fit/Reset moved into it; zooms labelled **Chart**
and **Panel** · top bar: 22 controls on six rows → one row + four menus (Course, Syllabus,
File, View), Save changes only while dirty · phone: chart opens fitted, stats on one
screen · lull periods per student in one pop-up calendar with **Copy to…** · opens on the
last student, their syllabus, scrolled to their last mark.

### Two real bugs fixed on the way, neither reported

- **Marking never set `fileDirty`** — the dot never lit. Now flagged in the four functions
  that persist work, behind a `loading` guard so boot migrations claim nothing.
- **Clicking an event on a syllabus with no students crashed** — grading is a no-op now.

## The course maps — checked against the user's own screenshots

They supplied 22 screenshots of the rendered Annex B. Both maps are transcribed in full
and pinned: `scripts/course-map-2026.json` (DEFAULT, B-11…B-22) and
`scripts/course-map-agaa-2026.json` (A/G – A/A, B-23…B-32), 205 events each.

**2026 was already correct** — not one link differs from the drawing. The only gaps are
naming (`AVI-12A/B`, `IEPE`, `NTR(S)-1 + IPC(W)`) and the DAAR/NAAR split the user asked
for. **A/G – A/A** matches too, apart from four links the syllabus keeps and the drawing
does not; all four were previously confirmed by the user and are pinned.

**Tx 2026 was badly broken and is repaired** — 19 links restored, including the whole
`AAM-06…AAM-10` chain, which had no prerequisites at all, and the `SA(S)` sim chain.

### If you re-read these maps, know this first

- **Two readings looked like real corrections and were not.** `INT(S)-2`+`AAS-04` (the
  arrowhead hops the J wire), and the `SA(S)`/`DAAR` "lost" links every independent reading
  concludes — `AGAA_SIM_CHAIN`/`AGAA_ADDED` overrule it. **User confirmed twice. Do not "fix".**
- The resolver, brief and page transcriptions are in the session scratchpad, not the repo.
  The method that worked: one agent per page, letters transcribed as nodes, then resolve
  the chains; then diff against the app and only zoom into the differences.
- `Tx` has no flow chart. Its tables govern, and the document's own policy line —
  *"Both Long and Short Conversion course will undergo the same academics requirement"* —
  is what the new academics check derives from. Hours corroborate: 231.5 academic on both
  tracks, 74.5 vs 71 device, 39 vs 31 sorties (and the tables list exactly 39 and 31).

### The document itself — the far better source (8 Aug)

The user supplied the sanitised `.docx`. **Read its text, never its chart images** (see
`CLAUDE.md`). Three parts settle almost everything: the two `FLYING MODULE` sections
(per-event Device / Crew / Prerequisites for each course, the SHORT one with its own
values for the renumbered sorties) and the two `TRAINING CURRICULUM TRACK SHEET`s
(the authoritative event list per course).

**The track sheet's serial-number column is the membership test.** Both sheets print all
209 rows; a row with **no S/N** is one that course does not do (Tx leaves 14 blank —
`V2_REMOVED` plus `SA(S)-3` and the 3 removed-from-syllabus). Parse rows by looking *back*
for the S/N; a numbered-runs-only parse silently drops every blank row.

Tx renumbers, with `(BCTM …)` naming the long-course equivalent — `SA-05 (BCTM SA-6)`,
`TI-01 (BCTM TI-1, TI-2)`, `BFM-05 (BCTM BFM-7)`. **Both syllabi were verified event-for-
event against these sheets on 8 Aug and match exactly**, the only extras being DAAR/NAAR,
`NVG-LAB` and `SA(S)-3`. But **the Tx flying-module table still carries long-course
prerequisites in places** — it names `SAT(S)-2` and `SA(S)-3`, neither of which Tx flies,
the same lag the document admits to for A/G – A/A. Track sheet for membership, table for
ordering.

## Still open, and what to ask

### The unreproduced save bug

A second save appeared to do nothing; never reproduced. `writeTo` verifies by reading the
file back; failures say `NOT SAVED`; the toolbar shows `saved N KB at HH:MM` — **if they
report it again, ask whether that time changed.** The `fileDirty` fix is a plausible
partial cause (the dot never lit after marking).

### Plan 9 is still blocked

> Plan 9 empties the three data files. **An unedited syllabus exists only in that code.**
> Nothing may be deleted until the user has saved a file, reopened it, and said *in their
> own words* their syllabi are inside. No check stands in for that. **Stop and ask.**

### Worth raising with them

- Everything fits one phone screen with room to spare **at two students**. The user is
  already running four on one course; a fifth may start it scrolling. Ask before spending
  more on it.
- Switching student scrolls to their last mark but does **not** switch syllabus. Switching
  under them would be a surprise and would prompt about unsaved flow edits.
- ~~**Tx `SAT-1`**~~ — done 8 Aug, both Tx years, confirmed by the document (Tx module
  says `SA-5`; the Tx sheet marks its `SA-05` *(BCTM SA-6)*; `SAT(S)-2` unnumbered so
  `SAT(S)-1` applies). Pinned by `TX_SAT1`.
- **`SA(S)-3` on Tx** — document contradicts itself (sheet: unnumbered; Tx table: required
  by `SA-2`/`SA-3`). **User chose keep, twice, 8 Aug.** It now hangs off the sim chain only.
- **The user's own 2026 became the baked default, 8 Aug** — their saved file's hand edits
  plus 39 repositioned balls and redrawn wires (see `USER_EDITS_2026` in `smoke.mjs`; they
  supersede the map pins). Tx 2026 mirrors those edits (`TX_MIRROR`), except `SA-5`, which
  keeps the doc-stated `[SA-4, SA(S)-6, SA(S)-7]`. One edit they recalled the same day:
  `ST-10` feeds `LASDT(S)-1` again, as the map draws it.
- **`Tx 2026` IS the 2026 replica now.** Built 8 Aug as `Tx 2026 v2` (fresh name because
  **stored charts shadow baked ones of the same name** — the ✎ in the picker); on 9 Aug
  the user deleted the old Tx in the app, renamed v2 to `Tx 2026`, and the baked data
  follows: old chart gone, v2 name retired everywhere (pinned). `V2_REMOVED` lists the ten
  cut events; `USER_TX_EDITS` their own Tx wiring. The DAAR/NAAR refresher tail is
  deliberately detached from `ST-18` on both 2026 charts — `NAAR-2` is a second loose end.
- **Detail bubbles are per-syllabus now.** `EVENT_INFO_BY_SYL['Tx 2026']` carries the
  renumbered profiles (Tx `BFM-5` = BCTM `BFM-7`, `SA-5` = `SA-6` crew-solo, `TI-2` =
  8-ship `TI-3`, `LASDT-2` = `LASDT-3`, `TR-5(P)` = IRT `UP / IRE`), merged in `infoFor`
  under the user's own edits. Every bare-id prerequisite TEXT was blanked (98) so bubbles
  fall back to the live chart links of the active syllabus — `SAT-1` had shown DAAR's text.
  Prose notes kept; list in `PROSE_OK`.
- **Tx `SA-1`, `SA(S)-1`, `NTR(S)-1`, `SA-5`** still differ from 2026 in ways that are
  defensible either way — each involves an event the short course cuts. Deliberately left
  alone. (`SA-1`→`TI-2` and the four `DAAR`/`NAAR` refreshers are done, at their request.)

## The traps

Nine checks once passed against code that did not have the fix in it — counting
`display:none` nodes, reading a scroll position twice without moving, grading an
empty roster (a no-op), measuring a chart that happened to have slack, or checking
an in-memory map that only breaks after a **reload**. Two rules would have caught
all nine: **assert the value is present, not merely unchanged**, and **make the
check fail on purpose before believing it.** Making `kLulls` return one shared
key, and watching the per-student check keep passing, is what exposed
the reload problem.

## Things that will bite you

- **Browser file pickers need a live click.** No `await` before `showSaveFilePicker` /
  `showOpenFilePicker` / `requestPermission`. The header menus keep their panels in the DOM
  and hide them with CSS partly for this: a button recreated around its own click spends
  the gesture.
- **`setSaveStatus` rewrites every `'ok'` message to a bare "saved".** Success detail goes
  beside the file name instead.
- **Only `applyCharts` may touch charts and only `applyStudents` may touch people.** A
  smoke check watches every `localStorage` write to hold that line.
- **`applyBundle` no longer deletes stored syllabi.** Restoring that would wipe the user's
  charts.
- **Backticks in a `git commit -m` heredoc get eaten by the shell.** Write the message to a
  file and use `-F`.
- See `CLAUDE.md` → Gotchas for the `#root` flex column, `minmax(0,1fr)`, and the
  `scrollHeight` floor. All three cost real time this session.

## Interface fixes, 8 Aug evening

Zoom buttons now anchor at the middle of the current view (`setFlowZoom` corrects the
scroll; the reflow-force matters, or the new range is stale and clamps). The edit-mode
hint bar floats in a zero-height wrapper (`.arrhintwrap`) over the legend — in flow, its
height changed on every tool switch AND every 1.8s flash, shoving the board mid-line-draw
so ends landed wrong. `pointer-events:none` keeps it click-transparent. Both pinned by
browser checks that were proven red first (17px board shift; 572px viewport jump).

## Whenever baked chart data changes, hand the user a sync file

**The user asked for this, 8 Aug.** Their stored charts shadow baked ones (the ✎), so a
baked change alone is invisible on their devices. Build a charts-only `ocu-tracker` JSON
(changed syllabi + layouts, `eventInfo: {}`), verify it with `readFile()`, send it; they
open it in the app and save. Safe now: `applyCharts` keeps only info fields that differ
from the baked base (`scrubEventInfo`, also run on every load to heal polluted stores) —
before that fix, one file-open froze every bubble and clobbered the per-syllabus profiles.

## Testing

`npm run smoke` — 187 checks, must be green before every commit touching `src/`.
`npm run live` — the deployed site, after the Pages run finishes. Never call a branch "live".
