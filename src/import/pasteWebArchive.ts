import { Platform } from 'react-native';
import { parseRosterData } from './pickRoster';
import type { ParsedAirAstanaRoster } from './parseAirAstanaRoster';

export type PasteWebArchiveResult = { roster: ParsedAirAstanaRoster; name: string };

/**
 * Opens a small browser-native paste surface and resolves when Safari supplies
 * a copied Web Archive/file through a real paste event. Nothing is uploaded.
 */
export function pasteWebArchiveFromClipboard(): Promise<PasteWebArchiveResult | undefined> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('Web Archive paste is available in the web app.'));
  }

  return new Promise((resolve, reject) => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483646', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', background: 'rgba(0,0,0,.28)', padding: '16px',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(100%, 620px)', borderRadius: '24px', padding: '18px',
      background: dark ? '#152C32' : '#FFFFFF', color: dark ? '#F3FAFA' : '#102326',
      boxShadow: '0 20px 60px rgba(0,0,0,.28)', fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif',
      marginBottom: 'max(8px, env(safe-area-inset-bottom))',
    });

    const title = document.createElement('div');
    title.textContent = 'Paste Web Archive';
    Object.assign(title.style, { fontSize: '20px', fontWeight: '800', marginBottom: '6px' });

    const help = document.createElement('div');
    help.textContent = 'In AIMS: Share → Options → Web Archive → Copy. Return here, tap the field below, then choose Paste.';
    Object.assign(help.style, { fontSize: '14px', lineHeight: '20px', opacity: '.72', marginBottom: '14px' });

    const target = document.createElement('div');
    target.contentEditable = 'true';
    target.setAttribute('role', 'textbox');
    target.setAttribute('aria-label', 'Paste copied AIMS Web Archive');
    target.textContent = 'Tap here, then Paste';
    Object.assign(target.style, {
      minHeight: '92px', borderRadius: '16px', border: `1px solid ${dark ? 'rgba(174,214,216,.22)' : 'rgba(16,74,79,.16)'}`,
      background: dark ? '#081519' : '#F2F6F6', padding: '16px', outline: 'none', fontSize: '15px', lineHeight: '22px',
      WebkitUserSelect: 'text', userSelect: 'text', overflow: 'auto',
    });

    const status = document.createElement('div');
    Object.assign(status.style, { minHeight: '20px', fontSize: '13px', lineHeight: '18px', opacity: '.72', marginTop: '10px' });

    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', gap: '10px', marginTop: '10px' });
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, {
      flex: '1', border: '0', borderRadius: '14px', padding: '13px', fontSize: '15px', fontWeight: '700',
      background: dark ? 'rgba(255,255,255,.08)' : '#EDF2F2', color: 'inherit',
    });

    const cleanup = () => overlay.remove();
    cancel.onclick = () => { cleanup(); resolve(undefined); };
    overlay.onclick = (event) => { if (event.target === overlay) { cleanup(); resolve(undefined); } };

    target.addEventListener('focus', () => {
      if (target.textContent === 'Tap here, then Paste') target.textContent = '';
    });

    target.addEventListener('paste', async (event) => {
      event.preventDefault();
      status.textContent = 'Reading Web Archive…';
      try {
        const items = Array.from(event.clipboardData?.items ?? []);
        const files = Array.from(event.clipboardData?.files ?? []);
        const itemFile = items.map((item) => item.kind === 'file' ? item.getAsFile() : null).find(Boolean) ?? undefined;
        const file = files[0] ?? itemFile;
        if (!file) {
          throw new Error('Safari did not provide the copied Web Archive as a file. In Share → Options choose Web Archive before Copy, then try Paste again.');
        }
        const data = await file.arrayBuffer();
        const roster = await parseRosterData(data, file.name || 'AIMS.webarchive');
        cleanup();
        resolve({ roster, name: file.name || 'AIMS.webarchive' });
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });

    buttons.append(cancel);
    card.append(title, help, target, status, buttons);
    overlay.append(card);
    document.body.append(overlay);
    window.setTimeout(() => target.focus(), 40);
  });
}
