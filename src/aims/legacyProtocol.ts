import { parseCrewSheet } from './engine';
import type { AimsExtractedCrewMember } from './types';

/**
 * Clean-room connector for the classic eCrew navigation pattern documented by
 * public AIMS integrations: schedule -> trip details -> leg crew sheet.
 * It never logs in and never accepts credentials; it can only use the session
 * of the AIMS page in which it is executed.
 */
export const AIMS_CLASSIC = {
  schedule: '/perinfo.exe/schedule',
  crew: '/perinfo.exe/getlegmem',
} as const;

export interface AimsClassicLegRef {
  legId: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
}

export class AimsClassicProtocol {
  async readSchedule(): Promise<string> {
    return sameOriginText(AIMS_CLASSIC.schedule);
  }

  parseLegRefs(html: string): AimsClassicLegRef[] {
    if (typeof DOMParser === 'undefined') return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const refs: AimsClassicLegRef[] = [];
    const seen = new Set<string>();
    for (const element of doc.querySelectorAll<HTMLElement>('[id],a[href]')) {
      const href = element instanceof HTMLAnchorElement ? element.getAttribute('href') ?? '' : '';
      const legId = legIdFrom(element.id) ?? legIdFrom(href);
      if (!legId || seen.has(legId)) continue;
      const text = clean(element.textContent);
      const route = /(\d{1,5})[^A-Z0-9]+([A-Z]{3})[^A-Z]+([A-Z]{3})/i.exec(text);
      refs.push({ legId, flightNumber: route?.[1], origin: route?.[2]?.toUpperCase(), destination: route?.[3]?.toUpperCase() });
      seen.add(legId);
    }
    return refs;
  }

  async readCrew(legId: string): Promise<AimsExtractedCrewMember[]> {
    if (!/^[A-Za-z0-9_.:,|+-]{1,256}$/.test(legId)) throw new Error('Invalid AIMS leg reference');
    const html = await sameOriginText(`${AIMS_CLASSIC.crew}?LegInfo=${encodeURIComponent(legId)}`);
    return parseCrewSheet(html);
  }

  async readCrewForSchedule(): Promise<Map<string, AimsExtractedCrewMember[]>> {
    const schedule = await this.readSchedule();
    const legs = this.parseLegRefs(schedule);
    const result = new Map<string, AimsExtractedCrewMember[]>();
    for (const leg of legs) {
      try { result.set(leg.legId, await this.readCrew(leg.legId)); }
      catch { result.set(leg.legId, []); }
    }
    return result;
  }
}

function legIdFrom(value: string): string | undefined {
  if (!value) return undefined;
  const query = /(?:LegInfo|leginfo)=([^&#"']+)/i.exec(value)?.[1];
  if (query) { try { return decodeURIComponent(query); } catch { return query; } }
  const direct = /^(?:leg|sector|flt)[-_:.]?(.{3,})$/i.exec(value)?.[1];
  return direct?.trim();
}

async function sameOriginText(path: string): Promise<string> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('Cross-origin AIMS request rejected');
  const response = await fetch(`${url.pathname}${url.search}`, { method: 'GET', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`AIMS request failed (${response.status})`);
  return response.text();
}
function clean(value: string | null): string { return (value ?? '').replace(/\s+/g, ' ').trim(); }
