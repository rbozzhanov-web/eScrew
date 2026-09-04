import MainScreen from './MainScreen';
import { installRosterDayColors } from './rosterDayColors';
import { parseAimsShortcutCapture } from '@/src/aims/shortcutCapture';
import { upsertStoredRoster } from '@/src/storage/rosterStorage';

const HASH_PREFIX = '#aims-shortcut=';
const RESULT_KEY = 'escrew.aims.shortcut.lastResult';
const B64_PREFIX = 'b64.';

function decodeBase64UrlPayload(encoded: string): string {
  const firstDot = encoded.indexOf('.', B64_PREFIX.length);
  if (!encoded.startsWith(B64_PREFIX) || firstDot < 0) throw new Error('Unsupported eScrew Capture transport.');
  const expectedLength = Number(encoded.slice(B64_PREFIX.length, firstDot));
  if (!Number.isSafeInteger(expectedLength) || expectedLength < 1) throw new Error('Invalid eScrew Capture transport length.');
  const body = encoded.slice(firstDot + 1);
  const base64 = body.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(body.length / 4) * 4, '=');
  let binary = '';
  try { binary = window.atob(base64); }
  catch { throw new Error('eScrew Capture transport is corrupted.'); }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.length !== expectedLength) throw new Error('eScrew Capture transport was truncated.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('eScrew Capture transport has invalid UTF-8.'); }
}

function decodeShortcutPayload(encoded: string): string {
  if (encoded.startsWith(B64_PREFIX)) return decodeBase64UrlPayload(encoded);
  if (encoded.startsWith('{')) return encoded;
  return decodeURIComponent(encoded);
}

function consumeShortcutCapture() {
  if (typeof window === 'undefined' || !window.location.hash.startsWith(HASH_PREFIX)) return;
  const encoded = window.location.hash.slice(HASH_PREFIX.length);
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', cleanUrl);
  try {
    const payload = decodeShortcutPayload(encoded);
    const roster = parseAimsShortcutCapture(payload);
    upsertStoredRoster(roster);
    window.sessionStorage?.setItem(RESULT_KEY, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.sessionStorage?.setItem(RESULT_KEY, `error:${message}`);
    console.error('eScrew shortcut import failed:', error);
    window.alert(`eScrew shortcut import failed:\n${message}`);
  }
}

consumeShortcutCapture();
installRosterDayColors();

export default MainScreen;
