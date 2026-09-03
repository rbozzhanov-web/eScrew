import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, Pressable, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IOSSheet } from './IOSOverlay';
import { SwipeSurface } from './SwipeSurface';
import { listenForAimsRoster } from '@/src/aims/bridge';
import { exportRosterCalendar } from '@/src/domain/calendar';
import { formatMinutes, rosterMonthLabel, rosterToDuties } from '@/src/domain/rosterView';
import { stationLocalDateTimeMs } from '@/src/domain/stationTime';
import type { Duty, Sector } from '@/src/domain/types';
import { pickAndParseRoster } from '@/src/import/pickRoster';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import { clearStoredRosters, loadStoredRosters, removeStoredRoster, upsertStoredRoster } from '@/src/storage/rosterStorage';

type Tab = 'Home' | 'Roster' | 'More';
const TABS: Tab[] = ['Home', 'Roster', 'More'];
const TAB_ICONS: Record<Tab, { glyph: string; size: number; nudge: number; weight: '700' | '800' }> = {
  Home: { glyph: '⌂', size: 24, nudge: 0, weight: '700' },
  Roster: { glyph: '✈︎', size: 22, nudge: 0, weight: '700' },
  More: { glyph: '•••', size: 18, nudge: -2, weight: '700' },
};
type Palette = { background:string; surface:string; surfaceStrong:string; text:string; muted:string; line:string; accent:string; accentSoft:string; gold:string; danger:string; weekend:string };
type RosterDuty = { roster: ParsedAirAstanaRoster; duty: Duty };
type FocusDuty = RosterDuty & { reportMs: number; releaseMs: number };
type FlightRow = { duty: Duty; sector: Sector };
type AimsState = 'idle' | 'waiting' | 'importing' | 'success' | 'error' | 'cancelled';

const WEB_GLASS = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(22px) saturate(1.18)', WebkitBackdropFilter: 'blur(22px) saturate(1.18)' } as any)
  : undefined;
const WEB_TAB_GLASS = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(30px) saturate(1.38)', WebkitBackdropFilter: 'blur(30px) saturate(1.38)' } as any)
  : undefined;

export default function MainScreen() {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const desktopWeb = Platform.OS === 'web' && width >= 768;
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => { if (!hydrated) setHydrated(true); }, [hydrated]);
  const dark = hydrated && scheme === 'dark';

  const palette = useMemo<Palette>(() => dark ? {
    background:'#081519', surface:'rgba(15,34,39,.78)', surfaceStrong:'rgba(21,44,50,.88)', text:'#F3FAFA', muted:'#A8BABC', line:'rgba(174,214,216,.14)', accent:'#35B8C0', accentSoft:'rgba(53,184,192,.16)', gold:'#D4AE62', danger:'#E08383', weekend:'#DCA17B',
  } : {
    background:'#F2F6F6', surface:'rgba(255,255,255,.78)', surfaceStrong:'rgba(255,255,255,.88)', text:'#102326', muted:'#60777A', line:'rgba(16,74,79,.11)', accent:'#007F86', accentSoft:'#DFF1F2', gold:'#A67A24', danger:'#B84B52', weekend:'#9B613B',
  }, [dark]);

  const [tab, setTab] = useState<Tab>('Home');
  const [rosters, setRosters] = useState<ParsedAirAstanaRoster[]>([]);
  const [activeMonth, setActiveMonth] = useState<string>();
  const [selectedFlight, setSelectedFlight] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [aimsState, setAimsState] = useState<AimsState>('idle');
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabSelection = useRef(new Animated.Value(0)).current;
  const aimsPopup = useRef<Window | null>(null);
  const aimsAttemptActive = useRef(false);

  useEffect(() => {
    const stored = loadStoredRosters();
    setRosters(stored);
    setActiveMonth(stored.at(-1)?.period.start);
  }, []);

  useEffect(() => {
    Animated.spring(tabSelection, {
      toValue: TABS.indexOf(tab), stiffness: 380, damping: 34, mass: 0.72,
      useNativeDriver: true, isInteraction: false,
    }).start();
  }, [tab, tabSelection]);

  useEffect(() => listenForAimsRoster((parsed) => {
    if (!aimsAttemptActive.current) return;
    setAimsState('importing');
    try {
      const next = upsertStoredRoster(parsed);
      setRosters(next);
      setActiveMonth(parsed.period.start);
      setSelectedFlight(undefined);
      setImportError(undefined);
      aimsAttemptActive.current = false;
      setAimsState('success');
      setTab('Roster');
    } catch {
      aimsAttemptActive.current = false;
      setAimsState('error');
      setImportError('Could not import roster from AIMS');
    }
  }, () => {
    if (!aimsAttemptActive.current) return;
    aimsAttemptActive.current = false;
    setAimsState('error');
    setImportError('Could not import roster from AIMS');
  }), []);

  useEffect(() => {
    if (aimsState !== 'waiting' || Platform.OS !== 'web') return;
    const timer = window.setInterval(() => {
      const popup = aimsPopup.current;
      if (!popup || !popup.closed) return;
      aimsPopup.current = null;
      aimsAttemptActive.current = false;
      setAimsState('cancelled');
    }, 500);
    return () => window.clearInterval(timer);
  }, [aimsState]);

  const roster = rosters.find((item) => item.period.start === activeMonth) ?? rosters.at(-1);
  const duties = useMemo(() => roster ? rosterToDuties(roster) : [], [roster]);
  const selectedSector = duties.flatMap((duty) => duty.sectors).find((sector) => sector.id === selectedFlight);
  const allDuties = useMemo<RosterDuty[]>(() => rosters.flatMap((item) => rosterToDuties(item).map((duty) => ({ roster: item, duty }))), [rosters]);
  const tabStep = tabBarWidth / TABS.length;
  const tabIndicatorX = Animated.multiply(tabSelection, tabStep);

  const importRoster = async () => {
    setImportError(undefined);
    setImporting(true);
    try {
      const parsed = await pickAndParseRoster();
      if (!parsed) return;
      const next = upsertStoredRoster(parsed);
      setRosters(next);
      setActiveMonth(parsed.period.start);
      setSelectedFlight(undefined);
      setTab('Roster');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  const openAims = () => {
    if (aimsState === 'waiting' || aimsState === 'importing') return;
    setImportError(undefined);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      aimsAttemptActive.current = true;
      setAimsState('waiting');
      const popup = window.open('https://aims.airastana.com/eCrew/CrewSchedule', 'escrew-aims');
      aimsPopup.current = popup;
      if (!popup) {
        aimsAttemptActive.current = false;
        setAimsState('error');
        setImportError('Could not open AIMS. Please allow pop-ups and try again.');
      }
      return;
    }
    setAimsState('error');
    setImportError('AIMS import is available in the web app.');
  };
  const dismissAimsStatus = () => {
    if (aimsState === 'waiting' || aimsState === 'importing') return;
    setAimsState('idle');
    setImportError(undefined);
  };
  const openAimsSetup = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const setupUrl = new URL('./aims-connector.html', window.location.href).href;
      window.open(setupUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const deleteRoster = (periodStart: string) => {
    const next = removeStoredRoster(periodStart);
    setRosters(next);
    setSelectedFlight(undefined);
    setActiveMonth((current) => current && current !== periodStart && next.some((item) => item.period.start === current) ? current : next.at(-1)?.period.start);
  };
  const changeMonth = (direction: -1 | 1) => {
    if (!roster) return;
    const index = rosters.findIndex((item) => item.period.start === roster.period.start);
    const next = rosters[index + direction];
    if (!next) return;
    setActiveMonth(next.period.start);
    setSelectedFlight(undefined);
  };
  const changeTab = (direction: -1 | 1) => {
    const next = TABS[TABS.indexOf(tab) + direction];
    if (!next) return;
    setSelectedFlight(undefined);
    setTab(next);
  };
  const eraseAll = () => {
    clearStoredRosters();
    setRosters([]);
    setActiveMonth(undefined);
    setSelectedFlight(undefined);
    setTab('Home');
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={desktopWeb ? ['bottom'] : ['top', 'bottom']}>
    <View style={styles.app}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.brand, { color: palette.text }]}>eScrew</Text>
          <Text style={[styles.kicker, { color: palette.muted }]}>CREW SCHEDULE</Text>
        </View>
        <Pressable onPress={openAims} disabled={aimsState === 'waiting' || aimsState === 'importing'} style={[styles.modeButton, styles.depthSurface, { backgroundColor: aimsState === 'waiting' || aimsState === 'importing' ? palette.accentSoft : palette.surface, borderColor: aimsState === 'success' ? palette.gold : aimsState === 'error' ? palette.danger : 'transparent', borderWidth: aimsState === 'success' || aimsState === 'error' ? 1 : 0 }]} accessibilityLabel={roster ? 'Update roster from AIMS' : 'Import roster from AIMS'}>
          {aimsState === 'waiting' || aimsState === 'importing' ? <ActivityIndicator size="small" color={palette.accent} /> : <Text style={[styles.aimsGlyph, { color: aimsState === 'error' ? palette.danger : palette.accent }]}>A</Text>}
        </Pressable>
      </View>

      {aimsState !== 'idle' && <AimsStatus state={aimsState} error={importError} palette={palette} onRetry={openAims} onDismiss={dismissAimsStatus} />}

      <SwipeSurface style={styles.viewport} onSwipeLeft={tab === 'More' ? undefined : () => changeTab(1)} onSwipeRight={tab === 'Home' ? undefined : () => changeTab(-1)}>
        {tab === 'Home' && <Home allDuties={allDuties} fallbackRoster={roster} rosters={rosters} palette={palette} onImport={importRoster} onAims={openAims} importing={importing} />}
        {tab === 'Roster' && <RosterScreen roster={roster} rosters={rosters} duties={duties} selectedSector={selectedSector} palette={palette} importing={importing} error={aimsState === 'error' ? undefined : importError} onImport={importRoster} onAims={openAims} onSelect={setSelectedFlight} onMonth={changeMonth} />}
        {tab === 'More' && <MoreScreen rosters={rosters} palette={palette} onAimsSetup={openAimsSetup} onDeleteRoster={deleteRoster} onErase={eraseAll} />}
      </SwipeSurface>

      <View onLayout={(event) => { const nextWidth = event.nativeEvent.layout.width; if (Math.abs(nextWidth - tabBarWidth) > 0.5) setTabBarWidth(nextWidth); }} style={[styles.tabBar, styles.depthSurface, WEB_TAB_GLASS, { backgroundColor: palette.surface, borderColor: palette.line }]}>
        {tabBarWidth > 0 && <Animated.View pointerEvents="none" style={[styles.tabSelection, { width: Math.max(0, tabStep - 8), backgroundColor: palette.surfaceStrong, transform: [{ translateX: tabIndicatorX }] }]} />}
        {TABS.map((item) => {
          const active = item === tab;
          return <Pressable key={item} onPress={() => { setSelectedFlight(undefined); setTab(item); }} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={styles.tabIconWrap}><Text style={[styles.tabIcon, { color: active ? palette.accent : palette.muted, fontSize: TAB_ICONS[item].size, lineHeight: TAB_ICONS[item].size + 3, marginTop: TAB_ICONS[item].nudge, fontWeight: TAB_ICONS[item].weight }]}>{TAB_ICONS[item].glyph}</Text></View>
            <Text style={[styles.tabText, { color: active ? palette.text : palette.muted }]}>{item}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </SafeAreaView>;
}

function AimsStatus({ state, error, palette, onRetry, onDismiss }: { state: AimsState; error?: string; palette: Palette; onRetry: () => void; onDismiss: () => void }) {
  const waiting = state === 'waiting' || state === 'importing';
  const title = state === 'waiting' ? 'Waiting for roster from AIMS' : state === 'importing' ? 'Importing roster' : state === 'success' ? 'Roster updated' : state === 'cancelled' ? 'AIMS import cancelled' : 'Could not import roster from AIMS';
  const detail = state === 'waiting' ? 'Sign in to AIMS if needed, then send your roster back to eScrew.' : state === 'importing' ? 'Saving the roster to eScrew…' : state === 'success' ? 'Your saved roster is now up to date.' : state === 'cancelled' ? 'Your existing roster was not changed.' : error ?? 'Your existing roster was not changed.';
  return <View style={[styles.aimsStatus, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: state === 'error' ? palette.danger : state === 'success' ? palette.gold : palette.line }]}>
    <View style={styles.aimsStatusIcon}>{waiting ? <ActivityIndicator size="small" color={palette.accent} /> : <Text style={[styles.aimsStatusGlyph, { color: state === 'error' ? palette.danger : palette.accent }]}>{state === 'success' ? '✓' : state === 'cancelled' ? '×' : '!'}</Text>}</View>
    <View style={styles.grow}><Text style={[styles.aimsStatusTitle, { color: palette.text }]}>{title}</Text><Text style={[styles.meta, { color: palette.muted }]}>{detail}</Text></View>
    {!waiting && state !== 'success' && <Pressable onPress={onRetry} style={[styles.statusAction, { backgroundColor: palette.accentSoft }]}><Text style={[styles.statusActionText, { color: palette.accent }]}>Try again</Text></Pressable>}
    {!waiting && <Pressable onPress={onDismiss} accessibilityLabel="Dismiss AIMS status" style={styles.statusDismiss}><Text style={[styles.statusDismissText, { color: palette.muted }]}>×</Text></Pressable>}
  </View>;
}

function Home({ allDuties, fallbackRoster, rosters, palette, onImport, onAims, importing }: { allDuties: RosterDuty[]; fallbackRoster?: ParsedAirAstanaRoster; rosters: ParsedAirAstanaRoster[]; palette: Palette; onImport: () => void; onAims: () => void; importing: boolean }) {
  const now = useNow();
  const timeline = useMemo(() => timedDuties(allDuties), [allDuties]);
  const focus = useMemo(() => pickFocusDuty(timeline, now), [timeline, now]);
  const roster = focus?.roster ?? fallbackRoster;
  const duty = focus?.duty;

  if (!roster || !duty) return <View style={styles.screen}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>Your roster, simplified.</Text>
    <Text style={[styles.intro, { color: palette.muted }]}>Choose how to add your Air Astana crew schedule.</Text>
    <PrimaryButton title="Import roster PDF" onPress={onImport} loading={importing} palette={palette} />
    <PrimaryButton title="Connect AIMS" onPress={onAims} loading={false} palette={palette} />
  </View>;

  const first = duty.sectors[0];
  const last = duty.sectors[duty.sectors.length - 1];
  const reportMs = focus?.reportMs;
  const releaseMs = focus?.releaseMs;
  const isUpcoming = reportMs !== undefined && reportMs > now;
  const isActive = reportMs !== undefined && releaseMs !== undefined && reportMs <= now && releaseMs >= now;
  const countdown = reportMs === undefined ? undefined : isUpcoming ? formatCountdown(reportMs - now) : isActive ? formatCountdown(now - reportMs) : undefined;
  const spanMinutes = reportMs !== undefined && releaseMs !== undefined ? Math.round((releaseMs - reportMs) / 60000) : undefined;
  const dutyMinutes = spanMinutes !== undefined && spanMinutes > 0 ? spanMinutes : undefined;
  const block = roster.totals.blockMinutes;
  const night = roster.totals.nightMinutes;
  const nightShare = block && night !== undefined ? Math.round((night / block) * 100) : undefined;
  const neighbours = previousDuties(timeline, focus, now, 6);
  const year = roster.period.start.slice(0, 4);
  const yearRosters = rosters.filter((item) => item.period.start.startsWith(`${year}-`));
  const ytdBlock = yearRosters.reduce((sum, item) => sum + (item.totals.blockMinutes ?? 0), 0);
  const ytdNight = yearRosters.reduce((sum, item) => sum + (item.totals.nightMinutes ?? 0), 0);

  return <View style={styles.screen}>
    <View style={styles.dutyHead}><Text style={[styles.label, { color: isActive ? palette.accent : palette.muted }]}>{isUpcoming ? 'NEXT DUTY' : isActive ? 'ON DUTY NOW' : 'LATEST DUTY'}</Text><Text style={[styles.label, { color: palette.muted }]}>{duty.dateLabel}</Text></View>
    <View style={[styles.heroCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.heroRoute, { color: palette.text }]}>{routeChain(duty)}</Text>
      <View style={[styles.heroMetaRow, countdown ? styles.heroMetaRowTall : undefined]}><Text numberOfLines={1} style={[styles.heroFlight, { color: palette.muted }]}>{duty.sectors.map((sector) => sector.flightNumber).join(' · ')}</Text>{countdown && <View style={[styles.countdownPill, { backgroundColor: palette.accentSoft }]}><Text style={[styles.countdown, { color: palette.accent }]}>{countdown}</Text><Text style={[styles.countdownLabel, { color: palette.accent }]}>{isUpcoming ? 'TO REPORT' : 'ON DUTY'}</Text></View>}</View>
      <View style={[styles.timeDivider, { backgroundColor: palette.line }]} />
      <View style={styles.timeRow}><TimeCell label="REPORT" value={duty.reportTime} palette={palette} /><TimeCell label={`DEP · ${first.departure}`} value={first.departureTime} palette={palette} /><TimeCell label={`ARR · ${last.arrival}`} value={last.arrivalTime} palette={palette} /><TimeCell label="RELEASE" value={duty.releaseTime} palette={palette} /></View>
      <Text style={[styles.heroFoot, { color: palette.muted }]}>{dutyMinutes !== undefined ? `Duty ${formatMinutes(dutyMinutes)} · ` : ''}{duty.sectors.length} sector{duty.sectors.length === 1 ? '' : 's'}</Text>
    </View>
    <Text style={[styles.label, { color: palette.muted }]}>{rosterMonthLabel(roster)}</Text>
    <View style={styles.summaryRow}><Summary title="BLOCK HOURS" value={formatMinutes(block)} detail={`${operatingCount(roster)} sectors flown`} palette={palette} /><Summary title="NIGHT HOURS" value={formatMinutes(night)} detail={nightShare === undefined ? 'reported by the roster' : `${nightShare}% of block time`} palette={palette} /></View>
    {yearRosters.length > 1 && <Text style={[styles.meta, { color: palette.muted }]}>{year} to date · {formatMinutes(ytdBlock)} block · {formatMinutes(ytdNight)} night · {yearRosters.length} months imported</Text>}
    {neighbours.length > 0 && <View style={styles.upNext}><Text style={[styles.label, { color: palette.muted }]}>PREVIOUS FLIGHTS</Text><FlatList data={neighbours} keyExtractor={(item) => item.duty.id} showsVerticalScrollIndicator={false} style={styles.upNextList} renderItem={({ item }) => <View style={[styles.upNextRow, { borderColor: palette.line }]}><Text style={[styles.upNextDate, { color: palette.muted }]}>{item.duty.dateLabel}</Text><Text numberOfLines={1} style={[styles.upNextRoute, { color: palette.text }]}>{routeChain(item.duty)}</Text><View style={styles.upNextTimeBlock}><Text style={[styles.upNextTimeLabel, { color: palette.muted }]}>RELEASED AT</Text><Text style={[styles.upNextTime, { color: palette.muted }]}>{item.duty.releaseTime}</Text></View></View>} /></View>}
  </View>;
}

function RosterScreen({ roster, rosters, duties, selectedSector, palette, importing, error, onImport, onAims, onSelect, onMonth }: { roster?: ParsedAirAstanaRoster; rosters: ParsedAirAstanaRoster[]; duties: Duty[]; selectedSector?: Sector; palette: Palette; importing: boolean; error?: string; onImport: () => void; onAims: () => void; onSelect: (id?: string) => void; onMonth: (direction: -1 | 1) => void }) {
  const [calendarState, setCalendarState] = useState<'idle'|'working'|'done'|'error'>('idle');
  const index = roster ? rosters.findIndex((item) => item.period.start === roster.period.start) : -1;
  const flights = useMemo<FlightRow[]>(() => duties.flatMap((duty) => duty.sectors.map((sector) => ({ duty, sector }))), [duties]);
  const selectedIndex = selectedSector ? flights.findIndex(({ sector }) => sector.id === selectedSector.id) : -1;
  const selectedRow = selectedIndex >= 0 ? flights[selectedIndex] : undefined;
  useEffect(() => setCalendarState('idle'), [roster?.period.start]);
  const exportCalendar = async () => { if (!roster || calendarState === 'working') return; setCalendarState('working'); try { await exportRosterCalendar(roster); setCalendarState('done'); } catch (e) { setCalendarState(e instanceof Error && /cancel/i.test(e.message) ? 'idle' : 'error'); } };

  return <View style={styles.screen}>
    <View style={styles.titleRow}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>{roster ? rosterMonthLabel(roster) : 'Roster'}</Text><Text style={[styles.meta, { color: palette.muted }]}>{roster?.subject ? `${roster.subject.base ?? '—'} · ${roster.subject.rank ?? 'crew'}` : 'Personal schedule'}</Text></View><View style={styles.titleActions}>{roster && <Pressable onPress={exportCalendar} style={[styles.compactButton, { backgroundColor: palette.surface, borderColor: palette.line }]}>{calendarState === 'working' ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.text }]}>{calendarState === 'done' ? 'Added' : calendarState === 'error' ? 'Retry' : 'Calendar'}</Text>}</Pressable>}<Pressable onPress={onImport} disabled={importing} style={[styles.compactButton, { backgroundColor: palette.accentSoft, borderColor: palette.accentSoft }]}>{importing ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.accent }]}>{roster ? 'Add PDF' : 'PDF'}</Text>}</Pressable>{!roster && <Pressable onPress={onAims} style={[styles.compactButton, { backgroundColor: palette.accentSoft, borderColor: palette.accentSoft }]}><Text style={[styles.compactText, { color: palette.accent }]}>AIMS</Text></Pressable>}</View></View>
    {roster && rosters.length > 1 && <SwipeSurface style={styles.monthNav} onSwipeRight={index > 0 ? () => onMonth(-1) : undefined} onSwipeLeft={index < rosters.length - 1 ? () => onMonth(1) : undefined} threshold={38}><Pressable disabled={index <= 0} onPress={() => onMonth(-1)}><Text style={[styles.monthNavText, { color: index <= 0 ? palette.line : palette.text }]}>‹ Previous</Text></Pressable><Text style={[styles.meta, { color: palette.muted }]}>{index + 1} / {rosters.length}</Text><Pressable disabled={index >= rosters.length - 1} onPress={() => onMonth(1)}><Text style={[styles.monthNavText, { color: index >= rosters.length - 1 ? palette.line : palette.text }]}>Next ›</Text></Pressable></SwipeSurface>}
    {error && <Text style={[styles.error, { color: palette.danger }]}>{error}</Text>}
    {!roster ? <View style={[styles.emptyCard, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.meta, { color: palette.muted }]}>Add a roster from PDF or AIMS to begin.</Text></View> : <View style={[styles.innerWindow, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><FlatList data={flights} keyExtractor={({ sector }) => sector.id} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} renderItem={({ item: { duty, sector } }) => { const dateMeta = rosterDateMeta(duty); return <Pressable onPress={() => onSelect(sector.id)} style={[styles.rosterCard, { backgroundColor: selectedSector?.id === sector.id ? palette.accentSoft : palette.surfaceStrong, borderColor: palette.line }]}><View style={styles.flightCardTop}><Text style={[styles.label, { color: dateMeta.weekend ? palette.weekend : palette.muted }]}>{dateMeta.label}</Text><Text style={[styles.flightNumber, { color: palette.muted }]}>{sector.flightNumber}{sector.deadhead ? ' · DHC' : ''}</Text></View><Text style={[styles.rosterRoute, { color: palette.text }]}>{sector.departure} → {sector.arrival}</Text><Text style={[styles.meta, { color: palette.muted }]}>{sector.departureTime} – {sector.arrivalTime} · Report {duty.reportTime}</Text></Pressable>; }} /></View>}
    {selectedRow && <FlightDetail row={selectedRow} palette={palette} onClose={() => onSelect(undefined)} onPrevious={selectedIndex > 0 ? () => onSelect(flights[selectedIndex - 1].sector.id) : undefined} onNext={selectedIndex < flights.length - 1 ? () => onSelect(flights[selectedIndex + 1].sector.id) : undefined} />}
  </View>;
}

function FlightDetail({ row, palette, onClose, onPrevious, onNext }: { row: FlightRow; palette: Palette; onClose: () => void; onPrevious?: () => void; onNext?: () => void }) {
  return <IOSSheet visible onClose={onClose} handleColor={palette.line} style={[styles.flightSheet, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><SwipeSurface style={styles.flightSheetContent} onSwipeLeft={onNext} onSwipeRight={onPrevious} threshold={44}><Text style={[styles.label, { color: palette.muted }]}>{row.duty.dateLabel} · {row.sector.flightNumber}{row.sector.deadhead ? ' · DHC' : ''}</Text><Text style={[styles.sheetRoute, { color: palette.text }]}>{row.sector.departure} → {row.sector.arrival}</Text><Text style={[styles.meta, { color: palette.muted }]}>{row.sector.departureTime} – {row.sector.arrivalTime}</Text><Text style={[styles.swipeHint, { color: palette.muted }]}>{onPrevious ? '‹ ' : ''}swipe flight{onNext ? ' ›' : ''} · swipe down to close</Text><Text style={[styles.flyingWith, { color: palette.accent }]}>Flying with · {row.sector.crew.length}</Text>{row.sector.crew.length > 0 ? <FlatList data={row.sector.crew} keyExtractor={(member) => member.id} style={styles.crewScroll} contentContainerStyle={styles.crewList} showsVerticalScrollIndicator={false} renderItem={({ item }) => <View style={styles.crewRow}><View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}><Text style={[styles.avatarText, { color: palette.accent }]}>{item.name[0]}</Text></View><View style={styles.grow}><Text style={[styles.crewName, { color: palette.text }]}>{item.name}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.position ?? item.role}</Text></View></View>} /> : <Text style={[styles.meta, { color: palette.muted, marginTop: 12 }]}>Crew is not listed for this flight in the imported report.</Text>}</SwipeSurface></IOSSheet>;
}

function MoreScreen({ rosters, palette, onAimsSetup, onDeleteRoster, onErase }: { rosters: ParsedAirAstanaRoster[]; palette: Palette; onAimsSetup: () => void; onDeleteRoster: (periodStart: string) => void; onErase: () => void }) {
  return <View style={styles.screen}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>More</Text>
    <Pressable onPress={onAimsSetup} style={[styles.settingsCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><View style={styles.grow}><Text style={[styles.cardTitle, { color: palette.text }]}>Safari connector setup</Text><Text style={[styles.meta, { color: palette.muted }]}>One-time setup for sending roster data back to eScrew without sharing credentials or session data.</Text></View><Text style={[styles.chevron, { color: palette.muted }]}>›</Text></Pressable>
    <View style={[styles.libraryCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Rosters</Text>{rosters.length ? <FlatList data={rosters} keyExtractor={(item) => item.period.start} style={styles.libraryList} showsVerticalScrollIndicator={false} renderItem={({ item }) => <View style={[styles.libraryRow, { borderColor: palette.line }]}><View style={styles.grow}><Text style={[styles.libraryMonth, { color: palette.text }]}>{rosterMonthLabel(item)}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.subject?.base ?? 'Roster'} · stored locally</Text></View><Pressable onPress={() => onDeleteRoster(item.period.start)} style={[styles.deleteRosterButton, { backgroundColor: palette.accentSoft }]}><Text style={[styles.deleteRosterText, { color: palette.danger }]}>Delete</Text></Pressable></View>} /> : <Text style={[styles.meta, { color: palette.muted }]}>No rosters stored</Text>}</View>
    <View style={[styles.infoCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Privacy</Text><Text style={[styles.meta, { color: palette.muted }]}>Roster PDFs are parsed locally. AIMS sends roster data only; credentials and session data are not stored by eScrew.</Text></View>
    {rosters.length > 0 && <Pressable onPress={onErase} style={[styles.secondaryButton, { borderColor: palette.line }]}><Text style={[styles.secondaryText, { color: palette.text }]}>Erase local roster data</Text></Pressable>}
  </View>;
}

function useNow(): number { const [now, setNow] = useState(() => Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); return now; }
function timedDuties(items: RosterDuty[]): FocusDuty[] { return items.flatMap((item) => { const duty = item.duty; if (!duty.date || !duty.sectors.length) return []; const first = duty.sectors[0], last = duty.sectors[duty.sectors.length - 1]; const reportMs = stationLocalDateTimeMs(first.departure, duty.reportDate ?? duty.date, duty.reportTime); const releaseMs = stationLocalDateTimeMs(last.arrival, duty.releaseDate ?? duty.date, duty.releaseTime); return reportMs === undefined || releaseMs === undefined ? [] : [{ ...item, reportMs, releaseMs }]; }).sort((a, b) => a.reportMs - b.reportMs); }
function pickFocusDuty(timed: FocusDuty[], now: number): FocusDuty | undefined { return timed.filter((item) => item.reportMs <= now && item.releaseMs >= now).sort((a, b) => b.reportMs - a.reportMs)[0] ?? timed.find((item) => item.reportMs > now) ?? timed[timed.length - 1]; }
function previousDuties(timed: FocusDuty[], focus: FocusDuty | undefined, now: number, count = 3): FocusDuty[] { return timed.filter((item) => item.releaseMs < now && item.duty.id !== focus?.duty.id).sort((a, b) => b.releaseMs - a.releaseMs).slice(0, count); }
function formatCountdown(milliseconds: number): string { const total = Math.max(0, Math.floor(milliseconds / 1000)); const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60; const clock = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`; return days > 0 ? `${days}d ${clock}` : clock; }
function rosterDateMeta(duty: Duty): { label: string; weekend: boolean } { if (!duty.date) return { label: duty.dateLabel, weekend: false }; const [year, month, day] = duty.date.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day)); if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { label: duty.dateLabel, weekend: false }; const weekdayIndex = date.getUTCDay(); const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][weekdayIndex]; return { label: `${duty.dateLabel} · ${weekday}`, weekend: weekdayIndex === 0 || weekdayIndex === 6 }; }
function routeChain(duty: Duty): string { return [duty.sectors[0]?.departure, ...duty.sectors.map((sector) => sector.arrival)].filter(Boolean).join(' → '); }
function TimeCell({ label, value, palette }: { label: string; value: string; palette: Palette }) { return <View style={styles.timeCell}><Text numberOfLines={1} style={[styles.timeLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.timeValue, { color: palette.text }]}>{value}</Text></View>; }
function Summary({ title, value, detail, palette }: { title: string; value: string; detail: string; palette: Palette }) { return <View style={[styles.summary, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.label, { color: palette.muted }]}>{title}</Text><Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text><Text style={[styles.meta, { color: palette.muted }]}>{detail}</Text></View>; }
function PrimaryButton({ title, onPress, loading, palette }: { title: string; onPress: () => void; loading: boolean; palette: Palette }) { return <Pressable onPress={onPress} disabled={loading} style={[styles.primaryButton, { backgroundColor: palette.accent }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{title}</Text>}</Pressable>; }
function operatingCount(roster: ParsedAirAstanaRoster) { return roster.sectors.filter((sector) => !sector.deadhead).length; }

const styles = StyleSheet.create({
  safe:{flex:1}, app:{flex:1,width:'100%',maxWidth:620,alignSelf:'center',paddingHorizontal:16,paddingTop:10.58},
  header:{height:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, brand:{fontSize:27,fontWeight:'700',letterSpacing:-.8}, kicker:{fontSize:10,fontWeight:'700',letterSpacing:1.2},
  modeButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center'}, aimsGlyph:{fontSize:17,lineHeight:20,fontWeight:'800'}, aimsDot:{position:'absolute',right:7,top:7,width:6,height:6,borderRadius:3},
  aimsStatus:{minHeight:66,borderWidth:1,borderRadius:20,padding:12,marginBottom:8,flexDirection:'row',alignItems:'center',gap:10}, aimsStatusIcon:{width:28,height:28,alignItems:'center',justifyContent:'center'}, aimsStatusGlyph:{fontSize:18,fontWeight:'800'}, aimsStatusTitle:{fontSize:14,lineHeight:18,fontWeight:'700'}, statusAction:{height:34,borderRadius:12,paddingHorizontal:10,alignItems:'center',justifyContent:'center'}, statusActionText:{fontSize:11,fontWeight:'700'}, statusDismiss:{width:24,height:34,alignItems:'center',justifyContent:'center'}, statusDismissText:{fontSize:22,lineHeight:24},
  viewport:{flex:1,minHeight:0}, screen:{flex:1,paddingTop:8,gap:12}, grow:{flex:1,minWidth:0}, sectionTitle:{fontSize:27,lineHeight:31,fontWeight:'700',letterSpacing:-.8}, intro:{fontSize:15,lineHeight:22}, label:{fontSize:11,fontWeight:'700',letterSpacing:.9}, meta:{fontSize:13,lineHeight:18},
  dutyHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, heroCard:{borderWidth:1,borderRadius:26,padding:18}, heroRoute:{fontSize:36,lineHeight:42,fontWeight:'700',letterSpacing:-1}, heroMetaRow:{flexDirection:'row',alignItems:'center',gap:10,marginTop:4}, heroMetaRowTall:{minHeight:44}, heroFlight:{flex:1,fontSize:13,fontWeight:'600'},
  countdownPill:{borderRadius:15,paddingHorizontal:12,paddingVertical:6,alignItems:'center'}, countdown:{fontSize:18,fontWeight:'800',fontVariant:['tabular-nums']}, countdownLabel:{fontSize:10,fontWeight:'700',letterSpacing:.7,marginTop:1}, timeDivider:{height:StyleSheet.hairlineWidth,marginVertical:14}, timeRow:{flexDirection:'row',alignItems:'flex-start',gap:6}, timeCell:{flex:1,minWidth:0}, timeLabel:{fontSize:11,lineHeight:14,fontWeight:'700',letterSpacing:.3}, timeValue:{fontSize:22,lineHeight:27,fontWeight:'700',marginTop:3,fontVariant:['tabular-nums']}, heroFoot:{fontSize:13,fontWeight:'600',marginTop:14},
  summaryRow:{flexDirection:'row',gap:10}, summary:{flex:1,borderWidth:1,borderRadius:20,padding:14}, summaryValue:{fontSize:28,fontWeight:'700',marginTop:6,fontVariant:['tabular-nums']}, upNext:{flex:1,minHeight:0,gap:2}, upNextList:{flex:1}, upNextRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:11,borderBottomWidth:StyleSheet.hairlineWidth}, upNextDate:{fontSize:12,fontWeight:'700',letterSpacing:.4,width:54}, upNextRoute:{flex:1,fontSize:15,fontWeight:'600'}, upNextTimeBlock:{minWidth:72,alignItems:'flex-end'}, upNextTimeLabel:{fontSize:8,lineHeight:10,fontWeight:'700',letterSpacing:.45,marginBottom:1}, upNextTime:{fontSize:14,fontWeight:'600',fontVariant:['tabular-nums']},
  primaryButton:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center'}, actionText:{color:'#fff',fontWeight:'700'}, titleRow:{flexDirection:'row',alignItems:'center',gap:8}, titleActions:{flexDirection:'row',gap:7}, compactButton:{height:38,minWidth:72,borderWidth:1,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:10}, compactText:{fontWeight:'700',fontSize:12}, monthNav:{height:40,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, monthNavText:{fontSize:12,fontWeight:'600'}, error:{fontSize:12},
  emptyCard:{borderWidth:1,borderRadius:20,padding:14}, innerWindow:{flex:1,minHeight:0,borderWidth:1,borderRadius:20,overflow:'hidden'}, listContent:{padding:8,gap:7,paddingBottom:18}, rosterCard:{borderWidth:1,borderRadius:16,padding:13}, flightCardTop:{flexDirection:'row',justifyContent:'space-between'}, flightNumber:{fontSize:11,fontWeight:'700'}, rosterRoute:{fontSize:20,fontWeight:'700',marginTop:4},
  infoCard:{borderWidth:1,borderRadius:20,padding:14,gap:3}, cardTitle:{fontSize:15,fontWeight:'700'}, settingsCard:{minHeight:68,borderWidth:1,borderRadius:20,padding:14,flexDirection:'row',alignItems:'center'}, chevron:{fontSize:30}, secondaryButton:{height:48,borderWidth:1,borderRadius:15,alignItems:'center',justifyContent:'center'}, secondaryText:{fontWeight:'600'}, libraryCard:{borderWidth:1,borderRadius:20,padding:14,minHeight:88,maxHeight:190}, libraryList:{marginTop:5}, libraryRow:{minHeight:54,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:StyleSheet.hairlineWidth}, libraryMonth:{fontSize:14,fontWeight:'700'}, deleteRosterButton:{minWidth:58,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',paddingHorizontal:8}, deleteRosterText:{fontSize:11,fontWeight:'700'},
  depthSurface:{shadowColor:'#000',shadowOffset:{width:0,height:10},shadowOpacity:.1,shadowRadius:24,elevation:5}, tabBar:{height:68,marginTop:8,marginBottom:4,borderWidth:1,borderRadius:22,flexDirection:'row'}, tabSelection:{position:'absolute',left:4,top:4,bottom:4,borderRadius:18,shadowColor:'#000',shadowOffset:{width:0,height:5},shadowOpacity:.08,shadowRadius:12,elevation:2}, tabItem:{flex:1,zIndex:1,alignItems:'center',justifyContent:'center',gap:2}, tabIconWrap:{minWidth:35,height:27,borderRadius:14,alignItems:'center',justifyContent:'center'}, tabIcon:{textAlign:'center'}, tabText:{fontSize:11,fontWeight:'600'},
  flightSheet:{width:'100%',maxWidth:620,maxHeight:'78%',alignSelf:'center',borderTopWidth:1,borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:18,paddingBottom:12,overflow:'hidden'}, flightSheetContent:{minHeight:0,flexShrink:1}, sheetRoute:{fontSize:28,lineHeight:33,fontWeight:'700',marginTop:5}, swipeHint:{fontSize:10,marginTop:7}, flyingWith:{fontSize:12,fontWeight:'700',marginTop:12,marginBottom:7}, crewScroll:{minHeight:0,flexShrink:1}, crewList:{paddingBottom:12}, crewRow:{minHeight:50,flexDirection:'row',alignItems:'center'}, avatar:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',marginRight:11}, avatarText:{fontSize:12,fontWeight:'800'}, crewName:{fontSize:14,fontWeight:'600'},
});