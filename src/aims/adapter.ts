import type { ParsedAirAstanaRoster, RosterHotelStay } from '@/src/import/parseAirAstanaRoster';
import type { RosterAbsence, RosterDuty, RosterSector } from '@/src/import/duties';

export interface AimsHotelInfo {
  ADDRESS?: string;
  AirportToHotel?: string;
  BookingReferenceName?: string;
  CheckInDate?: string;
  CheckInTime?: string;
  CheckOutDate?: string;
  CheckOutTime?: string;
  HotelMemo?: string;
  HotelName?: string;
  HotelReference?: string;
  HotelToAirport?: string;
  PickUpAirportDate?: string;
  PickUpAirportPhone?: string;
  PickUpAirportStr?: string;
  PickUpAirportType?: string;
  PickUpHotelDate?: string;
  PickUpHotelPhone?: string;
  PickUpHotelStr?: string;
  PickUpHotelType?: string;
  PortHotelLatitude?: number;
  PortHotelLongitude?: number;
  Rest?: string;
  ShuttleBusrequired?: boolean;
  TELEPHONE1?: string;
  TELEPHONE2?: string;
}

export interface AimsSchedulerEvent {
  start?: string;
  end?: string;
  report?: string;
  debrief?: string;
  delay?: string;
  type?: string;
  text?: string;
  details?: string;
  location?: string;
  IsDeadhead?: boolean;
  HotelNo?: number;
  HotelInfo?: AimsHotelInfo;
}

export interface AimsSchedulerResponse {
  SchedulerEvents?: AimsSchedulerEvent[];
  PeriodStart?: string;
  PeriodEnd?: string;
  RosterDateTime?: string;
}

const ABSENCE_CODES = new Set<RosterAbsence['code']>(['SICK', 'UFF', 'VAC', 'CHLD']);
const SECTOR_RE = /(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})(⁺¹)?\)/g;
const AIRCRAFT_RE = /\b((?:B|A|E)\d{3}[A-Z0-9]{0,3})\b/gi;

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
  const hotelStays: RosterHotelStay[] = [];
  const unreadCells: string[] = [];

  for (const event of payload.SchedulerEvents ?? []) {
    const hotel = parseHotelStay(event);
    if (hotel) hotelStays.push(hotel);

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

    const reportDate = isoDatePart(event.start) ?? eventDate;
    const debriefDate = isoDatePart(event.end) ?? eventDate;
    duties.push({
      index: dutyIndex,
      start: normalizeDutyBoundary(event.report, reportDate) ?? normalizeEventBoundary(event.start),
      end: normalizeDutyBoundary(event.debrief, debriefDate) ?? normalizeEventBoundary(event.end),
      sectorCount: parsedSectors.length,
    });
    sectors.push(...parsedSectors);
  }

  return {
    period: { start, end },
    totals: {},
    sectors,
    duties,
    absences,
    crewRecords: [],
    hotelStays: dedupeHotelStays(hotelStays),
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

  applyAircraftTypes(sectors, details);
  return sectors;
}

function applyAircraftTypes(sectors: RosterSector[], details: string): void {
  AIRCRAFT_RE.lastIndex = 0;
  const matches = [...details.matchAll(AIRCRAFT_RE)].map((match) => match[1].toUpperCase());
  if (!matches.length || !sectors.length) return;

  const unique = [...new Set(matches)];
  if (unique.length === 1) {
    for (const sector of sectors) sector.aircraftType = unique[0];
    return;
  }
  if (matches.length === sectors.length) {
    sectors.forEach((sector, index) => { sector.aircraftType = matches[index]; });
  }
}

function parseHotelStay(event: AimsSchedulerEvent): RosterHotelStay | undefined {
  const info = event.HotelInfo;
  if (!info || typeof info !== 'object') return undefined;

  const stay: RosterHotelStay = {
    hotelNo: finiteNumber(event.HotelNo),
    eventDate: isoDatePart(event.start),
    name: cleanString(info.HotelName),
    address: cleanString(info.ADDRESS),
    telephone1: cleanString(info.TELEPHONE1),
    telephone2: cleanString(info.TELEPHONE2),
    bookingReferenceName: cleanString(info.BookingReferenceName),
    hotelReference: cleanString(info.HotelReference),
    checkInDate: cleanString(info.CheckInDate),
    checkInTime: cleanString(info.CheckInTime),
    checkOutDate: cleanString(info.CheckOutDate),
    checkOutTime: cleanString(info.CheckOutTime),
    rest: cleanString(info.Rest),
    airportToHotel: cleanString(info.AirportToHotel),
    hotelToAirport: cleanString(info.HotelToAirport),
    pickupAirportDate: cleanString(info.PickUpAirportDate),
    pickupAirport: cleanString(info.PickUpAirportStr),
    pickupAirportType: cleanString(info.PickUpAirportType),
    pickupAirportPhone: cleanString(info.PickUpAirportPhone),
    pickupHotelDate: cleanString(info.PickUpHotelDate),
    pickupHotel: cleanString(info.PickUpHotelStr),
    pickupHotelType: cleanString(info.PickUpHotelType),
    pickupHotelPhone: cleanString(info.PickUpHotelPhone),
    shuttleBusRequired: typeof info.ShuttleBusrequired === 'boolean' ? info.ShuttleBusrequired : undefined,
    latitude: finiteNumber(info.PortHotelLatitude),
    longitude: finiteNumber(info.PortHotelLongitude),
    memo: cleanString(info.HotelMemo),
  };

  return Object.values(stay).some((value) => value !== undefined && value !== '') ? stay : undefined;
}

function dedupeHotelStays(stays: RosterHotelStay[]): RosterHotelStay[] {
  const seen = new Set<string>();
  const result: RosterHotelStay[] = [];
  for (const stay of stays) {
    const key = [stay.hotelNo ?? '', stay.eventDate ?? '', stay.name ?? '', stay.checkInDate ?? '', stay.checkInTime ?? '', stay.checkOutDate ?? '', stay.checkOutTime ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(stay);
  }
  return result;
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

function normalizeDutyBoundary(value: string | undefined, fallbackDate: string): string | undefined {
  if (!value) return undefined;
  const iso = normalizeEventBoundary(value);
  if (iso) return iso;
  const match = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(value);
  return match ? `${fallbackDate}T${match[1]}:${match[2]}` : undefined;
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

function cleanString(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
