export const AIMS_CREW_SCHEDULE_PATH = '/eCrew/CrewSchedule';
export const AIMS_SCHEDULER_EVENTS_PATH = '/eCrew/CrewSchedule/SchedulerEvents';
export const AIMS_DASHBOARD_PATH = '/eCrew/Dashboard';

/** Values allowed to leave the authenticated AIMS page context. */
export interface AimsExtractedCrewMember {
  name: string;
  role?: string;
  operatingStatus?: string;
}

export interface AimsExtractedFlight {
  date?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
  report?: string;
  aircraftType?: string;
  legId?: string;
  crew: AimsExtractedCrewMember[];
}

/**
 * Sanitized Variant A boundary object. Authentication/session material must
 * never be added to this type or copied into it by extraction code.
 */
export interface AimsExtractedRoster {
  periodStart: string;
  periodEnd: string;
  rosterDateTime?: string;
  flights: AimsExtractedFlight[];
}

export interface AimsObservedResponse {
  path: string;
  data: unknown;
}
