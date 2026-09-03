import type { NormalizedRoster } from '@/src/core/rosterContract';
import { upsertNormalizedRoster } from '@/src/core/rosterStorage';
import { upsertStoredRoster } from '@/src/storage/rosterStorage';

/**
 * Public application import boundary for already-normalized roster data.
 * Persists the normalized Core model and updates the existing UI-compatible
 * local roster projection without exposing source-specific details to UI.
 */
export function importNormalizedRoster(roster: NormalizedRoster) {
  upsertNormalizedRoster(roster);
  return upsertStoredRoster(roster);
}
