import { expect, it } from 'vitest';
import { importNormalizedRoster } from './rosterImport';

it('accepts an empty normalized roster period without source-specific state', () => {
  const result = importNormalizedRoster({ period:{start:'2026-10-01',end:'2026-10-31'}, duties:[] });
  expect(result.at(-1)?.period.start).toBe('2026-10-01');
});
