/**
 * Headless smoke test / screenshot tool.
 *
 *   node tools/screenshot.mjs --url http://127.0.0.1:5173/ --out shots/deck.png
 *                             [--w 390] [--h 844] [--wait 800] [--steps '<js>;;<js>']
 *
 * Loads the app at phone size, optionally runs page-side JS steps separated
 * by ";;" (each followed by a short wait), forwards console errors and writes
 * a screenshot. A step of the form SHOT:path writes an intermediate
 * screenshot. Pass --full to capture the whole scroll height.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const url = arg('url', 'http://127.0.0.1:5173/');
const out = arg('out', 'shots/frame.png');
const wait = parseInt(arg('wait', '800'), 10);
const steps = (arg('steps', '') || '').split(';;').filter(Boolean);
const width = parseInt(arg('w', '390'), 10);
const height = parseInt(arg('h', '844'), 10);
const full = args.includes('--full');
const keepStorage = args.includes('--keep');

mkdirSync(dirname(out), { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
if (!keepStorage) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
}
await new Promise((r) => setTimeout(r, wait));
for (const s of steps) {
  // "SHOT:path" captures an intermediate screenshot.
  if (s.trim().startsWith('SHOT:')) {
    await page.screenshot({ path: s.trim().slice(5), fullPage: full });
    console.log(`wrote ${s.trim().slice(5)}`);
    continue;
  }
  const res = await page.evaluate(s);
  if (res !== undefined) console.log('step →', JSON.stringify(res));
  await new Promise((r) => setTimeout(r, wait));
}
await page.screenshot({ path: out, fullPage: full });
for (const l of logs) console.log(l);
console.log(`wrote ${out}`);
await browser.close();
