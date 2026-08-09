# Handoff: OCU Progress Tracker — 9 Aug 2026 (late)

## Read this first

**The user is not a programmer** (see `CLAUDE.md`). Plain language in *every* reply, not
just summaries. Their bug reports have never been wrong — reproduce before theorising.

**Verify by driving the app, not by reading the diff.** Every fault this session was found
by using the app or by measuring it; none were visible in review. Two of the worst were
invisible to a suite that was green at the time.

**A check that passes first time has probably measured nothing.** Three written this
session measured nothing until repaired — see *The traps*.

**The repository is public.** No student name, mark or date may enter it. Smoke checks
enforce it.

## Where things stand

`npm run smoke` is **275 checks, green**. Everything through **PR #22** is merged and
**verified on the live site by driving it**, not by looking at it.

**Charts:** `2026 · 2024 · Tx 2026 · A/G - A/A 2026`. Their edits are the baked defaults.

**The working loop (keep it):** they edit charts in the app and send their file → read ONLY
its `charts` block, diff against baked, bake, PR, they say "merge" → verify live → send back
a charts-only sync JSON they open and re-save. Their word on names, order and links is
authoritative; mirror it exactly.

**Every PR merge is a squash**, so afterwards restart the branch rather than stacking on
merged history: `git fetch origin main && git checkout -B <branch> origin/main`.

## What shipped this session

**Interface** (#20, #21) — "Marking as" renamed **Crew** and moved to the front of the bar
with the View menu beside it; a search box that jumps the board to an event and rings it
turquoise (`circle.found`, r = rO+8, clear of the yellow available ring at rO+3); reorder
for **courses** and **crew** as well as syllabi, all through one modal (`core.ordMode`,
`data-ord` says which); a new course is added at the **top**; the app reopens on the course,
syllabus and crew member you last used, kept **per browser** under `ocuLocal:` — deliberately
outside the `ocu:` prefix that `sync/local.js` sweeps into the shared file.

**Eleven fault fixes** (#22), all reproduced first and each proven red by reverting its fix:

| Was | Now |
|---|---|
| A damaged file wrote to storage, then the app showed a blank page on every load | `fileFormat.js` checks the shape of both blocks before returning; `computeFlow` carries a visited set so a prerequisite loop degrades instead of blowing the stack |
| `applyStudents` replaced `v3:courses`, deleting the opener's own courses | merges |
| Reset layout wiped all 65 drawn lines, said "manual moves", no undo | counts the lines in the prompt, `pushUndo()` first |
| `redoStack` outlived `clearDirty`; neither stack cleared in `loadCourse` | both cleared, so undo/redo cannot cross charts |
| Detail edits never set `fileDirty` | they do |
| A detail edit equal to the base was scrubbed away and the syllabus note returned | `__kept` marks a deliberate edit; a file's bulk table has none, so it is still pruned |
| `renCourse` dropped pace, targets, lulls, last-position | moves them |
| `removeStudent` deleted nothing from storage | purges; course-level pace only once they are off every syllabus in it |
| `charts.order` written and never read back | restored on a whole-file open (not on import) |
| "Next event" showed unflyable events as ready | they carry `ready`; the panel draws the rest faded **and** dashed |
| An N.A. event drew failure ticks and accepted more | ticks hidden, adding refused, count kept |

## Still open

### PR #19 is still open and will conflict

`claude/read-handoff-lnn6fo` — "Take in the restored A/G – A/A links, and rewrite the handoff
notes". Based on `1049b76`, four merges behind. It adds three links the user restored by hand
(`IAT-07 → INT(S)-1`, `TR(S)-3 → TR-1(P)`, `EPE → TR-4`) and **rewrites this file**, so
merging it now conflicts here. Verified by reading its data: those three links and nothing
else — no box moves, no other chart. Take the three links across by hand rather than merging.

### Two A/G – A/A links the map draws and the chart does not

`EPE → AAS-04` and `TR(S)-4 → TR-2`. The user said "we work on the connections later".
**`AAS-04` currently has no prerequisites at all**, so it reads as available from day one.

### Two people at once is untested

There is no SharePoint here, so everything runs on the `localStorage` fallback. Reading the
code, this is where the remaining risk sits, and none of it is confirmed:

- `plan.sylName` is shared, so one person switching syllabus can move everyone's view.
- `reloadFromStore` does not check `sylDirty`, and `isUiBusy()` misses `dlg`, `ordMode`,
  `infoId`, `showAllOpen` — a 10 s poll landing mid-edit may discard in-memory `SYL` edits.
- `pushNow` reads content and ETag as two calls, so `If-Match` can pass against stale content.
- `sSet` reports every write as "saved" — `local.js` swallows quota errors.

### Plan 9 is still blocked

> Plan 9 empties the three data files. **An unedited syllabus exists only in that code.**
> Nothing may be deleted until the user has saved a file, reopened it, and said *in their own
> words* their syllabi are inside. No check stands in for that. **Stop and ask.**

### Smaller, unraised

- `layoutSnapshotFor` writes `{x:60,y:60}` for every event of a syllabus with no stored
  layout — a file saved in that state bakes the whole chart into one pile.
- Opening a file replaces stored layouts for every syllabus in it, with no dirty check and
  no warning. `Import syllabus…` asks; `Open…` does not.
- Switching **course** with unsaved event edits discards them silently (`switchCourse` has no
  `sylDirty` guard, unlike `switchSyllabus`). Box moves are safe — they auto-save.
- `.lvert` / `.lend` drags call `pushUndo()` *after* mutating, so undo cannot restore the
  prior shape.
- A ball dragged to a negative coordinate is clipped out of view mode; `bounds()` never
  computes a minimum, so Fit and search cannot reach it.

## The traps

Three checks written this session measured nothing until repaired. All three are the same
mistake — **the check and the thing it tests shared state**:

- The chart-order check cleared storage and re-applied in the **same page**, so it read back
  the order it had just set and passed with the fix removed. It reloads first now.
- The reorder check derived its expected order from the output it was testing; a broken run
  compared `SMOKE FIRST | SMOKE FIRST` against itself. Expectations are written out in full.
- The fallback check read `#courseSel`, and a `<select>` whose value names no option silently
  reports its first one — so it passed against a build with the membership test removed. It
  reads `#courseTitle` now.

Two more worth keeping: a colour check that passed when the ring did not exist at all (assert
the value is **present**, not merely different), and a scroll check run against a five-event
chart where nothing could scroll.

**And: make the fix-revert prove the RIGHT check.** Reverting all fourteen fixes at once and
confirming exactly the fourteen new checks went red — with the existing 260 still green — is
what showed each check answers for its own fault.

## Things that will bite you

- **`src/data/*.js` blobs are one line each.** Edit them by replacing that line.
- **Only `applyCharts` may touch charts and only `applyStudents` may touch people.** A smoke
  check watches every `localStorage` write to hold that line.
- **Browser file pickers need a live click** — no `await` before `showSaveFilePicker` /
  `showOpenFilePicker` / `requestPermission`.
- **Backticks in a `git commit -m` heredoc get eaten.** Write the message to a file, use `-F`.
- **Subagents in this environment inherit plan mode** and cannot drive a browser, whatever you
  tell them. Use `Explore` agents for source analysis and do the browser work yourself.
- **`npm run live` only ever shows what has finished publishing.** Order is: `npm run smoke`
  → push → merge → wait for the Pages run → `npm run live`. Never call a branch "live".
- See `CLAUDE.md` → Gotchas for the `#root` flex column, `minmax(0,1fr)`, the `scrollHeight`
  floor, the two `@media(max-width:1050px)` blocks, and the bar having no spare width at 1440.

## Whenever baked chart data changes, hand the user a sync file

**They asked for this.** Their stored charts shadow baked ones, so a baked change alone is
invisible on their devices. Build a charts-only `ocu-tracker` JSON, verify it with
`readFile()`, send it; they open it and save. Say plainly if it will also remove something.

## Testing

`npm run smoke` — 275 checks, green before every commit touching `src/`.
`npm run live` — the deployed site, after the Pages run finishes.
