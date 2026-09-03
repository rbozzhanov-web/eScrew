import type { NormalizedRoster } from '@/src/core/rosterContract';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';

export type ProjectedRoster = ParsedAirAstanaRoster & { normalized?: NormalizedRoster };

/** Temporary UI projection. Remove when MainScreen consumes Core roster state directly. */
export function projectNormalizedRoster(roster: NormalizedRoster): ProjectedRoster {
  const sectors: ParsedAirAstanaRoster['sectors'] = [];
  const duties: ParsedAirAstanaRoster['duties'] = [];
  for (const duty of roster.duties) {
    const dutyIndex = duties.length;
    duties.push({ index: dutyIndex, start: duty.start, end: duty.end, sectorCount: duty.flights.length });
    duty.flights.forEach((flight, index) => sectors.push({
      flightNumber: flight.flightNumber, date: flight.date,
      departureAirport: flight.origin, arrivalAirport: flight.destination,
      timeOut: flight.departure, timeIn: flight.arrival,
      arrivalDate: flight.arrivalDate, aircraftType: flight.aircraftType,
      deadhead: Boolean(flight.deadhead), actualTimes: Boolean(flight.actualTimes),
      dutyIndex, dutySectorIndex: index + 1,
    }));
  }
  return {
    period: roster.period,
    totals: {},
    sectors,
    duties,
    absences: roster.absences ?? [],
    crewRecords: [],
    unreadCells: [],
    normalized: roster,
  };
}
