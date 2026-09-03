import type { ExtractedPage, TextItem } from './types';

export interface Line {
  y: number;
  items: TextItem[];
  text: string;
}

export function tokenizeLines(page: ExtractedPage, yTolerance = 2): Line[] {
  const lines: Line[] = [];
  for (const item of page.items) {
    if (!item.str.trim()) continue;
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance);
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lines.push({ y: item.y, items: [item], text: '' });
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  lines.sort((a, b) => a.y - b.y);
  return lines;
}
