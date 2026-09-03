import type {
  NormalizedAbsence,
  NormalizedCrewMember,
  NormalizedDuty,
  NormalizedFlight,
  NormalizedRoster,
  NormalizedSupplement,
  NormalizedSupplementCategory,
  NormalizedSupplementField,
} from '@/src/core/rosterContract';
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
  HotelInfo?: unknown;
  HotelNo?: unknown;
  Memo?: unknown;
  Notification?: unknown;
  RequiredRest?: unknown;
  [key: string]: unknown;
}

export interface AimsSchedulerResponse {
  SchedulerEvents?: AimsSchedulerEvent[];
  PeriodStart?: string;
  PeriodEnd?: string;
  RosterDateTime?: string;
  [key: string]: unknown;
}

const ABSENCE_CODES = new Set<NormalizedAbsence['code']>(['SICK', 'UFF', 'VAC', 'CHLD']);
const SECTOR_RE = /(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)/g;
const SENSITIVE_KEY_RE = /pass|pwd|token|auth|cookie|session|csrf|secret|verification/i;
const FIELD_LIMIT = 500;

/** AIMS-specific adapter. No AIMS DTO crosses this return boundary. */
export function adaptAimsSchedulerResponse(payload: AimsSchedulerResponse): NormalizedRoster {
  const start = parseIsoDate(payload.PeriodStart);
  const end = parseIsoDate(payload.PeriodEnd);
  if (!start || !end) throw new Error('AIMS response does not contain a valid roster period');

  const duties: NormalizedDuty[] = [];
  const absences: NormalizedAbsence[] = [];
  const supplements: NormalizedSupplement[] = [];

  for (const event of payload.SchedulerEvents ?? []) {
    const eventDate = isoDatePart(event.start);
    const code = eventCode(event);
    if (eventDate && code && ABSENCE_CODES.has(code as NormalizedAbsence['code'])) {
      absences.push({ code: code as NormalizedAbsence['code'], date: eventDate });
    }

    const flights = event.type === 'Flight' ? parseFlightSectors(event) : [];
    if (flights.length) {
      duties.push({
        date: flights[0].date,
        start: normalizeEventBoundary(event.start),
        end: normalizeEventBoundary(event.end),
        flights,
      });
    }

    const fields = flattenSafeFields(event);
    if (fields.length) {
      const supplement: NormalizedSupplement = {
        category: supplementCategory(event),
        fields,
      };
      if (eventDate) supplement.date = eventDate;
      if (flights[0]?.flightNumber) supplement.flightNumber = flights[0].flightNumber;
      const title = supplementTitle(event);
      if (title) supplement.title = title;
      supplements.push(supplement);
    }
  }

  const metadataSource: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'SchedulerEvents' || key === 'PeriodStart' || key === 'PeriodEnd' || SENSITIVE_KEY_RE.test(key)) continue;
    metadataSource[key] = value;
  }
  const metadata = flattenSafeFields(metadataSource);

  return {
    period: { start, end },
    duties,
    absences,
    metadata: metadata.length ? metadata : undefined,
    supplements: supplements.length ? supplements : undefined,
  };
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
  const aircraftType = directString(event, ['aircraftType', 'AircraftType', 'aircraft', 'Aircraft', 'acType', 'ACType']);
  const crew = normalizeEmbeddedCrew(event);
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
      aircraftType,
      deadhead: Boolean(event.IsDeadhead),
      actualTimes: outPrefix === 'A' && inPrefix === 'A',
      crew: crew.length ? crew : undefined,
    });
  }
  return flights;
}

function normalizeEmbeddedCrew(event: AimsSchedulerEvent): NormalizedCrewMember[] {
  const candidates = ['crew', 'Crew', 'crewMembers', 'CrewMembers', 'crewList', 'CrewList'];
  const raw = candidates.map(key => event[key]).find(Array.isArray);
  if (!Array.isArray(raw)) return [];
  const members: NormalizedCrewMember[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const name = directString(record, ['name', 'Name', 'fullName', 'FullName', 'crewName', 'CrewName']);
    if (!name) continue;
    const position = directString(record, ['position', 'Position', 'rank', 'Rank', 'rosterRank', 'RosterRank']);
    const roleText = `${directString(record, ['role', 'Role', 'crewRole', 'CrewRole']) ?? ''} ${position ?? ''}`.toLowerCase();
    const role = /cabin|purser|flight attendant|\bfa\b|\bcc\b/.test(roleText)
      ? 'Cabin'
      : /captain|\bcpt\b|first officer|\bfo\b|pilot|flight deck/.test(roleText)
        ? 'Flight deck'
        : undefined;
    if (!role) continue;
    const member: NormalizedCrewMember = { name, role };
    const id = directString(record, ['id', 'Id', 'staffId', 'StaffId', 'crewId', 'CrewId']);
    if (id) member.id = id;
    if (position) member.position = position;
    members.push(member);
  }
  return members;
}

function supplementCategory(event: AimsSchedulerEvent): NormalizedSupplementCategory {
  if (event.HotelInfo || meaningful(event.HotelNo)) return 'hotel';
  if (meaningful(event.Memo)) return 'memo';
  if (meaningful(event.Notification)) return 'notification';
  if (meaningful(event.RequiredRest)) return 'rest';
  const keys = Object.keys(event).join(' ');
  if (/pickup|dropoff|transport|transfer|shuttle/i.test(keys)) return 'transport';
  return 'event';
}

function supplementTitle(event: AimsSchedulerEvent): string | undefined {
  const firstLine = typeof event.text === 'string' ? event.text.split(/\r?\n/, 1)[0]?.trim() : undefined;
  return firstLine || event.type || event.location;
}

function flattenSafeFields(value: unknown): NormalizedSupplementField[] {
  const fields: NormalizedSupplementField[] = [];
  const visit = (current: unknown, path: string, depth: number) => {
    if (fields.length >= FIELD_LIMIT || depth > 7 || current === null || current === undefined) return;
    if (typeof current === 'string') {
      if (path && current.length) fields.push({ label: path, value: current });
      return;
    }
    if (typeof current === 'number') {
      if (path && Number.isFinite(current)) fields.push({ label: path, value: current });
      return;
    }
    if (typeof current === 'boolean') {
      if (path) fields.push({ label: path, value: current });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof current === 'object') {
      for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
        if (SENSITIVE_KEY_RE.test(key)) continue;
        visit(item, path ? `${path}.${key}` : key, depth + 1);
        if (fields.length >= FIELD_LIMIT) break;
      }
    }
  };
  visit(value, '', 0);
  return fields;
}

function directString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function meaningful(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== '';
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
