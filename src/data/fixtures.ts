/**
 * Fictional concept content. Every venue, event, price and link here is made
 * up for the prototype; none of it is a claim about real Prague events.
 *
 * Templates are laid onto real calendar dates relative to "now" so the deck
 * always has a Tonight and a Tomorrow/Weekend to show. The set deliberately
 * includes ugly data from the QA list: very long titles, missing prices,
 * duplicates across sources, cancellations, after-midnight club nights,
 * missing coordinates, dead source links and a flood of near-identical DJ
 * listings.
 */
import type { Category, DateKey, Price, SourceKind, SourceRecord, Venue } from '../types';
import { fold } from '../core/format';
import { hash } from '../core/rng';
import { addDays, fromWallMinutes, wallMinutes, weekday } from '../core/time';

const V = {
  pod: { name: 'Studio Pod Mostem', district: 'Karlín', address: 'Thámova 14', lat: 50.0928, lon: 14.4509 },
  svetlo: { name: 'Kino Světlo', district: 'Vinohrady', address: 'Korunní 41', lat: 50.0755, lon: 14.443 },
  sklep: { name: 'Klub Sklep 7', district: 'Žižkov', address: 'Seifertova 22', lat: 50.0841, lon: 14.4512 },
  okno: { name: 'Galerie Okno', district: 'Holešovice', address: 'Dělnická 9', lat: 50.1026, lon: 14.4483 },
  trznice: { name: 'Tržnice Hall 12', district: 'Holešovice', address: 'Bubenské nábřeží 12', lat: 50.0995, lon: 14.4462 },
  ticha: { name: 'Café Tichá', district: 'Nové Město', address: 'Vodičkova 30', lat: 50.0805, lon: 14.4245 },
  roh: { name: 'Divadlo na Rohu', district: 'Vršovice', address: 'Krymská 11', lat: 50.07, lon: 14.457 },
  pavilon: { name: 'Letná Pavilon', district: 'Letná', address: 'Letenské sady 1', lat: 50.096, lon: 14.423 },
  loft: { name: 'Smíchov Loft', district: 'Smíchov', address: 'Plzeňská 8', lat: 50.0712, lon: 14.403 },
  rybka: { name: 'Knihovna Rybka', district: 'Staré Město', address: 'Karoliny Světlé 18', lat: 50.0839, lon: 14.415 },
  bunkr: { name: 'Bunkr Libeň', district: 'Libeň', address: 'Na Žertvách 3', lat: 50.106, lon: 14.476 },
  dvur: { name: 'Dvůr Malá Strana', district: 'Malá Strana', address: 'Tržiště 6', lat: 50.0877, lon: 14.402 },
  sal: { name: 'Sál Dejvice', district: 'Dejvice', address: 'Jugoslávských partyzánů 2', lat: 50.1015, lon: 14.392 },
  kotel: { name: 'Komunitní dílna Kotel', district: 'Žižkov', address: 'Bořivojova 70', lat: 50.082, lon: 14.448 },
  schody: { name: 'Nusle Steps Bar', district: 'Nusle', address: 'Táborská 5', lat: 50.063, lon: 14.435 },
  // No trustworthy coordinates: must stay off the map.
  hala: { name: 'Hala Vltava', district: 'Holešovice', address: 'Address on the organizer page' },
  vrana: { name: 'Atelier Vrána', district: 'Vinohrady', address: 'Slezská 40', lat: 50.0738, lon: 14.4405 },
  kocka: { name: 'Jazzový sklep U Kočky', district: 'Staré Město', address: 'Liliová 7', lat: 50.086, lon: 14.419 },
  lod: { name: 'Loď Náplavka', district: 'Nové Město', address: 'Rašínovo nábřeží', lat: 50.07, lon: 14.414 },
  zahrada: { name: 'Zahrada Bubeneč', district: 'Bubeneč', address: 'Čechova 3', lat: 50.104, lon: 14.405 },
  // Venue not disclosed by the organizer.
  tba: { name: 'Venue announced on the day' },
  pol: { name: 'Kino Pátý Pól', district: 'Holešovice', address: 'Komunardů 20', lat: 50.1012, lon: 14.4401 },
  mlyn: { name: 'Klub Mlýn', district: 'Vysočany', address: 'Sokolovská 190', lat: 50.1105, lon: 14.498 },
  dvorana: { name: 'Dvorana Břevnov', district: 'Břevnov', address: 'Bělohorská 50', lat: 50.0848, lon: 14.36 },
  patra: { name: 'Čajovna Mezi Patry', district: 'Vinohrady', address: 'Mánesova 12', lat: 50.0775, lon: 14.437 },
  sklad: { name: 'Sklad Strašnice', district: 'Strašnice', address: 'Černokostelecká 30', lat: 50.072, lon: 14.49 },
  lodenice: { name: 'Loděnice Podolí', district: 'Podolí', address: 'Podolské nábřeží 4', lat: 50.056, lon: 14.417 },
  lampa: { name: 'Antikvariát Pod Lampou', district: 'Malá Strana', address: 'Újezd 9', lat: 50.0835, lon: 14.4045 },
  rampa: { name: 'Galerie Rampa', district: 'Karlín', address: 'Pernerova 31', lat: 50.0935, lon: 14.442 },
  tramvaj: { name: 'Bar Tramvaj', district: 'Smíchov', address: 'Štefánikova 15', lat: 50.0745, lon: 14.4045 },
  vysiny: { name: 'Sál Na Výšinách', district: 'Letná', address: 'Milady Horákové 40', lat: 50.0985, lon: 14.426 },
  ozvena: { name: 'Klub Ozvěna', district: 'Nové Město', address: 'Opatovická 6', lat: 50.079, lon: 14.418 },
  kapsa: { name: 'Divadlo Kapsa', district: 'Libeň', address: 'Zenklova 25', lat: 50.104, lon: 14.471 },
  hrebik: { name: 'Dílna Hřebík', district: 'Holešovice', address: 'Jateční 3', lat: 50.105, lon: 14.4455 },
  radio: { name: 'Rádio Café', district: 'Dejvice', address: 'Dejvická 21', lat: 50.1, lon: 14.395 },
} satisfies Record<string, Omit<Venue, 'id'>>;

type VenueKey = keyof typeof V;

interface Template {
  id: string;
  title: string;
  display?: string;
  cat: Category;
  genre?: string;
  venue: VenueKey;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  start: string;
  end?: string;
  /** 0 = free, n = from n Kč, [a, b] = range, undefined = unknown. */
  price?: number | [number, number];
  src?: SourceKind;
  conf?: number;
  oneOff?: boolean;
  local?: boolean;
  lang?: [string, boolean];
  desc?: string;
  blurb?: string;
  dupes?: string[];
  canceled?: boolean;
  gone?: boolean;
  ambiguous?: boolean;
}

const ALL = [0, 1, 2, 3, 4, 5, 6];

const T: Template[] = [
  // Music
  { id: 'small-sounds', title: 'Small Sounds', cat: 'music', genre: 'Listening session', venue: 'ticha', days: [0, 2, 4, 6], start: '19:30', end: '21:30', price: 250, local: true, desc: 'A seated listening session: one record, start to finish, on a good system. Phones away.' },
  { id: 'intimate-jazz', title: 'Intimate Jazz', cat: 'music', genre: 'Jazz', venue: 'kocka', days: [1, 3, 4, 5], start: '20:30', end: '23:00', price: 250, local: true, dupes: ['INTIMATE JAZZ (Trio Night)'], desc: 'House trio in the cellar room. Two sets.' },
  { id: 'below-ground', title: 'Below Ground', cat: 'nightlife', genre: 'Electronic', venue: 'bunkr', days: [5, 6], start: '22:00', end: '04:00', price: 200 },
  { id: 'night-shift', title: 'The Night Shift', cat: 'music', genre: 'Late live set', venue: 'sklep', days: [1, 4, 5, 6], start: '23:00', end: '03:00', price: 250, local: true },
  { id: 'three-bands', title: 'Three Bands, One Basement', cat: 'music', genre: 'Alternative', venue: 'sklep', days: [1, 2, 3], start: '21:00', price: 200, local: true, dupes: ['Three bands one basement'] },
  { id: 'leftfield', title: 'Leftfield Frequencies', cat: 'nightlife', genre: 'Leftfield electronic', venue: 'pavilon', days: [3, 5], start: '22:30', end: '02:00', price: 150 },
  { id: 'harp-tape', title: 'Harp & Tape Loops', cat: 'music', genre: 'Experimental', venue: 'rybka', days: [1, 4], start: '19:00', price: 0, oneOff: true, desc: 'Solo harp processed through tape machines in the library reading room.' },
  { id: 'brass-boat', title: 'Brass on the Boat', cat: 'music', genre: 'Brass band', venue: 'lod', days: [0, 6], start: '18:00', end: '21:00', price: 120 },
  { id: 'folk-revival', title: 'Czech Folk Revival Session', cat: 'music', genre: 'Folk', venue: 'dvur', days: [2, 5, 0], start: '20:00', local: true, desc: 'Open session; bring an instrument or just listen.' },
  { id: 'vinyl-club', title: 'Vinyl Listening Club: Czech Jazz 1965–1975', cat: 'music', genre: 'Listening session', venue: 'ticha', days: [1, 5], start: '20:00', price: 0, local: true },
  { id: 'choir', title: 'Choir of Strangers', cat: 'community', genre: 'Group singing', venue: 'kotel', days: [3, 1], start: '19:00', price: 0, local: true, desc: 'No auditions and no experience needed. Songs are taught by ear.' },
  { id: 'noise-matinee', title: 'Noise Matinée', cat: 'music', genre: 'Noise', venue: 'okno', days: [0], start: '17:00', price: 100 },
  { id: 'piano-midnight', title: 'Piano at Midnight', cat: 'music', genre: 'Solo piano', venue: 'loft', days: [6, 2], start: '23:45', end: '01:30', price: 300 },
  { id: 'balkan', title: 'Balkan Brass Party', cat: 'nightlife', genre: 'Balkan', venue: 'roh', days: [5], start: '21:30', price: 220 },
  { id: 'cypher', title: 'Hip-Hop Open Cypher', cat: 'performance', genre: 'Hip-hop', venue: 'schody', days: [4, 1], start: '20:00', price: 0, lang: ['CZ', true] },
  { id: 'organ', title: 'Organ & Electronics', cat: 'music', genre: 'Contemporary', venue: 'sal', days: [0, 3], start: '19:00', price: [250, 350], oneOff: true },

  // Film
  { id: 'cinema-motion', title: 'Cinema in Motion', cat: 'film', genre: 'Silent film, live score', venue: 'svetlo', days: [1, 3, 5], start: '20:30', price: 180 },
  { id: 'new-wave', title: 'Midnight Movie: Czech New Wave Double Bill', display: 'New Wave at Midnight', cat: 'film', genre: 'Double bill', venue: 'svetlo', days: [5, 6], start: '23:00', end: '02:30', price: 200, local: true, desc: 'Two features from the 1960s with a short break. Czech audio, English subtitles.', lang: ['CZ, EN subtitles', true] },
  { id: 'edge-docs', title: 'Documentaries from the Edge of the City', cat: 'film', genre: 'Documentary', venue: 'okno', days: [2, 0], start: '19:00', price: 0, local: true },
  { id: 'shorts', title: 'Short Film Night', cat: 'film', genre: 'Shorts', venue: 'loft', days: [4, 1], start: '20:00', price: 120 },
  { id: 'animation-long', title: 'An Evening of Experimental Czech Animation from the 1960s and 1970s, with Live Improvised Piano Accompaniment and a Q&A', cat: 'film', genre: 'Animation', venue: 'svetlo', days: [2, 4, 0], start: '19:00', price: 160, oneOff: true, local: true },
  { id: 'student-docs', title: 'Prague Short Documentary Showcase: New Work from Students of the Film School, Followed by Director Conversations', display: 'Student Docs Showcase', cat: 'film', genre: 'Documentary', venue: 'sal', days: [3, 6], start: '18:30', price: 0, local: true },

  // Talks and spoken word
  { id: 'words-out-loud', title: 'Words Out Loud', cat: 'performance', genre: 'Open mic', venue: 'roh', days: [3, 6, 1], start: '20:00', price: 0, local: true },
  { id: 'trams', title: 'How Prague Got Its Trams', cat: 'talk', genre: 'City history', venue: 'rybka', days: [2, 5], start: '18:30', price: 0, local: true, lang: ['EN', true], desc: 'Illustrated talk by a transport historian, with archive photographs.' },
  { id: 'signs', title: 'Design Talk: Signs of the City', cat: 'talk', genre: 'Design', venue: 'okno', days: [4, 0], start: '19:00', price: 100, oneOff: true },
  { id: 'twenty-slides', title: 'Twenty Slides, Twenty Seconds', cat: 'talk', genre: 'Lightning talks', venue: 'pavilon', days: [1, 4], start: '19:30', price: 150 },
  { id: 'science-bar', title: 'Science at the Bar', cat: 'talk', genre: 'Science', venue: 'schody', days: [2, 0], start: '19:00', price: 0, lang: ['CZ', true] },
  { id: 'two-languages', title: 'Poetry in Two Languages', cat: 'performance', genre: 'Poetry', venue: 'rybka', days: [6, 3], start: '18:00', price: 0, lang: ['CZ / EN', true] },

  // Art
  { id: 'after-opening', title: 'After the Opening', cat: 'art', genre: 'Exhibition opening', venue: 'okno', days: [4, 5], start: '19:00', end: '22:00', price: 0, oneOff: true },
  { id: 'riso', title: 'Ink & Paper: Risograph Show', cat: 'art', genre: 'Print', venue: 'vrana', days: [3, 6, 1], start: '18:00', price: 0, local: true },
  { id: 'utopias', title: 'Concrete Utopias', cat: 'art', genre: 'Exhibition', venue: 'trznice', days: ALL, start: '10:00', ambiguous: true, price: 120, desc: 'Multi-week exhibition. The source lists a date range but not tonight’s opening hours.' },
  { id: 'gallery-walk', title: 'Night Gallery Walk', cat: 'art', genre: 'Gallery walk', venue: 'okno', days: [5], start: '20:00', end: '23:00', price: 0, local: true },
  { id: 'slide-night', title: 'Photo Slide Night', cat: 'art', genre: 'Photography', venue: 'vrana', days: [1, 2], start: '19:30', price: 80 },

  // Community and workshops
  { id: 'draw', title: 'Community Drawing Evening at an Art Studio', display: 'Draw with Strangers', cat: 'workshop', genre: 'Drawing', venue: 'kotel', days: [4, 0, 2], start: '19:00', end: '21:30', price: 0, src: 'organizer', local: true, desc: 'Open drawing evening. Paper and pencils are provided; bring anything else you like to use.' },
  { id: 'bike-repair', title: 'Bike Repair Night', cat: 'workshop', genre: 'Repair', venue: 'kotel', days: [2, 5], start: '18:00', price: 0, local: true },
  { id: 'ceramics', title: 'Ceramics for Beginners', cat: 'workshop', genre: 'Ceramics', venue: 'vrana', days: [3, 0, 5], start: '18:30', price: 450, lang: ['EN', true] },
  { id: 'conversation', title: 'Czech for Newcomers: Conversation Table', cat: 'community', genre: 'Language exchange', venue: 'ticha', days: [2, 4, 1], start: '18:00', price: 0, lang: ['CZ / EN', true], local: true },
  { id: 'boardgames', title: 'Board Game Night', cat: 'community', genre: 'Games', venue: 'schody', days: [1, 3], start: '19:00', price: 0 },
  { id: 'repair-cafe', title: 'Repair Café', cat: 'community', genre: 'Repair', venue: 'rybka', days: [0, 6], start: '15:00', end: '18:00', price: 0, local: true },
  // Language is listed by an aggregator but not verified: must not be shown.
  { id: 'zine', title: 'Zine Making Workshop', cat: 'workshop', genre: 'Zines', venue: 'okno', days: [6, 2], start: '16:00', price: 150, lang: ['EN', false], src: 'aggregator', conf: 0.75 },
  { id: 'swing', title: 'Swing Dance Social', cat: 'community', genre: 'Dance', venue: 'dvur', days: [3, 0], start: '20:00', price: 120 },
  { id: 'supper', title: 'Neighbourhood Supper Club', cat: 'community', genre: 'Food', venue: 'zahrada', days: [5, 1], start: '19:00', local: true },
  { id: 'plant-swap', title: 'Plant Swap & Tea', cat: 'community', genre: 'Swap', venue: 'zahrada', days: [0], start: '14:00', price: 0, local: true },

  // Comedy and performance
  { id: 'comedy-all-night', title: 'Comedy All Night', cat: 'comedy', genre: 'Stand-up', venue: 'roh', days: [5, 6], start: '20:00', price: 100, local: true },
  { id: 'improv', title: 'Improv in English', cat: 'comedy', genre: 'Improv', venue: 'loft', days: [2, 4], start: '20:00', price: 150, lang: ['EN', true] },
  { id: 'standup-open', title: 'Stand-up Open Mic', cat: 'comedy', genre: 'Open mic', venue: 'schody', days: [3, 0], start: '20:30', price: 0 },
  { id: 'puppets', title: 'Puppets After Dark', cat: 'performance', genre: 'Puppetry', venue: 'roh', days: [4, 2], start: '21:00', price: 200, local: true },
  { id: 'weightless', title: 'Contemporary Dance: Weightless', cat: 'performance', genre: 'Dance', venue: 'sal', days: [5, 6], start: '19:30', price: 290, oneOff: true },
  { id: 'cabaret', title: 'Kabaret Žižkov', cat: 'performance', genre: 'Cabaret', venue: 'sklep', days: [6, 3], start: '21:00', local: true },
  { id: 'theatre-short', title: 'Pět Krátkých Her', cat: 'performance', genre: 'Theatre', venue: 'pod', days: [1, 2, 3], start: '19:30', price: 220, local: true, lang: ['CZ', true] },
  { id: 'chamber', title: 'Chamber Music in Karlín', cat: 'music', genre: 'Chamber', venue: 'pod', days: [0, 4], start: '19:00', price: [180, 280] },

  // Nightlife
  { id: 'static-bloom', title: 'Static Bloom', cat: 'nightlife', genre: 'Techno', venue: 'hala', days: [5, 6], start: '23:30', end: '03:30', price: 250 },
  { id: 'karaoke', title: 'Disco Karaoke', cat: 'nightlife', genre: 'Karaoke', venue: 'schody', days: [5, 4], start: '21:00', price: 0 },
  { id: 'slow-techno', title: 'Sunday Slow Techno', cat: 'nightlife', genre: 'Techno', venue: 'bunkr', days: [0], start: '20:00', end: '02:00', price: 150 },
  { id: 'queer-dance', title: 'Glitter Basement', cat: 'nightlife', genre: 'Queer dance party', venue: 'pavilon', days: [6], start: '22:00', end: '04:00', price: 200 },
  { id: 'popup-rave', title: 'Pop-up Rave: Location by Message', cat: 'nightlife', genre: 'Rave', venue: 'tba', days: [5, 6], start: '23:00', src: 'aggregator', conf: 0.45 },
  { id: 'midweek-disco', title: 'Midweek Disco', cat: 'nightlife', genre: 'Disco', venue: 'sklep', days: [3, 2], start: '22:00', end: '02:00', price: 100 },

  // Intentionally broken records
  { id: 'rooftop-jazz', title: 'Rooftop Jazz', cat: 'music', genre: 'Jazz', venue: 'pod', days: [2, 4, 6], start: '19:00', price: 200, canceled: true },
  { id: 'ghost', title: 'Ghost Listing Concert', cat: 'music', genre: 'Indie', venue: 'trznice', days: [1, 3, 5, 6], start: '20:00', price: 150, gone: true },
];

/**
 * Two-to-three-line blurbs for the poster info band: what the event is, in
 * plain words. Keyed by template id, or by title for venue programmes.
 */
const BLURBS: Record<string, string> = {
  'small-sounds': 'One album played start to finish on a proper hi-fi. Seated, lights low, phones away.',
  'intimate-jazz': 'The house trio plays standards and originals in the cellar room. Two sets with a break.',
  'below-ground': 'Six hours of driving techno in a former air-raid shelter. Two rooms, one long night.',
  'night-shift': 'A late live set from a rotating local band. Starts at eleven, plays until the bar closes.',
  'three-bands': 'Three local alternative bands, thirty-five minutes each, in a small brick basement.',
  leftfield: 'Broken beats, odd tempos and live modular sets in the pavilion above Letná park.',
  'harp-tape': 'Solo harp run through reel-to-reel tape loops, performed in the library reading room.',
  'brass-boat': 'A ten-piece brass band plays the deck of a moored river boat. Standing room, bar open.',
  'folk-revival': 'Open session of Czech and Moravian folk tunes. Bring an instrument or just sit and listen.',
  'vinyl-club': 'Original pressings of Czech jazz from 1965 to 1975, played and introduced by a collector.',
  choir: 'Learn three songs by ear in an hour, then sing them together. No auditions, no experience.',
  'noise-matinee': 'An afternoon of loud, textured noise sets in the gallery. Earplugs at the door.',
  'piano-midnight': 'A solo pianist plays quiet late-night pieces in a candlelit loft. Seated, small room.',
  balkan: 'A Balkan brass band plays a dance set, followed by DJs spinning gypsy punk and cumbia.',
  cypher: 'Open rap cypher with a live beatmaker. Sign up at the door to take the mic, or just watch.',
  organ: 'Contemporary pieces for pipe organ and live electronics in a resonant concert hall.',
  'cinema-motion': 'A silent classic screened with a live score from a three-piece band beside the screen.',
  'new-wave': 'Two Czech New Wave features from the 1960s with a short break. English subtitles.',
  'edge-docs': 'Short documentaries about life on the edges of Prague, with the filmmakers in the room.',
  shorts: 'A programme of eight short films, from comedy to animation, picked by the venue’s film club.',
  'animation-long': 'Rare Czech animated shorts from the 60s and 70s with live piano, then a Q&A.',
  'student-docs': 'New short documentaries by film school students, each followed by a talk with its director.',
  'words-out-loud': 'Open mic for poems, stories and songs. Five minutes each. Sign up from 19:30.',
  trams: 'An illustrated talk on how Prague built its tram network, with archive photographs.',
  signs: 'A designer walks through the history of Prague’s street signs, shopfronts and lettering.',
  'twenty-slides': 'Eight speakers, twenty slides each, twenty seconds per slide. Topics are a surprise.',
  'science-bar': 'A researcher explains their work in plain Czech over a beer, then takes questions.',
  'two-languages': 'Poets read the same poems in Czech and English, side by side, then talk about translating.',
  'after-opening': 'Opening night for a new group show. Drinks, a short welcome and the artists in the room.',
  riso: 'Prints, zines and posters made on risograph machines by local studios. Most are for sale.',
  utopias: 'Photographs and models of socialist-era housing estates and the futures they promised.',
  'gallery-walk': 'A guided late-night walk through three galleries in Holešovice, with a drink at each.',
  'slide-night': 'Photographers show 35mm slides on a real projector and tell the stories behind them.',
  draw: 'An open drawing evening with a model and still lifes. Paper and pencils are provided.',
  'bike-repair': 'Volunteer mechanics help you fix your own bike. Tools and spare parts on hand.',
  ceramics: 'A first lesson on the wheel: centre the clay, throw a bowl, take it home after firing.',
  conversation: 'Practise Czech at small tables with native speakers. All levels, tea included.',
  boardgames: 'A shelf of two hundred games and staff who teach the rules. Come alone or bring friends.',
  'repair-cafe': 'Bring a broken lamp, toaster or jacket. Volunteers help you repair it for free.',
  zine: 'Make your own zine with collage, typewriters and a photocopier. Materials provided.',
  swing: 'A short beginners’ lesson, then social dancing to swing records in the courtyard hall.',
  supper: 'A shared three-course dinner at long tables, cooked by a different neighbour each month.',
  'plant-swap': 'Bring a cutting or a pot, take one home. Tea and advice from the garden volunteers.',
  'comedy-all-night': 'Six stand-up comedians, back to back, with a host keeping it moving. In English.',
  improv: 'An improv troupe builds scenes from audience suggestions. No two nights are the same.',
  'standup-open': 'Open mic stand-up: new comics trying new material. Five minutes each, cheap beer.',
  puppets: 'Marionettes for grown-ups: a dark, funny show from a Prague puppet company.',
  weightless: 'An hour-long contemporary dance piece for five dancers about gravity and falling.',
  cabaret: 'Songs, sketches and burlesque from Žižkov’s resident cabaret troupe. Late show.',
  'theatre-short': 'Five short plays by young Czech writers, staged in one evening. In Czech.',
  chamber: 'A string quartet plays Dvořák and Martinů in a converted Karlín studio.',
  'static-bloom': 'Hard, fast techno in a former industrial hall. Four DJs, one room, no photos.',
  karaoke: 'Disco and pop karaoke with a live host, a glitter ball and a long song list.',
  'slow-techno': 'Slow, deep techno to end the weekend. Starts early, finishes at two.',
  'queer-dance': 'A queer dance party with pop, house and disco. Everyone welcome, door policy enforced.',
  'popup-rave': 'A one-off rave in an unannounced location. The address is sent on the day.',
  'midweek-disco': 'Disco, boogie and Italo records in the basement club. Free entry before 23:00.',
  'rooftop-jazz': 'Jazz quartet on the roof terrace, weather permitting, with views over Karlín.',
  ghost: 'An indie band plays the main hall with a local support act.',

  // Venue programmes, keyed by title.
  'Cinema Under the Tracks': 'Repertory screening in the cinema under the railway viaduct. Classic print, small bar.',
  'Animated Shorts for Grown-ups': 'Animated short films for adults from festivals around Europe.',
  'Polish Comedies of the 70s': 'Two Polish comedies from the 1970s, with English subtitles.',
  'Wrong Answers Film Quiz': 'A film quiz where the funniest wrong answer scores as well as the right one. Teams of four.',
  'Sci-fi on 35mm': 'A classic science-fiction feature screened from a 35mm print.',
  'Garage Punk Triple Bill': 'Three fast, loud garage-punk bands in one evening. Standing only.',
  'Mlýn Jazz Jam': 'The house band plays a set, then the stage opens to anyone who brings an instrument.',
  'Dub Sound System Night': 'A homemade sound system plays dub and reggae on heavy bass until three.',
  'Surf Rock Revival': 'Reverb-heavy instrumental surf rock from two Prague bands.',
  'Shoegaze Sunday': 'Two shoegaze bands, loud guitars and a lot of fog.',
  'Folk Dances of Moravia': 'A caller teaches Moravian folk dances to a live band. No partner needed.',
  'Family Puppet Matinée': 'A traditional marionette show for children and their grown-ups. About an hour.',
  'String Quartet: Janáček & Haas': 'A string quartet plays Janáček’s Intimate Letters and Haas’s second quartet.',
  'Neighbourhood Film Club': 'A monthly film club: one feature, then a short conversation over tea.',
  'Tea & Tanpura': 'Indian classical music on sitar and tanpura in a tearoom. Seated on cushions.',
  'Silent Reading Party': 'Bring a book and read in good company for an hour. Quiet music, tea, no talking.',
  'Haiku Writing Circle': 'A short introduction to haiku, then write and share your own. In English.',
  'Oud by Candlelight': 'Solo oud and Arabic maqam improvisations in a candlelit tearoom.',
  'Warehouse Techno': 'All-night techno in a Strašnice warehouse. Two rooms, runs until five.',
  'Screen Printing Open Studio': 'Print your own tote or poster with help from the studio team. Materials included.',
  'Strašnice Flea Night': 'An evening flea market with vintage clothes, records and street food.',
  'Breakbeat Basement': 'Breakbeat, jungle and drum and bass in a low basement room.',
  'Rowing Club Movie Night': 'A feature film screened in the boathouse of an old rowing club.',
  'River Stories: Floods of Prague': 'A local historian on the great Vltava floods, with photos from the archive.',
  'Accordion & Wine': 'An accordion duo plays French and Czech songs. Moravian wine by the glass.',
  'Readings from Banned Books': 'Actors read from books banned under communism, introduced by a literary historian.',
  'Book Launch & Conversation': 'An author presents a new novel, reads a chapter and signs copies.',
  'Translators’ Evening': 'Literary translators talk about the books they are working on and read short extracts.',
  'Second-hand Vinyl Hour': 'Crate-dig through second-hand records while the owner plays favourites.',
  'Opening: Soft Machines': 'Opening of a show of kinetic and robotic sculptures by four young artists.',
  'Artist Talk: Mapping Karlín': 'An artist talks about a year spent drawing and mapping Karlín street by street.',
  'Life Drawing': 'Untutored life drawing with a model. Short poses first, then longer ones.',
  'Curator Walk-through': 'The curator leads a tour of the current exhibition and answers questions.',
  'Tram Line Trivia': 'A pub quiz on Prague, trams and general knowledge. Teams of up to five.',
  'Indie Pop Night': 'DJs play indie pop, Britpop and indie dance until three.',
  'Songwriters in the Round': 'Three songwriters sit on stage together and take turns playing their songs.',
  'Karaoke Rescue Squad': 'Karaoke with a live backing band that rescues anyone who loses the tune.',
  'Baroque by Night': 'Baroque chamber music on period instruments, by candlelight.',
  'Science Café: Sleep': 'A sleep researcher explains what happens in the brain at night, then takes questions.',
  'Choral Evensong': 'A chamber choir sings an evening service of English and Czech choral music.',
  'Stand-up in Czech': 'Four Czech comedians, one host, in Czech.',
  'Ambient Lounge': 'Ambient and downtempo sets for sitting and listening. Beanbags provided.',
  'Late Jazz Session': 'A late jazz session with a rotating line-up of Prague players.',
  'Synth Meetup': 'Bring a synth or come and play with others’. Show-and-tell and an open jam.',
  'Electronic Live Acts': 'Three live electronic acts with hardware only, no laptops.',
  'Physical Theatre: Hold On': 'A physical theatre piece for three performers, wordless and about an hour long.',
  'Improv Jam': 'Open improv jam: anyone can jump on stage for a scene. Hosted by the house team.',
  'Clown Cabaret': 'Clowns, mime and slapstick in a late-night cabaret for adults.',
  'New Plays Reading': 'Actors read new Czech plays from scripts, followed by a talk with the writers.',
  'Woodworking Basics': 'Learn to measure, saw and join wood, and make a small box to take home.',
  'Fix Your Lamp Night': 'Bring a broken lamp and rewire it with help from the workshop team.',
  'Upholstery Evening': 'Re-cover a stool or chair seat with fabric, foam and a staple gun.',
  'Radio Drama Live Taping': 'Watch a radio play being recorded live, sound effects and all.',
  'Pub Philosophy': 'A philosopher poses a question and the room argues it out. No reading needed.',
  'Swing Records & Dancing': 'Swing records from the 30s and 40s and a dance floor. Beginners welcome.',
};

/**
 * Weekly programmes for smaller venues: each night a venue may host one item
 * from its pool, chosen deterministically from the date. Gives every night a
 * realistic volume without hand-writing hundreds of records.
 */
type Slot = [title: string, cat: Category, genre: string, start: string, price?: number | [number, number], end?: string];
const PROGRAMMES: Partial<Record<VenueKey, Slot[]>> = {
  pol: [
    ['Cinema Under the Tracks', 'film', 'Repertory', '20:00', 150],
    ['Animated Shorts for Grown-ups', 'film', 'Animation', '19:30', 130],
    ['Polish Comedies of the 70s', 'film', 'Repertory', '20:30', 150],
    ['Wrong Answers Film Quiz', 'community', 'Quiz', '19:00', 0],
    ['Sci-fi on 35mm', 'film', '35mm', '21:00', 170],
  ],
  mlyn: [
    ['Garage Punk Triple Bill', 'music', 'Punk', '20:30', 180],
    ['Mlýn Jazz Jam', 'music', 'Jazz jam', '21:00', 0],
    ['Dub Sound System Night', 'nightlife', 'Dub', '22:00', 150, '03:00'],
    ['Surf Rock Revival', 'music', 'Surf rock', '20:00', 200],
    ['Shoegaze Sunday', 'music', 'Shoegaze', '19:30', 220],
  ],
  dvorana: [
    ['Folk Dances of Moravia', 'community', 'Folk dance', '19:00', 100],
    ['Family Puppet Matinée', 'performance', 'Puppetry', '16:00', 120],
    ['String Quartet: Janáček & Haas', 'music', 'Classical', '19:30', [250, 390]],
    ['Neighbourhood Film Club', 'film', 'Film club', '19:00', 0],
  ],
  patra: [
    ['Tea & Tanpura', 'music', 'Indian classical', '19:00', 200],
    ['Silent Reading Party', 'community', 'Reading', '18:30', 0],
    ['Haiku Writing Circle', 'workshop', 'Writing', '18:00', 80],
    ['Oud by Candlelight', 'music', 'Oud', '20:00', 220],
  ],
  sklad: [
    ['Warehouse Techno', 'nightlife', 'Techno', '23:00', 250, '05:00'],
    ['Screen Printing Open Studio', 'workshop', 'Screen print', '17:00', 200],
    ['Strašnice Flea Night', 'community', 'Market', '17:00', 0, '21:00'],
    ['Breakbeat Basement', 'nightlife', 'Breakbeat', '22:00', 180, '03:00'],
  ],
  lodenice: [
    ['Rowing Club Movie Night', 'film', 'Outdoor-style cinema indoors', '19:30', 100],
    ['River Stories: Floods of Prague', 'talk', 'Local history', '18:30', 0],
    ['Accordion & Wine', 'music', 'Accordion', '19:00', 150],
  ],
  lampa: [
    ['Readings from Banned Books', 'talk', 'Literature', '19:00', 0],
    ['Book Launch & Conversation', 'talk', 'Literature', '18:30', 0],
    ['Translators’ Evening', 'talk', 'Translation', '19:00', 50],
    ['Second-hand Vinyl Hour', 'community', 'Records', '17:00', 0],
  ],
  rampa: [
    ['Opening: Soft Machines', 'art', 'Exhibition opening', '19:00', 0],
    ['Artist Talk: Mapping Karlín', 'talk', 'Artist talk', '18:30', 0],
    ['Life Drawing', 'workshop', 'Drawing', '19:00', 250],
    ['Curator Walk-through', 'art', 'Guided tour', '18:00', 100],
  ],
  tramvaj: [
    ['Tram Line Trivia', 'community', 'Quiz', '19:30', 0],
    ['Indie Pop Night', 'nightlife', 'Indie', '22:00', 100, '03:00'],
    ['Songwriters in the Round', 'music', 'Singer-songwriter', '20:00', 150],
    ['Karaoke Rescue Squad', 'nightlife', 'Karaoke', '21:00', 0],
  ],
  vysiny: [
    ['Baroque by Night', 'music', 'Early music', '20:00', [200, 450]],
    ['Science Café: Sleep', 'talk', 'Science', '19:00', 0],
    ['Choral Evensong', 'music', 'Choral', '18:00', 0],
    ['Stand-up in Czech', 'comedy', 'Stand-up', '20:00', 180],
  ],
  ozvena: [
    ['Ambient Lounge', 'music', 'Ambient', '20:00', 120],
    ['Late Jazz Session', 'music', 'Jazz', '22:00', 200, '01:00'],
    ['Synth Meetup', 'community', 'Electronics', '19:00', 0],
    ['Electronic Live Acts', 'nightlife', 'Live electronics', '22:30', 180, '03:00'],
  ],
  kapsa: [
    ['Physical Theatre: Hold On', 'performance', 'Physical theatre', '19:30', 260],
    ['Improv Jam', 'comedy', 'Improv', '20:00', 100],
    ['Clown Cabaret', 'performance', 'Clowning', '20:00', 180],
    ['New Plays Reading', 'performance', 'Staged reading', '19:00', 0],
  ],
  hrebik: [
    ['Woodworking Basics', 'workshop', 'Woodwork', '17:30', 400],
    ['Fix Your Lamp Night', 'workshop', 'Repair', '18:00', 0],
    ['Upholstery Evening', 'workshop', 'Craft', '18:00', 350],
  ],
  radio: [
    ['Radio Drama Live Taping', 'performance', 'Radio drama', '19:30', 0],
    ['Pub Philosophy', 'talk', 'Philosophy', '19:00', 0],
    ['Swing Records & Dancing', 'nightlife', 'Swing', '21:00', 80],
  ],
};

function programmes(date: DateKey): Template[] {
  const out: Template[] = [];
  for (const [venue, slots] of Object.entries(PROGRAMMES) as [VenueKey, Slot[]][]) {
    const h = hash(`${venue}:${date}`);
    if (h % 10 === 0) continue; // dark night
    const [title, cat, genre, start, price, end] = slots[h % slots.length];
    out.push({ id: fold(title).replace(/ /g, '-'), title, cat, genre, venue, days: ALL, start, end, price, local: h % 3 === 0, oneOff: h % 7 === 0, blurb: BLURBS[title] });
  }
  return out;
}

/** Twenty near-identical DJ listings from one aggregator feed. */
const DJS = [
  'Kova', 'Mira Lux', 'Pulse Petr', 'Dvořák B2B Nová', 'Lenka K', 'Tomas Deep', 'Noční Vlak', 'Sublet',
  'Ondřej Ø', 'Vlna', 'Kaja', 'Basement Ivo', 'Zuzka Z', 'Grey Tram', 'Hana Haze', 'Low Ceiling',
  'Radek R', 'Pavla P', 'Drift Kid', 'Echo Šárka',
];
const DJ_VENUES: VenueKey[] = ['trznice', 'bunkr', 'sklep', 'hala'];

function price(p: Template['price']): Price | undefined {
  if (p === undefined) return undefined;
  if (p === 0) return { kind: 'free' };
  if (Array.isArray(p)) return { kind: 'paid', min: p[0], max: p[1] };
  return { kind: 'paid', min: p };
}

function at(date: DateKey, hm: string): string {
  return `${date}T${hm}`;
}

/** End before start means the event runs past midnight. */
function endFor(date: DateKey, start: string, end?: string): string | undefined {
  if (!end) return undefined;
  const s = wallMinutes(at(date, start));
  let e = wallMinutes(at(date, end));
  if (e <= s) e += 24 * 60;
  return fromWallMinutes(e);
}

const SOURCES: Record<SourceKind, { id: string; name: string; base: string }> = {
  organizer: { id: 'organizer', name: 'Organizer listing', base: 'https://example.org/organizers' },
  venue: { id: 'venue', name: 'Venue programme', base: 'https://example.org/venues' },
  aggregator: { id: 'praha-feed', name: 'Praha Listings (aggregator)', base: 'https://example.com/praha-feed' },
};

function record(t: Template, date: DateKey, overrides: Partial<SourceRecord> = {}): SourceRecord {
  const kind = t.src ?? 'venue';
  const s = SOURCES[kind];
  const venue = { id: t.venue, ...V[t.venue] } as Venue;
  // Daytime starts on the given date; anything before the night cutoff is
  // listed on the calendar day after.
  const startDate = Number(t.start.slice(0, 2)) < 5 ? addDays(date, 1) : date;
  return {
    sourceId: s.id,
    sourceName: s.name,
    sourceKind: kind,
    url: `${s.base}/${t.venue}/${t.id}-${date}`,
    title: t.title,
    displayTitle: t.display,
    start: t.ambiguous ? undefined : at(startDate, t.start),
    end: t.ambiguous ? undefined : endFor(startDate, t.start, t.end),
    dateAmbiguous: t.ambiguous,
    listedDate: date,
    venue,
    price: price(t.price),
    category: t.cat,
    genre: t.genre,
    language: t.lang ? { value: t.lang[0], verified: t.lang[1] } : undefined,
    description: t.desc,
    blurb: t.blurb ?? BLURBS[t.id],
    status: t.canceled ? 'canceled' : 'scheduled',
    sourceAlive: !t.gone,
    confidence: t.conf ?? (kind === 'aggregator' ? 0.7 : 0.9),
    oneOff: t.oneOff ?? false,
    local: t.local ?? false,
    updatedAt: at(addDays(date, -1), '16:00'),
    ...overrides,
  };
}

/**
 * Build source records for the nights around `tonight`.
 * Yesterday is included so stale saves and ended states have something to
 * point at.
 */
export function buildFixtures(tonight: DateKey): SourceRecord[] {
  const out: SourceRecord[] = [];
  for (let offset = -1; offset <= 7; offset++) {
    const date = addDays(tonight, offset);
    const wd = weekday(date);
    for (const t of [...T, ...programmes(date)]) {
      if (!t.days.includes(wd)) continue;
      out.push(record(t, date));
      for (const dupeTitle of t.dupes ?? []) {
        // Same event re-published by the aggregator, with a messier title and
        // no validated price.
        out.push(
          record({ ...t, src: 'aggregator', title: dupeTitle, display: undefined }, date, {
            price: undefined,
            description: undefined,
          }),
        );
      }
    }
    if (wd === 5 || wd === 6) {
      DJS.forEach((dj, i) => {
        const venue = DJ_VENUES[i % DJ_VENUES.length];
        const start = ['22:00', '22:30', '23:00', '23:30'][i % 4];
        out.push(
          record(
            {
              id: `dj-${i}`,
              title: `DJ Night: ${dj}`,
              cat: 'nightlife',
              genre: 'DJ set',
              venue,
              days: [wd],
              start,
              end: '03:00',
              price: 150,
              src: 'aggregator',
              blurb: `${dj} plays one long set of house and techno, from opening until three.`,
            },
            date,
          ),
        );
      });
    }
  }
  return out;
}
