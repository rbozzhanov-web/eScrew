import { describe, expect, it } from 'vitest';
import type { NormalizedRoster } from '@/src/core/rosterContract';
import { importNormalizedRoster } from './rosterImport';

describe('importNormalizedRoster', () => {
  it('projects a normalized roster into the existing UI roster without source-specific data', () => {
    const roster: NormalizedRoster = { period: { start: '2026-09-01', end: '2026-09-30' }, duties: [{ date: '2026-09-03', start: '2026-09-03T08:00', end: '2026-09-03T14:00', flights: [{ flightNumber: '921', date: '2026-09-03', origin: 'NQZ', destination: 'FRA', departure: '09:00', arrival: '13:00', crew: [] }] }] };
    const stored = importNormalizedRoster(roster);
    expect(stored.at(-1)?.sectors[0]).toMatchObject({ flightNumber: '921', departureAirport: 'NQZ', arrivalAirport: 'FRA' });
  });
});
