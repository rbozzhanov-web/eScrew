import type { AimsSchedulerEvent, AimsSchedulerResponse } from './adapter';
import type { AimsExtractedFlight, AimsExtractedRoster } from './types';

/**
 * Builds the explicit data-transfer object allowed to cross from AIMS into
 * eScrew. It intentionally does not retain the source object or unknown fields.
 * Crew and stable leg identifiers are left empty until their real Air Astana
 * source has been established.
 */
export function normalizeAimsRoster(payload: AimsSchedulerResponse): AimsExtractedRoster | undefined {
  if (!payload.PeriodStart || !payload.PeriodEnd) return undefined;

  const flights = (payload.SchedulerEvents ?? [])
    .filter(event => event.type === 'Flight')
    .flatMap(normalizeFlightEvent);

  const roster: AimsExtractedRoster = {
    periodStart: payload.PeriodStart,
    periodEnd: payload.PeriodEnd,
    flights,
  };
  if (payload.RosterDateTime) roster.rosterDateTime = payload.RosterDateTime;
  return roster;
}

function normalizeFlightEvent(event: AimsSchedulerEvent): AimsExtractedFlight[] {
  const date = datePart(event.start);
  const details = event.details ?? '';
  const sectors = parseSectorDetails(details);

  if (!sectors.length) {
    return [{
      date,
      report: event.report,
      crew: [],
    }];
  }

  return sectors.map(sector => ({
    date,
    flightNumber: sector.flightNumber,
    origin: sector.origin,
    destination: sector.destination,
    departure: sector.departure,
    arrival: sector.arrival,
    report: event.report,
    crew: [],
  }));
}

const SECTOR_RE = /(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\([A]?(\d{4})(?:⁺¹)?\)\s*-\s*([A-Z]{3,4})\s*\([A]?(\d{4})(?:⁺¹)?\)/g;

function parseSectorDetails(details: string) {
  const sectors: Array<{ flightNumber: string; origin: string; destination: string; departure: string; arrival: string }> = [];
  SECTOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SECTOR_RE.exec(details))) {
    sectors.push({
      flightNumber: match[1],
      origin: match[2],
      departure: hhmm(match[3]),
      destination: match[4],
      arrival: hhmm(match[5]),
    });
  }
  return sectors;
}

function datePart(value?: string): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}

function hhmm(value: string): string {
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}
