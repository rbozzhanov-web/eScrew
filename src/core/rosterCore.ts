import type { Duty, CrewMember, Sector } from '@/src/domain/types';
import type { NormalizedCrewMember, NormalizedRoster } from './rosterContract';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/** Source-agnostic Core entry point. No source module may be imported here. */
export function normalizedRosterToDuties(roster: NormalizedRoster): Duty[] {
  return roster.duties.filter(duty => duty.flights.length > 0).map((duty, dutyIndex) => {
    const first = duty.flights[0];
    const last = duty.flights[duty.flights.length - 1];
    const date = new Date(`${duty.date}T00:00:00Z`);
    const sectors: Sector[] = duty.flights.map((flight, flightIndex) => ({
      id: flightIdentity(flight.date, flight.flightNumber, flight.origin, flight.destination, flight.departure),
      flightNumber: /^KC/i.test(flight.flightNumber) ? flight.flightNumber.toUpperCase() : `KC${flight.flightNumber}`,
      departure: flight.origin,
      arrival: flight.destination,
      departureTime: flight.departure,
      arrivalTime: flight.arrival,
      blockMinutes: 0,
      crew: (flight.crew ?? []).map((member, crewIndex) => toCrewMember(member, crewIndex)),
      deadhead: flight.deadhead,
      actualTimes: flight.actualTimes,
    }));
    const reportStamp = duty.start?.split('T');
    const releaseStamp = duty.end?.split('T');
    return {
      id: `duty-${duty.date}-${dutyIndex}`,
      date: duty.date,
      reportDate: reportStamp?.[0] ?? duty.date,
      releaseDate: releaseStamp?.[0] ?? last.arrivalDate ?? last.date,
      dateLabel: `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]}`,
      reportTime: reportStamp?.[1] ?? first.departure,
      releaseTime: releaseStamp?.[1] ?? last.arrival,
      sectors,
      layoverStation: last.destination,
    };
  });
}

function toCrewMember(member: NormalizedCrewMember, index: number): CrewMember {
  return {
    id: member.id ?? `crew-${index}-${stablePart(member.name)}`,
    name: titleCase(member.name),
    role: member.role,
    position: member.position,
    deadhead: member.deadhead,
  };
}

function flightIdentity(date: string, flight: string, origin: string, destination: string, departure: string): string {
  return [date, flight.toUpperCase(), origin.toUpperCase(), destination.toUpperCase(), departure].join('-');
}

function stablePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[ -])\p{L}/gu, letter => letter.toUpperCase());
}
