import { expect, it } from 'vitest';
import { projectNormalizedRoster } from './rosterProjection';

it('does not expose integration internals in the UI projection', () => {
  const projected = projectNormalizedRoster({period:{start:'2026-09-01',end:'2026-09-30'},duties:[]});
  expect(JSON.stringify(projected)).not.toMatch(/SchedulerEvents|getlegmem|LegInfo|legId|cookie|csrf|authorization/i);
});
