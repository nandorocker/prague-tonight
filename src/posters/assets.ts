/** Reusable decorative art. Source records and poster styles never select these subjects. */
export type ArtworkKind = 'photo' | 'object' | 'cartoon' | 'collage';
export type ArtworkToken = string;

export interface ArtworkAsset {
  id: string;
  kind: ArtworkKind;
  src: string;
  label: string;
  attribution: string;
  rights: string;
  sourceUrl?: string;
  photographic: boolean;
  faceDominant: boolean;
  transparent: boolean;
  aspectRatio: number;
  density: 'light' | 'dense';
}

const original = (id: string, kind: ArtworkKind, label: string, aspectRatio = 1): ArtworkAsset => ({
  id, kind, src: `/artwork/${id}.svg`, label,
  attribution: 'Original vector artwork made for Prague Tonight',
  rights: 'Project original', photographic: false, faceDominant: false,
  transparent: true, aspectRatio, density: 'light',
});

const archive = (id: string, label: string, item: string, aspectRatio: number, faceDominant = false): ArtworkAsset => ({
  id, kind: 'photo', src: `/artwork/${id}.webp`, label,
  attribution: 'Bain News Service / Library of Congress, Prints & Photographs Division',
  rights: 'Library of Congress: no known restrictions on publication',
  sourceUrl: `https://www.loc.gov/item/${item}/`,
  photographic: true, faceDominant, transparent: false, aspectRatio, density: 'dense',
});

/** IDs are persisted in saved appearances: keep them stable as the library grows. */
export const ARTWORK_ASSETS: readonly ArtworkAsset[] = [
  archive('archive-horses', 'Prestashka of W. Winans — horses, c. 1910–1915', '2014689217', 1.37),
  archive('archive-truck', 'U.S. Mail truck, c. 1910–1915', '2014694708', 1.36),
  archive('archive-phonograph', 'First phonograph — an undated archival photograph', '2014702526', 1.39),
  archive('archive-bain', 'G. G. Bain in his office, c. 1910–1915', '2014695048', 1.38, true),
  original('rotary-phone', 'object', 'A red rotary telephone', 1.4),
  original('lounge-chair', 'object', 'An implausibly elegant green chair'),
  original('sardine-tin', 'object', 'An open tin with one enormous sardine', 1.4),
  original('portable-tv', 'object', 'A portable television with rabbit-ear aerials'),
  original('dancing-hotdog', 'cartoon', 'A dancing hot dog in white gloves'),
  original('confused-pigeon', 'cartoon', 'A confused blue pigeon'),
  original('melancholy-moon', 'cartoon', 'A melancholy moon with very long legs'),
  original('expressive-cat', 'cartoon', 'A wide-eyed orange cat'),
  original('moon-chair', 'collage', 'A moon balanced on a chair inside a paper orbit', 1.3),
  original('fish-telephone', 'collage', 'A fish answering a telephone among paper fragments', 1.3),
  original('pigeon-orbit', 'collage', 'A pigeon orbiting a television on a paper moon', 1.3),
];
