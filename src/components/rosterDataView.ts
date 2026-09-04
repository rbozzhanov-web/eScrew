import type { NormalizedFlight, NormalizedRoster, NormalizedSupplement } from '@/src/core/rosterContract';
import type { Duty, Sector } from '@/src/domain/types';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';

export type RosterWithNormalized = ParsedAirAstanaRoster & { normalized?: NormalizedRoster };

export type RosterTimelineRow =
  | { kind: 'flight'; key: string; sortKey: string; duty: Duty; sector: Sector }
  | {
      kind: 'event';
      key: string;
      sortKey: string;
      date: string;
      title: string;
      badge: string;
      detail?: string;
      station?: string;
      supplement: NormalizedSupplement;
    };

export type FlightExtra = {
  aircraftType?: string;
  actualTimes?: boolean;
  arrivalDate?: string;
};

export type StayInfo = {
  station?: string;
  hotel?: string;
  rest?: string;
  checkIn?: string;
  checkOut?: string;
  address?: string;
  phone?: string;
};

const SECTOR_DETAIL_RE = /\b\d{1,5}\s*-\s*[A-Z]{3,4}\s*\(/i;

export function buildRosterTimeline(roster: RosterWithNormalized | undefined, duties: Duty[]): RosterTimelineRow[] {
  const rows: RosterTimelineRow[] = duties.flatMap((duty) => duty.sectors.map((sector) => ({
    kind: 'flight' as const,
    key: `flight-${sector.id}`,
    sortKey: `${duty.date ?? ''}T${duty.reportTime || sector.departureTime || '00:00'}-1-${sector.departureTime}`,
    duty,
    sector,
  })));

  for (const supplement of roster?.normalized?.supplements ?? []) {
    if (!supplement.date || supplement.flightNumber || isSectorSupplement(supplement)) continue;
    const presentation = presentEvent(supplement);
    if (!presentation) continue;
    rows.push({
      kind: 'event',
      key: `event-${supplement.date}-${rows.length}-${presentation.badge}-${presentation.title}`,
      sortKey: `${supplement.date}T${eventTime(supplement) ?? '00:00'}-0`,
      date: supplement.date,
      supplement,
      ...presentation,
    });
  }

  return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function flightExtra(roster: RosterWithNormalized | undefined, sector: Sector): FlightExtra | undefined {
  const flight = findNormalizedFlight(roster?.normalized, sector);
  if (!flight) return undefined;
  return {
    aircraftType: flight.aircraftType,
    actualTimes: flight.actualTimes,
    arrivalDate: flight.arrivalDate,
  };
}

export function stayForSector(roster: RosterWithNormalized | undefined, sector: Sector): StayInfo | undefined {
  const supplements = roster?.normalized?.supplements ?? [];
  const station = sector.arrival.toUpperCase();
  const dated = supplements.find((item) => item.category === 'hotel' && item.date === sectorDate(roster?.normalized, sector));
  const directory = supplements.find((item) => item.category === 'hotel' && !item.date && field(item, 'port')?.toUpperCase() === station);
  if (!dated && !directory) return undefined;

  const rawText = dated ? field(dated, 'text') : undefined;
  const hotelFromText = rawText ? /^Rest\s+(.+?)\s+\(/i.exec(clean(rawText))?.[1]?.trim() : undefined;
  const rest = dated ? field(dated, 'HotelInfo.Rest') ?? firstMatch(field(dated, 'details'), /^(\d{1,3}:\d{2})\s+Rest/i) : undefined;
  const checkIn = dated ? field(dated, 'HotelInfo.CheckInTime') : undefined;
  const checkOut = dated ? field(dated, 'HotelInfo.CheckOutTime') : undefined;
  const address = directory ? field(directory, 'addresses') : undefined;
  const phone = directory ? field(directory, 'phones') : undefined;

  if (!hotelFromText && !rest && !checkIn && !checkOut && !address && !phone) return undefined;
  return {
    station,
    hotel: hotelFromText,
    rest,
    checkIn,
    checkOut,
    address,
    phone,
  };
}

function presentEvent(supplement: NormalizedSupplement): { title: string; badge: string; detail?: string; station?: string } | undefined {
  const type = clean(field(supplement, 'type') ?? '');
  const text = clean(field(supplement, 'text') ?? supplement.title ?? '');
  const details = clean(field(supplement, 'details') ?? '');
  const station = clean(field(supplement, 'location') ?? '');
  const lines = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const code = lines[0] ?? '';
  const description = lines[1] ?? firstMatch(details, /^(.+?)\s+-\s+[A-Z0-9]+(?:\s|$)/i);

  if (supplement.category === 'hotel' || type.toLowerCase() === 'hotel') {
    const hotel = /^Rest\s+(.+?)\s+\(/i.exec(text)?.[1]?.trim() ?? description ?? 'Layover';
    const rest = field(supplement, 'HotelInfo.Rest') ?? firstMatch(details, /^(\d{1,3}:\d{2})\s+Rest/i);
    const checkIn = field(supplement, 'HotelInfo.CheckInTime');
    const checkOut = field(supplement, 'HotelInfo.CheckOutTime');
    const timing = [rest ? `Rest ${rest}` : undefined, checkIn && checkOut ? `${checkIn} → ${checkOut}` : eventRange(supplement)].filter(Boolean).join(' · ');
    return { title: hotel, badge: 'HOTEL', detail: timing || undefined, station: station || undefined };
  }

  if (!text && !details && !type) return undefined;
  const title = description || code || supplement.title || type || 'Roster event';
  const badge = eventBadge(type, code, supplement.category);
  const range = eventRange(supplement) ?? (details.includes('Full day') ? 'Full day' : undefined);
  return { title, badge, detail: range, station: station || undefined };
}

function eventBadge(type: string, code: string, category: NormalizedSupplement['category']): string {
  if (category === 'memo') return 'MEMO';
  if (category === 'notification') return 'NOTICE';
  if (category === 'rest') return 'REST';
  if (category === 'transport') return 'TRANSFER';
  if (/standby/i.test(type)) return 'STANDBY';
  if (/off/i.test(type)) return code || 'OFF';
  return (code || type || 'EVENT').toUpperCase().slice(0, 12);
}

function eventRange(supplement: NormalizedSupplement): string | undefined {
  const start = isoTime(field(supplement, 'start'));
  const end = isoTime(field(supplement, 'end'));
  if (!start || !end || (start === '00:00' && end === '23:59')) return undefined;
  const endDate = isoDate(field(supplement, 'end'));
  const suffix = endDate && supplement.date && endDate !== supplement.date ? ' +1' : '';
  return `${start} – ${end}${suffix}`;
}

function eventTime(supplement: NormalizedSupplement): string | undefined {
  return isoTime(field(supplement, 'start'));
}

function isSectorSupplement(supplement: NormalizedSupplement): boolean {
  const details = field(supplement, 'details');
  return Boolean(details && SECTOR_DETAIL_RE.test(details));
}

function findNormalizedFlight(roster: NormalizedRoster | undefined, sector: Sector): NormalizedFlight | undefined {
  if (!roster) return undefined;
  const number = normalizeFlight(sector.flightNumber);
  return roster.duties.flatMap((duty) => duty.flights).find((flight) =>
    normalizeFlight(flight.flightNumber) === number
    && flight.origin.toUpperCase() === sector.departure.toUpperCase()
    && flight.destination.toUpperCase() === sector.arrival.toUpperCase()
    && flight.departure === sector.departureTime
  );
}

function sectorDate(roster: NormalizedRoster | undefined, sector: Sector): string | undefined {
  return findNormalizedFlight(roster, sector)?.date;
}

function field(supplement: NormalizedSupplement, label: string): string | undefined {
  const value = supplement.fields.find((item) => item.label === label)?.value;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function clean(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function firstMatch(value: string | undefined, pattern: RegExp): string | undefined {
  return value ? pattern.exec(value)?.[1]?.trim() : undefined;
}

function isoTime(value: string | undefined): string | undefined {
  return value ? /T(\d{2}:\d{2})/.exec(value)?.[1] : undefined;
}

function isoDate(value: string | undefined): string | undefined {
  return value ? /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] : undefined;
}

function normalizeFlight(value: string): string {
  return value.trim().toUpperCase().replace(/^KC/, '').replace(/^F(?=\d)/, '');
}
