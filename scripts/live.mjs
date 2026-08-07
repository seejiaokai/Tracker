/*
 * Open the *deployed* app (GitHub Pages) in a real browser and report what it finds.
 *
 *   npm run live                       load it, print a health summary, screenshot
 *   npm run live -- --shot out.png     choose where the screenshot lands
 *   npm run live -- --syllabus "2026"  switch syllabus before shooting
 *   LIVE_URL=… npm run live            point at somewhere else
 *
 * This is the deployed artifact, not a local build — it only ever shows the last
 * commit that finished publishing. Use `npm run smoke` for unpushed work.
 *
 * Leaving the container needs two settings Chromium does not arrive with:
 *   1. the egress proxy passed in explicitly, else ERR_CERT_AUTHORITY_INVALID
 *   2. --ssl-version-max=tls1.2 — the proxy resets Chromium's TLS 1.3 handshake
 * Certificate verification stays on throughout; neither of these weakens it.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};

const URL = process.env.LIVE_URL || 'https://seejiaokai.github.io/Tracker/';
const SHOT = flag('shot', 'live.png');
const SYLLABUS = flag('syllabus', null);
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;

const execPath = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const b = await chromium.launch({
  ...(execPath ? { executablePath: execPath } : {}),
  ...(PROXY ? { proxy: { server: PROXY } } : {}),
  args: ['--ssl-version-max=tls1.2'],
});
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });

const errs = [], bad = [];
const EXPECTED_404 = /_api\/(web|contextinfo)/;   // SharePoint probes, 404 by design
pg.on('pageerror', e => errs.push(e.message));
pg.on('requestfailed', r => { if (!EXPECTED_404.test(r.url())) bad.push(`FAILED ${r.url()}`); });
pg.on('response', r => { if (r.status() >= 400 && !EXPECTED_404.test(r.url())) bad.push(`${r.status()} ${r.url()}`); });

console.log(`loading ${URL}${PROXY ? ' via ' + PROXY : ''} …`);
let res;
try {
  res = await pg.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
} catch (e) {
  console.error(`\ncould not reach the deployed site: ${e.message.split('\n')[0]}`);
  console.error('If this is ERR_CONNECTION_RESET or a cert error, the session-start hook did not run;');
  console.error('if it is a 403 on CONNECT, the environment\'s network policy does not allow *.github.io.');
  await b.close();
  process.exit(1);
}

if (SYLLABUS) {
  await pg.selectOption('#sylSel', { label: SYLLABUS }).catch(async () => {
    // The syllabus <select> has no stable id in every build; fall back to matching by option text.
    await pg.evaluate(label => {
      const sel = [...document.querySelectorAll('select')]
        .find(s => [...s.options].some(o => o.textContent.trim() === label));
      if (!sel) throw new Error(`no syllabus called "${label}"`);
      sel.value = [...sel.options].find(o => o.textContent.trim() === label).value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, SYLLABUS);
  });
  await pg.waitForTimeout(1200);   // let the board re-render and its scroll settle
}
await pg.waitForTimeout(1500);

const info = await pg.evaluate(() => ({
  title: document.title,
  heading: document.querySelector('h1')?.textContent?.trim(),
  syllabus: [...document.querySelectorAll('select')]
    .map(s => s.options[s.selectedIndex]?.textContent?.trim()).filter(Boolean),
  boardEls: document.querySelectorAll('#board svg *').length,
}));

console.log(`\nHTTP ${res.status()}   ${info.title}`);
console.log(`heading:   ${info.heading}`);
console.log(`selects:   ${info.syllabus.join(' · ')}`);
console.log(`board:     ${info.boardEls} svg elements`);
console.log(`js errors: ${errs.length ? '\n  ' + errs.join('\n  ') : 'none'}`);
console.log(`bad reqs:  ${bad.length ? '\n  ' + bad.join('\n  ') : 'none'}`);

await pg.screenshot({ path: SHOT, fullPage: false });
console.log(`\nscreenshot: ${SHOT}`);
await b.close();

const healthy = res.status() === 200 && info.boardEls > 0 && !errs.length && !bad.length;
process.exit(healthy ? 0 : 1);
