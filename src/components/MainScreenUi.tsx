import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import MainScreenEntry from './MainScreenEntry';
import { rosterToDuties } from '@/src/domain/rosterView';
import { stationLocalDateTimeMs } from '@/src/domain/stationTime';
import type { Duty } from '@/src/domain/types';
import { loadStoredRosters } from '@/src/storage/rosterStorage';

const SHORTCUT_RESULT_KEY = 'escrew.aims.shortcut.lastResult';

type ShortcutNotice = 'success' | 'error';

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

function timedDuty(duty: Duty) {
  if (!duty.date || !duty.sectors.length) return undefined;
  const first = duty.sectors[0];
  const last = duty.sectors[duty.sectors.length - 1];
  const reportMs = stationLocalDateTimeMs(first.departure, duty.reportDate ?? duty.date, duty.reportTime);
  const releaseMs = stationLocalDateTimeMs(last.arrival, duty.releaseDate ?? duty.date, duty.releaseTime);
  if (reportMs === undefined || releaseMs === undefined) return undefined;
  return { duty, reportMs, releaseMs };
}

function focusedDuty(): Duty | undefined {
  const timed = loadStoredRosters()
    .flatMap((roster) => rosterToDuties(roster).map(timedDuty).filter((item): item is NonNullable<typeof item> => Boolean(item)))
    .sort((a, b) => a.reportMs - b.reportMs);
  const now = Date.now();
  return timed.filter((item) => item.reportMs <= now && item.releaseMs >= now).sort((a, b) => b.reportMs - a.reportMs)[0]?.duty
    ?? timed.find((item) => item.reportMs > now)?.duty
    ?? timed.at(-1)?.duty;
}

function currentCrew() {
  const duty = focusedDuty();
  if (!duty) return [];
  const seen = new Set<string>();
  return duty.sectors.flatMap((sector) => sector.crew).filter((member) => {
    const key = member.id || `${member.name}|${member.position ?? member.role ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replacePreviousFlightsWithCrew(root: HTMLElement) {
  const previousTitle = leafWithText(root, ['PREVIOUS FLIGHTS']);
  if (!previousTitle) return;
  const previousSection = previousTitle.parentElement ?? undefined;
  const host = previousSection?.parentElement ?? undefined;
  if (!previousSection || !host) return;
  setImportant(previousSection, 'display', 'none');

  let crewSection = host.querySelector<HTMLElement>('[data-escrew-home-crew="1"]') ?? undefined;
  if (!crewSection) {
    crewSection = document.createElement('div');
    crewSection.dataset.escrewHomeCrew = '1';
    host.insertBefore(crewSection, previousSection.nextSibling);
  }

  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const text = dark ? '#F3FAFA' : '#102326';
  const muted = dark ? '#A8BABC' : '#60777A';
  const line = dark ? 'rgba(174,214,216,.14)' : 'rgba(16,74,79,.11)';
  const accent = dark ? '#67A5FF' : ACCENT;
  const accentSoft = dark ? 'rgba(103,165,255,.12)' : 'rgba(45,125,255,.08)';
  const crew = currentCrew();

  crewSection.replaceChildren();
  Object.assign(crewSection.style, { flex: '1 1 auto', minHeight: '0', maxHeight: '34vh', display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' });

  const title = document.createElement('div');
  title.textContent = `CREW ON THIS FLIGHT · ${crew.length}`;
  Object.assign(title.style, { color: muted, fontSize: '11px', lineHeight: '16px', fontWeight: '700', letterSpacing: '.8px', paddingTop: '2px', flex: '0 0 auto' });
  crewSection.appendChild(title);

  const list = document.createElement('div');
  Object.assign(list.style, { minHeight: '0', flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorY: 'contain', touchAction: 'pan-y' });
  list.style.setProperty('-webkit-overflow-scrolling', 'touch');
  crewSection.appendChild(list);

  if (!crew.length) {
    const empty = document.createElement('div');
    empty.textContent = 'Crew is not listed for this flight in the imported roster.';
    Object.assign(empty.style, { color: muted, fontSize: '13px', lineHeight: '18px', padding: '12px 0' });
    list.appendChild(empty);
    return;
  }

  crew.forEach((member) => {
    const row = document.createElement('div');
    Object.assign(row.style, { minHeight: '48px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${line}` });

    const avatar = document.createElement('div');
    avatar.textContent = member.name?.trim()?.[0]?.toUpperCase() ?? '•';
    Object.assign(avatar.style, { width: '32px', height: '32px', borderRadius: '16px', flex: '0 0 32px', marginRight: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentSoft, color: accent, fontSize: '12px', fontWeight: '800' });

    const copy = document.createElement('div');
    Object.assign(copy.style, { minWidth: '0', flex: '1 1 auto' });
    const name = document.createElement('div');
    name.textContent = member.name;
    Object.assign(name.style, { color: text, fontSize: '14px', lineHeight: '18px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    const role = document.createElement('div');
    role.textContent = member.position ?? member.role ?? '';
    Object.assign(role.style, { color: muted, fontSize: '12px', lineHeight: '16px' });
    copy.append(name, role);
    row.append(avatar, copy);
    list.appendChild(row);
  });
}

function makeFlightSheetScrollable(root: HTMLElement) {
  const flyingLabels = [...root.querySelectorAll<HTMLElement>('*')]
    .filter((element) => element.children.length === 0 && /^Flying with · \d+$/.test(element.textContent?.trim() ?? ''));

  flyingLabels.forEach((flyingWith) => {
    const sheetContent = flyingWith.parentElement ?? undefined;
    if (!sheetContent) return;

    const count = Number(flyingWith.textContent?.match(/(\d+)$/)?.[1] ?? '0');
    sheetContent.dataset.escrewFlightScroll = '1';
    setImportant(sheetContent, 'overflow-y', 'auto');
    setImportant(sheetContent, 'overflow-x', 'hidden');
    setImportant(sheetContent, 'overscroll-behavior-y', 'contain');
    setImportant(sheetContent, '-webkit-overflow-scrolling', 'touch');
    setImportant(sheetContent, 'touch-action', 'pan-y');
    setImportant(sheetContent, 'height', 'calc(78vh - 42px)');
    setImportant(sheetContent, 'max-height', 'calc(78vh - 42px)');
    setImportant(sheetContent, 'min-height', '0px');
    setImportant(sheetContent, 'flex', '0 1 auto');

    const crewRoot = flyingWith.nextElementSibling as HTMLElement | null;
    if (!crewRoot) return;
    crewRoot.dataset.escrewCrewScroller = '1';
    setImportant(crewRoot, 'overflow-y', 'visible');
    setImportant(crewRoot, 'overflow-x', 'visible');
    setImportant(crewRoot, 'max-height', 'none');
    setImportant(crewRoot, 'height', `${Math.max(1, count) * 50 + 14}px`);
    setImportant(crewRoot, 'min-height', `${Math.max(1, count) * 50 + 14}px`);
    setImportant(crewRoot, 'flex', '0 0 auto');

    [...crewRoot.querySelectorAll<HTMLElement>('*')].forEach((candidate) => {
      const overflowY = window.getComputedStyle(candidate).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') return;
      setImportant(candidate, 'overflow-y', 'visible');
      setImportant(candidate, 'max-height', 'none');
      setImportant(candidate, 'height', 'auto');
    });
  });
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

  replacePreviousFlightsWithCrew(root);
  makeFlightSheetScrollable(root);
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

  return <View style={styles.root}>
    <MainScreenEntry />
    {notice && <View pointerEvents="box-none" style={styles.noticeLayer}>
      <Pressable onPress={() => setNotice(undefined)} style={[styles.notice, { backgroundColor: dark ? 'rgba(22,30,45,.97)' : 'rgba(255,255,255,.98)', borderColor: notice === 'success' ? (dark ? '#67A5FF' : ACCENT) : (dark ? '#E08383' : '#B84B52') }]}>
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
