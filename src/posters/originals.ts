/** Original eight image-free grammars, ported from 1d08e59 with truthful facts. */
import type { FamilyId, OriginalFamilyId, PragueEvent } from '../types';
import { CATEGORY_LABEL, esc, priceText, upper } from '../core/format';
import { hash, rng, type Rng } from '../core/rng';
import { clock, dayLabel, numericDate, shortDate, weekdayShort } from '../core/time';
import { posterTitle } from './assign';
import { fitTitle, type FitOptions } from './fit';

const K = {
  ink: '#191919', cream: '#F4EEDD', paper: '#E6DCC4', orange: '#FF5A3C',
  yellow: '#F0E14A', cobalt: '#2350D0', cyan: '#74E8FF', navy: '#14152E',
  pink: '#FF7DBB', lime: '#C8F25A', green: '#1E8C5A', red: '#E8352B',
  violet: '#6B4EFF', mint: '#9FE3C8', magenta: '#FF5FD2',
};
type Grammar = OriginalFamilyId extends `original-${infer G}` ? G : never;
interface Ctx { e: PragueEvent; r: Rng; f: ReturnType<typeof factsOf>; title: string; uid: string; family: OriginalFamilyId }
interface Box { x: number; y: number; w: number; h: number }

export function isOriginalFamily(f: FamilyId): f is OriginalFamilyId {
  return f.startsWith('original-');
}
function factsOf(e: PragueEvent) {
  const date = e.start?.slice(0, 10) ?? e.night;
  const [y, m, d] = date ? date.split('-').map(Number) : [];
  return {
    date: date ? dayLabel(date) : 'Date TBC', time: e.start ? clock(e.start) : 'Time TBC',
    kind: CATEGORY_LABEL[e.category], price: priceText(e.price),
    place: e.venue ? [...new Set([e.venue.name, e.venue.district].filter(Boolean))].join(' · ') : 'Location TBC',
    day: date ? esc(`${weekdayShort(date)} ${upper(shortDate(date))}`) : 'Date TBC',
    dd: date ? esc(date.slice(8)) : 'TBC', ddmm: date ? esc(numericDate(date)) : 'TBC',
    mon: date ? esc(upper(shortDate(date).split(' ')[1] ?? '')) : '',
    weekday: date ? weekdayShort(date) : 'DATE TBC',
    issue: date ? String(Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5)).padStart(3, '0') : 'TBC',
  };
}
function star(): string {
  return `<svg class="star" viewBox="0 0 24 24" width="0.9em" height="0.9em" aria-hidden="true"><g stroke="currentColor" stroke-width="2.6" stroke-linecap="square">${[0, 45, 90, 135].map((a) => {
    const dx = Math.cos(a * Math.PI / 180) * 10, dy = Math.sin(a * Math.PI / 180) * 10;
    return `<line x1="${(12 - dx).toFixed(2)}" y1="${(12 - dy).toFixed(2)}" x2="${(12 + dx).toFixed(2)}" y2="${(12 + dy).toFixed(2)}"/>`;
  }).join('')}</g></svg>`;
}
function title(text: string, box: Box, o: Partial<FitOptions> & { cls?: string; lineCls?: (i: number) => string; style?: string }): string | null {
  const fit = fitTitle(text, { w: box.w, h: box.h, charW: o.charW ?? .47, lineH: o.lineH ?? .98, max: o.max ?? 30, min: o.min ?? 8, maxLines: o.maxLines ?? 4 });
  if (!fit.ok) return null;
  return `<div class="p-title ${o.cls ?? ''}" data-w="${box.w}" data-h="${box.h}" data-min="${o.min ?? 8}" style="left:${box.x}cqw;top:${box.y}cqw;width:${box.w}cqw;font-size:${fit.size}cqw;${o.style ?? ''}" aria-hidden="true">${fit.lines.map((l, i) => `<span class="ln ${o.lineCls?.(i) ?? ''}">${esc(l)}</span>`).join('')}</div>`;
}
function svg(body: string, defs = '') {
  return `<svg class="decor" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}
function band(c: Ctx, o: { fg: string; accent: string; bg?: string; font?: 'cond' | 'serif'; x: number }) {
  const f = c.f;
  return `<div class="p-band band-${c.family} band-${o.font ?? 'ui'} ${o.bg ? 'boxed' : 'ruled'}" style="left:${o.x}cqw;right:${o.x}cqw;--b-fg:${o.fg};--b-ac:${o.accent};${o.bg ? `--b-bg:${o.bg}` : ''}"><div class="b-when"><span class="b-date">${esc(f.date)}</span> · <span class="b-time">${esc(f.time)}</span></div><div class="b-where"><span class="b-venue">${esc(f.place)}</span><span class="b-price">${esc(f.price)}</span></div><div class="b-kind">${esc(f.kind)}</div></div>`;
}
function blurb(c: Ctx, style: string, cls = '', lines = 3) {
  const text = c.e.blurb ?? c.e.description;
  return text ? `<p class="p-blurb bl-${c.family} ${cls}" style="${style};-webkit-line-clamp:${lines}">${esc(text)}</p>` : '';
}
function hatch(id: string, color: string, opacity: number, spacing = 5, angle = 30, width = .5) {
  return `<pattern id="${id}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><line x1="0" y1="0" x2="0" y2="${spacing}" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/></pattern>`;
}
function rings(cx: number, cy: number, count: number, r0: number, step: number, color: string, width: number, extra = '') {
  return Array.from({ length: count }, (_, i) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r0 + i * step).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`).join('');
}
const f1 = (n: number) => n.toFixed(1);
function wrap(c: Ctx, style: string, inner: string, fg = K.ink) {
  const f = c.f, text = c.e.blurb ?? c.e.description;
  const label = `${c.e.title}. ${f.date}, ${f.time}. ${f.place}. ${f.price}. ${f.kind}.${text ? ` ${text}` : ''}`;
  return `<div class="poster original fam-${c.family}" data-artwork="none" style="${style};color:${fg}" role="img" aria-label="${esc(label)}">${inner}</div>`;
}

function acid(c: Ctx): string | null {
  const { r, f } = c;
  const pal = r.pick([{ bg: K.orange, box: K.yellow }, { bg: K.pink, box: K.lime }, { bg: K.lime, box: K.orange }, { bg: K.yellow, box: K.orange }]);
  const cx = r.range(35, 72), cy = r.range(24, 40), n = r.int(4, 7), slantUp = r.chance(.5), ty = r.range(66, 74);
  const poly = slantUp ? `0,${f1(ty + 8)} 100,${f1(ty - 6)} 100,${f1(ty + 30)} 0,${f1(ty + 40)}` : `0,${f1(ty - 6)} 100,${f1(ty + 6)} 100,${f1(ty + 36)} 0,${f1(ty + 30)}`;
  const art = svg(`<rect width="100" height="140" fill="url(#h${c.uid})"/>${rings(cx, cy, n, 4, 5.4, K.ink, 1.7)}<polygon points="${poly}" fill="${K.ink}"/>`, hatch(`h${c.uid}`, K.ink, .18, 6, r.pick([25, 35, -30]), .4));
  const t = title(upper(c.title), { x: 4, y: 38, w: 90, h: 60 }, { cls: 'fx-cond fx-boxes', lineCls: (i) => i % 2 ? 'box-ink' : 'box-cream', lineH: 1.06, charW: .5, max: 26, min: 11, maxLines: 3 });
  if (!t) return null;
  return wrap(c, `--bg:${pal.bg}`, `${art}<div class="p-brand bar"><span>PRAGUE TONIGHT ${star()} ISSUE ${f.issue}</span><span>${f.day}</span></div>${t}${blurb(c, `left:5cqw;top:100cqw;width:72cqw;transform:rotate(${f1(r.range(-3.5, -1.5))}deg);background:${K.cream};color:${K.ink}`, 'bl-sticker', 2)}${band(c, { bg: pal.box, fg: K.ink, accent: K.ink, font: 'cond', x: 4 })}`);
}
function editorial(c: Ctx): string | null {
  const { r, f } = c;
  const accent = r.pick([K.orange, K.cobalt, K.green, K.red]), bx = r.pick([58, 62, 8]), by = r.range(16, 22), bw = r.range(28, 34), bh = r.range(26, 34), stripes = r.int(6, 11), motif = r.pick(['stripes', 'solid-dot', 'solid']);
  let block = `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="${accent}"/>`;
  if (motif === 'stripes') for (let i = 1; i < stripes; i++) block += `<line x1="${f1(bx + bw / stripes * i)}" y1="${f1(by)}" x2="${f1(bx + bw / stripes * i)}" y2="${f1(by + bh)}" stroke="${K.ink}" stroke-width="0.5"/>`;
  else if (motif === 'solid-dot') block += `<circle cx="${f1(bx + bw / 2)}" cy="${f1(by + bh / 2)}" r="${f1(Math.min(bw, bh) * .28)}" fill="${K.cream}"/>`;
  const kickerLeft = bx < 30 ? 50 : 8;
  const art = svg(`<line x1="8" y1="11" x2="92" y2="11" stroke="${K.ink}" stroke-width="0.4"/>${block}`);
  const t = title(upper(c.title), { x: 8, y: 56, w: 84, h: 44 }, { cls: 'fx-serif', charW: .66, lineH: 1.08, max: 15, min: 6, maxLines: 5 });
  if (!t) return null;
  const weekdayName: Record<string, string> = { SUN: 'SUNDAY', MON: 'MONDAY', TUE: 'TUESDAY', WED: 'WEDNESDAY', THU: 'THURSDAY', FRI: 'FRIDAY', SAT: 'SATURDAY' };
  return wrap(c, `--bg:${K.cream}`, `${art}<div class="p-brand line"><span>PRAGUE TONIGHT</span><span>${f.dd} / ${f.ddmm.slice(3)}</span></div><div class="p-kicker serif" style="left:${kickerLeft}cqw;top:22cqw">${weekdayName[f.weekday] ? `${weekdayName[f.weekday]}’S` : 'DATE TBC'}<br>${esc(upper(f.kind))}</div>${t}${blurb(c, `left:${kickerLeft}cqw;top:34cqw;width:${bx < 30 ? 42 : 44}cqw;color:${K.ink}`, 'bl-serif', 5)}${band(c, { fg: K.ink, accent, font: 'serif', x: 8 })}`);
}
function swiss(c: Ctx): string | null {
  const { r, f } = c;
  const accent = r.pick([K.cobalt, K.red, K.green, K.orange]), cols = r.pick([3, 4]), rows = [18, r.pick([48, 56, 64]), 98];
  let grid = '';
  for (let i = 1; i < cols; i++) grid += `<line x1="${f1(100 / cols * i)}" y1="0" x2="${f1(100 / cols * i)}" y2="140" stroke="#CFCBBE" stroke-width="0.3"/>`;
  for (const y of rows) grid += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="#CFCBBE" stroke-width="0.3"/>`;
  const cw = 100 / cols, barCol = r.int(0, cols - 1), barY = r.pick([84, 88]);
  const bar = `<rect x="${f1(barCol * cw + 1)}" y="${barY}" width="${f1(cw - 2)}" height="6" fill="${accent}"/>`;
  let nums = '';
  for (let i = 0; i < cols; i++) nums += `<text x="${f1(i * cw + 1.2)}" y="${rows[2] - 1.5}" font-size="2.4" fill="#9C978A" font-family="Fira Sans, sans-serif">${String(i + 1).padStart(2, '0')}</text>`;
  const art = svg(`<rect x="${f1(100 - cw)}" y="0" width="${f1(cw)}" height="18" fill="${accent}"/>${grid}${bar}${nums}`);
  const t = title(upper(c.title), { x: 2, y: 30, w: 95, h: 52 }, { cls: 'fx-cond', charW: .48, lineH: .98, max: 22, min: 8, maxLines: 5 });
  if (!t) return null;
  return wrap(c, '--bg:#F7F4EC', `${art}<div class="p-brand swiss">PT—${f.dd}</div><div class="p-brand swiss-date" style="right:0;width:${f1(cw)}cqw;color:${K.cream}">${f.ddmm}</div><div class="p-label" style="left:2cqw;top:21cqw;color:${accent}">${esc(upper(f.kind))}</div>${t}${blurb(c, `left:2cqw;top:101cqw;width:64cqw;color:${K.ink}`, 'bl-grid', 2)}${band(c, { fg: K.ink, accent, font: 'cond', x: 2 })}`);
}
function geo(c: Ctx): string | null {
  const { r, f } = c;
  const pal = r.pick([{ bg: K.yellow, a: K.orange, b: K.cobalt }, { bg: K.mint, a: K.pink, b: K.violet }, { bg: '#FFC2DA', a: K.orange, b: K.cobalt }, { bg: K.cream, a: K.cobalt, b: K.orange }]);
  const cx = r.range(55, 85), cy = r.range(22, 38), rad = r.range(28, 40);
  const tri = r.chance(.5) ? `${f1(r.range(10, 30))},${f1(r.range(52, 62))} ${f1(r.range(55, 70))},${f1(r.range(36, 46))} ${f1(r.range(80, 95))},${f1(r.range(84, 96))}` : `0,${f1(r.range(60, 70))} ${f1(r.range(40, 60))},${f1(r.range(30, 40))} 100,${f1(r.range(54, 64))} 100,${f1(r.range(88, 96))}`;
  const art = svg(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}" fill="${pal.a}"/><polygon points="${tri}" fill="${pal.b}"/><circle cx="${f1(r.range(10, 30))}" cy="${f1(r.range(30, 46))}" r="${f1(r.range(18, 26))}" fill="none" stroke="${K.ink}" stroke-width="1.4"/>`);
  const t = title(upper(c.title), { x: 4, y: 44, w: 90, h: 50 }, { cls: 'fx-cond fx-boxes', lineCls: () => 'box-cream', charW: .5, lineH: 1.12, max: 17, min: 7, maxLines: 4 });
  if (!t) return null;
  return wrap(c, `--bg:${pal.bg}`, `${art}<div class="p-brand bar"><span>PRAGUE TONIGHT ${star()} ${f.dd} ${f.mon}</span><span>${f.weekday}</span></div>${t}${blurb(c, `right:4cqw;top:97cqw;width:62cqw;text-align:right;color:${K.ink}`, 'bl-bold', 3)}${band(c, { bg: K.ink, fg: K.cream, accent: pal.bg, font: 'cond', x: 4 })}`);
}
function afterhours(c: Ctx): string | null {
  const { r, f } = c;
  const accent = r.pick([K.cyan, K.magenta, K.lime, K.orange]), motif = r.pick(['rings', 'waves', 'rays']);
  let grid = '';
  for (let x = 7; x < 100; x += 7) grid += `<line x1="${x}" y1="0" x2="${x}" y2="140" stroke="${accent}" stroke-opacity="0.1" stroke-width="0.25"/>`;
  for (let y = 7; y < 140; y += 7) grid += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${accent}" stroke-opacity="0.1" stroke-width="0.25"/>`;
  const cx = r.range(40, 66), cy = r.range(50, 64);
  let m = '';
  if (motif === 'rings') m = rings(cx, cy, r.int(8, 12), 6, 2.6, accent, .45, `filter="url(#g${c.uid})"`);
  else if (motif === 'waves') {
    const amp = r.range(3, 6), freq = r.range(.06, .11);
    for (let i = 0; i < 12; i++) {
      let d = '';
      for (let x = 0; x <= 100; x += 2) d += `${x ? 'L' : 'M'}${x},${f1(30 + i * 4 + Math.sin(x * freq + i * .5) * amp)}`;
      m += `<path d="${d}" fill="none" stroke="${accent}" stroke-width="0.45" stroke-opacity="${(.35 + i * .05).toFixed(2)}" filter="url(#g${c.uid})"/>`;
    }
  } else for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    m += `<line x1="${f1(cx + Math.cos(a) * 8)}" y1="${f1(cy + Math.sin(a) * 8)}" x2="${f1(cx + Math.cos(a) * 34)}" y2="${f1(cy + Math.sin(a) * 34)}" stroke="${accent}" stroke-width="0.4" filter="url(#g${c.uid})"/>`;
  }
  const art = svg(`${grid}${m}`, `<filter id="g${c.uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
  const t = title(upper(c.title), { x: 6, y: 56, w: 88, h: 44 }, { cls: 'fx-cond fx-glow', charW: .48, lineH: .98, max: 22, min: 8, maxLines: 4 });
  if (!t) return null;
  return wrap(c, `--bg:${K.navy}`, `${art}<div class="p-brand glow" style="color:${accent}">PRAGUE / TONIGHT<small style="color:${K.cream}">${f.weekday} ${f.ddmm} ${star()}</small></div>${t}${blurb(c, `left:6cqw;top:19cqw;width:56cqw;color:${accent}`, 'bl-glow', 4)}${band(c, { fg: K.cream, accent, font: 'cond', x: 6 })}`);
}
function typewall(c: Ctx): string | null {
  const { r, f } = c;
  const pal = r.pick([{ bg: K.orange, hi: K.yellow }, { bg: K.cobalt, hi: K.yellow }, { bg: K.yellow, hi: K.orange }, { bg: K.red, hi: K.cream }]);
  const words = upper(c.title).split(/\s+/);
  const art = svg(`<rect width="100" height="140" fill="url(#h${c.uid})"/>`, hatch(`h${c.uid}`, K.ink, .22, 4.5, r.pick([20, 28, -25]), .35));
  const t = title(words.join(' '), { x: 3, y: 17, w: 92, h: 70 }, { cls: 'fx-cond fx-boxes fx-wall', lineCls: (i) => i % 2 ? 'box-ink' : 'box-cream', charW: .5, lineH: 1.08, max: 34, min: 12, maxLines: Math.min(4, words.length) });
  if (!t) return null;
  const fg = pal.bg === K.cobalt || pal.bg === K.red ? K.cream : K.ink;
  return wrap(c, `--bg:${pal.bg}`, `${art}<div class="p-brand bar inset"><span>PT ${star()} ${f.dd} ${f.mon} / PRAGUE</span></div>${t}<div class="p-label big" style="left:4cqw;top:93cqw;color:${fg}">${esc(upper(f.kind))}</div>${blurb(c, `left:4cqw;top:100cqw;width:90cqw;color:${fg}`, 'bl-bold', 2)}${band(c, { bg: K.ink, fg: K.cream, accent: pal.hi, font: 'cond', x: 3 })}`);
}
function quiet(c: Ctx): string | null {
  const { r, f } = c;
  // Original dark-paper option, now independent of the event's start time.
  const dark = r.chance(.6), bg = dark ? '#1E1E1C' : r.pick([K.cream, '#EEF0EA', '#F2E9E4']), fg = dark ? K.cream : K.ink;
  const accent = r.pick([K.orange, K.cobalt, K.red, K.green]), sx = r.range(72, 84), sy = r.range(24, 32), sign = r.pick(['circlex', 'asterisk', 'half', 'triangle', 'dot']);
  let s = '';
  if (sign === 'circlex') s = `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="6" fill="none" stroke="${accent}" stroke-width="1.6"/><path d="M${f1(sx - 3.6)},${f1(sy - 3.6)}L${f1(sx + 3.6)},${f1(sy + 3.6)}M${f1(sx + 3.6)},${f1(sy - 3.6)}L${f1(sx - 3.6)},${f1(sy + 3.6)}" stroke="${accent}" stroke-width="1.6"/>`;
  else if (sign === 'asterisk') for (let a = 0; a < 180; a += 45) {
    const dx = Math.cos(a * Math.PI / 180) * 6, dy = Math.sin(a * Math.PI / 180) * 6;
    s += `<line x1="${f1(sx - dx)}" y1="${f1(sy - dy)}" x2="${f1(sx + dx)}" y2="${f1(sy + dy)}" stroke="${accent}" stroke-width="1.4"/>`;
  }
  else if (sign === 'half') s = `<path d="M${f1(sx - 6)},${f1(sy)} A6,6 0 0 1 ${f1(sx + 6)},${f1(sy)} Z" fill="${accent}"/><line x1="${f1(sx - 8)}" y1="${f1(sy + 2)}" x2="${f1(sx + 8)}" y2="${f1(sy + 2)}" stroke="${accent}" stroke-width="0.8"/>`;
  else if (sign === 'triangle') s = `<polygon points="${f1(sx)},${f1(sy - 6)} ${f1(sx + 6)},${f1(sy + 5)} ${f1(sx - 6)},${f1(sy + 5)}" fill="${accent}"/>`;
  else s = `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="3.2" fill="${accent}"/>`;
  const art = svg(`<line x1="8" y1="13" x2="92" y2="13" stroke="${fg}" stroke-width="0.35"/>${s}`);
  const t = title(upper(c.title), { x: 8, y: 58, w: 84, h: 42 }, { cls: 'fx-serif', charW: .66, lineH: 1.04, max: 14, min: 5.5, maxLines: 5 });
  if (!t) return null;
  return wrap(c, `--bg:${bg}`, `${art}<div class="p-brand quiet" style="color:${fg}"><span class="serif">P&#8202;T</span><span>${f.dd} / ${f.mon}</span></div><div class="p-kicker serif small" style="left:8cqw;top:51cqw;color:${fg}">${f.day}</div>${t}${blurb(c, `left:8cqw;top:20cqw;width:56cqw;color:${fg}`, 'bl-serif bl-big', 4)}${band(c, { fg, accent, font: 'serif', x: 8 })}`, fg);
}
function collage(c: Ctx): string | null {
  const { r, f } = c;
  const papers = [K.cobalt, K.orange, K.yellow, K.pink, K.green, K.cream], top = r.pick([K.cobalt, K.green, K.pink]), mid = r.pick(papers.filter((p) => p !== top && p !== K.yellow && p !== K.cream));
  const sheet = (x: number, y: number, w: number, h: number, color: string) => `<g transform="rotate(${f1(r.range(-3.5, 3.5))} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/></g>`;
  const art = svg(`<rect width="100" height="140" fill="${K.paper}"/>${sheet(4, r.range(2, 6), 92, 44, top)}${sheet(2, 44, 96, 50, mid)}${sheet(3, 90, 94, 32, K.yellow)}<rect x="${f1(r.range(60, 80))}" y="${f1(r.range(14, 30))}" width="22" height="22" fill="url(#d${c.uid})"/><rect width="100" height="140" filter="url(#n${c.uid})" opacity="0.18"/>`, `<pattern id="d${c.uid}" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.55" fill="${K.ink}" fill-opacity="0.5"/></pattern><filter id="n${c.uid}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${hash(c.e.id) % 997}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0"/></filter>`);
  const t = title(upper(c.title), { x: 5, y: 50, w: 86, h: 40 }, { cls: 'fx-cond fx-alt', lineCls: (i) => i % 2 ? 'tx-ink' : 'tx-cream', charW: .48, lineH: .98, max: 20, min: 8, maxLines: 4, style: `transform:rotate(${f1(r.range(-2.5, 1))}deg)` });
  if (!t) return null;
  return wrap(c, `--bg:${K.paper}`, `${art}<div class="p-brand plain" style="left:8cqw;top:6cqw;color:${K.cream}">PRAGUE TONIGHT / ${f.dd}.${f.ddmm.slice(3)} ${star()}</div>${t}${blurb(c, `left:8cqw;top:14cqw;width:54cqw;transform:rotate(${f1(r.range(1, 3))}deg);background:${K.cream};color:${K.ink}`, 'bl-sticker', 4)}${band(c, { bg: K.ink, fg: K.cream, accent: K.yellow, font: 'cond', x: 6 })}`);
}
const RENDER: Record<Grammar, (c: Ctx) => string | null> = { acid, editorial, swiss, geo, afterhours, typewall, quiet, collage };
export function renderOriginal(e: PragueEvent, family: OriginalFamilyId, uid: string): string | null {
  const grammar = family.slice(9) as Grammar;
  return RENDER[grammar]({ e, family, uid, r: rng(`${e.id}:${grammar}`), f: factsOf(e), title: posterTitle(e) });
}
export function originalColor(e: PragueEvent, family: OriginalFamilyId): string {
  const r = rng(`${e.id}:${family.slice(9)}`);
  switch (family) {
    case 'original-acid': return r.pick([K.orange, K.pink, K.lime, K.yellow]);
    case 'original-editorial': return r.pick([K.orange, K.cobalt, K.green, K.red]);
    case 'original-swiss': return r.pick([K.cobalt, K.red, K.green, K.orange]);
    case 'original-geo': return r.pick([K.yellow, K.mint, '#FFC2DA', K.cream]);
    case 'original-afterhours': return K.navy;
    case 'original-typewall': return r.pick([K.orange, K.cobalt, K.yellow, K.red]);
    case 'original-quiet': return K.cream;
    case 'original-collage': return K.cobalt;
  }
}
