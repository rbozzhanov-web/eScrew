import { AIMS_SCHEDULER_EVENTS_PATH, type AimsObservedResponse } from './types';
import type { AimsSchedulerResponse } from './adapter';

/**
 * Accepts only the known same-origin roster endpoint at the extraction boundary.
 * Callers are responsible for observing requests inside the already-authenticated
 * AIMS page; this module never reads cookies, storage, headers, request bodies,
 * credentials, CSRF tokens or other session material.
 */
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
