# Handoff: OCU Progress Tracker — 9 Aug 2026 (evening)

## Read this first

**The user is not a programmer** (see `CLAUDE.md`). Plain language, always — in every
reply, not just summaries.

**Their bug reports have never been wrong.** Reproduce before theorising.

**Verify by driving the app, not by reading the diff.** Faults that a green suite missed
this session: seven line crossings drawing as junctions, two bus rails drawing as cut, and
two clipped labels. All were obvious in a screenshot and invisible in the data.

**A check that passes first time has probably measured nothing.** Make every new check fail
on purpose before believing it. One check this session could NOT be made to fail (every
event code is zero-padded, so text and number sorting agree) — it was deleted, not kept.
Four more measured nothing until rewritten: one derived its expected order from the output
it was testing, one read back an order it had just written in the same page (reload first),
one scrolled a five-event chart that could not scroll, and one read `#courseSel`, which
reports its first option when the value names none.

**The repository is public.** `github.com/seejiaokai/Tracker`. No student name, mark or
date may enter it. Smoke checks enforce this, and `bake-user-charts.mjs` re-checks after
every bake.

## Where things stand

`npm run smoke` is **275 checks, green**. Everything through PR #22 is merged and checked
live (9 Aug: new bar, search box, faded next-event chips all present, no console errors).
**Run `npm run live` and look at the screenshot before anything else.**

**Charts:** `2024 (212) · 2026 (210) · Tx 2026 (200) · A/G - A/A 2026 (211)`.
**Tx 2024 was deleted 9 Aug at the user's request** — recoverable from git history only.

**The working loop with the user (keep it):** they edit charts in the app and send their
file → `node scripts/bake-user-charts.mjs <file>` (reads ONLY the `charts` half) → diff,
PR, they say "merge" → verify live → send back a charts-only sync JSON they open and
re-save. Their word on chart names/order/links is authoritative; mirror it exactly.

## What shipped this session

**A/G - A/A redrawn to the course map.** `scripts/gen-agaa-layout.mjs` holds the
transcription of pages B-23…B-32 (flipped, stacked). The user has since moved 132 boxes and
drawn 68 lines of their own on top, so **that script is now history, not the source of
truth** — do not re-run it, it would throw their work away.

**Show All is grouped by event code.** `src/app/eventOrder.js` (no browser APIs, unit-tested
in plain Node like `fileFormat.js`): group by the text before the dash, natural-sort inside
the group, and prefix matches win over free-text so typing `ST` returns the ST family alone.

**Three loader faults fixed** — shipped `__unmerges`, `__merges` and `__font` were read from
a saved chart but never from the built-in one, so a first visit lost every kept hop, cut two
bus rails, and clipped the wide `ST-10` labels. All three come from one fallback branch in
`loadEdgeMeta` / `loadLineDefaults`.

**The per-syllabus wording leak fixed.** The editor pre-fills from `infoFor()` (base +
syllabus profile + user edits) but `saveInfoFor` compared against the base ALONE, so saving
any row while Tx 2026 was on screen stored Tx's wording as a GLOBAL override. One real save
of `SA-5` did this and arrived in the user's file; the bake script now drops such entries.

**The bar reorganised, and an event search (#20, #21).** Crew leads the bar, then View, the
search box, Course and Syllabus; a spacer, then File / Edit / Show All / Details. Type a code
and the board snaps to that ball and rings it turquoise. Courses and crew reorder by drag
through the one `#ordModal`. The app reopens on the last course / syllabus / crew member,
remembered **per browser** under raw `ocuLocal:` keys — deliberately outside the `ocu:`
prefix `sync/local.js` sweeps into the one shared SharePoint file.

**Eleven faults from the 9 Aug system test (#22).** Four kinds of damaged file used to be
written to storage and then render a blank page on every load — `fileFormat.js` now checks
inside both blocks and names what is wrong, and `computeFlow` carries a visited set so a
looping chart degrades instead of killing the render. `applyStudents` merges courses instead
of replacing them; Reset layout counts the drawn lines in its prompt and takes an undo
snapshot; the redo stack is cleared on course and syllabus change; `renCourse` and
`removeStudent` now move and purge every key they own.

**Every link departure is closed (10 Aug).** A full audit of all four charts — structure,
both printed maps, and each link compared across the charts — found two faults, and the user
fixed both by hand in one save:

| Was | Now |
|---|---|
| `TR(S)-4 → TR-2` missing on A/G - A/A | restored; all four charts agree and the map guards it |
| `ACM(S)-2 → ACM-3`, `SA(S)-3 → SA-2`, `SA(S)-4 → SA-3` missing on 2026 **and** Tx | restored on both; these were the only places any chart let a flight go before its simulator |

**`EPE → AAS-04` is not a missing link and never was.** It was called one twice, including in
a PR body. The map transcription says so itself, under `app_keeps_links_this_map_does_not_draw`:
neither map nor table draws it, it is legacy from the first port, and 2026 and Tx carry no
feeder either. All four charts now agree that `AAS-04` takes nothing. **Read that note before
"restoring" it.**

Nothing now remains that a map draws and a chart lacks, bar the DAAR/NAAR refresher tail the
user deliberately detached. `USER_EDITS_2026` and `USER_EDITS_AGAA` hold genuine departures
only, so the maps govern everything else and a future drop fails instead of being excused.
Direction of risk, still worth remembering: removals let an event unlock EARLY; additions can
only delay.

## Still open, and what to ask

### Plan 9 is still blocked

> Plan 9 empties the three data files. **An unedited syllabus exists only in that code.**
> Nothing may be deleted until the user has saved a file, reopened it, and said *in their
> own words* their syllabi are inside. No check stands in for that. **Stop and ask.**
> (The Tx 2024 deletion was a single named chart the user asked for by name — not this.)

### The unreproduced save bug

A second save appeared to do nothing; never reproduced. `writeTo` verifies by reading back;
failures say `NOT SAVED`; the toolbar shows `saved N KB at HH:MM` — **if they report it
again, ask whether that time changed.**

### Worth raising

- Everything fits one phone screen **at two students**; a fifth may start it scrolling.
- Switching student scrolls to their last mark but does **not** switch syllabus. Deliberate.
- `SA(S)-3` on Tx: the document contradicts itself. **User chose keep, twice, 8 Aug.**
- The edit-mode hint overlays the colour legend. Move it if they miss the legend.

## Reading the maps again? Know this first

Both maps are transcribed and pinned: `scripts/course-map-2026.json` and
`scripts/course-map-agaa-2026.json`. **2026 matched the drawing exactly; A/G - A/A matched
apart from four links the user confirmed.** The map is authoritative over the tables — every
page says so.

- **Two readings looked like real corrections and were not.** `INT(S)-2`+`AAS-04` (the
  arrowhead hops the J wire) and the `SA(S)`/`DAAR` "lost" links. **User confirmed twice.**
- Method that worked: one agent per page, page-join letters transcribed as NODES, chains
  resolved afterwards, then diff against the app and zoom only into the differences.
- **Agents auditing the RENDERED chart found real faults the data checks could not.** Give
  each two screenshot bands plus the link list; ask for missing / phantom / visual defects
  separately. Six of seven regions came back clean, and the seventh was genuine.
- Do not trust chart images unzipped from the `.docx` — overlays are separate files and go
  missing. Ask for screenshots.

## Things that will bite you

- **User edits supersede map pins.** `USER_EDITS_2026` and `USER_EDITS_AGAA` are consulted
  before every map comparison. Add to them; never "correct" the syllabus back to the map.
- **Chart-shape checks read geometry from the page, not fixed coordinates.** The user owns
  those positions and moves them constantly; a pixel-pinned path is noise within a day.
- **`src/data/*.js` blobs are one line each.** Edit them by replacing that LINE. A regex
  spanning `export` to `export` deleted `EVENT_INFO_BY_SYL` this session — `eventInfo.js`
  has a comment between its two exports and the lazy match ran straight past it.
- **Browser file pickers need a live click.** No `await` before `showSaveFilePicker` /
  `showOpenFilePicker` / `requestPermission`.
- **Only `applyCharts` may touch charts and only `applyStudents` may touch people.**
- **Anything remembered per browser goes in `ocuLocal:`, never through `sSet`.** Every `ocu:`
  key lands in one shared file, so whoever used the app last would decide what opens for
  everyone. `kLastStudent`/`kLast` stay shared on purpose.
- **`applyBundle` no longer deletes stored syllabi.** Restoring that would wipe their charts.
- **Backticks in a `git commit -m` heredoc get eaten.** Write the message to a file, use `-F`.
- Every PR merge is a squash, so the branch is left behind afterwards; reset it onto
  `origin/main` rather than stacking on merged history.
- See `CLAUDE.md` → Gotchas for the `#root` flex column, `minmax(0,1fr)`, the `scrollHeight`
  floor, and the two `@media(max-width:1050px)` blocks.

## Whenever baked chart data changes, hand the user a sync file

**They asked for this, 8 Aug.** Their stored charts shadow baked ones, so a baked change
alone is invisible on their devices. Build a charts-only `ocu-tracker` JSON, verify it with
`readFile()`, send it; they open it and save. Say plainly if it will also remove something.

## Testing

`npm run smoke` — 275 checks, green before every commit touching `src/`.
`npm run live` — the deployed site, after the Pages run finishes. Never call a branch "live".
