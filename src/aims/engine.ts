import { extractSchedulerResponse } from './extraction';
import { normalizeSchedulerResponse } from './normalize';
import { AIMS_SCHEDULER_EVENTS_PATH, type AimsExtractedCrewMember, type AimsExtractedRoster } from './types';

/**
 * Variant A engine. Runs only inside an already-authenticated AIMS page.
 * It deliberately relies on the browser's existing same-origin session and never
 * reads, serializes or exposes cookies, credentials, storage, CSRF values or headers.
 */
export class AimsExtractionEngine {
  async readRoster(): Promise<AimsExtractedRoster> {
    const response = await fetch(AIMS_SCHEDULER_EVENTS_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`AIMS roster request failed (${response.status})`);
    const data: unknown = await response.json();
    const extracted = extractSchedulerResponse({ path: AIMS_SCHEDULER_EVENTS_PATH, data });
    if (!extracted) throw new Error('AIMS roster response shape is unsupported');
    return normalizeSchedulerResponse(extracted);
  }

  /**
   * Enriches flights when a crew-sheet URL/reference is available in the page.
   * The request remains same-origin. The parser accepts common AIMS crew table
   * layouts without depending on presentation CSS classes.
   */
  async readCrew(path: string): Promise<AimsExtractedCrewMember[]> {
    const safePath = sameOriginPath(path);
    const response = await fetch(safePath, { method: 'GET', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`AIMS crew request failed (${response.status})`);
    return parseCrewSheet(await response.text());
  }

  async enrichCrew(roster: AimsExtractedRoster, crewPathForLeg: (legId: string) => string | undefined): Promise<AimsExtractedRoster> {
    const flights = await Promise.all(roster.flights.map(async flight => {
      if (!flight.legId) return flight;
      const path = crewPathForLeg(flight.legId);
      if (!path) return flight;
      try {
        const crew = await this.readCrew(path);
        return crew.length ? { ...flight, crew } : flight;
      } catch {
        return flight; // crew enrichment must never break the roster
      }
    }));
    return { ...roster, flights };
  }
}

export function parseCrewSheet(html: string): AimsExtractedCrewMember[] {
  if (typeof DOMParser === 'undefined') return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const members: AimsExtractedCrewMember[] = [];
  const seen = new Set<string>();

  for (const row of document.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('th,td')].map(cell => clean(cell.textContent));
    if (cells.length < 2) continue;
    const member = crewFromCells(cells);
    if (!member) continue;
    const key = `${member.role ?? ''}\u0000${member.name}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    members.push(member);
  }
  return members;
}

function crewFromCells(cells: string[]): AimsExtractedCrewMember | undefined {
  const roleIndex = cells.findIndex(value => /^(CAPT|CPT|FO|F\/O|SCCM|CCM|FA|PU|PURSER|TRI|TRE)$/i.test(value));
  if (roleIndex < 0) return undefined;
  const role = normalizeRole(cells[roleIndex]);
  const name = cells
    .filter((_, index) => index !== roleIndex)
    .find(value => value.length >= 3 && /[A-ZА-ЯЁ]/i.test(value) && !/^\d+$/.test(value));
  if (!name) return undefined;
  const status = cells.find(value => /^(OPERATING|DEADHEAD|DHD|DH|JUMPSEAT|INSTRUCTOR|TRAINEE)$/i.test(value));
  return { name, role, operatingStatus: status ? normalizeStatus(status) : undefined };
}

function normalizeRole(value: string): string {
  const role = value.toUpperCase().replace(/\s+/g, '');
  if (role === 'CPT') return 'CAPT';
  if (role === 'F/O') return 'FO';
  if (role === 'PU' || role === 'PURSER') return 'SCCM';
  return role;
}

function normalizeStatus(value: string): string {
  const status = value.toUpperCase();
  if (status === 'DHD' || status === 'DH') return 'deadhead';
  return status.toLowerCase();
}

function sameOriginPath(value: string): string {
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('Cross-origin AIMS request rejected');
  return `${url.pathname}${url.search}`;
}

function clean(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
