/**
 * A schematic Prague: the Vltava, a few parks and district names, drawn
 * locally so the map needs no tiles, keys or network.
 */

const BBOX = { west: 14.35, east: 14.5, north: 50.115, south: 50.045 };
const W = 1075;
const H = 778;

export function project(lat: number, lon: number): [number, number] {
  return [((lon - BBOX.west) / (BBOX.east - BBOX.west)) * W, ((BBOX.north - lat) / (BBOX.north - BBOX.south)) * H];
}

const RIVER: [number, number][] = [
  [50.035, 14.407], [50.05, 14.414], [50.058, 14.416], [50.066, 14.414], [50.074, 14.411], [50.081, 14.41],
  [50.0865, 14.4114], [50.09, 14.414], [50.093, 14.42], [50.0945, 14.428], [50.096, 14.437], [50.0985, 14.447],
  [50.101, 14.456], [50.105, 14.461], [50.11, 14.455], [50.112, 14.444], [50.114, 14.432], [50.117, 14.423], [50.122, 14.413],
];

const PARKS: [number, number, number, number][] = [
  [50.0965, 14.421, 70, 22], // Letná
  [50.106, 14.42, 85, 30], // Stromovka
  [50.0825, 14.397, 30, 55], // Petřín
  [50.0755, 14.4385, 26, 18], // Riegrovy sady
  [50.087, 14.465, 40, 18], // Vítkov
];

const DISTRICTS: [string, number, number][] = [
  ['Holešovice', 50.1045, 14.443], ['Letná', 50.0995, 14.426], ['Karlín', 50.0915, 14.449], ['Libeň', 50.1075, 14.48],
  ['Vysočany', 50.1115, 14.5], ['Žižkov', 50.0825, 14.457], ['Vinohrady', 50.0745, 14.446], ['Vršovice', 50.068, 14.462],
  ['Strašnice', 50.0745, 14.486], ['Nusle', 50.0605, 14.436], ['Podolí', 50.0525, 14.42], ['Smíchov', 50.068, 14.399],
  ['Malá Strana', 50.0885, 14.398], ['Staré Město', 50.0875, 14.421], ['Nové Město', 50.077, 14.422], ['Dejvice', 50.103, 14.389],
  ['Břevnov', 50.0855, 14.362], ['Bubeneč', 50.1055, 14.405],
];

const pt = ([lat, lon]: [number, number]) => project(lat, lon).map((v) => v.toFixed(1)).join(',');

export function PRAGUE_MAP(pins: string): string {
  let grid = '';
  for (let x = 0; x <= W; x += 54) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  for (let y = 0; y <= H; y += 54) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
  const parks = PARKS.map(([lat, lon, rx, ry]) => {
    const [x, y] = project(lat, lon);
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx}" ry="${ry}"/>`;
  }).join('');
  const labels = DISTRICTS.map(([n, lat, lon]) => {
    const [x, y] = project(lat, lon);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${n.toLocaleUpperCase('cs-CZ')}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <rect width="${W}" height="${H}" fill="#E8E2D0"/>
    <g stroke="#D6CFBB" stroke-width="2">${grid}</g>
    <g fill="#D3DBBE">${parks}</g>
    <polyline points="${RIVER.map(pt).join(' ')}" fill="none" stroke="#A9CBE3" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <g class="map-labels" fill="#8E8774">${labels}</g>
    ${pins}
  </svg>`;
}
