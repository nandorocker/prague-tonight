import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../src/data/fixtures';
import { normalize } from '../src/core/normalize';
import { FAMILIES } from '../src/posters/assign';
import { renderPoster } from '../src/posters/render';
import { balance, fitTitle } from '../src/posters/fit';

const events = normalize(buildFixtures('2026-10-22')).filter((e) => e.night === '2026-10-22');
const draw = events.find((e) => e.displayTitle === 'Draw with Strangers')!;

describe('poster engine', () => {
  it('renders all eight families from one normalized fixture', () => {
    const htmls = FAMILIES.map((f) => renderPoster(draw, f));
    for (const [i, r] of htmls.entries()) {
      expect(r.family).toBe(FAMILIES[i]);
      expect(r.html).toContain('19:00');
      expect(r.html).toContain('ŽIŽKOV');
      expect(r.html).toContain('FREE');
    }
    expect(new Set(htmls.map((h) => h.html.replace(/[hgdn][0-9a-z]+"/g, ''))).size).toBe(8);
  });

  it('is stable for the same event and family', () => {
    const strip = (s: string) => s.replace(/(id|url\(#)[a-z]?[0-9a-z]+/g, '');
    expect(strip(renderPoster(draw, 'geo').html)).toBe(strip(renderPoster(draw, 'geo').html));
  });

  it('says Check price when the price is unknown, never Free', () => {
    const supper = normalize(buildFixtures('2026-10-22')).find((e) => e.title === 'Neighbourhood Supper Club')!;
    for (const f of FAMILIES) {
      const { html } = renderPoster(supper, f);
      expect(html).toContain('CHECK PRICE');
      expect(html).not.toMatch(/\bFREE\b/);
    }
  });

  it('falls back instead of clipping a 120-character title', () => {
    const long = events.find((e) => e.title.length > 110)!;
    for (const f of FAMILIES) {
      const r = renderPoster(long, f);
      // Every word of the title survives, whatever composition was used.
      for (const w of ['Experimental', 'Animation', 'Accompaniment']) expect(r.html.toLowerCase()).toContain(w.toLowerCase());
    }
  });

  it('balances line breaks', () => {
    expect(balance(['DRAW', 'WITH', 'STRANGERS'], 2)).toEqual(['DRAW WITH', 'STRANGERS']);
    const f = fitTitle('BELOW GROUND', { w: 90, h: 50, charW: 0.5, lineH: 1, max: 30, min: 8, maxLines: 3 });
    expect(f.ok).toBe(true);
    expect(f.lines.length).toBeGreaterThanOrEqual(1);
  });
});
