# Syllabus File — Plan 8 of 9: removing the buttons the file replaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take five buttons off a crowded toolbar, and with them a second complete copy of the app.

**Architecture:** Deletions only. The `sync/` machinery underneath ☁ Cloud stays exactly as it is — it is how all saving works, including saving to the browser — so only the buttons go. Removing ⤓ Save as new HTML is what finally allows `src/data/pristine.html` to be deleted, which every earlier plan has been deferring its port to.

**Tech Stack:** Vanilla ES modules, Vite, React 18, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-syllabus-file-design.md`

**Order:** … 7 Import & Save-a-copy → **8 remove old buttons** → 9 changeover.

## Global Constraints

- Every markdown doc stays **under 200 lines**; target elements by **ID**, never by text; `npm run build` must pass; there is no linter (`CLAUDE.md`).
- After this plan `src/data/pristine.html` is gone, so the porting rule no longer applies. **Update `CLAUDE.md` in the same commit.**
- Prove every new check fails before its fix exists.

---

### Task 1: Remove the five buttons and the duplicate app

**Files:** Modify `src/components/Header.jsx`, `src/app/core.js`, `CLAUDE.md` · Delete `src/data/pristine.html` · Modify `scripts/build-standalone.mjs`, `README.md`, `scripts/smoke.mjs`

**Interfaces:** removes `exportBakedHtml`, `saveBackup`, `importStateJson` and the `PRISTINE_HTML` import. **The `sync/` machinery stays untouched** — it is how all saving works; only the ☁ Cloud and ⟳ Load latest *buttons* go.

- [ ] **Step 1: Write the failing test**

```js
for (const id of ['#cloudBtn', '#loadLatestBtn', '#saveBtn', '#importBtn', '#exportHtmlBtn'])
  ok(`${id} is gone from the toolbar`, await pg.locator(id).count() === 0);
ok('saving still works without the cloud button',
  (await pg.textContent('#saveStat')).length > 0);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run smoke 2>&1 | grep -i 'is gone from'` → five `FAIL`s.

- [ ] **Step 3: Remove them**

From `Header.jsx`: those five `<button>` elements, the hidden `<input type="file">`, and `onImportFile`. From `core.js`: `exportBakedHtml`, `bakeState`, `bakeJSON`, `bakeSkip`, `BAKE_SKIP_EXACT`, `saveBackup`, `collectState`, `importStateJson`, the `PRISTINE_HTML` import. Keep `applyBundle` — Plan 9 needs it. Then `git rm src/data/pristine.html scripts/build-standalone.mjs` and drop the "Sample data" section from `README.md`.

In `CLAUDE.md`: delete the `pristine.html` bullet from **Architecture**, step 5 from **Workflow**, and `#cloudBtn` from the Gotchas ID list.

- [ ] **Step 4: Run and pass**

Run: `npm run smoke 2>&1 | tail -8` and `npm run build` → both clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Remove five buttons the file replaces, and the duplicate app

Cloud and Load latest leave the toolbar; the sync machinery underneath
stays, since it is how all saving works. Save backup and Load backup are
covered by the one file. Save as new HTML goes, which lets pristine.html
— a second copy of the app that had drifted before — be deleted."
```
