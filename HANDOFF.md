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

`main` and `claude/read-handoff-tyugyx` are level. `npm run smoke` is **163 checks, green**.
All five interface packages are merged and verified live. The last commit was still
publishing at handoff — **run `npm run live` and look at the screenshot before anything else.**

### Fixed after the user tested it live (8 Aug)

| Reported | Cause |
|---|---|
| Phone menus dead | Panels were clipped by the sideways-scrolling header; now `position:fixed`, placed by JS |
| Pace stuck at 2 | `parseFloat(v) \|\| 2` turned the empty box into 2; the raw text is stored now and coerced only for arithmetic |
| Each student must be independent | Pace, both end dates and lull periods are per student (`v3:<course>:pace:<student>`, `:lulls:<student>`) |
| **Syllabus could not be changed on a course that had marks** | "Open on the last-marked syllabus" ran on *every* `loadCourse`, including the one the user's own choice triggers, so it overwrote that choice instantly. Now opt-in: `init()` and `switchCourse` only |
| End dates ran off the right on the phone | Panel now opens at what used to be 80%, and the three pace boxes sit on one row with centred, contained date fields |

**Not reproduced: the "ACG-06 puck snapping" report.** Edit → Show All Details moved zero
balls, wrote no layout keys and raised no save button. Best theory: the syllabus was
flipping back under them, so a ball belonging to the other chart looked like it had jumped.
Ask them to try again now the flipping has stopped.

### What shipped

| | |
|---|---|
| **1. Quick wins** | End dates no longer run off the panel · edit toolbar docked below the top bar instead of covering the first event · Fit and Reset layout moved into it, so the header stops reshuffling · zoom controls labelled **Chart** and **Panel** |
| **2. Top bar** | 22 controls on six rows → one row and four menus (Course, Syllabus, File, View) · Save changes appears only when there is unsaved work |
| **3. Phone** | Chart opens fitted to the screen, so it only scrolls down · 170px of room past the last event · every statistic on one screen (703px of content in 763px) |
| **4. Lull periods** | Per student, in one pop-up calendar: first click sets the start, second the end · tap a period to change it · **Copy to…** · the calendar leaves the side panel |
| **5. Opening view** | Opens on the last student, their syllabus, scrolled to the event they last marked |

### Two real bugs fixed on the way, neither reported

- **Marking a student never set `fileDirty`.** `saveChangesClick` writes regardless, so
  nothing was lost while the button was permanently on screen — but the dot never lit, and
  the button could not be hidden safely. Now flagged in the four functions that persist the
  user's work, behind a `loading` guard so boot migrations do not claim work they did not do.
- **Clicking an event on a syllabus with no students crashed the page** —
  `marks[null][id]`. Grading is a no-op with no students now.

## The course maps — checked against the user's own screenshots

They supplied 22 screenshots of the rendered Annex B (`IMG_3257`–`3278`). Both maps are
now transcribed in full and pinned:

| File | What it holds |
|---|---|
| `scripts/course-map-2026.json` | The DEFAULT map, B-11…B-22, 205 events |
| `scripts/course-map-agaa-2026.json` | The A/G – A/A map, B-23…B-32, 205 events |

**2026 was already correct** — not one link differs from the drawing. The only gaps are
naming (`AVI-12A/B`, `IEPE`, `NTR(S)-1 + IPC(W)`) and the DAAR/NAAR split the user asked
for. **A/G – A/A** matches too, apart from four links the syllabus keeps and the drawing
does not; all four were previously confirmed by the user and are pinned.

**Tx 2026 was badly broken and is repaired** — 19 links restored, including the whole
`AAM-06…AAM-10` chain, which had no prerequisites at all, and the `SA(S)` sim chain.

### If you re-read these maps, know this first

- **Two readings looked like real corrections and were not.** `INT(S)-2` appeared to gain
  `AAS-04` on an arrowhead that, at 22×, stops in white space ~16px short of the J wire —
  it hops J and feeds only K. And `SA(S)-3`/`SA(S)-5`/`DAAR` appeared to lose links, which
  is what every independent reading concludes and exactly what `AGAA_SIM_CHAIN` and
  `AGAA_ADDED` exist to overrule. **The user confirmed that chain twice.** Do not "fix" it.
- The resolver, brief and page transcriptions are in the session scratchpad, not the repo.
  The method that worked: one agent per page, letters transcribed as nodes, then resolve
  the chains; then diff against the app and only zoom into the differences.
- `Tx` has no flow chart. Its tables govern, and the document's own policy line —
  *"Both Long and Short Conversion course will undergo the same academics requirement"* —
  is what the new academics check derives from. Hours corroborate: 231.5 academic on both
  tracks, 74.5 vs 71 device, 39 vs 31 sorties (and the tables list exactly 39 and 31).

### The document itself — the far better source (8 Aug)

The user supplied the sanitised `.docx`. **Read its text, never its chart images** (see
`CLAUDE.md`). Three parts settle almost everything, and beat any chart transcription:

| Section | What it gives |
|---|---|
| `FLYING MODULE (LONG CONVERSION – "B" Course)` | per-event `Prerequisites` for 2026 |
| `FLYING MODULE (SHORT CONVERSION – "Tx" Course)` | per-event `Prerequisites` for Tx |
| Two `TRAINING CURRICULUM TRACK SHEET`s | the authoritative **event list** per course |

**The track sheet's serial-number column is the membership test.** Both sheets print all
209 rows; a row with **no S/N** is one that course does not do. Tx leaves 14 blank —
3 removed-from-syllabus plus `TR-6(P)`, `BFM-6`, `BFM-7`, a `LASDT`, `DCA(S)-1`, `DCA-1`,
`TI-3`, `SA(S)-3`, `SA-6`, `SAT(S)-2`, `SAT-2`. Parse rows by looking *back* for the S/N;
a numbered-runs-only parse silently drops every blank row and misreads the course.

Tx renumbers, with `(BCTM …)` naming the long-course equivalent — `SA-05 (BCTM SA-6)`,
`TI-01 (BCTM TI-1, TI-2)`, `BFM-05 (BCTM BFM-7)`. **Both syllabi were verified event-for-
event against these sheets on 8 Aug and match exactly**, the only extras being DAAR/NAAR,
`NVG-LAB` and `SA(S)-3`. But **the Tx flying-module table still carries long-course
prerequisites in places** — it names `SAT(S)-2` and `SA(S)-3`, neither of which Tx flies,
the same lag the document admits to for A/G – A/A. Track sheet for membership, table for
ordering.

## Still open, and what to ask

### The unreproduced save bug

The user reported a second save appearing to do nothing. Never reproduced. `writeTo` reads
the file back and compares sizes, failures report `NOT SAVED` and keep the work dirty, and
the toolbar shows `saved N KB at HH:MM`. **If they report it again, ask whether that time
changed.** Tell them to hard-refresh before testing anything newly shipped.

The `fileDirty` fix above is a plausible partial explanation: the dot never lit after
marking, so the app looked like it had nothing to save when it did.

### Plan 9 is still blocked

> Plan 9 empties `src/data/syllabi.js`, `layouts.js` and `eventInfo.js`. **Any syllabus the
> user has never edited exists only in that code.** It may not be deleted until the user
> has saved a file, reopened it, and said *in their own words* that their syllabi are
> inside it. No check can stand in for that. If you reach Plan 9 without that confirmation
> in the conversation, **stop and ask.**

### Worth raising with them

- Everything fits one phone screen with room to spare **at two students**. The user is
  already running four on one course; a fifth may start it scrolling. Ask before spending
  more on it.
- Switching student scrolls to their last mark but does **not** switch syllabus. Switching
  under them would be a surprise and would prompt about unsaved flow edits.
- ~~**Tx `SAT-1`**~~ — done 8 Aug, on **both** Tx years, and since **confirmed by the
  document**: the Tx flying module gives `SAT-1` [`SA-5`, `SAT(S)-2`], and the Tx track
  sheet annotates its own `SA-05` as *(BCTM SA-6)* — the exact flight 2026 makes `SAT-1`
  wait for. `SAT(S)-2` is unnumbered on that sheet, so `SAT(S)-1` is the sim that applies,
  which is also the one Tx's `SATN-1` names. Pinned by `TX_SAT1`.
- **`SA(S)-3` on Tx — a live contradiction inside the document.** The track sheet leaves it
  unnumbered (not flown); the Tx flying module still requires it for `SA-2` and `SA-3`.
  **The user chose to keep it, 8 Aug**, having confirmed that sim chain twice before. Pinned,
  so the blank row cannot be "corrected" into a deletion. If they come back from the
  squadron with an answer, that pin is the one to change.
- **Tx `SA-1`, `SA(S)-1`, `NTR(S)-1`, `SA-5`** still differ from 2026 in ways that are
  defensible either way — each involves an event the short course cuts. Deliberately left
  alone. (`SA-1`→`TI-2` and the four `DAAR`/`NAAR` refreshers are done, at their request.)

## The traps

Nine checks passed against code that did not have the fix in it. All the same shape:

| What it measured | Why it could not fail |
|---|---|
| Header buttons added by edit mode | Counted nodes that are merely `display:none` |
| "Is ST-01 reachable" | Which event sits under the toolbar depends on the pan an earlier check left |
| "Marking as" wrapping | Depends on how long the course name happens to be |
| Room below the last event | That chart happened to end with 451px of empty layout |
| Lull periods per student | The in-memory map is keyed by student either way — needs a **reload** |
| Opening on the last mark ×3 | Ran against a four-event syllabus, whose roster was empty, so grading was a no-op |
| Switching student jumps | Read the same scroll position twice without moving the board |

Two rules that would have caught all nine: **assert the value is present, not merely
unchanged**, and **make the check fail on purpose before believing it.** Making `kLulls`
return one shared key, and watching the per-student check keep passing, is what exposed
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

## Testing

`npm run smoke` — 163 checks, must be green before every commit touching `src/`.
`npm run live` — the deployed site, after the Pages run finishes. Never call a branch "live".
