import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import type { ProjectedRoster } from '@/src/application/rosterProjection';
import { loadStoredRosters, upsertStoredRoster } from './rosterStorage';

interface BackupFile {
  version: 1;
  exportedAt: string;
  rosters: ProjectedRoster[];
}

export function exportBackup(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Backup export is available in the web/PWA version.');
  }
  const backup: BackupFile = { version: 1, exportedAt: new Date().toISOString(), rosters: loadStoredRosters() };
  const filename = `escrew-backup-${backup.exportedAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function restoreBackup(): Promise<{ restored: number }> {
  if (Platform.OS !== 'web') throw new Error('Backup restore is available in the web/PWA version.');
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', multiple: false, copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return { restored: 0 };
  const asset = result.assets[0];
  const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();

  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('That file is not a valid eScrew backup.'); }

  const rosters = Array.isArray(parsed) ? parsed
    : isRecord(parsed) && Array.isArray(parsed.rosters) ? parsed.rosters
    : undefined;
  if (!rosters) throw new Error('That file is not a valid eScrew backup.');

  let restored = 0;
  for (const roster of rosters) {
    if (!isRecord(roster) || !isRecord(roster.period) || typeof roster.period.start !== 'string') continue;
    upsertStoredRoster(roster as unknown as ProjectedRoster);
    restored += 1;
  }
  if (!restored) throw new Error('No rosters found in that backup file.');
  return { restored };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
