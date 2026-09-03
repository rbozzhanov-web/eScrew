import { parseAimsSchedulerResponse, type AimsSchedulerResponse } from './adapter';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';

export const AIMS_ORIGIN = 'https://aims.airastana.com';
export const ESCREW_ORIGIN = 'https://rbozzhanov-web.github.io';
export const AIMS_MESSAGE_TYPE = 'escrew:aims-scheduler-events';
export const AIMS_READY_MESSAGE_TYPE = 'escrew:aims-ready';

export interface AimsBridgeEnvelope {
  type: typeof AIMS_MESSAGE_TYPE;
  payload: AimsSchedulerResponse;
}

/**
 * Validates a postMessage event coming from an AIMS-origin bridge.
 *
 * The bridge transfers roster JSON only. It must never transfer cookies,
 * passwords, antiforgery tokens, Retrieve keys or other session material.
 */
export function rosterFromAimsMessage(event: Pick<MessageEvent, 'origin' | 'data'>): ParsedAirAstanaRoster | undefined {
  if (event.origin !== AIMS_ORIGIN) return undefined;
  if (!isBridgeEnvelope(event.data)) return undefined;
  return parseAimsSchedulerResponse(event.data.payload);
}

export function isBridgeEnvelope(value: unknown): value is AimsBridgeEnvelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.type !== AIMS_MESSAGE_TYPE) return false;
  const payload = record.payload;
  if (!payload || typeof payload !== 'object') return false;
  const roster = payload as Record<string, unknown>;
  return typeof roster.PeriodStart === 'string'
    && typeof roster.PeriodEnd === 'string'
    && Array.isArray(roster.SchedulerEvents);
}

/**
 * Tells an AIMS-side sender that the eScrew receiver is loaded.
 *
 * This is intentionally one-way and contains no local roster data or session
 * material. The target origin is pinned to AIMS.
 */
function announceReceiverReady(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: AIMS_READY_MESSAGE_TYPE }, AIMS_ORIGIN);
    }
  } catch {
    // The sender also retries delivery, so readiness is best-effort only.
  }
}

/**
 * Registers the receiving side of the web-only AIMS bridge.
 * Returns a cleanup function suitable for a React effect.
 */
export function listenForAimsRoster(onRoster: (roster: ParsedAirAstanaRoster) => void, onError?: (error: Error) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const listener = (event: MessageEvent) => {
    try {
      const roster = rosterFromAimsMessage(event);
      if (roster) onRoster(roster);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  window.addEventListener('message', listener);
  announceReceiverReady();
  return () => window.removeEventListener('message', listener);
}
