import { AIMS_SCHEDULER_EVENTS_PATH, AIMS_DASHBOARD_PATH, type AimsObservedResponse } from './types';
import type { AimsSchedulerResponse } from './adapter';
import type { DashboardRosterResponse } from './dashboardParser';

/**
 * Accepts known same-origin roster endpoints at the extraction boundary.
 * Callers are responsible for observing requests inside the already-authenticated
 * AIMS page; this module never reads cookies, storage, headers, request bodies,
 * credentials, CSRF tokens or other session material.
 */
export function extractObservedResponse(observed: AimsObservedResponse): AimsSchedulerResponse | DashboardRosterResponse | undefined {
  if (observed.path === AIMS_SCHEDULER_EVENTS_PATH) {
    return extractSchedulerResponse(observed);
  }
  if (observed.path === AIMS_DASHBOARD_PATH) {
    return extractDashboardResponse(observed);
  }
  return undefined;
}

export function extractSchedulerResponse(observed: AimsObservedResponse): AimsSchedulerResponse | undefined {
  if (observed.path !== AIMS_SCHEDULER_EVENTS_PATH) return undefined;
  if (!isRecord(observed.data)) return undefined;

  const periodStart = stringValue(observed.data.PeriodStart);
  const periodEnd = stringValue(observed.data.PeriodEnd);
  const schedulerEvents = observed.data.SchedulerEvents;
  if (!periodStart || !periodEnd || !Array.isArray(schedulerEvents)) return undefined;

  const result: AimsSchedulerResponse = {
    PeriodStart: periodStart,
    PeriodEnd: periodEnd,
    SchedulerEvents: schedulerEvents.filter(isRecord).map(event => ({
      start: stringValue(event.start),
      end: stringValue(event.end),
      report: stringValue(event.report),
      debrief: stringValue(event.debrief),
      type: stringValue(event.type),
      text: stringValue(event.text),
      details: stringValue(event.details),
      location: stringValue(event.location),
      IsDeadhead: typeof event.IsDeadhead === 'boolean' ? event.IsDeadhead : undefined,
    })),
  };

  const rosterDateTime = stringValue(observed.data.RosterDateTime);
  if (rosterDateTime) result.RosterDateTime = rosterDateTime;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractDashboardResponse(observed: AimsObservedResponse): DashboardRosterResponse | undefined {
  if (observed.path !== AIMS_DASHBOARD_PATH) return undefined;
  if (!isRecord(observed.data)) return undefined;

  const periodStart = stringValue(observed.data.periodStart);
  const periodEnd = stringValue(observed.data.periodEnd);
  const events = observed.data.events;
  if (!periodStart || !periodEnd || !Array.isArray(events)) return undefined;

  const result: DashboardRosterResponse = {
    periodStart,
    periodEnd,
    events: events.filter(isRecord).map(event => ({
      date: stringValue(event.date),
      flightNumber: stringValue(event.flightNumber),
      origin: stringValue(event.origin),
      destination: stringValue(event.destination),
      departure: stringValue(event.departure),
      arrival: stringValue(event.arrival),
      report: stringValue(event.report),
      aircraftType: stringValue(event.aircraftType),
      legId: stringValue(event.legId),
      status: stringValue(event.status),
      type: stringValue(event.type),
    })),
  };

  const rosterDateTime = stringValue(observed.data.rosterDateTime);
  if (rosterDateTime) result.rosterDateTime = rosterDateTime;
  return result;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
