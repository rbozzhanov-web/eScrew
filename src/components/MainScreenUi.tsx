import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import MainScreenEntry from './MainScreenEntry';

const SHORTCUT_RESULT_KEY = 'escrew.aims.shortcut.lastResult';

type ShortcutNotice = { kind: 'success' } | { kind: 'error'; message: string };

const ACCENT = '#2D7DFF';

function leafWithText(root: HTMLElement, values: string[]): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('*')].find((element) => element.children.length === 0 && values.includes(element.textContent?.trim() ?? ''));
}

function interactiveAncestor(element?: HTMLElement): HTMLElement | undefined {
  let node = element;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement ?? undefined) {
    if (node.getAttribute('role') === 'button' || node.tabIndex === 0) return node;
  }
  return element?.parentElement ?? undefined;
}

function setImportant(element: HTMLElement | undefined, name: string, value: string) {
  if (!element) return;
  if (element.style.getPropertyValue(name) === value && element.style.getPropertyPriority(name) === 'important') return;
  element.style.setProperty(name, value, 'important');
}

function tintText(element: HTMLElement | undefined, color: string) {
  if (!element) return;
  const leaves = [element, ...element.querySelectorAll<HTMLElement>('*')].filter((item) => item.children.length === 0);
  leaves.forEach((item) => setImportant(item, 'color', color));
}

function stylePrimary(button?: HTMLElement) {
  if (!button) return;
  setImportant(button, 'background-color', ACCENT);
  setImportant(button, 'border-color', ACCENT);
  tintText(button, '#FFFFFF');
}

function styleSecondary(button?: HTMLElement) {
  if (!button) return;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  setImportant(button, 'background-color', dark ? 'rgba(103,165,255,.10)' : 'rgba(45,125,255,.07)');
  setImportant(button, 'border-color', dark ? 'rgba(148,163,184,.18)' : '#E9EDF2');
  tintText(button, dark ? '#67A5FF' : ACCENT);
}

function enhanceUi() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;

  const headerAims = root.querySelector<HTMLElement>('[aria-label="Update roster from AIMS"], [aria-label="Import roster from AIMS"]')
    ?? interactiveAncestor(leafWithText(root, ['A']));
  if (headerAims) {
    headerAims.dataset.escrewAimsTrigger = '1';
    setImportant(headerAims, 'width', '72px');
    setImportant(headerAims, 'height', '40px');
    setImportant(headerAims, 'border-radius', '16px');
    const glyph = leafWithText(headerAims, ['A']);
    if (glyph) {
      glyph.textContent = 'AIMS';
      setImportant(glyph, 'font-size', '12px');
      setImportant(glyph, 'letter-spacing', '.2px');
    }
  }

  let homeAims = root.querySelector<HTMLElement>('[data-escrew-home-aims]') ?? undefined;
  if (!homeAims) {
    const label = leafWithText(root, ['Connect AIMS']);
    homeAims = interactiveAncestor(label);
    if (homeAims) {
      homeAims.dataset.escrewHomeAims = '1';
      if (label) label.textContent = 'Import from AIMS';
    }
  }

  let homeFile = root.querySelector<HTMLElement>('[data-escrew-home-file]') ?? undefined;
  if (!homeFile) {
    const label = leafWithText(root, ['Import roster PDF']);
    homeFile = interactiveAncestor(label);
    if (homeFile) {
      homeFile.dataset.escrewHomeFile = '1';
      if (label) label.textContent = 'Import file';
    }
  }

  if (homeAims && homeFile && homeAims.parentElement === homeFile.parentElement) {
    homeAims.parentElement?.insertBefore(homeAims, homeFile);
    stylePrimary(homeAims);
    styleSecondary(homeFile);
  }

  const homeIntro = leafWithText(root, ['Choose how to add your Air Astana crew schedule.']);
  if (homeIntro) homeIntro.textContent = 'Import from AIMS, then tap Share → eScrew Capture.';

  for (const oldLabel of ['Add PDF', 'PDF']) {
    const label = leafWithText(root, [oldLabel]);
    const button = interactiveAncestor(label);
    if (!button) continue;
    button.dataset.escrewRosterFile = '1';
    if (label) label.textContent = 'Import file';
    setImportant(button, 'min-width', '84px');
    styleSecondary(button);
  }

  const rosterFile = root.querySelector<HTMLElement>('[data-escrew-roster-file]') ?? undefined;
  if (rosterFile) {
    const actions = rosterFile.parentElement ?? undefined;
    const hasRoster = Boolean(actions && [...actions.querySelectorAll<HTMLElement>('*')].some((element) => element.children.length === 0 && ['Calendar', 'Added', 'Retry'].includes(element.textContent?.trim() ?? '')));
    if (actions && hasRoster && !actions.querySelector('[data-escrew-roster-aims]')) {
      const aimsButton = rosterFile.cloneNode(true) as HTMLElement;
      aimsButton.removeAttribute('data-escrew-roster-file');
      aimsButton.dataset.escrewRosterAims = '1';
      const label = [...aimsButton.querySelectorAll<HTMLElement>('*')].find((element) => element.children.length === 0);
      if (label) label.textContent = 'AIMS';
      setImportant(aimsButton, 'min-width', '64px');
      stylePrimary(aimsButton);
      const trigger = () => root.querySelector<HTMLElement>('[data-escrew-aims-trigger]')?.click();
      aimsButton.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); trigger(); });
      aimsButton.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); trigger(); } });
      actions.insertBefore(aimsButton, rosterFile);
    }
    if (actions && !hasRoster) {
      const existingAimsLabel = [...actions.querySelectorAll<HTMLElement>('*')].find((element) => element.children.length === 0 && element.textContent?.trim() === 'AIMS');
      stylePrimary(interactiveAncestor(existingAimsLabel));
    }
  }

  const emptyRoster = leafWithText(root, ['Add a roster from PDF or AIMS to begin.']);
  if (emptyRoster) emptyRoster.textContent = 'Start with AIMS, or import a saved roster file.';

  const replacements: Array<[string, string]> = [
    ['Waiting for roster from AIMS', 'Opening AIMS'],
    ['Sign in to AIMS if needed, then send your roster back to eScrew.', 'In Crew Schedule, tap Share → eScrew Capture.'],
    ['Importing roster', 'Importing roster…'],
    ['Saving the roster to eScrew…', 'Finishing your roster update…'],
    ['Your saved roster is now up to date.', 'Your roster is ready.'],
    ['AIMS import cancelled', 'AIMS closed'],
    ['Could not import roster from AIMS', 'Could not import roster'],
    ['Could not open AIMS. Please allow pop-ups and try again.', 'Could not open AIMS. Try again.'],
  ];
  replacements.forEach(([from, to]) => {
    const element = leafWithText(root, [from]);
    if (element) element.textContent = to;
  });

  let shortcutTitle = leafWithText(root, ['Safari connector setup', 'eScrew Capture Shortcut']);
  if (shortcutTitle) {
    shortcutTitle.textContent = 'eScrew Capture Shortcut';
    const card = interactiveAncestor(shortcutTitle);
    if (card) {
      card.dataset.escrewShortcutSetup = '1';
      const oldDetail = [...card.querySelectorAll<HTMLElement>('*')].find((element) => element.children.length === 0 && element.textContent?.trim() === 'One-time setup for sending roster data back to eScrew without sharing credentials or session data.');
      if (oldDetail) oldDetail.textContent = 'Set up · How it works';
      if (!card.dataset.escrewShortcutBound) {
        card.dataset.escrewShortcutBound = '1';
        card.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const setupUrl = new URL('./aims-shortcut-setup.html', window.location.href).href;
          window.open(setupUrl, '_blank', 'noopener,noreferrer');
        }, true);
      }
    }
  }

  [...root.querySelectorAll<HTMLElement>('*')]
    .filter((element) => element.children.length === 0 && /^Flying with · \d+$/.test(element.textContent?.trim() ?? ''))
    .forEach((element) => {
      setImportant(element, 'font-size', '11px');
      setImportant(element, 'letter-spacing', '.45px');
      setImportant(element, 'opacity', '.82');
    });
}

export default function MainScreenUi() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [notice, setNotice] = useState<ShortcutNotice>();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const result = window.sessionStorage?.getItem(SHORTCUT_RESULT_KEY);
      if (!result) return;
      window.sessionStorage.removeItem(SHORTCUT_RESULT_KEY);
      if (result === 'success') setNotice({ kind: 'success' });
      else if (result.startsWith('error:')) setNotice({ kind: 'error', message: result.slice('error:'.length).trim() || 'Unknown Shortcut import error.' });
      else setNotice({ kind: 'error', message: result });
    } catch {}
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), notice.kind === 'error' ? 12000 : 4800);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof MutationObserver === 'undefined') return;
    let queued = false;
    const apply = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; enhanceUi(); });
    };
    enhanceUi();
    const observer = new MutationObserver(apply);
    const root = document.getElementById('root');
    if (root) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'aria-label'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', apply);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.('change', apply);
    };
  }, []);

  const error = notice?.kind === 'error' ? notice.message : '';

  return <View style={styles.root}>
    <MainScreenEntry />
    {notice && <View pointerEvents="box-none" style={styles.noticeLayer}>
      <Pressable onPress={() => setNotice(undefined)} style={[styles.notice, { backgroundColor: dark ? 'rgba(22,30,45,.97)' : 'rgba(255,255,255,.98)', borderColor: notice.kind === 'success' ? (dark ? '#67A5FF' : ACCENT) : (dark ? '#E08383' : '#B84B52') }]}>
        <Text style={[styles.noticeTitle, { color: dark ? '#F8FAFC' : '#0F172A' }]}>{notice.kind === 'success' ? 'Roster updated' : 'Could not import roster'}</Text>
        <Text selectable style={[styles.noticeText, { color: dark ? '#98A2B3' : '#6B7280' }]}>{notice.kind === 'success' ? 'AIMS roster imported with eScrew Capture.' : error}</Text>
      </Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noticeLayer: { position: 'absolute', top: 82, left: 16, right: 16, zIndex: 1000, alignItems: 'center' },
  notice: { width: '100%', maxWidth: 588, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: .12, shadowRadius: 24, elevation: 12 },
  noticeTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  noticeText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
});
