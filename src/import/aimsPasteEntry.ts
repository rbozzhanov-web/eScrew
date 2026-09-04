import { pasteWebArchiveFromClipboard } from './pasteWebArchive';
import { upsertStoredRoster } from '@/src/storage/rosterStorage';

let installed = false;
let active = false;

function isAimsImportTrigger(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    '[aria-label="Update roster from AIMS"], [aria-label="Import roster from AIMS"], [data-escrew-aims-trigger], [data-escrew-home-aims], [data-escrew-roster-aims]'
  ));
}

export function installAimsWebArchivePaste() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener('click', async (event) => {
    if (!isAimsImportTrigger(event.target) || active) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    active = true;
    try {
      const result = await pasteWebArchiveFromClipboard();
      if (!result) return;
      upsertStoredRoster(result.roster);
      window.sessionStorage?.setItem('escrew.aims.shortcut.lastResult', 'success');
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Could not import AIMS Web Archive:\n${message}`);
    } finally {
      active = false;
    }
  }, true);
}
