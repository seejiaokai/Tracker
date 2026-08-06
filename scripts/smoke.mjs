/*
 * Browser smoke suite for the OCU Progress Tracker.
 *
 *   npm run smoke              build dist/, serve it, drive it, tear down
 *   npm run smoke -- --keep    leave the preview server running afterwards
 *   APP_URL=http://host/path/ npm run smoke      test an already-running app instead
 *
 * It builds and serves with GITHUB_PAGES=true so the base path matches what
 * GitHub Pages serves — this exercises the real production bundle, not the dev server.
 *
 * Chromium: uses Playwright's own download when present. If the browser lives
 * somewhere else (some CI images ship one), point CHROMIUM_PATH at it.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = process.env.SMOKE_PORT || 4179;
const OWN_SERVER = !process.env.APP_URL;
const URL = process.env.APP_URL || `http://localhost:${PORT}/Tracker/`;
const KEEP = process.argv.includes('--keep');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? ' PASS' : ' FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const run = (cmd, args, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', c => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
});
const waitForServer = async url => {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(url)).ok) return true; } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};

let server = null;
if (OWN_SERVER) {
  console.log('building dist/ (GITHUB_PAGES=true) …');
  await run('npx', ['vite', 'build'], { env: { ...process.env, GITHUB_PAGES: 'true' } });
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { env: { ...process.env, GITHUB_PAGES: 'true' }, stdio: 'ignore', shell: process.platform === 'win32' });
  if (!await waitForServer(URL)) { console.error(`preview server never came up at ${URL}`); server.kill(); process.exit(1); }
}
const stopServer = () => { if (server && !KEEP) server.kill(); };

const execPath = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch(execPath ? { executablePath: execPath } : {});
const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });

const errs = [], bad4xx = [];
pg.on('pageerror', e => errs.push(e.message));
/* The SharePoint probes 404 by design outside SharePoint (see src/sync/local.js
   falling back to localStorage); anything else failing to load is a real problem. */
const EXPECTED_404 = /_api\/(web|contextinfo)/;
pg.on('response', r => { if (r.status() >= 400 && !EXPECTED_404.test(r.url())) bad4xx.push(r.status() + ' ' + r.url()); });

console.log(`\n=== ${URL} ===\n`);
await pg.goto(URL, { waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball', { timeout: 20000 });

const nBalls = await pg.locator('#flowSvg .ball').count();
ok('app boots and renders the flow board', nBalls > 100, `${nBalls} events`);

/* ---- hover bubble stays put while crossing a ball ---- */
await pg.click('#detailsBtn'); await pg.waitForTimeout(250);
const t = await pg.evaluate(() => {
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === 'ST-01');
  const r = g.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
});
await pg.evaluate(() => {
  window.__n = 0;
  document.querySelectorAll('#flowSvg .ball').forEach(g => g.addEventListener('pointerenter', () => window.__n++));
});
await pg.mouse.move(t.cx, t.cy - t.w);
for (let dy = -Math.round(t.w / 2) - 2; dy <= Math.round(t.w / 2) + 2; dy++) await pg.mouse.move(t.cx, t.cy + dy);
const enters = await pg.evaluate(() => window.__n);
ok('one hover enter per ball crossing (no bubble flicker)', enters === 1, `${enters} enter events`);
await pg.click('#detailsBtn'); await pg.waitForTimeout(200);

/* ---- inline editing in the Show All list ---- */
const row = id => pg.locator('.sarow').filter({ has: pg.locator('.sid', { hasText: new RegExp(`^${id}$`) }) }).first();
const meta = async id => ((await row(id).locator('.smeta').textContent()) || '').replace(/\s+/g, ' ').trim();
const set = async (label, val) => {
  const l = pg.locator('.saedit label').filter({ hasText: label }).first();
  await l.locator('input, textarea').first().fill(val);
};
const resetRow = async id => {
  await row(id).locator('button.sedit').click(); await pg.waitForSelector('.saedit');
  await pg.locator('.saedit-btns button', { hasText: 'Reset to doc' }).click(); await pg.waitForTimeout(400);
  await pg.locator('.saedit-btns button', { hasText: 'Cancel' }).click(); await pg.waitForTimeout(250);
};

await pg.click('#showAllBtn');
await pg.waitForSelector('#showAllPanel.on');
await row('ST-01').locator('button.sedit').click();
await pg.waitForSelector('.saedit');
const labels = await pg.evaluate(() => [...document.querySelectorAll('.saedit label')].map(l => l.childNodes[0].textContent));
ok('inline editor has all five fields',
  JSON.stringify(labels) === JSON.stringify(['Name', 'Type / format', 'Hours', 'Crew', 'Prerequisites']), labels.join(' / '));
ok('inline editor is not covered by anything', await pg.evaluate(() => {
  const i = document.querySelector('.saedit input'); const r = i.getBoundingClientRect();
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === i;
}));

await set('Name', 'SMOKE TEST NAME'); await set('Crew', 'UP/UW');
await pg.locator('.saedit-btns button.primary').click(); await pg.waitForTimeout(400);
ok('save writes through to the list',
  (await row('ST-01').locator('.snm').textContent()) === 'SMOKE TEST NAME' && (await meta('ST-01')).includes('UP/UW'));
ok('Show All stays open after save', await pg.locator('#showAllPanel.on').count() === 1);

await row('ST-01').locator('button.sedit').click(); await pg.waitForSelector('.saedit');
await set('Name', 'DISCARD ME');
await pg.locator('.saedit-btns button', { hasText: 'Cancel' }).click(); await pg.waitForTimeout(300);
ok('cancel discards edits', (await row('ST-01').locator('.snm').textContent()) === 'SMOKE TEST NAME');

await resetRow('ST-01');
ok('reset to doc restores source values', (await row('ST-01').locator('.snm').textContent()) === 'Squadron Welcome');

await row('ST-01').locator('button.sedit').click(); await pg.waitForSelector('.saedit');
await set('Crew', 'PERSIST/CHECK');
await pg.locator('.saedit-btns button.primary').click(); await pg.waitForTimeout(500);
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('#flowSvg .ball');
await pg.click('#showAllBtn'); await pg.waitForSelector('#showAllPanel.on');
ok('edits survive a reload', (await meta('ST-01')).includes('PERSIST/CHECK'));
await resetRow('ST-01');
await pg.click('#saClose'); await pg.waitForTimeout(200);

/* ---- pop-up editor: compact, and above the Show All panel ---- */
const clickBall = id => pg.evaluate(i => {
  const g = [...document.querySelectorAll('#flowSvg .ball')].find(x => x.dataset.id === i);
  g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, id);
await clickBall('ST-01'); await pg.waitForTimeout(300);
await pg.click('#popEditInfo'); await pg.waitForSelector('#infoModal');
const m = await pg.evaluate(() => {
  const el = document.getElementById('infoModal');
  return { h: Math.round(el.getBoundingClientRect().height), z: +getComputedStyle(el).zIndex,
    ta: [...el.querySelectorAll('textarea')].map(x => Math.round(x.getBoundingClientRect().height)) };
});
ok('pop-up editor is compact', m.h < 400 && m.ta.every(h => h < 80), `height ${m.h}px, textareas ${m.ta.join('/')}px`);
ok('pop-up editor stacks above the Show All panel (81)', m.z > 81, `z-index ${m.z}`);
await pg.click('#ifCancel'); await pg.waitForTimeout(200);

/* ---- core interaction ---- */
await clickBall('ST-01'); await pg.waitForTimeout(300);
ok('clicking a ball opens the grading popup', await pg.evaluate(() => {
  const p = document.getElementById('pop');
  return !!(p && getComputedStyle(p).display !== 'none' && p.offsetWidth);
}));

ok('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
ok('no unexpected failed requests', bad4xx.length === 0, [...new Set(bad4xx)].slice(0, 3).join(' | '));

/* ---- syllabus data integrity (every syllabus) + 2026 chart spot-checks ---- */
const { SYLLABI } = await import('../src/data/syllabi.js');
const dangling = [], cyclic = [];
for (const [name, syl] of Object.entries(SYLLABI)) {
  const byid = Object.fromEntries(syl.map(e => [e.id, e]));
  syl.forEach(e => (e.prereqs || []).forEach(p => { if (!byid[p]) dangling.push(`${name}:${e.id}<-${p}`); }));
  const seen = {};
  const walk = id => {
    if (seen[id] === 2) return;
    if (seen[id] === 1) { cyclic.push(`${name}:${id}`); return; }
    seen[id] = 1; (byid[id]?.prereqs || []).forEach(walk); seen[id] = 2;
  };
  syl.forEach(e => walk(e.id));
}
ok('no prereq points at a missing event', dangling.length === 0, dangling.slice(0, 3).join(', '));
ok('no circular prereqs', cyclic.length === 0, [...new Set(cyclic)].slice(0, 3).join(', '));

/* A handful of 2026 links read straight off the Jul 26 course map. These were
   misread by earlier extraction passes, so they are pinned here. */
const CHART_2026 = {
  'BFM-1': ['AAM-06', 'SA-6'], 'INT-1': ['AHC-1', 'INT(S)-4'], 'ACM-1': ['AAM-10', 'BFM-7'],
  'LASDT-3': ['TI-1'], 'SAT-1': ['DCA-1', 'SAT(S)-2'], 'SAT(S)-1': ['DCA(S)-1', 'ST-15'],
  'SA-2': ['SA(S)-3', 'SA-1'], 'SA-3': ['SA(S)-4', 'SA-2'], 'SA-4': ['SA(S)-5', 'SA-3'],
  'TR(S)-7': ['TR(S)-LAO'], 'ST-18': ['SAT-2', 'SATN-1'], 'AGW-01': ['T-12'],
};
const by26 = Object.fromEntries(SYLLABI['2026'].map(e => [e.id, e]));
const wrong = Object.entries(CHART_2026).filter(([id, want]) =>
  JSON.stringify((by26[id]?.prereqs || []).slice().sort()) !== JSON.stringify([...want].sort()));
ok('2026 prereqs match the course map', wrong.length === 0,
  wrong.map(([id]) => `${id}=[${(by26[id]?.prereqs || []).join(',')}]`).join(' | '));

console.log(`\n${pass} passed, ${fail} failed\n`);
await b.close();
stopServer();
if (KEEP && server) console.log(`preview left running at ${URL} (pid ${server.pid})`);
process.exit(fail ? 1 : 0);
