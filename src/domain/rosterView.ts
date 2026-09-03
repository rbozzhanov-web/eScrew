import type { Duty } from './types';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import { adaptPdfRoster } from '@/src/import/pdfAdapter';
import { normalizedRosterToDuties } from '@/src/core/rosterCore';

/** Compatibility entry point for the existing PDF flow. Source conversion happens before Core. */
export function rosterToDuties(roster: ParsedAirAstanaRoster): Duty[] {
  return normalizedRosterToDuties(adaptPdfRoster(roster));
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
