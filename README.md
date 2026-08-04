# OCU Progress Tracker

A flight-training syllabus progress tracker for an Operational Conversion Unit:
multi-student, multi-course, multi-syllabus. It renders each syllabus as an
interactive "pokéball" flow chart (one ring segment per student, coloured by
grade — DCO / DPCO / Marginal / NA), with a full flow-chart editor (move,
connect, free-drawn lines, merge/unmerge crossings, undo/redo), a stats side
panel (progress by event type, next-event lookahead, currency & flex state,
pace / expected-end planning, lull periods, calendar) and per-event detail
sheets.

This repository is a **Vite + React port of the original single-file HTML app**.
All behaviour, storage keys (`v3:...`, persisted in `localStorage` under the
`ocu:` prefix), state shapes and the backup JSON format are preserved, so data
from the original tool loads unchanged. The optional sync layers (SharePoint
file sync, Microsoft Dataverse, Google Firebase) are ported as-is and activate
exactly as before; on any other host the app quietly works browser-local.

## Getting started

```bash
npm install
npm run dev        # start the dev server (default http://localhost:5173)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

## Importing the sample state

A sample exported state file lives at `sample-data/OCU_state_sample.json`
(a dump of the app's storage keys, exactly what the **💾 Save backup** button
downloads).

To load it: run the app, click **⤒ Load backup** in the header toolbar, and
pick the file. Every key is written back into storage and the app reloads from
it — courses, rosters, marks, dates, plans and custom syllabi included.

**💾 Save backup** downloads the current state in the same format.

## Notes on the port

- `src/app/core.js` — application state, storage/key scheme, graph & geometry
  logic and the imperative flow-board engine (a faithful port of the original
  script; the SVG editor keeps its direct-DOM rendering for drag/pan
  performance, wrapped by the React `Board` component).
- `src/components/` — React function components: header/toolbar, arrange
  tools, side panel (stats, currency, pace, calendar), grade popover,
  Show-All panel and all modals.
- `src/data/` — the master syllabi, default flow-chart layouts, event info and
  seed state extracted verbatim from the original file, plus a pristine copy
  of the original single-file HTML used by **⤓ Save as new HTML** (which still
  exports a fully self-contained single-file copy with your data baked in).
- `src/sync/` — the SharePoint/localStorage layer and the Dataverse/Firebase
  cloud layer.
