import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4219;
const URL = `http://localhost:${PORT}/Tracker/`;
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-Tracker/bc1fa94c-9f90-56a7-a556-98f91a5d9fc1/scratchpad';
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: '/home/user/Tracker', stdio: 'ignore', env: { ...process.env, GITHUB_PAGES: 'true' } });
const wait = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 50; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch (_) {} await wait(200); }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport: { width: 1700, height: 1300 } });
pg.on('pageerror', e => console.log('JS ERROR:', e.message));
await pg.goto(URL, { waitUntil: 'networkidle' });
await wait(1000);
await pg.evaluate(label => {
  let sel = null, val = null;
  for (const s of document.querySelectorAll('select'))
    for (const o of s.options) if (o.textContent.trim() === label) { sel = s; val = o.value; }
  sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true }));
}, 'A/G - A/A 2026');
await wait(1500);
const dims = await pg.evaluate(() => {
  const svg = document.querySelector('svg');
  let el = svg.parentElement;
  while (el && el.scrollHeight <= el.clientHeight + 5) el = el.parentElement;
  window.__scroller = el;
  return { h: svg.getBoundingClientRect().height, balls: document.querySelectorAll('g.ball').length };
});
console.log('chart:', JSON.stringify(dims));
const step = 1100;
const bands = Math.ceil(dims.h / step);
for (let i = 0; i < bands; i++) {
  await pg.evaluate(y => { window.__scroller.scrollTop = y; }, i * step);
  await wait(250);
  await pg.screenshot({ path: `${OUT}/agaa-wide-${String(i).padStart(2, '0')}.png` });
}
console.log('bands:', bands);
await b.close(); server.kill();
