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

### The deployed site is usually unreachable from a session

`https://seejiaokai.github.io/Tracker/` is normally blocked by the environment's
egress policy — the proxy answers `403` to `CONNECT`, same as any non-allowlisted
host. Confirm with:

```
curl -sS http://127.0.0.1:36909/__agentproxy/status | python3 -m json.tool
```

and look at `recentRelayFailures`. This is **not** fixable from inside the
container and must not be routed around. Only the user can change it, by
choosing a network policy that allows `*.github.io` when creating the
environment (https://code.claude.com/docs/en/claude-code-on-the-web).

Until then `npm run smoke` is the substitute: same commit, same build flags,
same base path, so it is the deployed artifact in everything but hostname.
Say so plainly rather than implying the live URL was checked.

## Architecture

- `src/app/core.js` — the whole app model plus the imperatively-rendered SVG flow
  board. Kept imperative for drag/pan/zoom performance; everything else is React.
- `src/data/syllabi.js` — one single-line JSON blob per syllabus. It round-trips
  exactly through `JSON.stringify`, so edit it programmatically. Each event's
  `prereqs` array is the *only* source of flow-chart edges.
- `src/data/layouts.js` — x/y positions only, no connection info.
- `src/data/eventInfo.js` — names, format, hours.
- `src/data/pristine.html` — the standalone single-file app that "⤓ Save as new
  HTML" exports, with current data baked in. **Fixes in `core.js` usually need
  porting here too**; it has its own copy of the same logic and has drifted before
  (the `escapeId` XSS fix landed in `core.js` alone and sat unfixed here).

## Gotchas

- Storage: `sync/cloud.js` → `sync/local.js`, which tries SharePoint and silently
  falls back to `localStorage`. The `_api/web/...` and `_api/contextinfo` **404s on
  every load outside SharePoint are by design — do not "fix" them.**
- Because state syncs to teammates via SharePoint, anything user-supplied that
  reaches the DOM is a *stored* XSS vector, not self-XSS. All of it flows through
  `escapeId()`, which must escape `& < > " '` — its output lands in HTML attributes.
- Target elements by **ID** in tests (`#showAllBtn`, `#detailsBtn`, `#saveChanges`,
  `#dupSyl`, `#addStu`, `#undoBtn`, `#editSyl`, `#cloudBtn`). Text matching breaks:
  `✓ Save changes` gains a `●` when dirty.
- The app uses its own modal (`#dlgModal` / `#dlgInput` / `#dlgOk`), not native
  `prompt()`. Playwright's dialog handler will not catch it.
- The Cloud dialog is a raw `position:fixed` div at `z-index:99999` with no
  `.modal`/`.overlay` class. Close it via `#cbCancel` or it silently swallows
  every later click.
- z-index ladder: `.modal` 60 · `#dlgModal`/`#ordModal` 71 · `#showAllPanel` 81 ·
  `#infoModal` 91 · Cloud dialog 99999. Anything new that opens *over* Show All
  must clear 81.
- Pages deploys: `concurrency.cancel-in-progress` must stay `false`. Cancelling a
  run mid-deploy orphans the Pages deployment it registered and the next run then
  times out after 10 minutes in `deployment_queued`.

## Workflow

Work on the branch named in the session prompt, never commit straight to `main`
unless asked. `npm run build` must pass. There is no linter configured.
