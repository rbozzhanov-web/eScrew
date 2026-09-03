import { extractCrewRecords, crewForSector, type CrewRecord } from './crew';
import { readRoster, type RosterAbsence, type RosterDuty, type RosterSector } from './duties';
import { extractDayColumns, type DayColumn } from './grid';
import { parsePeriod, parseReportTotals, parseSubject, type ReportPeriod, type ReportSubject, type ReportTotals } from './header';
import type { ExtractedPage } from './types';

export type { RosterDuty, RosterSector } from './duties';

export interface RosterHotelStay {
  hotelNo?: number;
  eventDate?: string;
  name?: string;
  address?: string;
  telephone1?: string;
  telephone2?: string;
  bookingReferenceName?: string;
  hotelReference?: string;
  checkInDate?: string;
  checkInTime?: string;
  checkOutDate?: string;
  checkOutTime?: string;
  rest?: string;
  airportToHotel?: string;
  hotelToAirport?: string;
  pickupAirportDate?: string;
  pickupAirport?: string;
  pickupAirportType?: string;
  pickupAirportPhone?: string;
  pickupHotelDate?: string;
  pickupHotel?: string;
  pickupHotelType?: string;
  pickupHotelPhone?: string;
  shuttleBusRequired?: boolean;
  latitude?: number;
  longitude?: number;
  memo?: string;
}

export interface ParsedAirAstanaRoster {
  subject?: ReportSubject;
  period: ReportPeriod;
  totals: ReportTotals;
  sectors: RosterSector[];
  duties: RosterDuty[];
  absences: RosterAbsence[];
  crewRecords: CrewRecord[];
  hotelStays?: RosterHotelStay[];
  unreadCells: string[];
}

export function parseAirAstanaRoster(pages: ExtractedPage[]): ParsedAirAstanaRoster {
  const text = pages.flatMap((page) => page.items.map((item) => item.str)).join(' ');
  if (!text.includes('AIR ASTANA') || !text.includes('Personal Crew Schedule Report')) throw new Error('Unsupported roster PDF');
  const period = parsePeriod(pages);
  if (!period) throw new Error('Could not read roster period');
  const columns = dedupeColumns(pages.flatMap(extractDayColumns));
  const reading = readRoster(columns, period.start, period.end);
  return {
    subject: parseSubject(pages),
    period,
    totals: parseReportTotals(pages),
    sectors: reading.sectors,
    duties: reading.duties,
    absences: reading.absences,
    crewRecords: extractCrewRecords(pages),
    unreadCells: reading.unreadCells,
  };
}

export function getSectorCrew(roster: ParsedAirAstanaRoster, sector: RosterSector) {
  return crewForSector(roster.crewRecords, sector.flightNumber, sector.date, roster.subject?.staffId);
}

function dedupeColumns(columns: DayColumn[]): DayColumn[] {
  const byLabel = new Map<string, DayColumn>();
  for (const column of columns) {
    const existing = byLabel.get(column.label);
    if (!existing || column.cells.length > existing.cells.length) byLabel.set(column.label, column);
  }
  return [...byLabel.values()];
}
