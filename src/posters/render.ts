/**
 * The poster engine: eight small design grammars plus a plain fallback.
 *
 * Each grammar picks a palette, motif and composition from a seed tied to the
 * event and family, so a poster is stable across refreshes and can be
 * regenerated from its record. Decoration is SVG in a 100×140 viewBox; text is
 * HTML positioned in container units (1cqw = 1% of poster width, the poster is
 * 140cqw tall). Facts always come from the event record, never from the art.
 */
import type { FamilyId, PragueEvent } from '../types';
import { CATEGORY_LABEL, esc, priceText, upper } from '../core/format';
import { hash, rng, type Rng } from '../core/rng';
import { clock, dayLabel, numericDate, shortDate, weekdayShort } from '../core/time';
import { posterTitle, setFitCheck } from './assign';
import { fitTitle, type FitOptions } from './fit';

export const COLOR = {
  ink: '#191919',
  cream: '#F4EEDD',
  paper: '#E6DCC4',
  orange: '#FF5A3C',
  yellow: '#F0E14A',
  cobalt: '#2350D0',
  cyan: '#74E8FF',
  navy: '#14152E',
  pink: '#FF7DBB',
  lime: '#C8F25A',
  green: '#1E8C5A',
  red: '#E8352B',
  violet: '#6B4EFF',
  mint: '#9FE3C8',
  magenta: '#FF5FD2',
};
const K = COLOR;

interface Facts {
  when: string;
  /** Calendar day of the start ("FRI 23 OCT"); after midnight that's the next day. */
  date: string;
  time: string;
  kind: string;
  price: string;
  day: string;
  dd: string;
  ddmm: string;
  mon: string;
  weekday: string;
  issue: string;
  late: boolean;
}

interface Ctx {
  e: PragueEvent;
  r: Rng;
  f: Facts;
  title: string;
  uid: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function factsOf(e: PragueEvent): Facts {
  const night = e.night ?? e.start?.slice(0, 10) ?? '2000-01-01';
  const startDay = e.start?.slice(0, 10);
  const hour = e.start ? Number(e.start.slice(11, 13)) : 19;
  let when = e.start ? clock(e.start) : 'TIME TBC';
  // After-midnight starts name their calendar day to avoid misreading.
  if (e.start && startDay !== night) when = `${weekdayShort(startDay!)} ${when}`;
  const [y, m, d] = night.split('-').map(Number);
  const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const genre = e.genre && e.genre.length <= 18 ? e.genre : CATEGORY_LABEL[e.category];
  // Facts are interpolated into markup; escape every one of them.
  return {
    when,
    date: dayLabel(startDay ?? night),
    time: e.start ? clock(e.start) : 'TIME TBC',
    kind: upper(genre),
    price: upper(priceText(e.price)),
    day: esc(`${weekdayShort(night)} ${upper(shortDate(night))}`),
    dd: esc(night.slice(8)),
    ddmm: esc(numericDate(night)),
    mon: esc(upper(shortDate(night).split(' ')[1] ?? '')),
    weekday: esc(weekdayShort(night)),
    issue: String(doy).padStart(3, '0'),
    late: hour >= 21 || hour < 5,
  };
}

/** The brand sign: an eight-arm asterisk, drawn so no font can swap it. */
export function star(color = 'currentColor', size = '0.9em'): string {
  const arms = [0, 45, 90, 135]
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      const dx = Math.cos(rad) * 10;
      const dy = Math.sin(rad) * 10;
      return `<line x1="${(12 - dx).toFixed(2)}" y1="${(12 - dy).toFixed(2)}" x2="${(12 + dx).toFixed(2)}" y2="${(12 + dy).toFixed(2)}"/>`;
    })
    .join('');
  return `<svg class="star" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><g stroke="${color}" stroke-width="2.6" stroke-linecap="square">${arms}</g></svg>`;
}

function title(text: string, box: Box, o: Partial<FitOptions> & { cls?: string; lineCls?: (i: number) => string; style?: string }): string | null {
  const fit = fitTitle(text, {
    w: box.w,
    h: box.h,
    charW: o.charW ?? 0.47,
    lineH: o.lineH ?? 0.98,
    max: o.max ?? 30,
    min: o.min ?? 8,
    maxLines: o.maxLines ?? 4,
  });
  if (!fit.ok) return null;
  const lines = fit.lines
    .map((l, i) => `<span class="ln ${o.lineCls?.(i) ?? ''}">${esc(l)}</span>`)
    .join('');
  return `<div class="p-title ${o.cls ?? ''}" data-w="${box.w}" data-h="${box.h}" style="left:${box.x}cqw;top:${box.y}cqw;width:${box.w}cqw;font-size:${fit.size}cqw;${o.style ?? ''}" aria-hidden="true">${lines}</div>`;
}

function svg(body: string, defs = ''): string {
  return `<svg class="decor" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

interface BandStyle {
  fg: string;
  accent: string;
  /** Filled box behind the band; without it the band sits on a rule. */
  bg?: string;
  font?: 'cond' | 'serif' | 'ui';
  /** Side inset in cqw. */
  x: number;
}

/**
 * The info band: the same facts in the same order and place on every poster
 * (date and time, then venue and price), styled by the family.
 */
function band(c: Ctx, o: BandStyle): string {
  const { e, f } = c;
  const venue = e.venue?.name ?? 'Venue TBC';
  const district = e.venue?.district && e.venue.district !== venue ? e.venue.district : '';
  return `<div class="p-band band-${o.font ?? 'ui'} ${o.bg ? 'boxed' : 'ruled'}" style="left:${o.x}cqw;right:${o.x}cqw;--b-fg:${o.fg};--b-ac:${o.accent};${o.bg ? `--b-bg:${o.bg}` : ''}">
    <div class="b-when">${esc(f.date)} · ${esc(f.time)}</div>
    <div class="b-where"><span class="b-venue">${esc(venue)}${district ? `<span class="b-district"> · ${esc(district)}</span>` : ''}</span><span class="b-price">${esc(f.price)}</span></div>
  </div>`;
}

/**
 * The blurb is the free element: each family places and dresses it in its
 * own way (a sticker, a serif column, a grid cell…), clamped to a few lines.
 */
function blurb(c: Ctx, style: string, cls = '', lines = 3): string {
  const text = c.e.blurb ?? c.e.description;
  return text ? `<p class="p-blurb ${cls}" style="${style};-webkit-line-clamp:${lines}">${esc(text)}</p>` : '';
}

function hatch(id: string, color: string, opacity: number, spacing = 5, angle = 30, width = 0.5): string {
  return `<pattern id="${id}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><line x1="0" y1="0" x2="0" y2="${spacing}" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/></pattern>`;
}

function rings(cx: number, cy: number, n: number, r0: number, step: number, color: string, width: number, extra = ''): string {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r0 + i * step).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
  return s;
}

const f1 = (n: number) => n.toFixed(1);

// ─── 01 Acid Flyer ─────────────────────────────────────────────────────────────
function acid(c: Ctx): string | null {
  const { r, f } = c;
  const pal = r.pick([
    { bg: K.orange, box: K.yellow },
    { bg: K.pink, box: K.lime },
    { bg: K.lime, box: K.orange },
    { bg: K.yellow, box: K.orange },
  ]);
  const cx = r.range(35, 72);
  const cy = r.range(24, 40);
  const n = r.int(4, 7);
  const slantUp = r.chance(0.5);
  const ty = r.range(66, 74);
  const poly = slantUp
    ? `0,${f1(ty + 8)} 100,${f1(ty - 6)} 100,${f1(ty + 30)} 0,${f1(ty + 40)}`
    : `0,${f1(ty - 6)} 100,${f1(ty + 6)} 100,${f1(ty + 36)} 0,${f1(ty + 30)}`;
  const art = svg(`<rect width="100" height="140" fill="url(#h${c.uid})"/>${rings(cx, cy, n, 4, 5.4, K.ink, 1.7)}<polygon points="${poly}" fill="${K.ink}"/>`,
    hatch(`h${c.uid}`, K.ink, 0.18, 6, r.pick([25, 35, -30]), 0.4),
  );
  const t = title(upper(c.title), { x: 4, y: 38, w: 90, h: 60 }, {
    cls: 'fx-cond fx-boxes',
    lineCls: (i) => (i % 2 ? 'box-ink' : 'box-cream'),
    lineH: 1.06,
    charW: 0.5,
    max: 26,
    min: 11,
    maxLines: 3,
  });
  if (!t) return null;
  return wrap(c, 'acid', `--bg:${pal.bg}`, `${art}
    <div class="p-brand bar" style="background:${K.ink};color:${K.cream}"><span>PRAGUE TONIGHT ${star()} ISSUE ${f.issue}</span><span>${f.day}</span></div>
    ${t}
    ${blurb(c, `left:5cqw;top:100cqw;width:72cqw;transform:rotate(${f1(r.range(-3.5, -1.5))}deg);background:${K.cream};color:${K.ink}`, 'bl-sticker')}
    ${band(c, { bg: pal.box, fg: K.ink, accent: K.ink, font: 'cond', x: 4 })}`);
}

// ─── 02 Editorial ──────────────────────────────────────────────────────────────
function editorial(c: Ctx): string | null {
  const { r, f } = c;
  const accent = r.pick([K.orange, K.cobalt, K.green, K.red]);
  const bx = r.pick([58, 62, 8]);
  const by = r.range(16, 22);
  const bw = r.range(28, 34);
  const bh = r.range(26, 34);
  const stripes = r.int(6, 11);
  const motif = r.pick(['stripes', 'solid-dot', 'solid']);
  let block = `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="${accent}"/>`;
  if (motif === 'stripes') {
    for (let i = 1; i < stripes; i++) {
      const x = bx + (bw / stripes) * i;
      block += `<line x1="${f1(x)}" y1="${f1(by)}" x2="${f1(x)}" y2="${f1(by + bh)}" stroke="${K.ink}" stroke-width="0.5"/>`;
    }
  } else if (motif === 'solid-dot') {
    block += `<circle cx="${f1(bx + bw / 2)}" cy="${f1(by + bh / 2)}" r="${f1(Math.min(bw, bh) * 0.28)}" fill="${K.cream}"/>`;
  }
  const kickerLeft = bx < 30 ? 50 : 8;
  const art = svg(`<line x1="8" y1="11" x2="92" y2="11" stroke="${K.ink}" stroke-width="0.4"/>${block}`);
  const t = title(upper(c.title), { x: 8, y: 56, w: 84, h: 44 }, {
    cls: 'fx-serif',
    charW: 0.66,
    lineH: 1.08,
    max: 15,
    min: 6,
    maxLines: 5,
  });
  if (!t) return null;
  const weekdayName = { SUN: 'SUNDAY', MON: 'MONDAY', TUE: 'TUESDAY', WED: 'WEDNESDAY', THU: 'THURSDAY', FRI: 'FRIDAY', SAT: 'SATURDAY' }[f.weekday];
  return wrap(c, 'editorial', `--bg:${K.cream}`, `${art}
    <div class="p-brand line" style="color:${K.ink}"><span>PRAGUE TONIGHT</span><span>${f.dd} / ${f.ddmm.slice(3)}</span></div>
    <div class="p-kicker serif" style="left:${kickerLeft}cqw;top:22cqw;color:${K.ink}">${weekdayName}’S<br>${esc(upper(CATEGORY_LABEL[c.e.category]))}</div>
    ${t}
    ${blurb(c, `left:${kickerLeft}cqw;top:34cqw;width:${bx < 30 ? 42 : 44}cqw;color:${K.ink}`, 'bl-serif', 5)}
    ${band(c, { fg: K.ink, accent, font: 'serif', x: 8 })}`);
}

// ─── 03 Swiss Grid ─────────────────────────────────────────────────────────────
function swiss(c: Ctx): string | null {
  const { r, f } = c;
  const accent = r.pick([K.cobalt, K.red, K.green, K.orange]);
  const cols = r.pick([3, 4]);
  const rows = [18, r.pick([48, 56, 64]), 98];
  let grid = '';
  for (let i = 1; i < cols; i++) grid += `<line x1="${f1((100 / cols) * i)}" y1="0" x2="${f1((100 / cols) * i)}" y2="140" stroke="#CFCBBE" stroke-width="0.3"/>`;
  for (const y of rows) grid += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="#CFCBBE" stroke-width="0.3"/>`;
  const cw = 100 / cols;
  const barCol = r.int(0, cols - 1);
  const barY = r.pick([84, 88]);
  const bar = `<rect x="${f1(barCol * cw + 1)}" y="${barY}" width="${f1(cw - 2)}" height="6" fill="${accent}"/>`;
  let nums = '';
  for (let i = 0; i < cols; i++) nums += `<text x="${f1(i * cw + 1.2)}" y="${rows[2] - 1.5}" font-size="2.4" fill="#9C978A" font-family="Fira Sans, sans-serif">${String(i + 1).padStart(2, '0')}</text>`;
  const art = svg(`<rect x="${f1(100 - cw)}" y="0" width="${f1(cw)}" height="18" fill="${accent}"/>${grid}${bar}${nums}`);
  const t = title(upper(c.title), { x: 2, y: 30, w: 95, h: 52 }, {
    cls: 'fx-cond',
    charW: 0.48,
    lineH: 0.98,
    max: 22,
    min: 8,
    maxLines: 5,
  });
  if (!t) return null;
  return wrap(c, 'swiss', '--bg:#F7F4EC', `${art}
    <div class="p-brand swiss" style="color:${K.ink}">PT—${f.dd}</div>
    <div class="p-brand swiss-date" style="right:0;width:${f1(cw)}cqw;color:${K.cream}">${f.ddmm}</div>
    <div class="p-label" style="left:2cqw;top:21cqw;color:${accent}">${esc(upper(CATEGORY_LABEL[c.e.category]))} / ${esc(f.kind)}</div>
    ${t}
    ${blurb(c, `left:2cqw;top:101cqw;width:64cqw;color:${K.ink}`, 'bl-grid')}
    ${band(c, { fg: K.ink, accent, font: 'cond', x: 2 })}`);
}

// ─── 04 Geometric ──────────────────────────────────────────────────────────────
function geo(c: Ctx): string | null {
  const { r, f } = c;
  const pal = r.pick([
    { bg: K.yellow, a: K.orange, b: K.cobalt },
    { bg: K.mint, a: K.pink, b: K.violet },
    { bg: '#FFC2DA', a: K.orange, b: K.cobalt },
    { bg: K.cream, a: K.cobalt, b: K.orange },
  ]);
  const cx = r.range(55, 85);
  const cy = r.range(22, 38);
  const rad = r.range(28, 40);
  const tri = r.chance(0.5)
    ? `${f1(r.range(10, 30))},${f1(r.range(52, 62))} ${f1(r.range(55, 70))},${f1(r.range(36, 46))} ${f1(r.range(80, 95))},${f1(r.range(84, 96))}`
    : `0,${f1(r.range(60, 70))} ${f1(r.range(40, 60))},${f1(r.range(30, 40))} 100,${f1(r.range(54, 64))} 100,${f1(r.range(88, 96))}`;
  const art = svg(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}" fill="${pal.a}"/><polygon points="${tri}" fill="${pal.b}"/><circle cx="${f1(r.range(10, 30))}" cy="${f1(r.range(30, 46))}" r="${f1(r.range(18, 26))}" fill="none" stroke="${K.ink}" stroke-width="1.4"/>`,
  );
  const t = title(upper(c.title), { x: 4, y: 44, w: 90, h: 50 }, {
    cls: 'fx-cond fx-boxes',
    lineCls: () => 'box-cream',
    charW: 0.5,
    lineH: 1.12,
    max: 17,
    min: 7,
    maxLines: 4,
  });
  if (!t) return null;
  return wrap(c, 'geo', `--bg:${pal.bg}`, `${art}
    <div class="p-brand bar" style="background:${K.ink};color:${K.cream}"><span>PRAGUE TONIGHT ${star()} ${f.dd} ${f.mon}</span><span>${f.weekday}</span></div>
    ${t}
    ${blurb(c, `right:4cqw;top:97cqw;width:62cqw;text-align:right;color:${K.ink}`, 'bl-bold')}
    ${band(c, { bg: K.ink, fg: K.cream, accent: pal.bg, font: 'cond', x: 4 })}`);
}

// ─── 05 After Hours ────────────────────────────────────────────────────────────
function afterhours(c: Ctx): string | null {
  const { r, f } = c;
  const accent = r.pick([K.cyan, K.magenta, K.lime, K.orange]);
  const motif = r.pick(['rings', 'waves', 'rays']);
  let grid = '';
  for (let x = 7; x < 100; x += 7) grid += `<line x1="${x}" y1="0" x2="${x}" y2="140" stroke="${accent}" stroke-opacity="0.1" stroke-width="0.25"/>`;
  for (let y = 7; y < 140; y += 7) grid += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${accent}" stroke-opacity="0.1" stroke-width="0.25"/>`;
  const cx = r.range(40, 66);
  const cy = r.range(50, 64);
  let m = '';
  if (motif === 'rings') m = rings(cx, cy, r.int(8, 12), 6, 2.6, accent, 0.45, `filter="url(#g${c.uid})"`);
  else if (motif === 'waves') {
    const amp = r.range(3, 6);
    const freq = r.range(0.06, 0.11);
    for (let i = 0; i < 12; i++) {
      let d = '';
      for (let x = 0; x <= 100; x += 2) d += `${x ? 'L' : 'M'}${x},${f1(30 + i * 4 + Math.sin(x * freq + i * 0.5) * amp)}`;
      m += `<path d="${d}" fill="none" stroke="${accent}" stroke-width="0.45" stroke-opacity="${(0.35 + i * 0.05).toFixed(2)}" filter="url(#g${c.uid})"/>`;
    }
  } else {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      m += `<line x1="${f1(cx + Math.cos(a) * 8)}" y1="${f1(cy + Math.sin(a) * 8)}" x2="${f1(cx + Math.cos(a) * 34)}" y2="${f1(cy + Math.sin(a) * 34)}" stroke="${accent}" stroke-width="0.4" filter="url(#g${c.uid})"/>`;
    }
  }
  const art = svg(`${grid}${m}`, `<filter id="g${c.uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
  const t = title(upper(c.title), { x: 6, y: 56, w: 88, h: 44 }, {
    cls: 'fx-cond fx-glow',
    charW: 0.48,
    lineH: 0.98,
    max: 22,
    min: 8,
    maxLines: 4,
  });
  if (!t) return null;
  return wrap(c, 'afterhours', `--bg:${K.navy}`, `${art}
    <div class="p-brand glow" style="color:${accent}">PRAGUE / TONIGHT<small style="color:${K.cream}">${f.weekday} ${f.ddmm} ${star()}</small></div>
    ${t}
    ${blurb(c, `left:6cqw;top:19cqw;width:56cqw;color:${accent}`, 'bl-glow', 4)}
    ${band(c, { fg: K.cream, accent, font: 'cond', x: 6 })}`);
}

// ─── 06 Type Wall ──────────────────────────────────────────────────────────────
function typewall(c: Ctx): string | null {
  const { r, f } = c;
  const pal = r.pick([
    { bg: K.orange, hi: K.yellow },
    { bg: K.cobalt, hi: K.yellow },
    { bg: K.yellow, hi: K.orange },
    { bg: K.red, hi: K.cream },
  ]);
  const words = upper(c.title).split(/\s+/);
  // Prefer one word per line, joining tiny words onto the next.
  const art = svg(`<rect width="100" height="140" fill="url(#h${c.uid})"/>`, hatch(`h${c.uid}`, K.ink, 0.22, 4.5, r.pick([20, 28, -25]), 0.35));
  const t = title(words.join(' '), { x: 3, y: 17, w: 92, h: 70 }, {
    cls: 'fx-cond fx-boxes fx-wall',
    lineCls: (i) => (i % 2 ? 'box-ink' : 'box-cream'),
    charW: 0.5,
    lineH: 1.08,
    max: 34,
    min: 12,
    maxLines: Math.min(4, words.length),
  });
  if (!t) return null;
  return wrap(c, 'typewall', `--bg:${pal.bg}`, `${art}
    <div class="p-brand bar inset" style="background:${K.ink};color:${K.cream}"><span>PT ${star()} ${f.dd} ${f.mon} / PRAGUE</span></div>
    ${t}
    <div class="p-label big" style="left:4cqw;top:93cqw;color:${pal.bg === K.cobalt || pal.bg === K.red ? K.cream : K.ink}">${esc(f.kind)}</div>
    ${blurb(c, `left:4cqw;top:100cqw;width:90cqw;color:${pal.bg === K.cobalt || pal.bg === K.red ? K.cream : K.ink}`, 'bl-bold')}
    ${band(c, { bg: K.ink, fg: K.cream, accent: pal.hi, font: 'cond', x: 3 })}`);
}

// ─── 07 Quiet Signal ───────────────────────────────────────────────────────────
function quiet(c: Ctx): string | null {
  const { r, f } = c;
  const dark = f.late && r.chance(0.6);
  const bg = dark ? '#1E1E1C' : r.pick([K.cream, '#EEF0EA', '#F2E9E4']);
  const fg = dark ? K.cream : K.ink;
  const accent = r.pick([K.orange, K.cobalt, K.red, K.green]);
  const sx = r.range(72, 84);
  const sy = r.range(24, 32);
  const sign = r.pick(['circlex', 'asterisk', 'half', 'triangle', 'dot']);
  let s = '';
  if (sign === 'circlex') s = `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="6" fill="none" stroke="${accent}" stroke-width="1.6"/><path d="M${f1(sx - 3.6)},${f1(sy - 3.6)}L${f1(sx + 3.6)},${f1(sy + 3.6)}M${f1(sx + 3.6)},${f1(sy - 3.6)}L${f1(sx - 3.6)},${f1(sy + 3.6)}" stroke="${accent}" stroke-width="1.6"/>`;
  else if (sign === 'asterisk') for (let a = 0; a < 180; a += 45) {
    const dx = Math.cos((a * Math.PI) / 180) * 6;
    const dy = Math.sin((a * Math.PI) / 180) * 6;
    s += `<line x1="${f1(sx - dx)}" y1="${f1(sy - dy)}" x2="${f1(sx + dx)}" y2="${f1(sy + dy)}" stroke="${accent}" stroke-width="1.4"/>`;
  }
  else if (sign === 'half') s = `<path d="M${f1(sx - 6)},${f1(sy)} A6,6 0 0 1 ${f1(sx + 6)},${f1(sy)} Z" fill="${accent}"/><line x1="${f1(sx - 8)}" y1="${f1(sy + 2)}" x2="${f1(sx + 8)}" y2="${f1(sy + 2)}" stroke="${accent}" stroke-width="0.8"/>`;
  else if (sign === 'triangle') s = `<polygon points="${f1(sx)},${f1(sy - 6)} ${f1(sx + 6)},${f1(sy + 5)} ${f1(sx - 6)},${f1(sy + 5)}" fill="none" stroke="${accent}" stroke-width="1.4"/>`;
  else s = `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="3.2" fill="${accent}"/>`;
  const art = svg(`<line x1="8" y1="13" x2="92" y2="13" stroke="${fg}" stroke-width="0.35"/>${s}`);
  const t = title(upper(c.title), { x: 8, y: 58, w: 84, h: 42 }, {
    cls: 'fx-serif',
    charW: 0.66,
    lineH: 1.04,
    max: 14,
    min: 5.5,
    maxLines: 5,
  });
  if (!t) return null;
  const kicker = f.late ? `LATE ON ${f.weekday}` : `${f.weekday} EVENING`;
  return wrap(c, 'quiet', `--bg:${bg}`, `${art}
    <div class="p-brand quiet" style="color:${fg}"><span class="serif">P&#8202;T</span><span>${f.dd} / ${f.mon}</span></div>
    <div class="p-kicker serif small" style="left:8cqw;top:51cqw;color:${fg}">${kicker}</div>
    ${t}
    ${blurb(c, `left:8cqw;top:20cqw;width:56cqw;color:${fg}`, 'bl-serif bl-big', 4)}
    ${band(c, { fg, accent, font: 'serif', x: 8 })}`, fg);
}

// ─── 08 Street Collage ─────────────────────────────────────────────────────────
function collage(c: Ctx): string | null {
  const { r, f } = c;
  const papers = [K.cobalt, K.orange, K.yellow, K.pink, K.green, K.cream];
  const top = r.pick([K.cobalt, K.green, K.pink]);
  const mid = r.pick(papers.filter((p) => p !== top && p !== K.yellow && p !== K.cream));
  const low = K.yellow;
  const rot = () => f1(r.range(-3.5, 3.5));
  const sheet = (x: number, y: number, w: number, h: number, color: string, extra = '') =>
    `<g transform="rotate(${rot()} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${extra}/></g>`;
  const art = svg(`<rect width="100" height="140" fill="${K.paper}"/>
     ${sheet(4, r.range(2, 6), 92, 44, top)}
     ${sheet(2, 44, 96, 50, mid)}
     ${sheet(3, 90, 94, 32, low)}
     <rect x="${f1(r.range(60, 80))}" y="${f1(r.range(14, 30))}" width="22" height="22" fill="url(#d${c.uid})"/>
     <rect width="100" height="140" filter="url(#n${c.uid})" opacity="0.18"/>`,
    `<pattern id="d${c.uid}" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.55" fill="${K.ink}" fill-opacity="0.5"/></pattern>
     <filter id="n${c.uid}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${hash(c.e.id) % 997}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0"/></filter>`,
  );
  const t = title(upper(c.title), { x: 5, y: 50, w: 86, h: 40 }, {
    cls: 'fx-cond fx-alt',
    lineCls: (i) => (i % 2 ? 'tx-ink' : 'tx-cream'),
    charW: 0.48,
    lineH: 0.98,
    max: 20,
    min: 8,
    maxLines: 4,
    style: `transform:rotate(${f1(r.range(-2.5, 1))}deg)`,
  });
  if (!t) return null;
  return wrap(c, 'collage', `--bg:${K.paper}`, `${art}
    <div class="p-brand plain" style="left:8cqw;top:6cqw;color:${K.cream}">PRAGUE TONIGHT / ${f.dd}.${f.ddmm.slice(3)} ${star()}</div>
    ${t}
    ${blurb(c, `left:8cqw;top:14cqw;width:54cqw;transform:rotate(${f1(r.range(1, 3))}deg);background:${K.cream};color:${K.ink}`, 'bl-sticker', 4)}
    ${band(c, { bg: K.ink, fg: K.cream, accent: K.yellow, font: 'cond', x: 6 })}`);
}

// ─── Fallback: robust plain typography ─────────────────────────────────────────
function plain(c: Ctx): string {
  const { r, f } = c;
  const dark = r.chance(0.5);
  const bg = dark ? K.ink : K.cream;
  const fg = dark ? K.cream : K.ink;
  const accent = r.pick([K.orange, K.yellow, K.cyan]);
  const art = svg(`<rect x="0" y="0" width="100" height="3" fill="${accent}"/>`);
  const fit =
    title(c.title, { x: 7, y: 18, w: 86, h: 76 }, { cls: 'fx-cond fx-mixed', charW: 0.42, lineH: 1.05, max: 16, min: 4.5, maxLines: 9 }) ??
    // Last resort: the full title at a fixed small size, wrapping freely.
    `<div class="p-title fx-cond fx-mixed fx-wrap" data-w="86" data-h="76" style="left:7cqw;top:18cqw;width:86cqw;font-size:4.5cqw"><span class="ln">${esc(c.title)}</span></div>`;
  return wrap(c, 'plain', `--bg:${bg}`, `${art}
    <div class="p-brand line" style="color:${fg}"><span>PRAGUE TONIGHT ${star(accent)}</span><span>${f.day}</span></div>
    ${fit}
    ${blurb(c, `left:7cqw;top:98cqw;width:86cqw;color:${fg}`)}
    ${band(c, { fg, accent: dark ? accent : K.orange, x: 7 })}`, fg);
}

function wrap(c: Ctx, fam: FamilyId, style: string, inner: string, fg = K.ink): string {
  const label = `${c.e.title}. ${c.f.date}, ${c.f.time}, ${c.e.venue?.name ?? 'venue TBC'}. ${priceText(c.e.price)}.${c.e.blurb ? ` ${c.e.blurb}` : ''}`;
  return `<div class="poster fam-${fam}" style="${style};color:${fg}" role="img" aria-label="${esc(label)}">${inner}</div>`;
}

const RENDER: Record<Exclude<FamilyId, 'plain'>, (c: Ctx) => string | null> = {
  acid,
  editorial,
  swiss,
  geo,
  afterhours,
  typewall,
  quiet,
  collage,
};

let uidCounter = 0;

export interface Rendered {
  html: string;
  /** Family actually drawn; 'plain' when the requested one could not fit. */
  family: FamilyId;
}

export function renderPoster(e: PragueEvent, family: FamilyId): Rendered {
  const ctx: Ctx = {
    e,
    r: rng(`${e.id}:${family}`),
    f: factsOf(e),
    title: posterTitle(e),
    uid: `${(uidCounter++).toString(36)}`,
  };
  if (family !== 'plain') {
    const html = RENDER[family](ctx);
    if (html) return { html, family };
    ctx.r = rng(`${e.id}:plain`);
  }
  return { html: plain(ctx), family: 'plain' };
}

/** A single representative color for list chips and map pins. */
export function familyColor(e: PragueEvent, family: FamilyId): string {
  const r = rng(`${e.id}:${family}`);
  switch (family) {
    case 'acid':
      return r.pick([K.orange, K.pink, K.lime, K.yellow]);
    case 'editorial':
      return r.pick([K.orange, K.cobalt, K.green, K.red]);
    case 'swiss':
      return r.pick([K.cobalt, K.red, K.green, K.orange]);
    case 'geo':
      return r.pick([K.yellow, K.mint, '#FFC2DA', K.cream]);
    case 'afterhours':
      return K.navy;
    case 'typewall':
      return r.pick([K.orange, K.cobalt, K.yellow, K.red]);
    case 'quiet':
      return K.cream;
    case 'collage':
      return K.cobalt;
    default:
      return K.orange;
  }
}

setFitCheck((e, f) => f === 'plain' || renderPoster(e, f).family === f);
