# OCU Progress Tracker

A flight-training syllabus progress tracker for an Operational Conversion Unit —
multi-student, multi-course, multi-syllabus.

Each syllabus is an interactive "pokéball" flow chart: one ring segment per
student, coloured by grade (DCO / DPCO / Marginal / NA). It comes with a full
chart editor (move, connect, free-drawn lines, merge crossings, undo/redo), a
stats side panel (progress by event type, next-event lookahead, currency & flex,
pace and expected-end planning, lull periods, calendar) and per-event detail
sheets.

This is a **Vite + React port of the original single-file HTML app**. Storage
keys, state shapes and the backup JSON format are unchanged, so data from the
original tool loads as-is. The optional sync layers (SharePoint, Dataverse,
Firebase) are ported unchanged; on any other host the app quietly works
browser-local.

## Getting started

```bash
npm install
npm run dev        # dev server, http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve that build locally
npm run smoke      # build it, drive it in a real browser, report pass/fail
```

`npm run smoke` is the check to run before committing anything that touches the
UI — see CLAUDE.md.

## Sample data

`sample-data/OCU_state_sample.json` is a legacy state export kept as a fixture
for the smoke suite. The app no longer reads it — your work lives in the file
you open with **📁 Open**.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/core.js` | App state, storage keys, graph/geometry logic, and the flow board. The board stays direct-DOM for drag/pan performance, wrapped by the React `Board` component. |
| `src/components/` | React components: header, arrange tools, side panel, grade popover, Show All panel, modals. |
| `src/data/` | Syllabi, default layouts, event info and seed state, taken verbatim from the original app. |
| `src/sync/` | SharePoint/localStorage layer, and the Dataverse/Firebase cloud layer. |
| `scripts/smoke.mjs` | The browser test suite behind `npm run smoke`. |
