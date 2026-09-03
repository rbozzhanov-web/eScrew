import type { NormalizedAbsence, NormalizedDuty, NormalizedFlight, NormalizedRoster } from '@/src/core/rosterContract';
import type { DashboardScheduleEvent } from './dashboardParser';

export interface AimsSchedulerEvent {
  start?: string;
  end?: string;
  report?: string;
  debrief?: string;
  type?: string;
  text?: string;
  details?: string;
  location?: string;
  IsDeadhead?: boolean;
}

export interface AimsSchedulerResponse {
  SchedulerEvents?: AimsSchedulerEvent[];
  PeriodStart?: string;
  PeriodEnd?: string;
  RosterDateTime?: string;
}

const ABSENCE_CODES = new Set<NormalizedAbsence['code']>(['SICK', 'UFF', 'VAC', 'CHLD']);
const SECTOR_RE = /(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)/g;

/** AIMS-specific adapter. No AIMS DTO crosses this return boundary. */
export function adaptAimsSchedulerResponse(payload: AimsSchedulerResponse): NormalizedRoster {
  const start = parseIsoDate(payload.PeriodStart);
  const end = parseIsoDate(payload.PeriodEnd);
  if (!start || !end) throw new Error('AIMS response does not contain a valid roster period');

  const duties: NormalizedDuty[] = [];
  const absences: NormalizedAbsence[] = [];

  for (const event of payload.SchedulerEvents ?? []) {
    const eventDate = isoDatePart(event.start);
    if (!eventDate) continue;
    const code = eventCode(event);
    if (code && ABSENCE_CODES.has(code as NormalizedAbsence['code'])) {
      absences.push({ code: code as NormalizedAbsence['code'], date: eventDate });
      continue;
    }
    if (event.type !== 'Flight') continue;
    const flights = parseFlightSectors(event);
    if (!flights.length) continue;
    duties.push({ date: flights[0].date, start: normalizeEventBoundary(event.start), end: normalizeEventBoundary(event.end), flights });
  }

  return { period: { start, end }, duties, absences };
}

export function decodeAimsSchedulerText(text: string): NormalizedRoster {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('AIMS SchedulerEvents response is not valid JSON'); }
  if (!value || typeof value !== 'object') throw new Error('AIMS SchedulerEvents response has an invalid shape');
  return adaptAimsSchedulerResponse(value as AimsSchedulerResponse);
}

export function adaptDashboardResponse(events: DashboardScheduleEvent[], periodStart?: string, periodEnd?: string): NormalizedRoster {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  if (!start || !end) throw new Error('Dashboard response does not contain a valid roster period');

  const duties: NormalizedDuty[] = [];

  for (const event of events) {
    const eventDate = event.date;
    if (!eventDate || !parseIsoDate(eventDate)) continue;

    const flight: NormalizedFlight = {
      flightNumber: event.flightNumber ?? '',
      date: eventDate,
      origin: event.origin ?? '',
      destination: event.destination ?? '',
      departure: event.departure ?? '',
      arrival: event.arrival ?? '',
    };

    if (event.aircraftType) flight.aircraftType = event.aircraftType;
    if (event.report) flight.arrivalDate = event.report;

    const existingDuty = duties.find(d => d.date === eventDate);
    if (existingDuty) {
      existingDuty.flights.push(flight);
    } else {
      duties.push({ date: eventDate, flights: [flight] });
    }
  }

  return { period: { start, end }, duties, absences: [] };
}

function parseFlightSectors(event: AimsSchedulerEvent): NormalizedFlight[] {
  const dutyDate = isoDatePart(event.start);
  if (!dutyDate) return [];
  const flights: NormalizedFlight[] = [];
  SECTOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SECTOR_RE.exec(event.details ?? ''))) {
    const [, flightNumber, origin, outPrefix, outHhmm, outNextDay, destination, inPrefix, inHhmm, inNextDay] = match;
    const date = addDays(dutyDate, outNextDay ? 1 : 0);
    const arrivalDate = addDays(dutyDate, inNextDay ? 1 : 0);
    if (!date || !arrivalDate) continue;
    flights.push({
      flightNumber,
      date,
      origin,
      destination,
      departure: hhmmToTime(outHhmm),
      arrival: hhmmToTime(inHhmm),
      arrivalDate: arrivalDate !== date ? arrivalDate : undefined,
      deadhead: Boolean(event.IsDeadhead),
      actualTimes: outPrefix === 'A' && inPrefix === 'A',
      crew: [],
    });
  }
  return flights;
}

function eventCode(event: AimsSchedulerEvent): string | undefined {
  const firstLine = (event.text ?? '').split(/\r?\n/, 1)[0]?.trim();
  if (firstLine) return firstLine.replace(/\s+/g, ' ').split(' ')[0];
  return /-\s*([A-Z][A-Z0-9_]{1,7})(?:\s|\r|\n|$)/.exec(event.details ?? '')?.[1];
}
function parseIsoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return undefined;
  return `${year}-${month}-${day}`;
}
function isoDatePart(value?: string): string | undefined { return value ? parseIsoDate(value.slice(0, 10)) : undefined; }
function normalizeEventBoundary(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match || !parseIsoDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59) return undefined;
  return `${match[1]}T${match[2]}:${match[3]}`;
}
function hhmmToTime(value: string): string { return `${value.slice(0, 2)}:${value.slice(2, 4)}`; }
function addDays(date: string, days: number): string | undefined {
  if (!parseIsoDate(date)) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}
