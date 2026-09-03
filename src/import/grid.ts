import { DAY_DDMM_RE } from './patterns';
import { tokenizeLines, type Line } from './tokenize';
import type { ExtractedPage, TextItem } from './types';

export interface DayColumn { label: string; cells: string[] }
const MEMO_MARKER = 'M';
const GRID_END_MARKERS = ['Total Hours', 'Other Crew', 'Expiry Dates'];

export function extractDayColumns(page: ExtractedPage): DayColumn[] {
  const lines = tokenizeLines(page);
  const headingLine = lines.find((line) => countDayHeadings(line) >= 3);
  if (!headingLine) return [];
  const headings = headingLine.items.filter((item) => DAY_DDMM_RE.test(item.str.trim())).sort((a, b) => a.x - b.x);
  const gridTop = headingLine.y + 12;
  const marker = lines.find((line) => line.y > gridTop && GRID_END_MARKERS.some((text) => line.text.startsWith(text)));
  const gridBottom = marker ? marker.y - 2 : Number.POSITIVE_INFINITY;
  const pitch = headings.length > 1 ? headings[1].x - headings[0].x : page.width;
  const leftPad = pitch / 4;
  const body = page.items.filter((item) => item.str.trim() && item.str.trim() !== MEMO_MARKER && item.y > gridTop && item.y < gridBottom);
  return headings.map((heading, index) => {
    const nextX = headings[index + 1]?.x ?? Number.POSITIVE_INFINITY;
    const from = heading.x - leftPad;
    const to = nextX - leftPad;
    const cells = body.filter((item) => item.x >= from && item.x < to).sort(byReadingOrder).map((item) => item.str.trim());
    return { label: heading.str.trim(), cells };
  });
}

function countDayHeadings(line: Line): number { return line.items.filter((item) => DAY_DDMM_RE.test(item.str.trim())).length; }
function byReadingOrder(a: TextItem, b: TextItem): number { return Math.abs(a.y - b.y) > 1.5 ? a.y - b.y : a.x - b.x; }

export function resolveGridDate(label: string, periodStart: string, periodEnd: string): string | undefined {
  const match = DAY_DDMM_RE.exec(label);
  if (!match) return undefined;
  const [, dd, mm] = match;
  const years = new Set([periodStart.slice(0, 4), periodEnd.slice(0, 4)]);
  const endPlusOne = addDays(periodEnd, 1);
  for (const year of years) {
    const candidate = `${year}-${mm}-${dd}`;
    if (isRealDate(candidate) && candidate >= periodStart && candidate <= endPlusOne) return candidate;
  }
  return undefined;
}
function isRealDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
