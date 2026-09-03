import { describe, expect, it } from 'vitest';
import { projectNormalizedRoster } from './rosterProjection';

it('projects normalized duties without AIMS-specific fields', () => {
  const projected = projectNormalizedRoster({ period:{start:'2026-09-01',end:'2026-09-30'}, duties:[{date:'2026-09-03',flights:[{flightNumber:'921',date:'2026-09-03',origin:'NQZ',destination:'FRA',departure:'09:00',arrival:'13:00'}]}] });
  expect(projected.sectors[0]).toMatchObject({departureAirport:'NQZ',arrivalAirport:'FRA'});
  expect(projected.crewRecords).toEqual([]);
});
