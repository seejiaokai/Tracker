# Handoff: OCU Progress Tracker — both course maps reconciled, 7 Aug 2026

## Read this first

**The user is not a programmer** (see `CLAUDE.md`). Plain language, always.

**Their corrections are the reason this session came out right.** They caught six wrong
conclusions, and every one exposed a real flaw in the method rather than a one-off slip.
Take their reports literally; they have never been wrong.

**Do not trust chart pages unzipped from the `.docx`.** This is the big one — see the
"Reading the syllabus .docx" section of `CLAUDE.md` before touching either map. Ask the user
for screenshots of the rendered pages instead.

**When you ask for screenshots, ask for them as file attachments.** Images pasted into the
chat can be read in the moment but are never written to disk, so they cannot be saved,
re-cropped, magnified or handed to a subagent — and they are gone for good next time you look.
The user sent all 22 pages this way; they were readable then and unrecoverable an hour later.
Only the `.docx` and two early photos ever reached the filesystem. Say this up front, so the
composited pages can be kept alongside the repo and this whole trap disappears for good.

## PAUSED — Plan 9 is waiting on the user, 7 Aug 2026

The syllabus-file work is built and live **except its last step**. Everything is in
`docs/superpowers/specs/2026-08-07-syllabus-file-design.md` and the nine plans beside it.

Done and on the site: the file format, reading and writing state, file access, 📁 Open,
✓ Save changes, ⊕ Import syllabus, ⤓ Save a copy, and the removal of five buttons plus
`pristine.html`. Bundle fell 1,005 kB → 436 kB.

**Plan 9 — taking the built-in charts out of `src/data/syllabi.js` — MUST NOT START until
the user has saved a file, reopened it, and said in their own words that their syllabi are
inside it.** Any syllabus they have never edited exists *only* in the code Plan 9 deletes.
No check can stand in for that confirmation; the file is on their machine. If you reach
Plan 9 without it in the conversation, stop and ask.

Proven already, so do not re-litigate it: a file saved by the current app restores every
syllabus, layout, event name, student and mark into an app whose charts have been deleted
from the code. That test also found and fixed the crash that used to leave the empty app
showing one syllabus of five.

**Open bug, unresolved.** The user reported a second save appearing to do nothing, and the
file not holding the second round of changes. It could not be reproduced. Saving now
verifies the write by reading the file back, reports `NOT SAVED` on any mismatch, and shows
"saved N KB at HH:MM" beside the file name. If they report it again, that note is the
evidence — ask whether the time changed.

## What this session did

`main` and `claude/read-handoff-docs-8imnhp` are level and clean; the chart work below is
merged and **verified live** on the Pages site.

| Commit | What |
|---|---|
| `8762305` | `npm run live` — the deployed site is reachable now; two Chromium settings |
| `cef1d2b` | Wrote the per-change workflow down, including where the live check fits |
| `3b7873c` | Removed the abandoned OPS-04 connector drawing an arrow into thin air |
| `ec565e9` | Stopped the chart claiming ST-03 is needed before AVI-01 |
| `8f47ad0` | Restored four A/G - A/A links the map draws: TR(S)-1+OPS-03, T-10+AAS-04, TR-5(P)+AAS-04, DAAR+TR-4 |
| `7f5030d` | Built DAAR-1/-2 and NAAR-1/-2 in 2026, at the user's request |
| `b14222b` | Pinned the A/G - A/A sim chain |
| `d6d00fa` | Pinned the seven 2026 links the extracted images get wrong |

**Both maps have now been transcribed twice, end to end.** Beyond those four A/G - A/A links,
no prerequisite in either syllabus differs from its map. The data is in good shape.

## Do not "fix" these

`scripts/smoke.mjs` pins them, with the reason beside each. All were read wrongly at least
once from the extracted images, then settled against the user's screenshots:

```
TR(S)-7  <- TR(S)-LAO      not TR(S)-6   (TR(S)-LAO is drawn grey, missing from the extract)
INT(S)-1 <- IEPE/IPC …     not EPE       (IEPE sits in the F column, missing from the extract)
TR-5(P)  <- AAS-04, IEPE/IPC, TR-4
LASDT-1  <- INT-1, …       not BFM-7     (INT-1 sits between them)
ACM-3    <- ACM-2, …       not INT-1
INT-1    <- BFM-7, INT(S)-4  not ACM-2
T-10     <- AAS-04, IAT-08               (AAS-04 arrives via page-join K from B-14)
A/G - A/A: SA(S)-2 -> -3 -> -4 -> -5 stays joined — B-28 looks broken but is not
```

**AVI-13, ST-08, ST-07(P), ST-07(W) are struck through in red** on the 2026 map and are
deliberately absent from the syllabus. The red X is an overlay, so the extracted pages show
them as ordinary boxes. Do not add them.

## Known outstanding work

1. **Tx 2026 / Tx 2024 layout**, never approved by the user: arrows that read backwards around
   `TR-1(P)`, `TR-4` and `EPT-02`, and `TI(S)-2`/`TI(S)-3` so close the arrow is all head.
   Fixing means moving boxes — ask first. Empty rows are already available.
2. **Long sweeps**, recorded as baselines, not endorsed: `AAS-04 -> T-10`, `TR-4 -> DAAR` and
   the DAAR spine. The links are right; the routing is ugly. A layout decision for the user.
3. `AVI-12` is printed **"AVI-12 A/B"** and `NTR(S)-1` as **"NTR(S)-1 + IPC(W)"** on the maps.
   Raised, not answered.

## Testing

`npm run smoke` — **27 checks, all passing.** Every check added this session was proved by
breaking the fix first and watching it go red. Do the same.

`npm run live` — the user asks for the deployed site to be checked after every change. It only
shows what has finished publishing: smoke → push → wait for the Pages run → live.

## Environment

- `https://seejiaokai.github.io` is reachable. Chromium needs the proxy passed explicitly and
  `--ssl-version-max=tls1.2`; see `CLAUDE.md`.
- Pillow: `pip install Pillow`. Composite RGBA pages onto **white**, never `.convert('RGB')`.
- The scratch directory does **not** survive; the user must re-upload the `.docx`.
