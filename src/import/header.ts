import { parseDateDdMmYyyy } from './patterns';
import { tokenizeLines } from './tokenize';
import type { ExtractedPage } from './types';

export interface ReportSubject { staffId: string; name: string; base?: string; rank?: string; qualification?: string }
export interface ReportPeriod { start: string; end: string }
export interface ReportTotals { blockMinutes?: number; nightMinutes?: number }

const SUBJECT_RE = /^(\d{2,6})\s+([A-Z][A-Z' -]*?)\s+([A-Z]{3})-([A-Z]{2,3})-([A-Z0-9]{2,6})$/;
const SUBJECT_MINIMAL_RE = /^(\d{2,6})\s+([A-Z][A-Z' -]+)$/;
const PERIOD_RE = /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/;

export function parseSubject(pages: ExtractedPage[]): ReportSubject | undefined {
  for (const page of pages) for (const line of tokenizeLines(page)) {
    const full = SUBJECT_RE.exec(line.text.trim());
    if (full) {
      const [, staffId, name, base, rank, qualification] = full;
      return { staffId, name: name.trim(), base, rank, qualification };
    }
    const minimal = SUBJECT_MINIMAL_RE.exec(line.text.trim());
    if (minimal) return { staffId: minimal[1], name: minimal[2].trim() };
  }
  return undefined;
}

export function parsePeriod(pages: ExtractedPage[]): ReportPeriod | undefined {
  for (const page of pages) for (const line of tokenizeLines(page)) {
    const match = PERIOD_RE.exec(line.text);
    if (!match) continue;
    const start = parseDateDdMmYyyy(match[1]);
    const end = parseDateDdMmYyyy(match[2]);
    if (start && end) return { start, end };
  }
  return undefined;
}

export function parseReportTotals(pages: ExtractedPage[]): ReportTotals {
  for (const page of pages) {
    const lines = tokenizeLines(page);
    const headingIndex = lines.findIndex((line) => line.text.startsWith('Block Hours'));
    if (headingIndex === -1) continue;
    const heading = lines[headingIndex];
    const values = lines[headingIndex + 1];
    if (!values) continue;
    const blockX = heading.items.find((item) => item.str.trim().startsWith('Block'))?.x;
    const nightX = heading.items.find((item) => item.str.trim().startsWith('Night'))?.x;
    return { blockMinutes: minutesUnder(values.items, blockX), nightMinutes: minutesUnder(values.items, nightX) };
  }
  return {};
}

function minutesUnder(items: { str: string; x: number }[], headingX: number | undefined): number | undefined {
  if (headingX === undefined) return undefined;
  const item = items.filter((candidate) => /^\d{1,4}:[0-5]\d$/.test(candidate.str.trim())).sort((a, b) => Math.abs(a.x - headingX) - Math.abs(b.x - headingX))[0];
  if (!item) return undefined;
  const [hours, minutes] = item.str.trim().split(':').map(Number);
  return hours * 60 + minutes;
}
