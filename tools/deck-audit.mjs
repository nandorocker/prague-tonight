/**
 * Renders every card of the current deck at real card size, measures overlaps
 * and overflow, and writes contact sheets.
 *
 *   node tools/deck-audit.mjs [--span 7] [--per 6] [--w 350] [--out shots/audit]
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const span = arg('span', '7');
const per = parseInt(arg('per', '6'), 10);
const W = parseInt(arg('w', '350'), 10);
const out = arg('out', 'shots/audit');
const fams = arg('fam', '');
const matrix = args.includes('--matrix');
const url = arg('url', 'http://127.0.0.1:5173/?now=2026-10-23T18:45');
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pt:span', s); }, span);
await page.reload({ waitUntil: 'networkidle0' });

const report = await page.evaluate(async ({ W, per, fams, matrix }) => {
  const { App } = await import('/src/app.ts');
  const { renderPoster } = await import('/src/posters/render.ts');
  const { fitDom } = await import('/src/posters/fit.ts');
  const app = new App();
  const cur = app.curation();
  document.body.innerHTML = '';
  document.body.style.cssText = 'background:#888;margin:0;overflow:auto;position:static;height:auto';
  document.documentElement.style.cssText = 'overflow:auto;height:auto';
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(3,${W}px);gap:14px;padding:14px;width:max-content`;
  document.body.append(grid);
  const rows = [];
  const { FAMILIES } = await import('/src/posters/assign.ts');
  const { ARTWORK_ASSETS } = await import('/src/posters/assets.ts');
  // --matrix: every event in every family it can render, bare and with rotating artwork
  const jobs = matrix
    ? [...new Map(cur.index.map((e) => [e.displayTitle ?? e.title, e])).values()].flatMap((e) => FAMILIES.flatMap((f, k) => [[e, f, 'none'], [e, f, ARTWORK_ASSETS[(hashN(e.id) + k) % ARTWORK_ASSETS.length].id]]))
    : cur.deck.map((e) => [e, cur.family.get(e.id), app.artworkOf(e)]);
  function hashN(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
  jobs.forEach(([e, fam, art], i) => {
    const r = renderPoster(e, fam, art);
    if (matrix && (r.family !== fam || (art !== 'none' && r.artwork === 'none'))) return;
    const cell = document.createElement('div');
    cell.style.cssText = `width:${W}px;position:relative`;
    cell.dataset.i = String(i);
    cell.innerHTML = r.html;
    const tag = document.createElement('div');
    tag.textContent = `${i + 1} ${r.family}${r.family !== fam ? ' (wanted ' + fam + ')' : ''} · ${art}`;
    tag.style.cssText = 'position:absolute;left:0;top:-12px;font:9px monospace;color:#fff';
    cell.append(tag);
    grid.append(cell);
    rows.push({ i, id: e.id, title: e.title, family: r.family, wanted: fam, art, e });
  });
  if (fams) { const keep = new Set(fams.split(',')); [...grid.children].forEach((c, k) => { if (!keep.has(rows[k].family)) c.remove(); }); rows.splice(0, rows.length, ...rows.filter((r) => keep.has(r.family))); }
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((res) => { im.onload = im.onerror = res; }))));
  fitDom(grid);
  await new Promise((r) => setTimeout(r, 300));

  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  const out = [];
  for (const row of rows) {
    const cell = grid.children[rows.indexOf(row)];
    const poster = cell.querySelector('.poster');
    const P = rect(poster);
    const issues = [];
    const q = (s) => poster.querySelector(s);
    const parts = {
      title: q('.p-title'), blurb: q('.p-blurb'), band: q('.p-band'), subject: q('.p-subject'), brand: q('.p-brand'),
    };
    const R = Object.fromEntries(Object.entries(parts).filter(([, v]) => v).map(([k, v]) => [k, rect(v)]));
    // Title: use the tight bounds of its lines
    if (parts.title) {
      const lns = [...parts.title.querySelectorAll('.ln')].map(rect);
      const tb = { x: Math.min(...lns.map((l) => l.x)), y: Math.min(...lns.map((l) => l.y)), r: Math.max(...lns.map((l) => l.r)), b: Math.max(...lns.map((l) => l.b)) };
      R.titleInk = { ...tb, w: tb.r - tb.x, h: tb.b - tb.y };
      const fs = parseFloat(getComputedStyle(parts.title).fontSize);
      row.titleLines = lns.length;
      row.titlePx = Math.round(fs);
      if (tb.x < P.x - 1 || tb.r > P.r + 1) issues.push(`title spills sideways (${Math.round(tb.x - P.x)}..${Math.round(tb.r - P.x)} of ${Math.round(P.w)})`);
      if (tb.b > P.b + 1) issues.push('title below poster');
      if (fs < W * 0.062) issues.push(`title small (${Math.round(fs)}px)`);
      if (lns.length > 5) issues.push(`title ${lns.length} lines`);
    } else issues.push('no title');
    if (!parts.blurb) issues.push('no blurb');
    if (parts.blurb) {
      const cs = getComputedStyle(parts.blurb);
      row.blurbPx = Math.round(parseFloat(cs.fontSize));
      if (parts.blurb.scrollHeight > parts.blurb.clientHeight + 1) issues.push('blurb clipped');
      // line-clamp hides overflow without scrollHeight noticing: compare against the unclamped height
      const before = parts.blurb.getBoundingClientRect().height;
      const keep = parts.blurb.style.cssText;
      parts.blurb.style.cssText += ';-webkit-line-clamp:unset;max-height:none;display:block;overflow:visible';
      const full = parts.blurb.getBoundingClientRect().height;
      parts.blurb.style.cssText = keep;
      if (full > before + 2) issues.push(`blurb truncated (${Math.round(before)}px of ${Math.round(full)}px)`);
      const lines = Math.round(rect(parts.blurb).h / parseFloat(cs.lineHeight));
      row.blurbLines = lines;
      if (lines > 4) issues.push(`blurb ${lines} lines`);
    }
    if (parts.band) {
      for (const el of parts.band.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') issues.push(`band ${el.className} overflows`);
      }
      if (R.band.b > P.b + 1 || R.band.r > P.r + 1) issues.push('band outside poster');
    }
    const pairs = [['titleInk', 'blurb'], ['titleInk', 'band'], ['titleInk', 'subject'], ['blurb', 'band'], ['blurb', 'subject'], ['subject', 'band'], ['titleInk', 'brand'], ['subject', 'brand']];
    for (const [a, b] of pairs) {
      if (R[a] && R[b]) {
        const area = inter(R[a], R[b]);
        if (area > 12) issues.push(`${a}×${b} overlap ${Math.round(area)}px²`);
      }
    }
    // image broken?
    for (const im of poster.querySelectorAll('img')) if (!im.naturalWidth) issues.push('broken image ' + im.src);
    row.issues = issues;
    row.text = parts.blurb?.textContent ?? '';
    delete row.e;
    out.push(row);
  }
  return out;
}, { W, per, fams, matrix });

// Contact sheets
const total = report.length;
const sheets = matrix ? 0 : Math.ceil(total / per);
for (let s = 0; s < sheets; s++) {
  const clip = await page.evaluate(({ s, per, W }) => {
    const cells = [...document.querySelector('div').children].slice(s * per, (s + 1) * per);
    const rs = cells.map((c) => c.getBoundingClientRect());
    const x = Math.min(...rs.map((r) => r.left)) - 6 + scrollX;
    const y = Math.min(...rs.map((r) => r.top)) - 18 + scrollY;
    return { x, y, width: Math.max(...rs.map((r) => r.right)) + 6 + scrollX - x, height: Math.max(...rs.map((r) => r.bottom)) + 6 + scrollY - y };
  }, { s, per, W });
  await page.screenshot({ path: `${out}/sheet-${String(s + 1).padStart(2, '0')}.png`, clip, captureBeyondViewport: true });
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
const byFam = {};
for (const r of report) byFam[r.family] = (byFam[r.family] ?? 0) + 1;
console.log(`cards: ${total}; sheets: ${sheets}`);
console.log('families:', JSON.stringify(byFam));
console.log('artwork:', JSON.stringify(report.reduce((a, r) => ((a[r.art === 'none' ? 'none' : 'img'] = (a[r.art === 'none' ? 'none' : 'img'] ?? 0) + 1), a), {})));
if (matrix) {
  const groups = new Map();
  for (const r of report) for (const i of r.issues) {
    const key = `${r.family}${r.art === 'none' ? '' : '+art'} · ${i.replace(/[0-9.]+/g, '#')}`;
    const g = groups.get(key) ?? { n: 0, ex: r.title };
    g.n++;
    groups.set(key, g);
  }
  console.log(`matrix: ${total} posters rendered`);
  for (const [k, g] of [...groups].sort()) console.log(`${String(g.n).padStart(4)}  ${k}   e.g. ${g.ex.slice(0, 40)}`);
}
const bad = matrix ? [] : report.filter((r) => r.issues.length);
console.log(`cards with issues: ${bad.length}`);
for (const r of bad) console.log(`#${r.i + 1} [${r.family}] ${r.title.slice(0, 40)} → ${r.issues.join('; ')}`);
await browser.close();
