/**
 * IATA code -> coordinates, for looking up weather by station. Covers Kazakhstan's
 * domestic network plus Air Astana's main international destinations. Not
 * exhaustive — an unknown code simply means no weather is shown for that leg.
 */
export const AIRPORT_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  // Kazakhstan
  ALA: { lat: 43.352, lon: 77.0405, name: 'Almaty' },
  NQZ: { lat: 51.0222, lon: 71.4669, name: 'Astana' },
  CIT: { lat: 42.3651, lon: 69.4795, name: 'Shymkent' },
  PWQ: { lat: 52.1859, lon: 77.0016, name: 'Pavlodar' },
  GUW: { lat: 47.1225, lon: 51.8195, name: 'Atyrau' },
  KGF: { lat: 49.6607, lon: 73.3401, name: 'Karaganda' },
  PPK: { lat: 54.7716, lon: 69.165, name: 'Petropavl' },
  UKK: { lat: 50.0344, lon: 82.4938, name: 'Oskemen' },
  AKX: { lat: 50.2458, lon: 57.2075, name: 'Aktobe' },
  URA: { lat: 51.1917, lon: 51.5442, name: 'Oral' },
  SCO: { lat: 43.86, lon: 51.0922, name: 'Aktau' },
  KZO: { lat: 44.63, lon: 65.5975, name: 'Kyzylorda' },
  DZN: { lat: 47.7, lon: 67.7167, name: 'Zhezkazgan' },
  PLX: { lat: 50.3536, lon: 80.2364, name: 'Semey' },
  TDK: { lat: 45.0031, lon: 78.4864, name: 'Taldykorgan' },

  // Europe
  FRA: { lat: 50.0333, lon: 8.5706, name: 'Frankfurt' },
  LHR: { lat: 51.47, lon: -0.4543, name: 'London Heathrow' },
  CDG: { lat: 49.0097, lon: 2.5479, name: 'Paris CDG' },
  AMS: { lat: 52.3086, lon: 4.7639, name: 'Amsterdam' },
  IST: { lat: 41.2753, lon: 28.7519, name: 'Istanbul' },

  // Middle East
  DXB: { lat: 25.2532, lon: 55.3657, name: 'Dubai' },
  DOH: { lat: 25.2731, lon: 51.6089, name: 'Doha' },
  MCT: { lat: 23.5933, lon: 58.2844, name: 'Muscat' },

  // Asia
  DEL: { lat: 28.5562, lon: 77.1, name: 'Delhi' },
  BKK: { lat: 13.69, lon: 100.7501, name: 'Bangkok' },
  ICN: { lat: 37.4602, lon: 126.4407, name: 'Seoul Incheon' },
  PEK: { lat: 40.0801, lon: 116.5846, name: 'Beijing' },
  PVG: { lat: 31.1443, lon: 121.8083, name: 'Shanghai Pudong' },
  KUL: { lat: 2.7456, lon: 101.7099, name: 'Kuala Lumpur' },

  // CIS / Caucasus
  SVO: { lat: 55.9726, lon: 37.4146, name: 'Moscow Sheremetyevo' },
  DME: { lat: 55.4088, lon: 37.9063, name: 'Moscow Domodedovo' },
  LED: { lat: 59.8003, lon: 30.2625, name: 'St. Petersburg' },
  TBS: { lat: 41.6693, lon: 44.9547, name: 'Tbilisi' },
  GYD: { lat: 40.4675, lon: 50.0467, name: 'Baku' },
};

export function airportCoords(code: string) {
  return AIRPORT_COORDS[code.trim().toUpperCase()];
}
