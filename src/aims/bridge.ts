import { parseAimsSchedulerResponse, type AimsSchedulerResponse } from './adapter';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';

export const AIMS_ORIGIN = 'https://aims.airastana.com';
export const AIMS_MESSAGE_TYPE = 'escrew:aims-roster';

export interface AimsBridgeMessage {
  type: typeof AIMS_MESSAGE_TYPE;
  payload: AimsSchedulerResponse;
}

/**
 * Validates that a value is a properly-formed AIMS bridge message.
 * The message must contain only roster JSON data - never cookies, tokens, or credentials.
 */
export function isAimsBridgeMessage(value: unknown): value is AimsBridgeMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== AIMS_MESSAGE_TYPE) return false;
  if (!msg.payload || typeof msg.payload !== 'object') return false;
  const payload = msg.payload as Record<string, unknown>;
  return (
    typeof payload.PeriodStart === 'string' &&
    typeof payload.PeriodEnd === 'string' &&
    Array.isArray(payload.SchedulerEvents)
  );
}

/**
 * Extracts and parses a roster from an AIMS postMessage event.
 * Origin must be aims.airastana.com to prevent XSS attacks.
 * Returns undefined if the message is invalid or from wrong origin.
 */
export function parseAimsMessage(event: Pick<MessageEvent, 'origin' | 'data'>): ParsedAirAstanaRoster | undefined {
  // Strict origin check - postMessage is only valid from AIMS domain
  if (event.origin !== AIMS_ORIGIN) {
    console.warn('Rejected AIMS message from unexpected origin:', event.origin);
    return undefined;
  }

  if (!isAimsBridgeMessage(event.data)) {
    return undefined;
  }

  try {
    return parseAimsSchedulerResponse(event.data.payload);
  } catch (error) {
    console.error('Failed to parse AIMS roster:', error);
    throw error;
  }
}

/**
 * Sets up a listener for AIMS roster data via postMessage.
 * The AIMS popup sends roster JSON when the user confirms the import.
 *
 * Returns a cleanup function to stop listening (typically for React cleanup).
 */
export function listenForAimsRoster(
  onRoster: (roster: ParsedAirAstanaRoster) => void,
  onError?: (error: Error) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleMessage = (event: MessageEvent) => {
    try {
      const roster = parseAimsMessage(event);
      if (roster) {
        onRoster(roster);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}
