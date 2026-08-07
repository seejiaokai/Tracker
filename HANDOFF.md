# Handoff: OCU Progress Tracker — chart work, 7 Aug 2026

## Read this first

**The user's last words were "Still got problem." They did not say which.** Ask before
you touch anything. Two previous sessions shipped confident, wrong chart rebuilds; this
one fixed the cause but the user is still not satisfied and the remaining fault is
unidentified.

**Ask for a screenshot.** This user reviews on a phone, in the standalone HTML file, and
points at things visually. Their reports have all been accurate and specific — "the messy
lines", "why does it end at TI-3", "why the arrow points backwards" each turned out to be
a real, findable bug. Take them literally.

**The user is not a programmer** (see `CLAUDE.md`). Plain language, always.

## The thing both previous sessions got wrong

**The Jul 26 `.docx` contains TWO different course maps, not one map drawn twice.**

| Images | Heading in the document | Belongs to |
|---|---|---|
| `image2`–`image19` | `DEFAULT COURSE MAP` | the **2026** syllabus |
| `image20`–`image29` | `A/G – A/A COURSE MAP` | the **A/G - A/A 2026** syllabus |

Both earlier rebuilds read images 20–29 and wrote the answers into **2026**. Every "error"
was a correct reading of the wrong course. Proof: of the 14 links the last rebuild changed
that also exist in A/G - A/A, **10 already matched A/G - A/A exactly**.

There are also **two versions of every event table**, and they disagree (different
prerequisites, aircraft counts, crew). Don't assume a table is authoritative — the chart
pages carry a printed note that the **flowchart supersedes the tables** where they conflict.

## Extracting the document (LibreOffice cannot open it — don't try)

```bash
unzip -q src.docx -d x                     # chart pages are word/media/image*.png|jpeg
```
To label each image with the map it belongs to, stitch the `<w:t>` runs of
`word/document.xml` into a single string, find the byte offsets of `DEFAULT COURSE MAP`
and `A/G – A/A COURSE MAP`, then assign each `r:embed`/`r:id` offset to the nearest
preceding heading. Paragraph-by-paragraph parsing **misses the A/G – A/A headings** —
they live inside nested elements and a non-greedy `<w:p>…</w:p>` match truncates them.

The table prerequisites extract cleanly from `<w:tbl>` blocks and are a genuinely useful
**independent cross-check** — that is how this session proved the last rebuild was wrong
(it broke 7 of 73 cross-checkable events and fixed 1).

**Chart-reading rules.** Read bottom→top. A branch off a vertical carries whatever is
below it. **A semicircular hump = crossing, NOT connected; a plain corner/dot = connected.**
Magnify every junction before deciding — three readings flipped this session
(`NTR(S)-1`/SS, `ST-15`/NN, `INT(S)-2`/AHC-1), and each would have been wrong at normal size.

## What this session changed (merged and live)

`main` and `claude/new-session-mooytp` are both at **`3c046f1`**, identical, clean. The
user asked for the merge at the end of the session; it fast-forwarded, and the push did
trigger a Pages deploy on its own this time (run `31136036790`). **Check a run exists after
any push — the previous session's merge push silently failed to start one** and had to be
kicked off by hand with `actions_run_trigger` → `run_workflow` on `deploy.yml`, ref `main`.

| Commit | What |
|---|---|
| `9de8c9f` | `scripts/build-standalone.mjs` — one command builds the reviewable single-file app |
| `54e50f7` | Reverted the 2026 prereqs to pre-rebuild; restored 23 deleted notes; **kept** the 13 device/crew edits (all verified against the tables); re-synced `pristine.html` |
| `41d9e43` | Rebuilt **A/G - A/A 2026** from images 20–29: added the 15 events of page B-32, fixed 4 reversed pairs, re-pointed ST-12 |
| `616f049` | Moved `TI(S)-3` (and `DCA(S)-1` back) so arrows stop pointing up the page |

### Current sizes

```
2024            212 events, 183 with prereqs, 29 roots   ends: AVI-07, AVI-08, TI-2, ST-18, NAAR 2, DAAR-2
2026            206 events, 181 with prereqs, 25 roots   ends: ST-18
Tx 2026         196 events, 164 with prereqs, 32 roots   ends: TI-1, ST-18
A/G - A/A 2026  209 events, 179 with prereqs, 30 roots   ends: ST-18
Tx 2024         196 events, 164 with prereqs, 32 roots   ends: TI-1, ST-18
```

## Known outstanding work

1. **2026 has never been read against its own map (`image2`–`image19`).** This is the big
   one. What is in the app now is the pre-rebuild data, which matches the written tables
   on 63 of 73 cross-checkable events — decent, but unverified against the correct pages.
   The user asked for this ("Both, A/G – A/A first"); A/G – A/A is done, this is not.
2. **Backwards arrows left in three charts**, recorded as baselines in the smoke suite,
   *not* endorsed. In each it is unresolved whether the box or the link is wrong:
   `2024` T-12/AGW-01 → LASDT(S)-1 (~600px) · `Tx 2026` and `Tx 2024` EPT-01→EPT-02,
   JMP-01/ST-16→TR-1(P), AAS-04→TR-4.
3. **`Tx 2026` / `Tx 2024` still carry the LASDT→SA long links** that made 2026 look like
   spaghetti. Same smell, never investigated.
4. Two links where chart and tables disagree and I changed nothing: **`TI-2`** may not need
   `TI-1` (2026 only); **`ACM(S)-1`** is `INT(S)-4, AAM-11` per the tables but `LASDT(S)-1`
   per the chart.

## Testing

`npm run smoke` — builds with `GITHUB_PAGES=true`, serves on `/Tracker/`, drives Chromium.
**21 checks, all passing.** Six are data checks: no dangling prereqs, no cycles, pinned
2026 links, pinned A/G - A/A links, endpoint counts per syllabus, arrow length baselines,
backwards-arrow baselines.

**Every check added this session was proved by breaking the fix first and watching it go
red.** Do the same. The baselines are deliberate: they record reality, not a target of zero.

For anything the suite misses, write a throwaway Playwright script — launch with
`executablePath: '/opt/pw-browsers/chromium'`, the bundled binary. **Take a screenshot and
actually look at it.** The scrollable element is `#board`; switching syllabus resets its
scroll, so scroll *after* the switch settles.

## Reviewing with the user

`node scripts/build-standalone.mjs` → `OCU-Tracker-review.html` (gitignored), then
`SendUserFile`. They save it, double-click, and the whole app opens locally. This is the
**only** way they can see a chart change. Open it yourself over `file://` first.

Data files are single-line JSON blobs that round-trip exactly through `JSON.stringify` —
edit them by loading the module, transforming, and rewriting line 2. `pristine.html` holds
its own baked copy of `SYLLABI`/`DEFAULT_LAYOUTS`/`EVENT_INFO`; **it had drifted badly and
was re-synced this session — keep it in step.**

## Environment

- `https://seejiaokai.github.io` is **reachable now** — the user changed the network policy.
  `npm run live` opens the deployed site in a browser and screenshots it; **they have asked
  for it to be used after every change and whenever chasing a bug.** It only shows what has
  finished publishing, so: `npm run smoke` → push → wait for the Pages run → `npm run live`.
  See `CLAUDE.md` for the two Chromium settings involved and how to diagnose a failure.
- Pillow is not installed by default; `pip install Pillow` for image cropping/zooming.
- A `SessionStart` hook installs deps and resolves Chromium, so `npm run smoke` works
  immediately.
- The scratch directory does **not** survive; the user must re-upload the `.docx`.
