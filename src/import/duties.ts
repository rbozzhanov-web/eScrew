import { CONTINUED_GLYPH, CONTINUES_GLYPH, NON_DUTY_CODES, isFlightNumber, isPlainTime, parseCellAircraft, parseCellStation, parseCellTime } from './patterns';
import { resolveGridDate, type DayColumn } from './grid';

export interface RosterSector {
  flightNumber: string; date: string; departureAirport: string; arrivalAirport: string;
  timeOut: string; timeIn: string; arrivalDate?: string; aircraftType?: string;
  deadhead: boolean; actualTimes: boolean; dutyIndex: number; dutySectorIndex: number;
}
export interface RosterDuty { index: number; start?: string; end?: string; sectorCount: number }
export interface RosterAbsence { code: 'SICK' | 'UFF' | 'VAC' | 'CHLD'; date: string }
export interface RosterReading { sectors: RosterSector[]; duties: RosterDuty[]; absences: RosterAbsence[]; unreadCells: string[] }
const DELAY_LABEL = 'Delay';
const GROUND_DUTY_CODE_RE = /^[A-Z][A-Z0-9_]{1,7}$/;
const PAYROLL_ABSENCE_CODES = new Set<RosterAbsence['code']>(['SICK', 'UFF', 'VAC', 'CHLD']);

export function readRoster(columns: DayColumn[], periodStart: string, periodEnd: string): RosterReading {
  const sectors: RosterSector[] = [];
  const duties: RosterDuty[] = [];
  const absences: RosterAbsence[] = [];
  const unreadCells: string[] = [];
  let carried: RosterSector | undefined;
  let currentDuty: RosterDuty | undefined;
  const openDuty = () => {
    const duty: RosterDuty = { index: duties.length, sectorCount: 0 };
    duties.push(duty); currentDuty = duty; return duty;
  };

  for (const column of columns) {
    const date = resolveGridDate(column.label, periodStart, periodEnd);
    if (!date) continue;
    const cells = column.cells;
    let i = 0;
    while (i < cells.length) {
      const cell = cells[i];
      if (cell === CONTINUED_GLYPH) {
        i += 1;
        if (!carried) continue;
        i = completeCarriedSector(carried, cells, i, date);
        sectors.push(carried); carried = undefined; continue;
      }
      if (NON_DUTY_CODES.has(cell)) {
        if (PAYROLL_ABSENCE_CODES.has(cell as RosterAbsence['code'])) absences.push({ code: cell as RosterAbsence['code'], date });
        i += 1; while (i < cells.length && isPlainTime(cells[i])) i += 1;
        currentDuty = undefined; continue;
      }
      if (cell === DELAY_LABEL) { i += 1; if (i < cells.length && isPlainTime(cells[i])) i += 1; continue; }
      if (cell === CONTINUES_GLYPH) { i += 1; continue; }
      if (isFlightNumber(cell)) {
        const duty = currentDuty ?? openDuty();
        const read = readSector(cells, i, date, duty);
        if (!read) { unreadCells.push(cell); i += 1; continue; }
        duty.sectorCount += 1;
        read.sector.dutySectorIndex = duty.sectorCount;
        if (read.continues) carried = read.sector; else sectors.push(read.sector);
        i = read.next; continue;
      }
      if (isPlainTime(cell)) {
        i += 1;
        if (isFlightNumber(cells[i] ?? '')) openDuty().start = `${date}T${cell}`;
        else if (currentDuty) { currentDuty.end = `${date}T${cell}`; currentDuty = undefined; }
        else openDuty().start = `${date}T${cell}`;
        continue;
      }
      if (GROUND_DUTY_CODE_RE.test(cell) && isPlainTime(cells[i + 1] ?? '') && isPlainTime(cells[i + 2] ?? '')) {
        const duty = openDuty();
        duty.start = `${date}T${cells[i + 1]}`; duty.end = `${date}T${cells[i + 2]}`;
        currentDuty = undefined; i += 3; continue;
      }
      if (/^[MR](,[MR])*$/.test(cell)) { i += 1; continue; }
      if (GROUND_DUTY_CODE_RE.test(cell)) { i += 1; continue; }
      unreadCells.push(cell); i += 1;
    }
  }
  return { sectors, duties, absences, unreadCells };
}

function readSector(cells: string[], start: number, date: string, duty: RosterDuty): { sector: RosterSector; next: number; continues: boolean } | undefined {
  let i = start;
  const flightNumber = cells[i++];
  const departure = parseCellTime(cells[i] ?? ''); if (!departure) return undefined; i += 1;
  const from = parseCellStation(cells[i] ?? ''); if (!from) return undefined; i += 1;
  const sector: RosterSector = { flightNumber, date, departureAirport: from.code, arrivalAirport: '', timeOut: departure.time, timeIn: '', deadhead: from.deadhead, actualTimes: departure.actual, dutyIndex: duty.index, dutySectorIndex: duty.sectorCount + 1 };
  if (cells[i] === CONTINUES_GLYPH) return { sector, next: i + 1, continues: true };
  const to = parseCellStation(cells[i] ?? ''); if (!to) return undefined; i += 1;
  const arrival = parseCellTime(cells[i] ?? ''); if (!arrival) return undefined; i += 1;
  sector.arrivalAirport = to.code; sector.timeIn = arrival.time; sector.actualTimes = sector.actualTimes && arrival.actual;
  const aircraft = parseCellAircraft(cells[i] ?? ''); if (aircraft) { sector.aircraftType = aircraft; i += 1; }
  return { sector, next: i, continues: false };
}

function completeCarriedSector(sector: RosterSector, cells: string[], start: number, date: string): number {
  let i = start;
  const to = parseCellStation(cells[i] ?? ''); if (to) { sector.arrivalAirport = to.code; i += 1; }
  const arrival = parseCellTime(cells[i] ?? ''); if (arrival) { sector.timeIn = arrival.time; sector.actualTimes = sector.actualTimes && arrival.actual; sector.arrivalDate = date; i += 1; }
  const aircraft = parseCellAircraft(cells[i] ?? ''); if (aircraft) i += 1;
  return i;
}
