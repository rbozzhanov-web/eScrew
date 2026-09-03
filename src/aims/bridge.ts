import { adaptAimsSchedulerResponse, adaptDashboardResponse, type AimsSchedulerResponse } from './adapter';
import { type DashboardRosterResponse } from './dashboardParser';
import type { NormalizedRoster } from '@/src/core/rosterContract';

export const AIMS_ORIGIN = 'https://aims.airastana.com';
export const AIMS_MESSAGE_TYPE = 'escrew:aims-roster';
export const AIMS_DASHBOARD_MESSAGE_TYPE = 'escrew:aims-dashboard';

export interface AimsBridgeMessage {
  type: typeof AIMS_MESSAGE_TYPE;
  payload: AimsSchedulerResponse;
}

export interface AimsDashboardBridgeMessage {
  type: typeof AIMS_DASHBOARD_MESSAGE_TYPE;
  payload: DashboardRosterResponse;
}

/** Transport/security validation only. No roster business logic belongs here. */
export function isAimsBridgeMessage(value: unknown): value is AimsBridgeMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== AIMS_MESSAGE_TYPE || !msg.payload || typeof msg.payload !== 'object') return false;
  const payload = msg.payload as Record<string, unknown>;
  return typeof payload.PeriodStart === 'string' && typeof payload.PeriodEnd === 'string' && Array.isArray(payload.SchedulerEvents);
}

export function isAimsDashboardBridgeMessage(value: unknown): value is AimsDashboardBridgeMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== AIMS_DASHBOARD_MESSAGE_TYPE || !msg.payload || typeof msg.payload !== 'object') return false;
  const payload = msg.payload as Record<string, unknown>;
  return typeof payload.periodStart === 'string' && typeof payload.periodEnd === 'string' && Array.isArray(payload.events);
}

export function parseAimsMessage(event: Pick<MessageEvent, 'origin' | 'data'>): NormalizedRoster | undefined {
  if (event.origin !== AIMS_ORIGIN) return undefined;
  if (isAimsBridgeMessage(event.data)) {
    return adaptAimsSchedulerResponse(event.data.payload);
  }
  if (isAimsDashboardBridgeMessage(event.data)) {
    return adaptDashboardResponse(event.data.payload.events, event.data.payload.periodStart, event.data.payload.periodEnd);
  }
  return undefined;
}

export function listenForAimsRoster(
  onRoster: (roster: NormalizedRoster) => void,
  onError?: (error: Error) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleMessage = (event: MessageEvent) => {
    try {
      const roster = parseAimsMessage(event);
      if (roster) onRoster(roster);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}
