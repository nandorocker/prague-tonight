/** Ten full-card art grammars. Facts share values and order, not a visual footer. */
import type { FamilyId, PragueEvent } from '../types';
import { CATEGORY_LABEL, esc, priceText, upper } from '../core/format';
import { hash, rng, type Rng } from '../core/rng';
import { clock, dayLabel } from '../core/time';
import { posterTitle, setFitCheck } from './assign';
import { fitTitle, type FitOptions } from './fit';

export const COLOR = {
  ink: '#191919', paper: '#F5F1E7', pink: '#F260BD', steel: '#A7C8F2',
  sage: '#B9C5B1', plum: '#604C64', violet: '#8B47EF', red: '#D93228',
};
const K = COLOR;
interface Ctx { e: PragueEvent; r: Rng; title: string; uid: string }
interface Box { x: number; y: number; w: number; h: number }

/** The brand sign: an eight-arm asterisk, drawn so no font can swap it. */
export function star(color = 'currentColor', size = '0.9em'): string {
  const arms = [0, 45, 90, 135].map((a) => {
    const rad = a * Math.PI / 180;
    const dx = Math.cos(rad) * 10;
    const dy = Math.sin(rad) * 10;
    return `<line x1="${(12 - dx).toFixed(2)}" y1="${(12 - dy).toFixed(2)}" x2="${(12 + dx).toFixed(2)}" y2="${(12 + dy).toFixed(2)}"/>`;
  }).join('');
  return `<svg class="star" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><g stroke="${color}" stroke-width="2.6" stroke-linecap="square">${arms}</g></svg>`;
}

function title(text: string, box: Box, o: Partial<FitOptions> & { cls?: string }): string | null {
  const fit = fitTitle(text, {
    w: box.w, h: box.h, charW: o.charW ?? 0.48, lineH: o.lineH ?? 1,
    max: o.max ?? 25, min: o.min ?? 7, maxLines: o.maxLines ?? 5,
  });
  if (!fit.ok) return null;
  return `<div class="p-title ${o.cls ?? ''}" data-w="${box.w}" data-h="${box.h}" style="left:${box.x}cqw;top:${box.y}cqw;width:${box.w}cqw;font-size:${fit.size}cqw" aria-hidden="true">${fit.lines.map((l) => `<span class="ln">${esc(l)}</span>`).join('')}</div>`;
}

function svg(body: string, defs = ''): string {
  return `<svg class="decor" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}
function brand(extra = ''): string {
  return `<div class="p-brand" aria-hidden="true">PRAGUE TONIGHT${extra}</div>`;
}
const n = (v: number) => v.toFixed(1);

function acid(c: Ctx): string | null {
  const x = n(c.r.range(45, 65));
  const t = title(upper(c.title), { x: 7, y: 26, w: 84, h: 57 }, { cls: 'fx-metal', max: 28, min: 9, lineH: 1.02 });
  if (!t) return null;
  const art = svg(`<rect width="100" height="140" fill="#160E25"/><path d="M0 0L${x} 0 100 140 73 140Z" fill="url(#beam${c.uid})"/><path d="M100 0L60 0 0 140 23 140Z" fill="${K.violet}" opacity=".35"/><path d="M80 -5L43 38 61 35 27 101 79 45 59 48 101 -5Z" fill="${K.pink}"/><path d="M0 104L100 95 100 140 0 140Z" fill="#100B1B"/><path d="M0 138L100 126M0 140L100 134" stroke="${K.violet}" stroke-width=".5"/>`, `<linearGradient id="beam${c.uid}"><stop stop-color="${K.violet}"/><stop offset="1" stop-color="${K.pink}" stop-opacity="0"/></linearGradient>`);
  return wrap(c, 'acid', `${art}${brand(star())}${t}`);
}

function typewall(c: Ctx): string | null {
  const t = title(upper(c.title), { x: 9, y: 23, w: 81, h: 60 }, { cls: 'fx-xerox', max: 23, min: 8, lineH: 1.12 });
  if (!t) return null;
  const offset = n(c.r.range(1, 4));
  const art = svg(`<rect width="100" height="140" fill="#242424"/><path d="M5 19L95 18 91 30 97 35 93 49 96 63 91 79 95 101 92 120 96 137 4 140 7 121 3 104 7 84 3 70 7 53 3 39Z" fill="${K.paper}"/><path d="M0 12L100 7M0 15L100 10M0 139L100 136" stroke="${K.paper}" stroke-width=".6"/><rect x="8" y="17" width="22" height="6" fill="#C6C1AF" opacity=".85" transform="rotate(-12 8 19)"/><rect width="100" height="140" filter="url(#noise${c.uid})" opacity=".17"/><path d="M${offset} 24V134" stroke="#191919" stroke-dasharray="1 2"/>`, `<filter id="noise${c.uid}"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="${hash(`${c.e.id}:typewall`) % 997}"/><feColorMatrix type="saturate" values="0"/></filter>`);
  return wrap(c, 'typewall', `${art}${brand()}${t}`);
}

function geo(c: Ctx): string | null {
  const t = title(c.title, { x: 8, y: 32, w: 84, h: 52 }, { cls: 'fx-pop', charW: 0.63, max: 22, min: 7, lineH: 1.02 });
  if (!t) return null;
  const angle = c.r.int(-20, 20);
  const petals = Array.from({ length: 6 }, (_, i) => `<ellipse cx="78" cy="13" rx="5" ry="10" fill="${K.pink}" transform="rotate(${i * 60 + angle} 78 24)"/>`).join('');
  const art = svg(`<rect width="100" height="140" fill="url(#candy${c.uid})"/><rect x="4" y="4" width="92" height="132" rx="14" fill="none" stroke="#FFFFFF" stroke-width="1.2"/>${petals}<circle cx="78" cy="24" r="5" fill="#FFF0A5"/><path d="M11 89L14 97 23 98 16 104 17 113 10 108 2 112 4 103 -2 97 7 96Z" fill="${K.steel}" stroke="#FFF" stroke-width="1"/><path d="M9 23Q24 8 49 14" fill="none" stroke="#FFF" stroke-width="2" stroke-linecap="round"/><ellipse cx="86" cy="130" rx="13" ry="9" fill="${K.pink}" stroke="#FFF"/>`, `<linearGradient id="candy${c.uid}" x2=".7" y2="1"><stop stop-color="#D9C6FA"/><stop offset=".5" stop-color="#F8CBE5"/><stop offset="1" stop-color="${K.steel}"/></linearGradient>`);
  return wrap(c, 'geo', `${art}${brand()}${t}`);
}

function quiet(c: Ctx): string | null {
  const t = title(c.title, { x: 9, y: 49, w: 82, h: 46 }, { cls: 'fx-soft', charW: 0.48, max: 19, min: 6, lineH: 1.04 });
  if (!t) return null;
  const shift = n(c.r.range(-5, 5));
  const art = svg(`<rect width="100" height="140" fill="${K.paper}"/><g filter="url(#haze${c.uid})"><path d="M-15 63Q45 ${shift} 120 38V140H-15Z" fill="${K.sage}"/><ellipse cx="78" cy="30" rx="34" ry="25" fill="${K.steel}" opacity=".85"/><ellipse cx="18" cy="125" rx="65" ry="30" fill="#DED0C2"/></g><path d="M69 44Q65 26 76 16M70 35Q54 33 58 22Q70 22 70 35M71 29Q85 29 84 18Q73 19 71 29" fill="none" stroke="${K.plum}" stroke-opacity=".5" stroke-width=".6"/>`, `<filter id="haze${c.uid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>`);
  return wrap(c, 'quiet', `${art}${brand()}${t}`);
}

function swiss(c: Ctx): string | null {
  const t = title(upper(c.title), { x: 5, y: 25, w: 90, h: 53 }, { cls: 'fx-brutal', max: 30, min: 8, lineH: 0.97 });
  if (!t) return null;
  const bar = c.r.pick([67, 73, 79]);
  const art = svg(`<rect width="100" height="140" fill="#F7F7F2"/><path d="M3 0V140M66 0V140M97 0V140M0 20H100M0 81H100M0 102H100M0 137H100" stroke="#191919" stroke-width=".35"/><rect x="66" width="31" height="20" fill="${K.ink}"/><path d="M${bar} 101L100 84V101Z" fill="${K.ink}"/><rect x="5" y="97" width="17" height="3" fill="${K.red}"/>`);
  return wrap(c, 'swiss', `${art}${brand()}${t}`);
}

function afterhours(c: Ctx): string | null {
  const t = title(c.title, { x: 12, y: 33, w: 76, h: 44 }, { cls: 'fx-digital', charW: 0.62, max: 17, min: 6, lineH: 1.04 });
  if (!t) return null;
  const px = c.r.int(74, 82);
  const pixel = (x: number, y: number) => `<path d="M${x} ${y - 6}v4h-4v4h4v4h4v-4h4v-4h-4v-4Z" fill="#F9FCFF" stroke="#667B9A" stroke-width=".5"/>`;
  const art = svg(`<rect width="100" height="140" fill="url(#metal${c.uid})"/><path d="M0 128Q50 30 100 100M-10 123Q50 20 110 95M-20 118Q50 10 120 90" fill="none" stroke="#EEF8FF" stroke-width=".6"/><rect x="7" y="23" width="86" height="111" rx="3" fill="#EAF2FC" stroke="#526582" stroke-width=".6"/><path d="M7 31H93M7 99H93" stroke="#526582" stroke-width=".6"/><rect x="11" y="26" width="44" height="2" rx="1" fill="${K.steel}"/><path d="M81 26l4 4m0-4l-4 4M87 26h3v3h-3Z" stroke="#526582" fill="none" stroke-width=".6"/>${pixel(px, 14)}${pixel(4, 132)}`, `<linearGradient id="metal${c.uid}" x2="1" y2="1"><stop stop-color="#EAF4FD"/><stop offset=".3" stop-color="${K.steel}"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#A9B1D9"/><stop offset="1" stop-color="#D4EBF8"/></linearGradient>`);
  return wrap(c, 'afterhours', `${art}${brand()}${t}`);
}

function editorial(c: Ctx): string | null {
  const t = title(c.title, { x: 9, y: 57, w: 82, h: 34 }, { cls: 'fx-fashion', charW: 0.52, max: 17, min: 6, lineH: 1.02 });
  if (!t) return null;
  const shift = n(c.r.range(0, 8));
  const art = svg(`<rect width="100" height="140" fill="${K.paper}"/><path d="M9 16H91M9 136H91" stroke="${K.ink}" stroke-width=".4"/><rect x="26" y="22" width="48" height="29" fill="#D5CDCF" stroke="${K.ink}" stroke-width=".3"/><path d="M${shift} 53L53 22H65L40 53Z" fill="${K.plum}" clip-path="url(#frame${c.uid})"/><path d="M48 53L73 22H90L68 53Z" fill="${K.ink}" clip-path="url(#frame${c.uid})"/>`, `<clipPath id="frame${c.uid}"><rect x="26" y="22" width="48" height="29"/></clipPath>`);
  return wrap(c, 'editorial', `${art}${brand()}${t}`);
}

function collage(c: Ctx): string | null {
  const t = title(upper(c.title), { x: 10, y: 27, w: 80, h: 55 }, { cls: 'fx-paste', max: 27, min: 8, lineH: 1.04 });
  if (!t) return null;
  const tilt = n(c.r.range(-4, -1));
  const art = svg(`<rect width="100" height="140" fill="${K.plum}"/><path d="M-5 1L72 7 68 31 73 39 -5 43Z" fill="${K.steel}"/><path d="M22 3L105 14 101 139 28 140 24 121 28 64 22 43Z" fill="${K.pink}"/><g transform="rotate(${tilt} 50 60)"><path d="M5 24L94 21 91 36 95 42 91 64 95 72 90 84 8 88 10 80 5 65 9 43Z" fill="#E6EB79"/></g><path d="M-5 102L102 106 100 121 -5 116Z" fill="#FA6E43"/><path d="M3 119L96 114 101 136 94 140 5 139 8 132Z" fill="${K.steel}"/><rect x="4" y="22" width="25" height="7" fill="${K.paper}" opacity=".8" transform="rotate(-22 4 22)"/><path d="M5 10l12 4m-14 0l12 4m-14 0l12 4M82 137l15-4m-15 7l15-4" stroke="${K.ink}" stroke-width="1.2"/>`);
  return wrap(c, 'collage', `${art}${brand()}${t}`);
}

function culture(c: Ctx): string | null {
  const t = title(c.title, { x: 7, y: 58, w: 86, h: 40 }, { cls: 'fx-culture', charW: 0.52, max: 20, min: 6, lineH: 1.02 });
  if (!t) return null;
  const accent = c.r.pick(['#A7352B', '#284C7B']);
  const cx = n(c.r.range(73, 84));
  const art = svg(`<rect width="100" height="140" fill="${K.paper}"/><path d="M7 4V137M93 4V137M7 16H93M7 53H93M7 104H93M7 137H93M50 16V53" stroke="${K.ink}" stroke-width=".4"/><g clip-path="url(#print${c.uid})"><circle cx="${cx}" cy="25" r="32" fill="${accent}"/><circle cx="${cx}" cy="25" r="32" fill="url(#dots${c.uid})"/><path d="M52 46L92 17M52 49L92 20" stroke="${K.paper}" stroke-width="2"/></g><rect x="7" y="101" width="43" height="2" fill="${accent}"/>`, `<clipPath id="print${c.uid}"><rect x="52" y="17" width="40" height="35"/></clipPath><pattern id="dots${c.uid}" width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".48" fill="${K.paper}"/></pattern>`);
  return wrap(c, 'culture', `${art}${brand()}${t}`);
}

function geometric(c: Ctx): string | null {
  const t = title(upper(c.title), { x: 7, y: 21, w: 86, h: 38 }, { cls: 'fx-geometric', charW: 0.51, max: 22, min: 7, lineH: 1.01 });
  if (!t) return null;
  const offset = c.r.pick([0, 6, 12]);
  const art = svg(`<rect width="100" height="140" fill="#F0E9D7"/><path d="M0 66H100M7 0V140M93 0V140" stroke="#244D4D" stroke-width=".35"/><g transform="translate(${offset} 0)"><path d="M-14 140V87A27 27 0 0 1 40 87V140H25V87A12 12 0 0 0 1 87V140Z" fill="#B9502E"/><path d="M29 140V87A27 27 0 0 1 83 87V140H68V87A12 12 0 0 0 44 87V140Z" fill="#244D4D"/><rect x="78" y="66" width="15" height="74" fill="#B9502E"/></g><rect x="7" y="13" width="24" height="2" fill="#B9502E"/>`);
  return wrap(c, 'geometric', `${art}${brand()}${t}`);
}

function plain(c: Ctx): string {
  const t = title(c.title, { x: 7, y: 21, w: 86, h: 72 }, { cls: 'fx-cond', charW: 0.48, max: 20, min: 4, maxLines: 12, lineH: 1.05 }) ??
    `<div class="p-title fx-cond fx-wrap" data-w="86" data-h="72" style="left:7cqw;top:21cqw;width:86cqw;font-size:4cqw" aria-hidden="true"><span class="ln">${esc(c.title)}</span></div>`;
  return wrap(c, 'plain', `${svg(`<rect width="100" height="140" fill="${K.paper}"/><path d="M7 15H93M7 136H93" stroke="${K.ink}" stroke-width=".5"/>`)}${brand()}${t}`);
}

function factsOf(e: PragueEvent) {
  const date = e.start?.slice(0, 10) ?? e.night;
  return {
    time: e.start ? clock(e.start) : 'Time TBC',
    date: date ? dayLabel(date) : 'Date TBC',
    place: e.venue ? [...new Set([e.venue.name, e.venue.district].filter(Boolean))].join(' · ') : 'Location TBC',
    kind: CATEGORY_LABEL[e.category], price: priceText(e.price),
  };
}

/** Truthful shared field order; each family independently composes and dresses it. */
function band(c: Ctx, fam: FamilyId): string {
  const f = factsOf(c.e);
  return `<div class="p-band band-${fam}"><div class="b-when"><span class="b-date">${esc(f.date)}</span> · <span class="b-time">${esc(f.time)}</span></div><div class="b-where"><span class="b-venue">${esc(f.place)}</span><span class="b-price">${esc(f.price)}</span></div><div class="b-kind">${esc(f.kind)}</div></div>`;
}

function wrap(c: Ctx, fam: FamilyId, art: string): string {
  const f = factsOf(c.e);
  const text = c.e.blurb ?? c.e.description;
  const label = `${c.e.title}. ${f.date}, ${f.time}. ${f.place}. ${f.price}. ${f.kind}.${text ? ` ${text}` : ''}`;
  const blurb = text ? `<p class="p-blurb bl-${fam}">${esc(text)}</p>` : '';
  return `<div class="poster fam-${fam}" role="img" aria-label="${esc(label)}"><div class="p-art" aria-hidden="true">${art}</div>${blurb}${band(c, fam)}</div>`;
}

const RENDER: Record<Exclude<FamilyId, 'plain'>, (c: Ctx) => string | null> = {
  acid, typewall, geo, quiet, swiss, afterhours, editorial, collage, culture, geometric,
};
let uidCounter = 0;
export interface Rendered {
  html: string;
  /** Family actually drawn; 'plain' when the requested one could not fit. */
  family: FamilyId;
}
export function renderPoster(e: PragueEvent, family: FamilyId): Rendered {
  const ctx: Ctx = { e, r: rng(`${e.id}:${family}`), title: posterTitle(e), uid: `p${(uidCounter++).toString(36)}` };
  if (family !== 'plain') {
    const html = RENDER[family](ctx);
    if (html) return { html, family };
  }
  return { html: plain(ctx), family: 'plain' };
}

/** Representative chips, independent of factual content. */
export function familyColor(_e: PragueEvent, family: FamilyId): string {
  const colors: Record<FamilyId, string> = {
    acid: '#30134C', typewall: K.ink, geo: K.pink, quiet: K.sage,
    swiss: '#F7F7F2', afterhours: K.steel, editorial: K.paper, collage: '#E6EB79',
    culture: '#A7352B', geometric: '#244D4D', plain: K.paper,
  };
  return colors[family];
}

setFitCheck((e, f) => f === 'plain' || renderPoster(e, f).family === f);
