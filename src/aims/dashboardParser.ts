import type { AimsExtractedFlight, AimsExtractedRoster } from './types';

/**
 * Dashboard API response from /eCrew/Dashboard endpoint
 */
export interface DashboardScheduleEvent {
  date?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
  report?: string;
  aircraftType?: string;
  legId?: string;
  status?: string;
  type?: string;
}

export interface DashboardRosterResponse {
  periodStart?: string;
  periodEnd?: string;
  rosterDateTime?: string;
  events?: DashboardScheduleEvent[];
}

/**
 * Parses Dashboard API response into normalized roster format.
 * Dashboard can provide schedule data in various formats; this parser
 * normalizes them into the standard AimsExtractedRoster format.
 */
export function parseDashboardResponse(data: unknown): AimsExtractedRoster | undefined {
  if (!isRecord(data)) return undefined;

  const periodStart = stringValue(data.periodStart);
  const periodEnd = stringValue(data.periodEnd);

  if (!periodStart || !periodEnd) return undefined;

  const flights: AimsExtractedFlight[] = [];
  const events = Array.isArray(data.events) ? data.events : [];

  for (const event of events) {
    if (!isRecord(event)) continue;
    const flight = parseFlightEvent(event);
    if (flight) flights.push(flight);
  }

  const roster: AimsExtractedRoster = {
    periodStart,
    periodEnd,
    flights,
  };

  const rosterDateTime = stringValue(data.rosterDateTime);
  if (rosterDateTime) roster.rosterDateTime = rosterDateTime;

  return roster;
}

function parseFlightEvent(event: Record<string, unknown>): AimsExtractedFlight | undefined {
  const date = stringValue(event.date);
  if (!date) return undefined;

  // Skip non-flight events
  const type = stringValue(event.type);
  if (type && type !== 'flight' && type.toUpperCase() !== 'FLIGHT') return undefined;

  const flight: AimsExtractedFlight = {
    date,
    crew: [],
  };

  const flightNumber = stringValue(event.flightNumber);
  if (flightNumber) flight.flightNumber = flightNumber;

  const origin = stringValue(event.origin);
  if (origin) flight.origin = origin;

  const destination = stringValue(event.destination);
  if (destination) flight.destination = destination;

  const departure = stringValue(event.departure);
  if (departure) flight.departure = departure;

  const arrival = stringValue(event.arrival);
  if (arrival) flight.arrival = arrival;

  const report = stringValue(event.report);
  if (report) flight.report = report;

  const aircraftType = stringValue(event.aircraftType);
  if (aircraftType) flight.aircraftType = aircraftType;

  const legId = stringValue(event.legId);
  if (legId) flight.legId = legId;

  return flight;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
