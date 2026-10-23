/** Independent, device-stable decorative subjects. Never inspect event facts or styles. */
import { ARTWORK_ASSETS, type ArtworkToken } from './assets';
import { hash } from '../core/rng';

export const artworkAsset = (token: unknown) => typeof token === 'string' ? ARTWORK_ASSETS.find((a) => a.id === token) : undefined;
export const isKnownArtwork = (token: unknown): token is ArtworkToken => token === 'none' || !!artworkAsset(token);
export const normalizeArtwork = (token: unknown): ArtworkToken => isKnownArtwork(token) ? token : 'none';
export function artworkMap(raw: unknown): Map<string, ArtworkToken> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Map();
  return new Map(Object.entries(raw).map(([id, token]) => [id, normalizeArtwork(token)]));
}
type Mode = 'none' | 'found' | 'cartoon' | 'collage';
export const artworkMode = (token: unknown): Mode => {
  const a = artworkAsset(token);
  return !a ? 'none' : a.kind === 'photo' || a.kind === 'object' ? 'found' : a.kind;
};
const TARGET: Record<Mode, number> = { none: .55, found: .20, cartoon: .15, collage: .10 };

/** Off-deck details get the same weighted distribution without freezing previews. */
export function fallbackArtwork(id: string): ArtworkToken {
  const roll = hash(`${id}:artwork-mode`) % 100;
  const mode: Mode = roll < 55 ? 'none' : roll < 75 ? 'found' : roll < 90 ? 'cartoon' : 'collage';
  const pool = ARTWORK_ASSETS.filter((a) => artworkMode(a.id) === mode && (!a.faceDominant || hash(`${id}:face`) % 10 === 0));
  return pool.length ? pool[hash(`${id}:artwork-subject`) % pool.length].id : 'none';
}

/** Freeze known tokens, then fill mode deficits with seeded, underused subjects. */
export function assignArtwork(deck: readonly { id: string }[], known: ReadonlyMap<string, ArtworkToken>): Map<string, ArtworkToken> {
  const choices = new Map<string, ArtworkToken>();
  const counts: Record<Mode, number> = { none: 0, found: 0, cartoon: 0, collage: 0 };
  const uses = new Map<string, number>();
  const recent: ArtworkToken[] = [];
  let faces = 0;
  for (const [i, e] of deck.entries()) {
    let token = known.has(e.id) ? normalizeArtwork(known.get(e.id)) : undefined;
    if (token === undefined) {
      const modes = (Object.keys(TARGET) as Mode[]).sort((a, b) =>
        ((i + 1) * TARGET[b] - counts[b]) - ((i + 1) * TARGET[a] - counts[a]) || hash(`${e.id}:${a}`) - hash(`${e.id}:${b}`));
      token = 'none';
      for (const mode of modes) {
        if (mode === 'none') break;
        const pool = ARTWORK_ASSETS.filter((a) => artworkMode(a.id) === mode &&
          (!a.faceDominant || faces + 1 <= Math.floor((i + 1) * .10)) &&
          !(a.photographic && recent.length === 2 && recent.every((t) => artworkAsset(t)?.photographic)) &&
          !(a.faceDominant && recent.length === 2 && recent.every((t) => artworkAsset(t)?.faceDominant)));
        pool.sort((a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0) || hash(`${e.id}:${a.id}`) - hash(`${e.id}:${b.id}`));
        if (pool.length) { token = pool[0].id; break; }
      }
    }
    choices.set(e.id, token);
    counts[artworkMode(token)]++;
    uses.set(token, (uses.get(token) ?? 0) + 1);
    if (artworkAsset(token)?.faceDominant) faces++;
    recent.push(token);
    if (recent.length > 2) recent.shift();
  }
  return choices;
}
