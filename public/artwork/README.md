# Decorative artwork library

These subjects are illustrative poster artwork, not photographs of the listed performers, audience, or venue. Event facts come from the event feed independently of the artwork.

## Archival photographs

The source is the Library of Congress, Prints & Photographs Division, **Bain News Service photograph collection**. Each linked item explicitly states **“No known restrictions on publication.”** That is the institution's rights advisory, not a newly assigned license. The catalogue and event details retain that wording rather than claiming that age alone establishes public-domain status.

The four source records and rights advisories were checked on 23 October 2026. Local derivatives are resized WebP copies of the Library's JPEG service images; the scans retain their original framing. The application loads these files locally, with no dependency on the archive at runtime.

| Local asset | Original title and date | Source record | Source JPEG |
| --- | --- | --- | --- |
| `archive-horses.webp` | Prestashka of W. Winans; c. 1910–1915 | [LOC 2014689217](https://www.loc.gov/item/2014689217/) | [ggbain.09231](https://tile.loc.gov/storage-services/service/pnp/ggbain/09200/09231v.jpg) |
| `archive-truck.webp` | U.S. Mail truck; c. 1910–1915 | [LOC 2014694708](https://www.loc.gov/item/2014694708/) | [ggbain.14735](https://tile.loc.gov/storage-services/service/pnp/ggbain/14700/14735v.jpg) |
| `archive-phonograph.webp` | First phonograph; no date recorded on caption card | [LOC 2014702526](https://www.loc.gov/item/2014702526/) | [ggbain.50225](https://tile.loc.gov/storage-services/service/pnp/ggbain/50200/50225v.jpg) |
| `archive-bain.webp` | G.G. Bain; c. 1910–1915 | [LOC 2014695048](https://www.loc.gov/item/2014695048/) | [ggbain.15074](https://cdn.loc.gov/service/pnp/ggbain/15000/15074v.jpg) |

Credit: **Bain News Service / Library of Congress, Prints & Photographs Division.** The portrait is marked face-dominant. The horses and truck include small, distant people; these are not face-dominant compositions. Cropping in the poster engine must preserve that distinction.

## Original vector artwork

The eleven SVG files were made for this prototype as reusable original illustrations, with no imported clip art, trademarks, or performer likenesses:

- Found objects: `rotary-phone`, `lounge-chair`, `sardine-tin`, `portable-tv`.
- Cartoon subjects: `dancing-hotdog`, `confused-pigeon`, `melancholy-moon`, `expressive-cat`.
- Cut-paper-style collages: `moon-chair`, `fish-telephone`, `pigeon-orbit`.

Each is a self-contained SVG with transparent surroundings and a descriptive title. Distinct drawing treatments include comic ink, flat cutouts, fine-line drawing, angular print-like marks, and layered paper shapes. They contain no scripts, external fonts, or external image references.

## Catalogue

`src/posters/assets.ts` is the runtime catalogue. It records kind, photographic content, human-face prominence, transparency, aspect ratio, density, attribution, and source/rights information. Keep IDs stable: saved appearances refer to them. Add assets only with a recorded source or original-art attribution.

The four `archive-*.webp` photographs are cropped inside the Library of Congress scan: the paper mat, the black negative edge and the handwritten caption were removed so only the picture shows. The crop does not alter the picture itself.
