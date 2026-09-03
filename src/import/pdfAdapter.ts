import { getSectorCrew, type ParsedAirAstanaRoster } from './parseAirAstanaRoster';
import type { RosterCrewMember } from './crew';
import type { NormalizedCrewMember, NormalizedRoster } from '@/src/core/rosterContract';

/** PDF-specific adapter. PDF parser types stop at this boundary. */
export function adaptPdfRoster(roster: ParsedAirAstanaRoster): NormalizedRoster {
  return {
    period: roster.period,
    absences: roster.absences,
    duties: roster.duties.flatMap(duty => {
      const sectors = roster.sectors.filter(sector => sector.dutyIndex === duty.index);
      if (!sectors.length) return [];
      return [{
        date: sectors[0].date,
        start: duty.start,
        end: duty.end,
        flights: sectors.map(sector => ({
          flightNumber: sector.flightNumber,
          date: sector.date,
          origin: sector.departureAirport,
          destination: sector.arrivalAirport,
          departure: sector.timeOut,
          arrival: sector.timeIn,
          arrivalDate: sector.arrivalDate,
          aircraftType: sector.aircraftType,
          deadhead: sector.deadhead,
          actualTimes: sector.actualTimes,
          crew: getSectorCrew(roster, sector)?.members
            .filter(member => member.id !== roster.subject?.staffId)
            .sort(crewOrder)
            .map(adaptCrew) ?? [],
        })),
      }];
    }),
  };
}

function adaptCrew(member: RosterCrewMember): NormalizedCrewMember {
  const flightDeck = member.rank === 'CP' || member.rank === 'FO';
  return {
    id: member.id,
    name: member.name,
    role: flightDeck ? 'Flight deck' : 'Cabin',
    position: `${member.deadhead ? 'DHC · ' : ''}${rankLabel(member.rank)}`,
    deadhead: member.deadhead,
  };
}

function crewOrder(a: RosterCrewMember, b: RosterCrewMember): number {
  const weight = (rank: string) => rank === 'CP' ? 0 : rank === 'FO' ? 1 : rank === 'PU' ? 2 : rank === 'IS' ? 3 : 4;
  return weight(a.rank) - weight(b.rank);
}

function rankLabel(rank: string): string {
  return ({ CP: 'Captain', FO: 'First Officer', PU: 'Purser', IS: 'Instructor', FJ: 'FJ', FY: 'FY', PS: 'PS', LI: 'LI' } as Record<string, string>)[rank] ?? rank;
}
