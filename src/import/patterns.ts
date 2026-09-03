export const DAY_DDMM_RE = /^([0-3]\d)\/([01]\d)$/;
export const DATE_DDMMYYYY_RE = /^([0-3]\d)\/([01]\d)\/(\d{4})$/;
export const CELL_TIME_RE = /^(A?)([0-2]\d):([0-5]\d)$/;
export const TIME_HHMM_RE = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;
export const CELL_STATION_RE = /^(\*?)([A-Z]{3,4})$/;
export const CELL_AIRCRAFT_RE = /^\[([A-Z0-9]{2,6})\]$/;
export const CELL_FLIGHT_NUMBER_RE = /^\d{1,5}$/;
export const CONTINUES_GLYPH = '→';
export const CONTINUED_GLYPH = '↓';

export const NON_DUTY_CODES = new Set([
  'OFF', 'DOFF', 'UFF', 'SICK', 'AVLB', 'LVE', 'VAC', 'ULV', 'ROFF', 'NR', 'HOMS', 'CHLD', 'BOFF',
]);

export function parseDateDdMmYyyy(token: string): string | null {
  const match = DATE_DDMMYYYY_RE.exec(token.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (date.getUTCFullYear() !== Number(yyyy) || date.getUTCMonth() !== Number(mm) - 1 || date.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export interface CellTime { time: string; actual: boolean }
export function parseCellTime(token: string): CellTime | null {
  const match = CELL_TIME_RE.exec(token.trim());
  if (!match) return null;
  const [, prefix, hh, mm] = match;
  if (Number(hh) > 23) return null;
  return { time: `${hh}:${mm}`, actual: prefix === 'A' };
}

export interface CellStation { code: string; deadhead: boolean }
export function parseCellStation(token: string): CellStation | null {
  const match = CELL_STATION_RE.exec(token.trim());
  if (!match) return null;
  const [, marker, code] = match;
  return { code, deadhead: marker === '*' };
}

export function parseCellAircraft(token: string): string | null {
  const match = CELL_AIRCRAFT_RE.exec(token.trim());
  return match ? match[1] : null;
}
export function isPlainTime(token: string): boolean { return TIME_HHMM_RE.test(token.trim()); }
export function isFlightNumber(token: string): boolean { return CELL_FLIGHT_NUMBER_RE.test(token.trim()); }
