import type { NormalizedRoster } from './rosterContract';

const KEY = 'escrew.normalized-rosters.v1';
const sort = (rosters: NormalizedRoster[]) => [...rosters].sort((a, b) => a.period.start.localeCompare(b.period.start));

export function loadNormalizedRosters(): NormalizedRoster[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? sort(value as NormalizedRoster[]) : [];
  } catch { return []; }
}

export function upsertNormalizedRoster(roster: NormalizedRoster): NormalizedRoster[] {
  const next = sort([...loadNormalizedRosters().filter(item => item.period.start !== roster.period.start), roster]);
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeNormalizedRoster(start: string): NormalizedRoster[] {
  const next = loadNormalizedRosters().filter(item => item.period.start !== start);
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
