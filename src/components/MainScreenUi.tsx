import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import MainScreenEntry from './MainScreenEntry';

const SHORTCUT_RESULT_KEY = 'escrew.aims.shortcut.lastResult';
type ShortcutNotice = 'success' | 'error';

let aimsLaunchPending = false;
let aimsLaunchObserved = false;

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

function bindAimsLaunch(button?: HTMLElement) {
  if (!button || button.dataset.escrewLaunchWatch) return;
  button.dataset.escrewLaunchWatch = '1';
  button.addEventListener('click', () => {
    aimsLaunchPending = true;
    aimsLaunchObserved = false;
    requestAnimationFrame(enhanceUi);
  }, true);
}

function setSpinnerVisible(container: HTMLElement | undefined, visible: boolean) {
  if (!container) return;
  container.querySelectorAll<HTMLElement>('[role="progressbar"]').forEach((spinner) => {
    if (visible) spinner.style.removeProperty('display');
    else spinner.style.setProperty('display', 'none', 'important');
  });
}

function enhanceUi() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;

  const headerAims = root.querySelector<HTMLElement>('[aria-label="Update roster from AIMS"], [aria-label="Import roster from AIMS"]') ?? undefined;
  bindAimsLaunch(headerAims);

  const homeAimsLabel = leafWithText(root, ['Connect AIMS', 'Import from AIMS']);
  const homeAims = interactiveAncestor(homeAimsLabel);
  if (homeAimsLabel?.textContent?.trim() === 'Connect AIMS') homeAimsLabel.textContent = 'Import from AIMS';
  bindAimsLaunch(homeAims);

  const homeFileLabel = leafWithText(root, ['Import roster PDF', 'Import file']);
  const homeFile = interactiveAncestor(homeFileLabel);
  if (homeFileLabel?.textContent?.trim() === 'Import roster PDF') homeFileLabel.textContent = 'Import file';

  if (homeAims && homeFile && homeAims.parentElement === homeFile.parentElement && homeFile.nextElementSibling === homeAims) {
    homeAims.parentElement.insertBefore(homeAims, homeFile);
  }

  const homeIntro = leafWithText(root, ['Choose how to add your Air Astana crew schedule.']);
  if (homeIntro) homeIntro.textContent = 'Open AIMS, then Share → eScrew Capture.';

  for (const oldLabel of ['Add PDF', 'PDF']) {
    const label = leafWithText(root, [oldLabel]);
    if (label) label.textContent = 'Import file';
  }

  const rosterAimsLabel = leafWithText(root, ['AIMS']);
  const rosterAims = interactiveAncestor(rosterAimsLabel);
  if (rosterAims && rosterAims !== headerAims) bindAimsLaunch(rosterAims);

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

  const statusTitle = leafWithText(root, ['Opening AIMS', 'Importing roster…', 'Roster updated', 'AIMS closed', 'Could not import roster']);
  const statusCard = statusTitle?.parentElement?.parentElement ?? undefined;
  const terminalState = statusTitle && ['Roster updated', 'AIMS closed', 'Could not import roster'].includes(statusTitle.textContent?.trim() ?? '');
  if (terminalState) {
    aimsLaunchPending = false;
    aimsLaunchObserved = false;
  }
  const showAimsSpinner = !aimsLaunchPending || aimsLaunchObserved;
  setSpinnerVisible(headerAims, showAimsSpinner);
  setSpinnerVisible(statusCard, showAimsSpinner);

  const shortcutTitle = leafWithText(root, ['Safari connector setup', 'eScrew Capture Shortcut']);
  if (shortcutTitle) {
    shortcutTitle.textContent = 'eScrew Capture Shortcut';
    const card = interactiveAncestor(shortcutTitle);
    if (card) {
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
      setNotice(result === 'success' ? 'success' : 'error');
    } catch {}
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 4800);
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
    const observeLaunch = () => {
      if (!aimsLaunchPending) return;
      aimsLaunchObserved = true;
      apply();
    };
    enhanceUi();
    const observer = new MutationObserver(apply);
    const root = document.getElementById('root');
    if (root) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'aria-label'] });
    window.addEventListener('blur', observeLaunch);
    document.addEventListener('visibilitychange', observeLaunch);
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', observeLaunch);
      document.removeEventListener('visibilitychange', observeLaunch);
    };
  }, []);

  return <View style={styles.root}>
    <MainScreenEntry />
    {notice && <View pointerEvents="box-none" style={styles.noticeLayer}>
      <Pressable onPress={() => setNotice(undefined)} style={[styles.notice, { backgroundColor: dark ? 'rgba(22,30,45,.97)' : 'rgba(255,255,255,.98)', borderColor: notice === 'success' ? (dark ? '#67A5FF' : '#2D7DFF') : (dark ? '#E08383' : '#B84B52') }]}>
        <Text style={[styles.noticeTitle, { color: dark ? '#F8FAFC' : '#0F172A' }]}>{notice === 'success' ? 'Roster updated' : 'Could not import roster'}</Text>
        <Text style={[styles.noticeText, { color: dark ? '#98A2B3' : '#6B7280' }]}>{notice === 'success' ? 'AIMS roster imported with eScrew Capture.' : 'Open Crew Schedule and try Share → eScrew Capture again.'}</Text>
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
