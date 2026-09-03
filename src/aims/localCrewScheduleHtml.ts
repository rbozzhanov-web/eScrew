import { projectNormalizedRoster, type ProjectedRoster } from '@/src/application/rosterProjection';
import type { NormalizedCrewMember, NormalizedRoster, NormalizedSupplement } from '@/src/core/rosterContract';
import { adaptAimsSchedulerResponse, type AimsSchedulerResponse } from './adapter';

type JsonRecord = Record<string, unknown>;

const FLIGHT_DECK_CODES = new Set(['CP', 'FO', 'LI']);

/** Parse a locally saved AIMS CrewSchedule HTML file. No network/session state is required. */
export function parseAimsCrewScheduleHtml(html: string): ProjectedRoster {
  if (!/\/eCrew\/CrewSchedule|CrewSchedule/i.test(html) || !/initialResult/.test(html)) {
    throw new Error('Unsupported AIMS file. Save the Crew Schedule page as HTML and import that file.');
  }

  const initialResult = parseAssignedJsonObject(html, /var\s+initialResult\s*=/);
  const periodStart = readLocalStorageString(html, 'PeriodStart');
  const periodEnd = readLocalStorageString(html, 'PeriodEnd');
  if (!periodStart || !periodEnd) throw new Error('Could not read the AIMS roster period from the saved Crew Schedule file.');

  const response: AimsSchedulerResponse = {
    ...initialResult,
    PeriodStart: periodStart,
    PeriodEnd: periodEnd,
    SchedulerEvents: Array.isArray(initialResult.SchedulerEvents) ? initialResult.SchedulerEvents as AimsSchedulerResponse['SchedulerEvents'] : [],
  };
  const normalized = adaptAimsSchedulerResponse(response);
  attachCrew(normalized, findElementById(initialResult.elementList, 'members'));
  attachHotels(normalized, findElementById(initialResult.elementList, 'hotels'));

  const projected = projectNormalizedRoster(normalized);
  const hours = findElementById(initialResult.elementList, 'hours');
  if (hours && Array.isArray(hours.data)) {
    for (const row of hours.data) {
      if (!isRecord(row)) continue;
      const label = textValue(row.desc).toLowerCase();
      const minutes = clockMinutes(textValue(row.hours));
      if (minutes === undefined) continue;
      if (label.includes('block')) projected.totals.blockMinutes = minutes;
      if (label.includes('night')) projected.totals.nightMinutes = minutes;
    }
  }
  return projected;
}

function attachCrew(roster: NormalizedRoster, membersElement?: JsonRecord) {
  const groups = membersElement && Array.isArray(membersElement.data) ? membersElement.data : [];
  for (const rawGroup of groups) {
    if (!isRecord(rawGroup)) continue;
    const key = parseCrewGroup(textValue(rawGroup.value));
    if (!key || !Array.isArray(rawGroup.data)) continue;
    const crew = rawGroup.data.flatMap((item): NormalizedCrewMember[] => {
      if (!isRecord(item)) return [];
      const name = textValue(item.value2).trim();
      const position = textValue(item.value4).trim();
      const id = scalarString(item.value3);
      if (!name || !position) return [];
      const baseCode = position.split('-')[0]?.trim().toUpperCase() ?? '';
      return [{
        id: id || undefined,
        name,
        role: FLIGHT_DECK_CODES.has(baseCode) ? 'Flight deck' : 'Cabin',
        position,
        deadhead: /\bDHC\b/i.test(position) || undefined,
      }];
    });
    if (!crew.length) continue;
    const flight = roster.duties.flatMap((duty) => duty.flights).find((candidate) =>
      candidate.date === key.date
      && normalizeFlight(candidate.flightNumber) === normalizeFlight(key.flightNumber)
      && candidate.origin.toUpperCase() === key.origin
      && candidate.destination.toUpperCase() === key.destination
    );
    if (flight) flight.crew = crew;
  }
}

function attachHotels(roster: NormalizedRoster, hotelsElement?: JsonRecord) {
  const rows = hotelsElement && Array.isArray(hotelsElement.data) ? hotelsElement.data : [];
  const supplements: NormalizedSupplement[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const port = cleanHtml(textValue(row.port));
    const fields = ['phones', 'addresses', 'locators'].flatMap((key) => {
      const value = cleanHtml(textValue(row[key]));
      return value ? [{ label: key, value }] : [];
    });
    if (port) fields.unshift({ label: 'port', value: port });
    if (fields.length) supplements.push({ category: 'hotel', title: port || 'Hotel', fields });
  }
  if (!supplements.length) return;
  roster.supplements = [...(roster.supplements ?? []), ...supplements];
}

function parseCrewGroup(value: string): { date: string; flightNumber: string; origin: string; destination: string } | undefined {
  const normalized = value
    .replace(/&emsp;|&#8195;|&#x2003;/gi, ' | ')
    .replace(/\u2003/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*([A-Z]?\d{1,5})\s*\|\s*([A-Z]{3,4})\s*-\s*([A-Z]{3,4})/i.exec(normalized);
  if (!match) return undefined;
  const [, day, month, year, flightNumber, origin, destination] = match;
  return { date: `${year}-${month}-${day}`, flightNumber, origin: origin.toUpperCase(), destination: destination.toUpperCase() };
}

function parseAssignedJsonObject(source: string, marker: RegExp): JsonRecord {
  const match = marker.exec(source);
  if (!match) throw new Error('Could not find AIMS CrewSchedule data in the saved HTML file.');
  const start = source.indexOf('{', match.index + match[0].length);
  if (start < 0) throw new Error('Could not read AIMS CrewSchedule data.');
  const json = balancedJson(source, start, '{', '}');
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error('Saved AIMS CrewSchedule data is not valid JSON.'); }
  if (!isRecord(parsed)) throw new Error('Saved AIMS CrewSchedule data has an invalid shape.');
  return parsed;
}

function balancedJson(source: string, start: number, open: string, close: string): string {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('Saved AIMS CrewSchedule data is incomplete.');
}

function readLocalStorageString(source: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`localStorage\\[['\"]${escaped}['\"]\\]\\s*=\\s*['\"]([^'\"]+)['\"]`).exec(source)?.[1];
}

function findElementById(value: unknown, id: string): JsonRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findElementById(item, id);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (value.id === id) return value;
  for (const child of Object.values(value)) {
    const found = findElementById(child, id);
    if (found) return found;
  }
  return undefined;
}

function cleanHtml(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim();
}
function normalizeFlight(value: string): string { return value.trim().toUpperCase().replace(/^KC/, '').replace(/^F(?=\d)/, ''); }
function scalarString(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function textValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function clockMinutes(value: string): number | undefined {
  const match = /^(\d{1,3}):(\d{2})$/.exec(value.trim());
  if (!match || Number(match[2]) > 59) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
