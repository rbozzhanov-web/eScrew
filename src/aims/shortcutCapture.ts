import type { ProjectedRoster } from '@/src/application/rosterProjection';
import { parseAimsCrewScheduleHtml } from './localCrewScheduleHtml';

type CompactCapture = {
  v: 1;
  p: [string, string];
  e: unknown[];
  m: unknown[];
  h: unknown[];
  t: unknown[];
};

const MAX_CAPTURE_LENGTH = 120_000;
const MAX_EVENTS = 200;
const MAX_MEMBER_GROUPS = 100;
const MAX_MEMBERS_PER_GROUP = 40;

/** Decode the compact, local-only payload returned by the iOS eScrew Capture shortcut. */
export function parseAimsShortcutCapture(text: string): ProjectedRoster {
  if (!text || text.length > MAX_CAPTURE_LENGTH) throw new Error('Invalid eScrew Capture payload size.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('eScrew Capture returned invalid JSON.'); }
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.p) || value.p.length !== 2) {
    throw new Error('Unsupported eScrew Capture payload.');
  }
  const periodStart = stringValue(value.p[0]);
  const periodEnd = stringValue(value.p[1]);
  if (!periodStart || !periodEnd) throw new Error('eScrew Capture did not include a roster period.');

  const events = Array.isArray(value.e) ? value.e.slice(0, MAX_EVENTS) : [];
  const memberGroups = Array.isArray(value.m) ? value.m.slice(0, MAX_MEMBER_GROUPS) : [];
  const hotels = Array.isArray(value.h) ? value.h : [];
  const totals = Array.isArray(value.t) ? value.t : [];

  const membersElement = {
    id: 'members',
    data: memberGroups.flatMap((group) => {
      if (!Array.isArray(group) || group.length < 2 || !Array.isArray(group[1])) return [];
      const groupLabel = stringValue(group[0]);
      if (!groupLabel) return [];
      return [{
        value: groupLabel,
        data: group[1].slice(0, MAX_MEMBERS_PER_GROUP).flatMap((member) => {
          if (!Array.isArray(member) || member.length < 3) return [];
          const name = stringValue(member[0]);
          const id = scalarValue(member[1]);
          const position = stringValue(member[2]);
          const extra = stringValue(member[3]);
          if (!name || !position) return [];
          return [{ value: '', value2: name, value3: id, value4: position, value5: extra }];
        }),
      }];
    }),
  };

  const hotelsElement = {
    id: 'hotels',
    data: hotels.flatMap((row) => {
      if (!Array.isArray(row)) return [];
      return [{
        port: stringValue(row[0]),
        phones: stringValue(row[1]),
        addresses: stringValue(row[2]),
        locators: stringValue(row[3]),
      }];
    }),
  };

  const hoursElement = {
    id: 'hours',
    data: totals.flatMap((row) => {
      if (!Array.isArray(row)) return [];
      return [{ desc: stringValue(row[0]), hours: stringValue(row[1]) }];
    }),
  };

  const initialResult = {
    SchedulerEvents: events,
    elementList: [membersElement, hotelsElement, hoursElement],
  };
  const syntheticHtml = [
    'CrewSchedule',
    `var initialResult=${JSON.stringify(initialResult)};`,
    `localStorage['PeriodStart']=${JSON.stringify(periodStart)};`,
    `localStorage['PeriodEnd']=${JSON.stringify(periodEnd)};`,
  ].join('\n');
  return parseAimsCrewScheduleHtml(syntheticHtml);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function scalarValue(value: unknown): string | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' ? value : '';
}
