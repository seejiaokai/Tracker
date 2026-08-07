# Handoff: OCU Progress Tracker — 7 Aug 2026

## Read this first

**The user is not a programmer** (see `CLAUDE.md`). Plain language, always — in every
reply, not just summaries.

**Their bug reports have never been wrong.** Reproduce before theorising. Twice this
session the reported symptom was real and my first explanation was not.

**Verify by driving the app, not by reading the diff.** Three real faults this session were
invisible in source review and obvious in a screenshot: two Save buttons side by side, a
round-trip check that passed while dropping every bit of layout metadata, and the edit
toolbar sitting on top of the chart.

**Ask for screenshots as file attachments.** Images pasted into chat can be read once and
are then gone for good — they never reach disk, so they cannot be re-cropped, magnified or
handed to a subagent.

**The repository is public.** `github.com/seejiaokai/Tracker`. No student name, mark or date
may enter it. Two smoke checks enforce this; both were confirmed to fail against the old
data before the fix landed.

## Where things stand

`main` and `claude/superpowers-install-setup-j6nwrl` are level and clean. Everything below
is merged and verified live on the Pages site.

### The syllabus file — Plans 1–8 done, Plan 9 blocked

Design: `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`
Plans: `docs/superpowers/plans/2026-08-07-syllabus-file-{1..9}-*.md`

The user's work now lives in a file they keep, not in browser memory. Built and live:
the file format, reading and writing state, browser file access, **📁 Open**,
**✓ Save changes**, **⊕ Import syllabus**, **⤓ Save a copy**, and the removal of five
buttons (Cloud, Load latest, Save backup, Load backup, Save as new HTML) along with
`src/data/pristine.html`. Bundle fell 1,005 kB → 436 kB.

> ### ⛔ Plan 9 must not start yet
>
> Plan 9 empties `src/data/syllabi.js`, `layouts.js` and `eventInfo.js`. **Any syllabus the
> user has never edited exists only in that code.** It may not be deleted until the user has
> saved a file, reopened it, and said *in their own words* that their syllabi are inside it.
>
> No check can stand in for that — the file is on their machine, not in CI. If you reach
> Plan 9 without that confirmation in the conversation, **stop and ask.**

Already proven, so do not re-litigate: a file saved by the current app restores every
syllabus, layout, event name, student and mark into an app whose charts have been deleted
from the code. That test also found and fixed the crash that left the empty app showing one
syllabus of five.

### Open bug — unreproduced

The user reported a second save appearing to do nothing, with the file not holding the
second round of changes. **It could not be reproduced**, including through the real code
path with only the OS dialog stubbed.

Rather than guess, the failure was made loud: `writeTo` reads the file back and compares
sizes, any write failure reports `NOT SAVED` with a reason and keeps the work dirty, and
the toolbar shows `saved N KB at HH:MM` beside the file name. **If they report it again,
ask whether that time changed** — that is now the evidence.

A likely innocent explanation was never ruled out: they may have been testing a cached page.
Tell them to hard-refresh before testing anything newly shipped.

## Interface work — just started, no decisions made

The user asked to rework the interface and then chose to hand off. Nothing was designed and
nothing was agreed. **Start the brainstorming skill fresh and ask what bothers them** — do
not assume the list below is the brief.

Three faults found by measurement, worth raising:

| Fault | Detail |
|---|---|
| Edit toolbar covers the chart | `#arrTools` is 720×139 at (360,128) and sits over `ST-01`, the first event |
| Edit mode reshuffles the header | "Marking as" jumps to row 2, so buttons move out from under the cursor |
| Two identical zoom controls | `#flowZoomCtl` bottom-left zooms the chart, `#sideZoomCtl` bottom-right zooms the side panel |

The toolbar also runs course, syllabus, file and view controls together with nothing
separating them. 22 controls across two rows at 1440px wide.

## Things that will bite you

- **Browser file pickers need a live click.** No `await` before `showSaveFilePicker` /
  `showOpenFilePicker` / `requestPermission`, or the gesture is spent and the call throws.
  This exact mistake made Save look dead after opening a file.
- **`setSaveStatus` rewrites every `'ok'` message to a bare "saved".** Success detail must
  go somewhere else; that is why the save proof sits beside the file name.
- **A before/after comparison can be worthless.** Two checks passed this session while the
  thing they guarded was broken, because both sides ran through the same broken code. Assert
  the value is *present*, not merely unchanged.
- **Only `applyCharts` may touch charts and only `applyStudents` may touch people.** A smoke
  check watches every `localStorage` write to hold that line — it is what makes importing a
  chart safe for marks.
- **`applyBundle` no longer deletes stored syllabi.** It used to, so a freshly baked
  standalone HTML would win over saved overrides. That export is gone; restoring the
  deletion would wipe the user's charts.

## Testing

`npm run smoke` — 85 checks, must be green before every commit touching `src/`.
`npm run live` — the deployed site, after the Pages run finishes. Never call a branch "live".

Prove every new check fails before its fix exists. Several checks this session were written,
passed immediately, and turned out to be measuring nothing.
