import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import type { RosterAbsence, RosterDuty, RosterSector } from '@/src/import/duties';
import type { CrewRecord, RosterCrewMember } from '@/src/import/crew';

export interface AimsHotelInfo {
  HotelName?: string;
  ADDRESS?: string;
  SCHECKIN?: string;
  SCHECKOUT?: string;
  CONTACT_NAME1?: string;
  CONTACT_NAME2?: string;
  DISTANCE?: number;
  SDISTANCE?: string;
  TELEPHONE1?: string;
  TELEPHONE2?: string;
  FAX1?: string;
  FAX2?: string;
  Emails?: string[];
  HotelMemo?: string;
  CheckInTime?: string;
  CheckOutTime?: string;
  CheckInDate?: string;
  CheckOutDate?: string;
  Rest?: string;
}

export interface AimsCrewMember {
  name: string;
  crewId: string;
  position: string;
  isPIC?: boolean;
}

export interface AimsFlightInfo {
  flightNumber: string;
  route: string;
  from: string;
  to: string;
  reportTime?: string;
  debriefTime?: string;
  isDeadhead: boolean;
  crew?: AimsCrewMember[];
}

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
  WillingToFly?: boolean;
  NoContact?: boolean;
  ReplaceGDO?: boolean;
  Memo?: boolean;
  Notification?: boolean;
  HotelInfo?: AimsHotelInfo;
  HotelNo?: number;
}

export interface AimsCrewList {
  [date: string]: {
    [flightNumber: string]: AimsCrewMember[];
  };
}

export interface AimsSchedulerResponse {
  SchedulerEvents?: AimsSchedulerEvent[];
  PeriodStart?: string;
  PeriodEnd?: string;
  RosterDateTime?: string;
  crewList?: AimsCrewList;
}

const ABSENCE_CODES = new Set<RosterAbsence['code']>(['SICK', 'UFF', 'VAC', 'CHLD']);
const SECTOR_RE = /(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)/g;

/**
 * Converts the decoded AIMS eCrew CrewSchedule/SchedulerEvents payload into
 * the same roster model used by eScrew's PDF importer.
 *
 * Authentication, cookies and CSRF/session transport intentionally live in a
 * separate layer so no AIMS credentials or session values ever enter this parser.
 */
export function parseAimsSchedulerResponse(payload: AimsSchedulerResponse): ParsedAirAstanaRoster {
  const start = parseIsoDate(payload.PeriodStart);
  const end = parseIsoDate(payload.PeriodEnd);
  if (!start || !end) throw new Error('AIMS response does not contain a valid roster period');

  const sectors: RosterSector[] = [];
  const duties: RosterDuty[] = [];
  const absences: RosterAbsence[] = [];
  const unreadCells: string[] = [];
  const crewRecords: CrewRecord[] = [];

  for (const event of payload.SchedulerEvents ?? []) {
    const eventDate = isoDatePart(event.start);
    if (!eventDate) continue;

    const code = eventCode(event);
    if (code && ABSENCE_CODES.has(code as RosterAbsence['code'])) {
      absences.push({ code: code as RosterAbsence['code'], date: eventDate });
      continue;
    }

    if (event.type !== 'Flight') continue;

    const dutyIndex = duties.length;
    const parsedSectors = parseFlightSectors(event, dutyIndex);
    if (!parsedSectors.length) {
      if (event.text) unreadCells.push(event.text.replace(/\s+/g, ' ').trim());
      continue;
    }

    duties.push({
      index: dutyIndex,
      start: normalizeEventBoundary(event.start),
      end: normalizeEventBoundary(event.end),
      sectorCount: parsedSectors.length,
    });
    sectors.push(...parsedSectors);
  }

  // Parse crew records from AIMS crew list
  if (payload.crewList) {
    for (const [date, flightCrewMap] of Object.entries(payload.crewList)) {
      for (const [flightNumber, crew] of Object.entries(flightCrewMap)) {
        if (crew.length > 0) {
          crewRecords.push({
            date,
            flightNumber,
            members: crewToRosterMembers(crew),
          });
        }
      }
    }
  }

  return {
    period: { start, end },
    totals: {},
    sectors,
    duties,
    absences,
    crewRecords,
    unreadCells,
  };
}

export function decodeAimsSchedulerText(text: string): ParsedAirAstanaRoster {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('AIMS SchedulerEvents response is not valid JSON');
  }
  if (!value || typeof value !== 'object') throw new Error('AIMS SchedulerEvents response has an invalid shape');
  return parseAimsSchedulerResponse(value as AimsSchedulerResponse);
}

function parseFlightSectors(event: AimsSchedulerEvent, dutyIndex: number): RosterSector[] {
  const details = event.details ?? '';
  const dutyDate = isoDatePart(event.start);
  if (!dutyDate) return [];

  const sectors: RosterSector[] = [];
  SECTOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SECTOR_RE.exec(details))) {
    const [, flightNumber, from, outPrefix, outHhmm, outNextDay, to, inPrefix, inHhmm, inNextDay] = match;
    const departureDate = addDays(dutyDate, outNextDay ? 1 : 0);
    const arrivalDate = addDays(dutyDate, inNextDay ? 1 : 0);
    if (!departureDate || !arrivalDate) continue;

    const sector: RosterSector = {
      flightNumber,
      date: departureDate,
      departureAirport: from,
      arrivalAirport: to,
      timeOut: hhmmToTime(outHhmm),
      timeIn: hhmmToTime(inHhmm),
      deadhead: Boolean(event.IsDeadhead),
      actualTimes: outPrefix === 'A' && inPrefix === 'A',
      dutyIndex,
      dutySectorIndex: sectors.length + 1,
    };
    if (arrivalDate !== departureDate) sector.arrivalDate = arrivalDate;
    sectors.push(sector);
  }
  return sectors;
}

function eventCode(event: AimsSchedulerEvent): string | undefined {
  const firstLine = (event.text ?? '').split(/\r?\n/, 1)[0]?.trim();
  if (firstLine) return firstLine.replace(/\s+/g, ' ').split(' ')[0];
  const details = event.details ?? '';
  const match = /-\s*([A-Z][A-Z0-9_]{1,7})(?:\s|\r|\n|$)/.exec(details);
  return match?.[1];
}

function parseIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return undefined;
  return `${year}-${month}-${day}`;
}

function isoDatePart(value: string | undefined): string | undefined {
  return value ? parseIsoDate(value.slice(0, 10)) : undefined;
}

function normalizeEventBoundary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match || !parseIsoDate(match[1])) return undefined;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return undefined;
  return `${match[1]}T${match[2]}:${match[3]}`;
}

function hhmmToTime(value: string): string {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

function addDays(date: string, days: number): string | undefined {
  const parsed = parseIsoDate(date);
  if (!parsed) return undefined;
  const [year, month, day] = parsed.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function parseFlightInfo(event: AimsSchedulerEvent): AimsFlightInfo | undefined {
  if (event.type !== 'Flight' && event.type !== 'Default') return undefined;

  const details = event.details ?? '';
  const text = event.text ?? '';

  // Parse flight number from text (first line)
  const flightMatch = /^([A-Z]?\d{1,5})/.exec(text);
  if (!flightMatch) return undefined;

  const flightNumber = flightMatch[1];

  // Parse route from text (second line, format: AAA-BBB or similar)
  const routeMatch = /\n([A-Z]{3})-([A-Z]{3})/.exec(text);
  const from = routeMatch?.[1] ?? '';
  const to = routeMatch?.[2] ?? from;
  const route = `${from}-${to}`;

  return {
    flightNumber,
    route,
    from,
    to,
    reportTime: event.report,
    debriefTime: event.debrief,
    isDeadhead: Boolean(event.IsDeadhead),
  };
}

export function parseHotelInfo(event: AimsSchedulerEvent): AimsHotelInfo | undefined {
  if (event.type !== 'Hotel' || !event.HotelInfo) return undefined;

  return {
    HotelName: event.HotelInfo.HotelName,
    ADDRESS: event.HotelInfo.ADDRESS,
    CheckInTime: event.HotelInfo.CheckInTime,
    CheckOutTime: event.HotelInfo.CheckOutTime,
    CheckInDate: event.HotelInfo.CheckInDate,
    CheckOutDate: event.HotelInfo.CheckOutDate,
    TELEPHONE1: event.HotelInfo.TELEPHONE1,
    TELEPHONE2: event.HotelInfo.TELEPHONE2,
    Rest: event.HotelInfo.Rest,
    HotelMemo: event.HotelInfo.HotelMemo,
  };
}

export function extractCrewFromEvent(event: AimsSchedulerEvent): AimsCrewMember[] {
  const crew: AimsCrewMember[] = [];

  // Crew info would come from a separate crew list associated with the event
  // For now, this is a placeholder that can be enhanced when crew data is available

  return crew;
}

function crewToRosterMembers(aimsCrewList: AimsCrewMember[]): RosterCrewMember[] {
  return aimsCrewList.map(member => ({
    rank: member.position,
    id: member.crewId,
    name: member.name,
    deadhead: member.isPIC === false,
  }));
}

/**
 * Builds a crew list from AIMS data. Each crew member should have:
 * - name: Full name
 * - crewId: Staff ID number
 * - position: Rank (CP, FO, IS, PU, FJ, FY, LI)
 * - isPIC: Whether crew member is Pilot in Command (true = regular crew, false = deadhead)
 */
export function buildAimsCrewList(
  crewByFlight: Array<{
    date: string;
    flightNumber: string;
    crew: AimsCrewMember[];
  }>
): AimsCrewList {
  const crewList: AimsCrewList = {};

  for (const { date, flightNumber, crew } of crewByFlight) {
    if (!crewList[date]) {
      crewList[date] = {};
    }
    crewList[date][flightNumber] = crew;
  }

  return crewList;
}
