import { Platform } from 'react-native';

export function softHaptic(): void {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(4); } catch {}
}
