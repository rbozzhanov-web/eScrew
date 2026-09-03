import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import type { RosterDuty, RosterSector } from '@/src/import/duties';

export interface CalendarExportResult { filename: string; events: number; method: 'download' | 'share' }

export function buildRosterIcs(roster: ParsedAirAstanaRoster): string {
  const events = roster.duties.flatMap((duty) => buildDutyEvent(roster, duty));
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//eScrew//Crew Schedule//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:eScrew',...events,'END:VCALENDAR',''].join('\r\n');
}

export async function exportRosterCalendar(roster: ParsedAirAstanaRoster): Promise<CalendarExportResult> {
  const content = buildRosterIcs(roster);
  const filename = `eScrew-${roster.period.start.slice(0, 7)}.ics`;
  if (typeof navigator !== 'undefined' && 'share' in navigator && typeof File !== 'undefined') {
    try {
      const file = new File([content], filename, { type: 'text/calendar;charset=utf-8' });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      const data: ShareData = { files: [file], title: `eScrew ${roster.period.start.slice(0, 7)}` };
      if (!nav.canShare || nav.canShare(data)) { await nav.share(data); return { filename, events: countEvents(content), method: 'share' }; }
    } catch (error) { if (error instanceof Error && (error.name === 'AbortError' || /cancel/i.test(error.message))) throw error; }
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') throw new Error('Calendar export is available in the web/PWA version.');
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = filename; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { filename, events: countEvents(content), method: 'download' };
}

function buildDutyEvent(roster: ParsedAirAstanaRoster, duty: RosterDuty): string[] {
  const sectors = roster.sectors.filter((sector) => sector.dutyIndex === duty.index); if (!sectors.length) return [];
  const first = sectors[0], last = sectors[sectors.length - 1]; const start = duty.start ?? `${first.date}T${first.timeOut}`; const end = ensureEndAfterStart(start, duty.end ?? `${last.arrivalDate ?? last.date}T${last.timeIn}`);
  const flights = sectors.map((sector) => `KC${sector.flightNumber}`).join(' / '); const summary = `${flights} · ${first.departureAirport} → ${last.arrivalAirport}`;
  return ['BEGIN:VEVENT',`UID:${escapeIcs(`${roster.period.start}-${duty.index}-${first.flightNumber}@escrew.local`)}`,`DTSTAMP:${utcStamp(new Date())}`,`DTSTART:${floatingStamp(start)}`,`DTEND:${floatingStamp(end)}`,`SUMMARY:${escapeIcs(summary)}`,`LOCATION:${escapeIcs(first.departureAirport)}`,`DESCRIPTION:${escapeIcs(`eScrew roster\\nReport ${timePart(start)} · Release ${timePart(end)}\\n${sectors.map(sectorDescription).join('\\n')}`)}`,'STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT'];
}
function sectorDescription(sector: RosterSector): string { return `KC${sector.flightNumber} ${sector.departureAirport}-${sector.arrivalAirport} ${sector.timeOut}-${sector.timeIn}${sector.deadhead ? ' · DHC' : ''}`; }
function ensureEndAfterStart(start:string,end:string):string{const a=parseNaive(start);let b=parseNaive(end);if(a===undefined||b===undefined||b>a)return end;b+=86400000;return naiveFromMs(b)}
function parseNaive(value:string){const[date,time]=value.split('T');if(!date||!time)return;const[y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);if([y,m,d,h,min].some(x=>!Number.isFinite(x)))return;return Date.UTC(y,m-1,d,h,min)}
function naiveFromMs(value:number){const d=new Date(value);return `${d.getUTCFullYear()}-${two(d.getUTCMonth()+1)}-${two(d.getUTCDate())}T${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`}
function floatingStamp(value:string){const[date,time]=value.split('T');return `${date.replaceAll('-','')}T${time.replace(':','')}00`}
function utcStamp(date:Date){return `${date.getUTCFullYear()}${two(date.getUTCMonth()+1)}${two(date.getUTCDate())}T${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`}
function timePart(value:string){return value.split('T')[1]??value} function two(v:number){return String(v).padStart(2,'0')}
function escapeIcs(value:string){return value.replaceAll('\\','\\\\').replaceAll(';','\\;').replaceAll(',','\\,').replace(/\r?\n/g,'\\n')}
function countEvents(content:string){return content.match(/BEGIN:VEVENT/g)?.length??0}
