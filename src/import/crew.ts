import { parseDateDdMmYyyy } from './patterns';
import { tokenizeLines, type Line } from './tokenize';
import type { ExtractedPage, TextItem } from './types';

export interface RosterCrewMember { rank: string; id: string; name: string; deadhead: boolean }
export interface CrewRecord { date: string; flightNumber: string; members: RosterCrewMember[] }
const CREW_MEMBER_RE = /^([A-Z]{2,3})\s*-\s*(DHC\s*-\s*)?(\d{1,6})\s*-\s*(.+)$/;
const CREW_END_SECTIONS = new Set(['Expiry Dates', 'Hotel Information', 'Memos', 'Descriptions']);
type CrewColumns = { date: number; duty: number; details: number };

export function parseCrewMember(raw: string): RosterCrewMember | undefined {
  const match = CREW_MEMBER_RE.exec(raw.trim());
  if (!match) return undefined;
  const [, rank, dhc, id, name] = match;
  return { rank, id, name: name.replace(/\s+/g, ' ').trim(), deadhead: dhc !== undefined };
}
export function parseCrewDetails(details: string): RosterCrewMember[] {
  return details.split('|').map(parseCrewMember).filter((member): member is RosterCrewMember => member !== undefined);
}

export function extractCrewRecords(pages: ExtractedPage[]): CrewRecord[] {
  const records: CrewRecord[] = [];
  let columns: CrewColumns | undefined;
  let insideCrewSection = false;
  for (const page of pages) {
    const lines = tokenizeLines(page);
    const heading = lines.find((line) => ['Date', 'Duty', 'Details'].every((label) => line.items.some((item) => item.str.trim() === label)));
    if (heading) { columns = headingColumns(heading); insideCrewSection = columns !== undefined; }
    if (!insideCrewSection || !columns) continue;
    const endSection = lines.filter((line) => line.items.some((item) => CREW_END_SECTIONS.has(item.str.trim()))).sort((a, b) => a.y - b.y)[0];
    const minY = heading ? heading.y : -Infinity;
    const maxY = endSection?.y ?? Infinity;
    const usable = page.items.filter((item) => item.y > minY && item.y < maxY && item.str.trim().length > 0);
    const anchors = usable.filter((item) => nearColumn(item, columns!.date, columns!.duty) && parseDateDdMmYyyy(item.str)).sort((a, b) => a.y - b.y);
    const dutyItems = usable.filter((item) => nearColumn(item, columns!.duty, columns!.details));
    const detailItems = usable.filter((item) => item.x >= columns!.details - 4);
    for (const [index, anchor] of anchors.entries()) {
      const date = parseDateDdMmYyyy(anchor.str)!;
      const duty = nearestBy(dutyItems, anchor.y);
      if (!duty || Math.abs(duty.y - anchor.y) > 12) continue;
      const details = detailItems.filter((item) => nearestAnchorIndex(anchors, item.y) === index).sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.str.trim()).join(' ');
      const members = parseCrewDetails(details);
      if (members.length > 0) records.push({ date, flightNumber: duty.str.trim(), members });
    }
    if (endSection) insideCrewSection = false;
  }
  return records;
}
function headingColumns(heading: Line): CrewColumns | undefined {
  const at = (label: string) => heading.items.find((item) => item.str.trim() === label)?.x;
  const date = at('Date'), duty = at('Duty'), details = at('Details');
  return date === undefined || duty === undefined || details === undefined ? undefined : { date, duty, details };
}
function nearColumn(item: TextItem, from: number, to: number): boolean { return item.x >= from - 4 && item.x < to - 4; }
function nearestBy(items: TextItem[], y: number): TextItem | undefined { return [...items].sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0]; }
function nearestAnchorIndex(anchors: TextItem[], y: number): number {
  let best = 0, distance = Number.POSITIVE_INFINITY;
  anchors.forEach((anchor, index) => { const next = Math.abs(anchor.y - y); if (next < distance) { best = index; distance = next; } });
  return best;
}
export function crewForSector(records: CrewRecord[], flightNumber: string, date: string, ownStaffId?: string) {
  const record = records.find((candidate) => candidate.flightNumber === flightNumber && candidate.date === date) ?? records.find((candidate) => candidate.flightNumber === flightNumber && withinADay(candidate.date, date));
  if (!record) return undefined;
  const own = ownStaffId ? record.members.find((member) => member.id === ownStaffId) : undefined;
  return { own, captain: record.members.find((member) => member.rank === 'CP' && !member.deadhead), purser: record.members.find((member) => member.rank === 'PU' && !member.deadhead), members: record.members };
}
function withinADay(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= 86_400_000;
}
