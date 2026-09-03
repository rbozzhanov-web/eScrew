import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('keeps the application import boundary source agnostic', () => {
  const source = readFileSync(new URL('./rosterImport.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/src\/aims|AimsExtractionEngine|AimsClassicProtocol|getlegmem|SchedulerEvents/);
});
