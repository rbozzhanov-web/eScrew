import type { Duty } from './types';
import type { NormalizedRoster } from '@/src/core/rosterContract';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import { adaptPdfRoster } from '@/src/import/pdfAdapter';
import { normalizedRosterToDuties } from '@/src/core/rosterCore';

type RosterWithNormalized = ParsedAirAstanaRoster & { normalized?: NormalizedRoster };

/** Compatibility entry point for PDF and normalized AIMS flows. */
export function rosterToDuties(roster: RosterWithNormalized): Duty[] {
  return normalizedRosterToDuties(roster.normalized ?? adaptPdfRoster(roster));
}

export function formatMinutes(minutes?: number): string {
  if (minutes === undefined) return '—';
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export function rosterMonthLabel(roster: ParsedAirAstanaRoster): string {
  const date = new Date(`${roster.period.start}T00:00:00Z`);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
