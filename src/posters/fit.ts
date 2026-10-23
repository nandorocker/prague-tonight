/**
 * Title fitting without DOM measurement: estimate glyph widths, try every
 * line count, balance the breaks, and take the largest size that fits the
 * box. A DOM pass (fitDom) corrects any remaining overflow once fonts load.
 */

export interface FitOptions {
  /** Box width and height in poster-width units (cqw). */
  w: number;
  h: number;
  /** Average glyph advance as a fraction of font size. */
  charW: number;
  /** Line pitch as a fraction of font size. */
  lineH: number;
  max: number;
  min: number;
  maxLines: number;
}

export interface FitResult {
  lines: string[];
  size: number;
  ok: boolean;
}

const NARROW = new Set([...'Iil1.,:;!|\'’ ()-–/']);
const WIDE = new Set([...'MWmw@&%ŽŠ']);

/** Relative width of a string, 1 per average character. */
export function measure(s: string): number {
  let n = 0;
  for (const c of s) n += NARROW.has(c) ? 0.5 : WIDE.has(c) ? 1.3 : 1;
  return n;
}

/** Split words into k lines minimizing the widest line. */
export function balance(words: string[], k: number): string[] {
  const n = words.length;
  const w = words.map(measure);
  const span = (i: number, j: number) => {
    let s = 0;
    for (let x = i; x < j; x++) s += w[x];
    return s + (j - i - 1) * 0.5;
  };
  // best[i][l]: minimal max width covering words[i..] with l lines
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(n));
  best[n][0] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let l = 1; l <= k; l++) {
      for (let j = i + 1; j <= n; j++) {
        const v = Math.max(span(i, j), best[j][l - 1]);
        if (v < best[i][l]) {
          best[i][l] = v;
          cut[i][l] = j;
        }
      }
    }
  }
  const lines: string[] = [];
  let i = 0;
  for (let l = k; l > 0 && i < n; l--) {
    const j = cut[i][l];
    lines.push(words.slice(i, j).join(' '));
    i = j;
  }
  return lines;
}

export function fitTitle(text: string, o: FitOptions): FitResult {
  const words = text.trim().split(/\s+/);
  let bestFit: FitResult = { lines: [text], size: 0, ok: false };
  for (let k = 1; k <= Math.min(o.maxLines, words.length); k++) {
    const lines = balance(words, k);
    const widest = Math.max(...lines.map(measure));
    const size = Math.min(o.max, o.w / (widest * o.charW), o.h / (lines.length * o.lineH));
    // Prefer fewer lines unless more lines buy a clearly larger size.
    if (size > bestFit.size * 1.06) bestFit = { lines, size, ok: size >= o.min };
  }
  bestFit.size = Math.round(bestFit.size * 100) / 100;
  return bestFit;
}

/** Replace the entire composition; never leave an empty image slot behind. */
export function replaceArtworkWithFallback(poster: HTMLElement, reason: 'load' | 'fit'): HTMLElement | null {
  const fallback = poster.nextElementSibling;
  if (!(fallback instanceof HTMLTemplateElement) || !fallback.classList.contains('artwork-fallback')) return null;
  const plain = fallback.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
  if (!plain) return null;
  plain.dataset.artworkFallback = reason;
  plain.dataset.requestedArtwork = poster.dataset.artwork;
  poster.replaceWith(plain);
  fallback.remove();
  const credit = plain.closest('.details')?.querySelector<HTMLElement>('.artwork-credit');
  if (credit) credit.textContent = `Image-free poster design${reason === 'load' ? ' (illustrative artwork could not load)' : ' to keep the full headline readable'}. Poster artwork is illustrative, not event photography.`;
  return plain;
}

/** Correct font overflow, dropping imagery before shrinking below its type minimum. */
export function fitDom(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.p-title').forEach((t) => {
    const poster = t.closest<HTMLElement>('.poster');
    if (!poster || !poster.clientWidth) return;
    const unit = poster.clientWidth / 100;
    const maxW = Number(t.dataset.w) * unit;
    const maxH = Number(t.dataset.h) * unit;
    const lines = [...t.querySelectorAll<HTMLElement>('.ln')];
    const wraps = t.classList.contains('fx-wrap');
    // scrollWidth catches overflow even when a line box is stretched to 100%.
    const widest = wraps || !lines.length ? maxW : Math.max(...lines.map((l) => l.scrollWidth));
    const ratio = Math.min(1, maxW / widest, maxH / Math.max(t.scrollHeight, 1));
    if (ratio < 0.995) {
      const size = parseFloat(t.style.fontSize) * ratio * 0.98;
      if (poster.classList.contains('has-artwork') && size < Number(t.dataset.min)) {
        const plain = replaceArtworkWithFallback(poster, 'fit');
        if (plain?.parentElement) fitDom(plain.parentElement);
        return;
      }
      t.style.fontSize = `${size}cqw`;
    }
  });
}
