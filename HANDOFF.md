# Handoff: OCU Progress Tracker — 7 Aug 2026 (evening)

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

`main` and `claude/read-handoff-tyugyx` are level. `npm run smoke` is **130 checks, green**.
All five interface packages are merged and verified live except the last, which was still
publishing at handoff — **run `npm run live` and look at the screenshot before anything else.**

### What shipped

| | |
|---|---|
| **1. Quick wins** | End dates no longer run off the panel · edit toolbar docked below the top bar instead of covering the first event · Fit and Reset layout moved into it, so the header stops reshuffling · zoom controls labelled **Chart** and **Panel** |
| **2. Top bar** | 22 controls on six rows → one row and four menus (Course, Syllabus, File, View) · Save changes appears only when there is unsaved work |
| **3. Phone** | Chart opens fitted to the screen, so it only scrolls down · 170px of room past the last event · every statistic on one screen (703px of content in 763px) |
| **4. Lull periods** | Per student, in one pop-up calendar: first click sets the start, second the end · tap a period to change it · **Copy to…** · the calendar leaves the side panel |
| **5. Opening view** | Opens on the last student, their syllabus, scrolled to the event they last marked |

### Two real bugs fixed on the way, neither reported

- **Marking a student never set `fileDirty`.** `saveChangesClick` writes the file
  regardless, so nothing was ever lost while the button was permanently on screen — but
  the dot never lit, and the button could not be hidden safely. Now flagged in the four
  functions that persist the user's work, behind a `loading` guard so boot migrations do
  not claim work the user has not done.
- **Clicking an event on a syllabus with no students crashed the page** —
  `marks[null][id]`. Grading is a no-op with no students now.

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

- Everything fits one phone screen with **60px to spare, with two students**. A third or
  fourth student will start it scrolling again. Ask before spending more on it.
- The student key-ball diagram is down to 58px on a phone. It is a legend, not data, but
  it is small — ask whether they would rather it moved below the calendar.
- Switching student scrolls to their last mark but does **not** switch syllabus. Switching
  under them would be a surprise and would prompt about unsaved flow edits.

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

`npm run smoke` — 130 checks, must be green before every commit touching `src/`.
`npm run live` — the deployed site, after the Pages run finishes. Never call a branch "live".
