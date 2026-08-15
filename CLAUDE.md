# OCU Progress Tracker

Vite + React (JavaScript, not TypeScript). Deployed to GitHub Pages from `main`
via `.github/workflows/deploy.yml`.

## How to talk to this user

**The user is not a programmer. Explain everything in plain language.** This
applies to every reply, not just summaries, and it is a standing instruction —
carry it across handoffs.

- Lead with what changed for them: what they will see, click, or notice in the
  app. Put the cause after that, if it is worth saying at all.
- No jargon. If a technical word is genuinely unavoidable, say what it means in
  half a sentence the first time. Avoid file paths, function names, CSS
  properties, and code snippets in the explanation — they are noise to this
  reader. Referring to a screen or button by the name shown in the app is fine.
- Prefer a short everyday comparison over a precise technical description when
  the two compete.
- Keep it short. A few sentences and a plain heading beat a long report.
- Say plainly when something is broken, uncertain, or was not checked. Plain
  language means simpler words, **not** softened facts or hidden problems.
- When a decision is theirs to make, state the choice in ordinary terms and say
  what you recommend.

**Keep every markdown doc in this repo under 200 lines**, this file included.
If one is outgrowing that, cut it rather than letting it sprawl: drop what the
reader can see in the code, merge overlapping points, and prefer a table to
paragraphs. Length is a standing constraint, not a target to fill.

## Always do live testing

**Verify UI changes by driving the real app in a browser, not by reading the diff.**
This app's bugs are overwhelmingly interaction bugs — hit-testing, hover, stacking
order, modal layering — and none of them are visible in source review.

```
npm run smoke            # build dist/, serve it, drive it in Chromium, tear down
npm run smoke -- --keep  # leave the preview server up to poke at it further
```

`scripts/smoke.mjs` builds with `GITHUB_PAGES=true` and serves on the same
`/Tracker/` base path Pages uses, so it exercises the production bundle rather
than the dev server. It exits non-zero on failure. Run it before every commit
that touches `src/`, and extend it when you add behaviour — a fix without a
check that would have caught it is only half done.

For anything the suite doesn't cover, write a throwaway Playwright script and
run it. Take a screenshot and actually look at it; several bugs here were only
visible that way.

Prove a fix is real by confirming the test fails without it. Stash the change,
watch the check go red, restore it, watch it go green. A test that never failed
has demonstrated nothing.

### Also check the deployed site — the user asked for this

```
npm run live                          # load the Pages site, health summary, screenshot
npm run live -- --syllabus "2026"     # switch syllabus first
```

**The user wants the live site checked after every change and whenever hunting a
bug.** It shows only what has finished publishing, so the order is: `npm run smoke`
→ push → wait for the Pages run → `npm run live`. Say which one you actually ran;
never let "checked live" stand for a local build.

`scripts/live.mjs` sets the two things Chromium needs and does not get on its own.
Any throwaway browser script that leaves the container needs both:

| Setting | Without it |
|---|---|
| `proxy: { server: process.env.HTTPS_PROXY }` | `ERR_CERT_AUTHORITY_INVALID` |
| `args: ['--ssl-version-max=tls1.2']` | `ERR_CONNECTION_RESET` — the proxy resets Chromium's TLS 1.3 handshake |

Certificate verification stays on; never reach for `--ignore-certificate-errors`.
Hosts the proxy intercepts with its own certificate (`github.com`, not `*.github.io`)
additionally need its CA in Chromium's own store — `apt-get install -y libnss3-tools`
then `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n ccr -i /root/.ccr/agent-proxy-ca.crt`.

A `403` on `CONNECT` instead means the environment's network policy no longer allows
`*.github.io`; only the user can change that, when creating the environment
(https://code.claude.com/docs/en/claude-code-on-the-web). Diagnose with
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` and read `recentRelayFailures`
(use `$HTTPS_PROXY`; the port changes every session).

## Reading the syllabus .docx — the images are incomplete

**Do not trust chart pages unzipped from the document.** Word stores each page as a base
picture with extra pieces laid *over* it: the red X strike-throughs, the IEPE ellipse on
B-14, a TR(S)-7 ellipse, an INT-1 aircraft. Those overlays come out as their own tiny
`word/media/image4,5,9,10,13,14` and are **absent from the page you extract**, so a box
vanishes mid-chain and the reading silently skips it. This produced five confidently wrong
answers in one session. **Ask the user for screenshots of the rendered pages** — those show
the composited truth. `scripts/smoke.mjs` pins the specific links this trap corrupts.

Two more traps: PNGs are RGBA, so `.convert('RGB')` flattens onto **black** and two pages
come out solid black (composite onto white instead); and page-join letters (A, B, … NN) are
**wires, not events** — a prerequisite can travel three pages through them, so transcribe
letters as nodes (`T-02 → A`, `A → AVI-06`) and resolve the chains afterwards.

The map is authoritative: the pages print *"Flowchart is authoritative and the table
prerequisites are treated as superseded."* The two blocks of event tables disagree with each
other in seven places; use them only as a weak cross-check.

## Architecture

- `src/app/core.js` — the whole app model plus the imperatively-rendered SVG flow board,
  kept imperative for drag/pan/zoom performance; everything else is React.
- `src/data/syllabi.js` — one single-line JSON blob per syllabus, round-tripping exactly
  through `JSON.stringify`, so edit it programmatically. Each event's `prereqs` array is
  the *only* source of flow-chart edges. `layouts.js` is x/y only (no connections);
  `eventInfo.js` is names, format, hours.
- `src/app/fileFormat.js` — the saved file's shape; no browser APIs and no `core.js` import, so `smoke.mjs` checks it in plain Node.
- `src/app/fileStore.js` — reaching the user's own files; Chrome and Edge write back in
  place, elsewhere it downloads and says so.

## Superpowers plugin

`obra/superpowers` is only *declared* by `.claude/settings.json` and this image starts with
an empty `~/.claude`, so `.claude/hooks/session-start.sh` re-installs it each session.
Startup prints `superpowers: ready`; anything else means the printed install command is the fix.

## Claude for Chrome

Only where Chrome is connected. **This remote environment has neither Claude for
Chrome nor Playwright MCP**, so `npm run smoke` / `npm run live` stay the way to drive the
app here — including their screenshots, which is how several bugs were found.

- `read_page` for refs from the accessibility tree; `find` to locate by description
- Click using `ref`, never coordinates. No screenshots unless asked (inverted for Playwright)

## Gotchas

- Storage: `sync/cloud.js` → `sync/local.js`, which tries SharePoint and silently
  falls back to `localStorage`. The `_api/web/...` and `_api/contextinfo` **404s on
  every load outside SharePoint are by design — do not "fix" them.**
- Because state syncs to teammates via SharePoint, anything user-supplied that
  reaches the DOM is a *stored* XSS vector, not self-XSS. All of it flows through
  `escapeId()`, which must escape `& < > " '` — its output lands in HTML attributes.
- Target elements by **ID** in tests (`#showAllBtn`, `#detailsBtn`, `#saveChanges`,
  `#dupSyl`, `#addStu`, `#undoBtn`, `#editSyl`, `#openFileBtn`, `#saveCopyBtn`). Text matching breaks:
  `✓ Save changes` gains a `●` when dirty.
- **Most of those now sit inside a menu** — `#courseMenuBtn`, `#sylMenuBtn`,
  `#fileMenuBtn`, `#viewMenuBtn`. Clicking one directly times out; open its menu
  first. Panels stay in the DOM and hide with CSS, so `textContent` and
  `isChecked` still work while shut.
- `#saveChanges` **only exists while something is unsaved.** `count() === 1` is
  the wrong assertion; make the app dirty first, or assert `<= 1`.
- The app uses its own modal (`#dlgModal` / `#dlgInput` / `#dlgOk`), not native
  `prompt()`. Playwright's dialog handler will not catch it.
- The Cloud dialog is a raw `position:fixed` div at `z-index:99999` with no
  `.modal`/`.overlay` class. Close it via `#cbCancel` or it silently swallows
  every later click.
- z-index ladder: `.modal` 60 · `.lullcal` 70 · `#dlgModal`/`#ordModal` 71 ·
  `#showAllPanel` 81 · `#infoModal` 91 · Cloud dialog 99999. Header menus 50,
  the phone search strip 52. Anything new that opens *over* Show All must clear 81.
- The desktop bar has **no spare width at 1440** — one added control wrapped it onto two
  rows and cost 44px of chart; the heading hides below 1600px to pay for the search box.
  The phone bar wraps to three rows (15 Aug), its width bought by trimming captions and
  selects, not by hiding controls.
- `#ordModal` serves syllabi, courses **and** crew — one `core.ordMode`, one set of ids,
  `data-ord` says which. Only one can ever be open.
- The page column lives on **`#root`**, not `body` — React mounts everything inside it, so
  a flex column on `body` lays out `#root` alone and the whole page scrolls instead of the
  board. `#root` needs `min-width:0` too.
- **`styles.css` has two `@media(max-width:1050px)` blocks, top and end.** Phone
  overrides belong in the *last*: same specificity means later wins, and the
  general rules sit between them. This has silently beaten a whole block of
  phone rules once and a `padding-bottom` once — only the deployed site showed it.
- Grid columns: always `minmax(0,1fr)`, never `1fr`. A bare `1fr` takes its
  minimum from content, and a `dd/mm/yyyy` box then pushes the panel wider than
  the screen. This has bitten three separate layouts.
- `scrollHeight` never reports less than `clientHeight`, so "fits exactly" and
  "fits with room to spare" look identical. Measure the content to get the margin.
- Pages deploys: `concurrency.cancel-in-progress` must stay `false`. Cancelling a
  run mid-deploy orphans the Pages deployment it registered and the next run then
  times out after 10 minutes in `deployment_queued`.

## Workflow

Work on the branch named in the session prompt, never commit straight to `main`
unless asked. `npm run build` must pass. There is no linter configured.

Per change, in order:

1. **`npm run live` first**, before touching anything, whenever the user reports a
   bug — reproduce it on the thing they are actually looking at. Their reports have
   always been accurate; confirm *what* is wrong before guessing why.
2. Make the change.
3. `npm run smoke` — must be green, and extend it so it would have caught this bug.
   Prove the new check fails without the fix.
4. Commit and push to the session branch.
5. After it reaches `main` and the Pages run finishes: **`npm run live` again** to
   confirm the fix is really live, and look at the screenshot.

**Step 5 cannot happen on a branch.** The deployed site is built from `main` only, so
between steps 4 and 5 the live site still shows the old behaviour — that is expected,
not a failed fix. Do not describe a branch change as "live", and do not push to `main`
to make step 5 possible. Wait for the merge, or say plainly that it is still pending.
