import { adaptAimsSchedulerResponse, type AimsSchedulerResponse } from './adapter';
import type { NormalizedRoster } from '@/src/core/rosterContract';

export const AIMS_ORIGIN = 'https://aims.airastana.com';
export const AIMS_MESSAGE_TYPE = 'escrew:aims-roster';

export interface AimsBridgeMessage {
  type: typeof AIMS_MESSAGE_TYPE;
  payload: AimsSchedulerResponse;
}

/** Transport/security validation only. No roster business logic belongs here. */
export function isAimsBridgeMessage(value: unknown): value is AimsBridgeMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== AIMS_MESSAGE_TYPE || !msg.payload || typeof msg.payload !== 'object') return false;
  const payload = msg.payload as Record<string, unknown>;
  return typeof payload.PeriodStart === 'string' && typeof payload.PeriodEnd === 'string' && Array.isArray(payload.SchedulerEvents);
}

export function parseAimsMessage(event: Pick<MessageEvent, 'origin' | 'data'>): NormalizedRoster | undefined {
  if (event.origin !== AIMS_ORIGIN || !isAimsBridgeMessage(event.data)) return undefined;
  return adaptAimsSchedulerResponse(event.data.payload);
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
