import MainScreen from './MainScreen';
import { parseAimsShortcutCapture } from '@/src/aims/shortcutCapture';
import { upsertStoredRoster } from '@/src/storage/rosterStorage';

const HASH_PREFIX = '#aims-shortcut=';
const RESULT_KEY = 'escrew.aims.shortcut.lastResult';

function consumeShortcutCapture() {
  if (typeof window === 'undefined' || !window.location.hash.startsWith(HASH_PREFIX)) return;
  const encoded = window.location.hash.slice(HASH_PREFIX.length);
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', cleanUrl);
  try {
    const payload = decodeURIComponent(encoded);
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

export default MainScreen;
