import { Platform } from 'react-native';
import { pickAndParseRoster } from './pickRoster';
import type { ParsedAirAstanaRoster } from './parseAirAstanaRoster';

export type AimsWebArchiveResult = { roster: ParsedAirAstanaRoster };

export function openAimsWebArchiveFlow(): Promise<AimsWebArchiveResult | undefined> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('AIMS Web Archive import is available in the web app.'));
  }

  return new Promise((resolve) => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483646', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', background: 'rgba(0,0,0,.28)', padding: '16px',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(100%, 620px)', borderRadius: '24px', padding: '18px',
      background: dark ? '#182135' : '#FFFFFF', color: dark ? '#F5F7FA' : '#0F172A',
      boxShadow: '0 20px 60px rgba(0,0,0,.28)', fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif',
      marginBottom: 'max(8px, env(safe-area-inset-bottom))',
    });

    const title = document.createElement('div');
    title.textContent = 'Import from AIMS';
    Object.assign(title.style, { fontSize: '20px', fontWeight: '800', marginBottom: '6px' });

    const help = document.createElement('div');
    help.textContent = 'Open Crew Schedule, then Share → Options → Web Archive → Save to Files. Return to eScrew and choose that Web Archive.';
    Object.assign(help.style, { fontSize: '14px', lineHeight: '20px', opacity: '.72', marginBottom: '14px' });

    const openAims = document.createElement('button');
    openAims.textContent = 'Open AIMS Crew Schedule';
    Object.assign(openAims.style, {
      width: '100%', border: '0', borderRadius: '14px', padding: '13px', fontSize: '15px', fontWeight: '800',
      background: '#2D7DFF', color: '#FFFFFF', marginBottom: '10px',
    });
    openAims.onclick = () => window.open('https://aims.airastana.com/eCrew/CrewSchedule', 'escrew-aims');

    const importArchive = document.createElement('button');
    importArchive.textContent = 'Import Web Archive';
    Object.assign(importArchive.style, {
      width: '100%', border: `1px solid ${dark ? '#232D40' : '#E9EDF2'}`,
      borderRadius: '14px', padding: '13px', fontSize: '15px', fontWeight: '800',
      background: dark ? '#131B2C' : '#F6F7FA', color: 'inherit', marginBottom: '8px',
    });

    const status = document.createElement('div');
    Object.assign(status.style, { minHeight: '20px', fontSize: '13px', lineHeight: '18px', opacity: '.72', marginTop: '4px' });

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, {
      width: '100%', border: '0', borderRadius: '14px', padding: '13px', fontSize: '15px', fontWeight: '700',
      background: 'transparent', color: 'inherit', marginTop: '2px', opacity: '.74',
    });

    const cleanup = () => overlay.remove();
    cancel.onclick = () => { cleanup(); resolve(undefined); };
    overlay.onclick = (event) => { if (event.target === overlay) { cleanup(); resolve(undefined); } };

    importArchive.onclick = async () => {
      status.textContent = 'Choose the saved Web Archive…';
      try {
        const roster = await pickAndParseRoster();
        if (!roster) {
          status.textContent = '';
          return;
        }
        cleanup();
        resolve({ roster });
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    };

    card.append(title, help, openAims, importArchive, status, cancel);
    overlay.append(card);
    document.body.append(overlay);
  });
}
