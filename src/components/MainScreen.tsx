import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions, type LayoutChangeEvent, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IOSDialog, IOSSheet } from './IOSOverlay';
import { SwipeSurface, type SwipeSurfaceHandle } from './SwipeSurface';
import { buildRosterTimeline, flightExtra, stayForSector, type RosterTimelineRow, type RosterWithNormalized, type StayInfo } from './rosterDataView';
import type { NormalizedExpiry } from '@/src/core/rosterContract';
import { exportRosterCalendar } from '@/src/domain/calendar';
import { formatMinutes, rosterMonthLabel, rosterToDuties } from '@/src/domain/rosterView';
import { stationLocalDateTimeMs } from '@/src/domain/stationTime';
import type { CrewMember, Duty, Sector } from '@/src/domain/types';
import { openAimsWebArchiveFlow } from '@/src/import/pasteWebArchive';
import { pickAndParseRoster } from '@/src/import/pickRoster';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import { exportBackup, restoreBackup } from '@/src/storage/backup';
import { clearStoredRosters, loadStoredRosters, removeStoredRoster, upsertStoredRoster } from '@/src/storage/rosterStorage';
import { airportCoords } from '@/src/weather/airports';
import { prefetchStationWeather, useAirportForecastState, useAirportWeatherState } from '@/src/weather/weatherService';
import { weatherIcon, windDirectionLabel } from '@/src/weather/weatherCodes';

type Tab = 'Home' | 'Roster' | 'More';
const TABS: Tab[] = ['Home', 'Roster', 'More'];
const TAB_ICONS: Record<Tab, { glyph: string; size: number; nudge: number; weight: '700' | '800' }> = {
  Home: { glyph: '⌂', size: 25, nudge: 0, weight: '700' },
  Roster: { glyph: '✈︎', size: 24, nudge: 0, weight: '700' },
  More: { glyph: '•••', size: 19, nudge: -2, weight: '700' },
};
type Palette = { background:string; surface:string; surfaceStrong:string; text:string; muted:string; line:string; accentLine:string; accent:string; accentSoft:string; gold:string; danger:string; weekend:string };
type RosterDuty = { roster: ParsedAirAstanaRoster; duty: Duty };
type FocusDuty = RosterDuty & { reportMs: number; releaseMs: number };
type FlightRow = { duty: Duty; sector: Sector };
type RosterFocusHandle = { focusToday: () => void };

const MONO_FONT = Platform.OS === 'web'
  ? ({ fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace' } as any)
  : undefined;
const WEB_GLASS = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(20px) saturate(1.28)', WebkitBackdropFilter: 'blur(20px) saturate(1.28)' } as any)
  : undefined;
const WEB_TAB_GLASS = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(24px) saturate(1.35)', WebkitBackdropFilter: 'blur(24px) saturate(1.35)' } as any)
  : undefined;
const WEB_SKY_BACKGROUND = Platform.OS === 'web'
  ? ({
      backgroundImage: 'radial-gradient(circle at 18% 8%, rgba(255,255,255,.72) 0%, rgba(255,255,255,0) 30%), radial-gradient(ellipse at 78% 22%, rgba(255,191,134,.34) 0%, rgba(255,191,134,0) 34%), linear-gradient(145deg, #FFBF86 0%, #8EC5FF 40%, #2F80ED 80%)',
      backgroundAttachment: 'fixed',
    } as any)
  : undefined;
const todayGlow = (palette: Palette) => ({
  shadowColor: palette.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: .22, shadowRadius: 22, elevation: 8, ...WEB_GLASS,
});
const LIST_TOP_PADDING = 8;
const LIST_ROW_GAP = 7;
const ROW_HEIGHT_ESTIMATE = { flight: 124, event: 80 } as const;
function heroTint(palette: Palette) {
  return Platform.OS === 'web'
    ? ({
        backgroundImage: `radial-gradient(ellipse at 50% 112%, rgba(47,128,237,.18) 0%, rgba(255,191,134,.16) 40%, transparent 70%), linear-gradient(145deg, rgba(255,255,255,.74) 0%, rgba(255,255,255,.50) 58%, ${palette.accentSoft} 100%)`,
      } as any)
    : undefined;
}

export default function MainScreen() {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const desktopWeb = Platform.OS === 'web' && width >= 768;
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => { if (!hydrated) setHydrated(true); }, [hydrated]);
  const dark = hydrated && scheme === 'dark';

  const palette = useMemo<Palette>(() => dark ? {
    background:'#091329', surface:'rgba(23,35,58,.62)', surfaceStrong:'rgba(28,42,68,.76)', text:'#F7FAFF', muted:'#A7B4C6', line:'rgba(255,255,255,.12)', accentLine:'rgba(142,197,255,.30)', accent:'#2F80ED', accentSoft:'rgba(142,197,255,.18)', gold:'#FFBF86', danger:'#F07278', weekend:'#FFBF86',
  } : {
    background:'#8EC5FF', surface:'rgba(255,255,255,.55)', surfaceStrong:'rgba(255,255,255,.67)', text:'#091329', muted:'#718095', line:'rgba(255,255,255,.30)', accentLine:'rgba(47,128,237,.22)', accent:'#2F80ED', accentSoft:'rgba(142,197,255,.26)', gold:'#FFBF86', danger:'#E5484D', weekend:'#A26743',
  }, [dark]);

  const [tab, setTab] = useState<Tab>('Home');
  const [rosters, setRosters] = useState<ParsedAirAstanaRoster[]>([]);
  const [activeMonth, setActiveMonth] = useState<string>();
  const [selectedFlight, setSelectedFlight] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabSelection = useRef(new Animated.Value(0)).current;
  const tabSwipeRef = useRef<SwipeSurfaceHandle>(null);
  const rosterFocus = useRef<RosterFocusHandle>({ focusToday: () => undefined }).current;

  useEffect(() => {
    const stored = loadStoredRosters();
    setRosters(stored);
    setActiveMonth(stored.at(-1)?.period.start);
  }, []);

  useEffect(() => {
    Animated.spring(tabSelection, {
      toValue: TABS.indexOf(tab),
      stiffness: 380,
      damping: 34,
      mass: 0.72,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }, [tab, tabSelection]);

  const roster = rosters.find((item) => item.period.start === activeMonth) ?? rosters.at(-1);
  const duties = useMemo(() => roster ? rosterToDuties(roster) : [], [roster]);
  const selectedSector = duties.flatMap((duty) => duty.sectors).find((sector) => sector.id === selectedFlight);
  const allDuties = useMemo<RosterDuty[]>(() => rosters.flatMap((item) => rosterToDuties(item).map((duty) => ({ roster: item, duty }))), [rosters]);
  useEffect(() => {
    const now = Date.now();
    const upcoming = timedDuties(allDuties).filter((item) => item.releaseMs >= now).slice(0, 6);
    const seen = new Set<string>();
    const requests: { code: string; days: number; startDate?: string; expandLayover?: boolean }[] = [];
    for (const item of upcoming) {
      for (const sector of item.duty.sectors) {
        const startDate = arrivalForecastDate(item.roster, item.duty, sector);
        const expandLayover = !isHomeBaseAirport(sector.arrival, item.roster.subject?.base);
        const requestKey = `${sector.arrival}:${startDate ?? 'today'}:${expandLayover ? 'layover' : 'day'}`;
        if (seen.has(requestKey)) continue;
        seen.add(requestKey);
        requests.push({ code: sector.arrival, days: 1, startDate, expandLayover });
      }
    }
    if (requests.length) prefetchStationWeather(requests);
  }, [allDuties]);
  const tabStep = tabBarWidth / TABS.length;
  const tabIndicatorX = Animated.multiply(tabSelection, tabStep);

  const importRoster = useCallback(async () => {
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
  }, []);

  const importFromAims = useCallback(async () => {
    if (importing) return;
    setImportError(undefined);
    setImporting(true);
    try {
      const result = await openAimsWebArchiveFlow();
      if (!result) return;
      const next = upsertStoredRoster(result.roster);
      setRosters(next);
      setActiveMonth(result.roster.period.start);
      setSelectedFlight(undefined);
      setTab('Roster');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  }, [importing]);
  const restoreFromBackup = useCallback(async () => {
    const result = await restoreBackup();
    if (result.restored) {
      const next = loadStoredRosters();
      setRosters(next);
      setActiveMonth(next.at(-1)?.period.start);
    }
    return result;
  }, []);

  const deleteRoster = useCallback((periodStart: string) => {
    const next = removeStoredRoster(periodStart);
    setRosters(next);
    setSelectedFlight(undefined);
    setActiveMonth((current) => current && current !== periodStart && next.some((item) => item.period.start === current) ? current : next.at(-1)?.period.start);
  }, []);
  const changeMonth = useCallback((direction: -1 | 1) => {
    if (!roster) return;
    const index = rosters.findIndex((item) => item.period.start === roster.period.start);
    const next = rosters[index + direction];
    if (!next) return;
    setActiveMonth(next.period.start);
    setSelectedFlight(undefined);
  }, [roster, rosters]);
  const changeTab = useCallback((direction: -1 | 1) => {
    const next = TABS[TABS.indexOf(tab) + direction];
    if (!next) return;
    if (next === 'Roster') rosterFocus.focusToday();
    setSelectedFlight(undefined);
    setTab(next);
  }, [tab, rosterFocus]);
  const goToTab = useCallback((target: Tab) => {
    if (target === tab) return;
    const direction = TABS.indexOf(target) > TABS.indexOf(tab) ? -1 : 1;
    setSelectedFlight(undefined);
    tabSwipeRef.current?.play(direction, () => {
      if (target === 'Roster') rosterFocus.focusToday();
      setTab(target);
    });
  }, [tab, rosterFocus]);
  const eraseAll = useCallback(() => {
    clearStoredRosters();
    setRosters([]);
    setActiveMonth(undefined);
    setSelectedFlight(undefined);
    setTab('Home');
  }, []);

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }, !dark && WEB_SKY_BACKGROUND]} edges={desktopWeb ? ['bottom'] : ['top', 'bottom']}>
    <View style={styles.app}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.brand, { color: palette.text }]}>eScrew</Text>
          <Text style={[styles.brandSubtitle, { color: palette.muted }]}>CREW · ROSTER · EVERYWHERE</Text>
        </View>
        <Pressable onPress={importFromAims} disabled={importing} style={[styles.modeButton, styles.depthSurface, { backgroundColor: importing ? palette.accentSoft : palette.surface, borderColor: palette.line }]} accessibilityLabel="Import from AIMS">
          {importing ? <ActivityIndicator size="small" color={palette.accent} /> : <Text style={[styles.aimsGlyph, { color: palette.accent }]}>AIMS</Text>}
        </Pressable>
      </View>

      {importError && <ImportErrorBanner message={importError} palette={palette} onDismiss={() => setImportError(undefined)} />}

      <SwipeSurface ref={tabSwipeRef} style={styles.viewport} onSwipeLeft={tab === 'More' ? undefined : () => changeTab(1)} onSwipeRight={tab === 'Home' ? undefined : () => changeTab(-1)}>
        <View style={[styles.tabPane, tab !== 'Home' && styles.tabPaneHidden]} pointerEvents={tab === 'Home' ? 'auto' : 'none'}>
          <Home allDuties={allDuties} fallbackRoster={roster} rosters={rosters} palette={palette} onImport={importRoster} importing={importing} />
        </View>
        <View style={[styles.tabPane, tab !== 'Roster' && styles.tabPaneHidden]} pointerEvents={tab === 'Roster' ? 'auto' : 'none'}>
          <RosterScreen roster={roster} rosters={rosters} duties={duties} selectedSector={selectedSector} palette={palette} importing={importing} onImport={importRoster} onSelect={setSelectedFlight} onMonth={changeMonth} rosterFocus={rosterFocus} />
        </View>
        <View style={[styles.tabPane, tab !== 'More' && styles.tabPaneHidden]} pointerEvents={tab === 'More' ? 'auto' : 'none'}>
          <MoreScreen rosters={rosters} palette={palette} onRestoreBackup={restoreFromBackup} onDeleteRoster={deleteRoster} onErase={eraseAll} />
        </View>
      </SwipeSurface>

      <View onLayout={(event) => { const nextWidth = event.nativeEvent.layout.width; if (Math.abs(nextWidth - tabBarWidth) > 0.5) setTabBarWidth(nextWidth); }} style={[styles.depthSurface, styles.tabBar, { backgroundColor: palette.surface, borderColor: palette.line }]}>
        {tabBarWidth > 0 && <Animated.View pointerEvents="none" style={[styles.tabSelection, { width: Math.max(0, tabStep - 10), backgroundColor: palette.surfaceStrong, transform: [{ translateX: tabIndicatorX }] }]} />}
        {TABS.map((item) => {
          const active = item === tab;
          return <Pressable key={item} onPress={() => goToTab(item)} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={styles.tabIconWrap}><Text style={[styles.tabIcon, { color: active ? palette.accent : palette.muted, fontSize: TAB_ICONS[item].size, lineHeight: TAB_ICONS[item].size + 3, marginTop: TAB_ICONS[item].nudge, fontWeight: TAB_ICONS[item].weight }]}>{TAB_ICONS[item].glyph}</Text></View>
            <Text style={[styles.tabText, { color: active ? palette.accent : palette.muted }]}>{item}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </SafeAreaView>;
}

function ImportErrorBanner({ message, palette, onDismiss }: { message: string; palette: Palette; onDismiss: () => void }) {
  return <View style={[styles.aimsStatus, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.danger }]}>
    <View style={styles.aimsStatusIcon}><Text style={[styles.aimsStatusGlyph, { color: palette.danger }]}>!</Text></View>
    <View style={styles.grow}><Text style={[styles.aimsStatusTitle, { color: palette.text }]}>Could not import roster</Text><Text style={[styles.meta, { color: palette.muted }]}>{message}</Text></View>
    <Pressable onPress={onDismiss} accessibilityLabel="Dismiss import error" style={styles.statusDismiss}><Text style={[styles.statusDismissText, { color: palette.muted }]}>×</Text></Pressable>
  </View>;
}

function HomeImpl({ allDuties, fallbackRoster, rosters, palette, onImport, importing }: { allDuties: RosterDuty[]; fallbackRoster?: ParsedAirAstanaRoster; rosters: ParsedAirAstanaRoster[]; palette: Palette; onImport: () => void; importing: boolean }) {
  const now = useNow();
  const timeline = useMemo(() => timedDuties(allDuties), [allDuties]);
  const focus = useMemo(() => pickFocusDuty(timeline, now), [timeline, now]);
  const roster = focus?.roster ?? fallbackRoster;
  const duty = focus?.duty;
  const renderCrewRow: ListRenderItem<CrewMember> = useCallback(({ item }) => <CrewRow member={item} palette={palette} />, [palette]);

  if (!roster || !duty) return <View style={styles.screen}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>Your roster, simplified.</Text>
    <Text style={[styles.intro, { color: palette.muted }]}>Tap AIMS above to import your crew schedule, or add a saved roster file below.</Text>
    <PrimaryButton title="Import file" onPress={onImport} loading={importing} palette={palette} />
  </View>;

  const first = duty.sectors[0];
  const last = duty.sectors[duty.sectors.length - 1];
  const stay = stayForSector(roster, last);
  const forecastStartDate = arrivalForecastDate(roster, duty, last);
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
  const crew = crewOnDuty(duty);
  const year = roster.period.start.slice(0, 4);
  const yearRosters = rosters.filter((item) => item.period.start.startsWith(`${year}-`));
  const ytdBlock = yearRosters.reduce((sum, item) => sum + (item.totals.blockMinutes ?? 0), 0);
  const ytdNight = yearRosters.reduce((sum, item) => sum + (item.totals.nightMinutes ?? 0), 0);

  return <View style={styles.screen}>
    <View style={styles.dutyHead}><Text style={[styles.label, { color: isActive ? palette.accent : palette.muted }]}>{isUpcoming ? 'NEXT DUTY' : isActive ? 'ON DUTY NOW' : 'LATEST DUTY'}</Text><Text style={[styles.label, { color: palette.muted }]}>{duty.dateLabel}</Text></View>
    <View style={[styles.heroCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.accentLine }, heroTint(palette)]}>
      <View style={styles.heroRouteRow}>
        <View style={[styles.planeOrb, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.planeGlyph, { color: palette.accent }]}>✈︎</Text></View>
        <View style={styles.heroRouteBlock}>
          <Text numberOfLines={2} style={[styles.heroRoute, { color: palette.text }]}>{routeChain(duty)}</Text>
          <View style={styles.flightBadgeRow}>{duty.sectors.map((sector) => <View key={sector.id} style={[styles.flightBadge, { backgroundColor: palette.accentSoft, borderColor: palette.line }]}><Text style={[styles.flightBadgeText, { color: palette.accent }]}>{sector.flightNumber}</Text></View>)}</View>
        </View>
      </View>
      {countdown && <View style={styles.heroCountdownRow}><View style={[styles.countdownPill, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.countdown, { color: palette.accent }]}>{countdown}</Text><Text style={[styles.countdownLabel, { color: palette.accent }]}>{isUpcoming ? 'TO REPORT' : 'ON DUTY'}</Text></View></View>}
      <View style={[styles.timeDivider, { backgroundColor: palette.line }]} />
      <View style={styles.timeRow}><TimeCell label="REPORT" value={duty.reportTime} palette={palette} /><TimeCell label={`DEP · ${first.departure}`} value={first.departureTime} palette={palette} /><TimeCell label={`ARR · ${last.arrival}`} value={last.arrivalTime} palette={palette} /><TimeCell label="RELEASE" value={duty.releaseTime} palette={palette} /></View>
      <View style={[styles.timeDivider, styles.heroFooterDivider, { backgroundColor: palette.line }]} />
      <View style={styles.heroFooterRow}>
        <View style={styles.heroWeatherWrap}><WeatherChip code={last.arrival} homeBase={roster.subject?.base} palette={palette} stay={stay} forecastStartDate={forecastStartDate} /></View>
        <Text style={[styles.heroFoot, { color: palette.muted }]}>{dutyMinutes !== undefined ? `Duty ${formatMinutes(dutyMinutes)} · ` : ''}{duty.sectors.length} sector{duty.sectors.length === 1 ? '' : 's'}</Text>
      </View>
    </View>
    <Text style={[styles.label, { color: palette.muted }]}>{rosterMonthLabel(roster)}</Text>
    <View style={styles.summaryRow}><Summary title="BLOCK HOURS" value={formatMinutes(block)} detail={`${operatingCount(roster)} sectors flown`} palette={palette} /><Summary title="NIGHT HOURS" value={formatMinutes(night)} detail={nightShare === undefined ? 'reported by the roster' : `${nightShare}% of block time`} palette={palette} /></View>
    {yearRosters.length > 1 && <Text style={[styles.meta, styles.ytdMeta, { color: palette.muted }]}>{year} to date · {formatMinutes(ytdBlock)} block · {formatMinutes(ytdNight)} night · {yearRosters.length} months imported</Text>}
    <View style={styles.upNext}>
      <Text style={[styles.label, { color: palette.muted }]}>CREW ON THIS FLIGHT · {crew.length}</Text>
      {crew.length > 0
        ? <FlatList data={crew} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} style={styles.upNextList} contentContainerStyle={styles.crewCardList} renderItem={renderCrewRow} />
        : <Text style={[styles.meta, { color: palette.muted, marginTop: 4 }]}>Crew is not listed for this flight in the imported roster.</Text>}
    </View>
  </View>;
}
const Home = memo(HomeImpl);

function RosterScreenImpl({ roster, rosters, duties, selectedSector, palette, importing, onImport, onSelect, onMonth, rosterFocus }: { roster?: ParsedAirAstanaRoster; rosters: ParsedAirAstanaRoster[]; duties: Duty[]; selectedSector?: Sector; palette: Palette; importing: boolean; onImport: () => void; onSelect: (id?: string) => void; onMonth: (direction: -1 | 1) => void; rosterFocus: RosterFocusHandle }) {
  const [calendarState, setCalendarState] = useState<'idle'|'working'|'done'|'error'>('idle');
  const index = roster ? rosters.findIndex((item) => item.period.start === roster.period.start) : -1;
  const flights = useMemo<FlightRow[]>(() => duties.flatMap((duty) => duty.sectors.map((sector) => ({ duty, sector }))), [duties]);
  const timeline = useMemo<RosterTimelineRow[]>(() => buildRosterTimeline(roster, duties), [roster, duties]);
  const selectedIndex = selectedSector ? flights.findIndex(({ sector }) => sector.id === selectedSector.id) : -1;
  const selectedRow = selectedIndex >= 0 ? flights[selectedIndex] : undefined;
  const monthSwipeRef = useRef<SwipeSurfaceHandle>(null);
  const listRef = useRef<FlatList<RosterTimelineRow>>(null);
  const rowHeights = useRef(new Map<string, number>()).current;
  const offsetsCache = useRef<{ timeline: RosterTimelineRow[]; offsets: number[] } | null>(null);
  const today = localTodayIso();
  const todayIndex = useMemo(() => {
    let idx = timeline.findIndex((row) => row.sortKey.slice(0, 10) === today);
    if (idx === -1) idx = timeline.findIndex((row) => row.sortKey.slice(0, 10) > today);
    return idx;
  }, [timeline, today]);
  const heightFor = useCallback((row: RosterTimelineRow | undefined) => {
    if (!row) return ROW_HEIGHT_ESTIMATE.flight;
    return rowHeights.get(row.key) ?? ROW_HEIGHT_ESTIMATE[row.kind];
  }, [rowHeights]);
  const buildOffsets = useCallback(() => {
    const offsets: number[] = [];
    let offset = LIST_TOP_PADDING;
    for (const row of timeline) { offsets.push(offset); offset += heightFor(row) + LIST_ROW_GAP; }
    offsetsCache.current = { timeline, offsets };
    return offsets;
  }, [timeline, heightFor]);
  const getItemLayout = useCallback((data: ArrayLike<RosterTimelineRow> | null | undefined, index: number) => {
    const cached = offsetsCache.current;
    const offsets = cached && cached.timeline === timeline ? cached.offsets : buildOffsets();
    return { length: heightFor(data?.[index]), offset: offsets[index] ?? 0, index };
  }, [timeline, heightFor, buildOffsets]);
  const measureRow = useCallback((key: string, height: number) => {
    if (rowHeights.get(key) === height) return;
    rowHeights.set(key, height);
    offsetsCache.current = null;
  }, [rowHeights]);
  useEffect(() => {
    rowHeights.clear();
    offsetsCache.current = null;
  }, [roster?.period.start, rowHeights]);
  const focusToday = useCallback(() => {
    if (todayIndex < 0) return;
    listRef.current?.scrollToIndex({ index: todayIndex, animated: false, viewPosition: 0 });
  }, [todayIndex]);
  const renderTimelineRow: ListRenderItem<RosterTimelineRow> = useCallback(({ item }) => {
    const onLayout = (event: LayoutChangeEvent) => measureRow(item.key, event.nativeEvent.layout.height);
    return item.kind === 'flight'
      ? <FlightRosterCard roster={roster} duty={item.duty} sector={item.sector} selected={selectedSector?.id === item.sector.id} isToday={item.sortKey.slice(0, 10) === today} palette={palette} onPress={() => onSelect(item.sector.id)} onLayout={onLayout} />
      : <RosterEventCard item={item} isToday={item.sortKey.slice(0, 10) === today} palette={palette} onLayout={onLayout} />;
  }, [roster, selectedSector, today, palette, onSelect, measureRow]);
  useEffect(() => {
    rosterFocus.focusToday = focusToday;
  }, [focusToday, rosterFocus]);
  useEffect(() => setCalendarState('idle'), [roster?.period.start]);
  const exportCalendar = async () => { if (!roster || calendarState === 'working') return; setCalendarState('working'); try { await exportRosterCalendar(roster); setCalendarState('done'); } catch (e) { setCalendarState(e instanceof Error && /cancel/i.test(e.message) ? 'idle' : 'error'); } };
  const goToMonth = (direction: -1 | 1) => {
    if ((direction === -1 && index <= 0) || (direction === 1 && index >= rosters.length - 1)) return;
    monthSwipeRef.current?.play(direction === 1 ? -1 : 1, () => onMonth(direction));
  };

  return <View style={styles.screen}>
    <View style={styles.titleRow}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>{roster ? rosterMonthLabel(roster) : 'Roster'}</Text><Text style={[styles.meta, { color: palette.muted }]}>{roster?.subject ? `${roster.subject.base ?? '—'} · ${roster.subject.rank ?? 'crew'}` : 'Personal schedule'}</Text></View><View style={styles.titleActions}>{roster && <Pressable onPress={exportCalendar} style={[styles.compactButton, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}>{calendarState === 'working' ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.text }]}>{calendarState === 'done' ? 'Added' : calendarState === 'error' ? 'Retry' : 'Calendar'}</Text>}</Pressable>}<Pressable onPress={onImport} disabled={importing} style={[styles.compactButton, styles.depthSurface, { backgroundColor: palette.accentSoft, borderColor: palette.line }]}>{importing ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.accent }]}>{roster ? 'Add file' : 'Import file'}</Text>}</Pressable></View></View>
    {roster && rosters.length > 1 && <View style={styles.monthNav}><Pressable disabled={index <= 0} onPress={() => goToMonth(-1)}><Text style={[styles.monthNavText, { color: index <= 0 ? palette.line : palette.text }]}>‹ Previous</Text></Pressable><Text style={[styles.meta, { color: palette.muted }]}>{index + 1} / {rosters.length}</Text><Pressable disabled={index >= rosters.length - 1} onPress={() => goToMonth(1)}><Text style={[styles.monthNavText, { color: index >= rosters.length - 1 ? palette.line : palette.text }]}>Next ›</Text></Pressable></View>}
    {!roster ? <View style={[styles.emptyCard, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.meta, { color: palette.muted }]}>Tap AIMS above, or import a saved roster file to begin.</Text></View> : <SwipeSurface ref={monthSwipeRef} style={styles.monthSwipeWrap} onSwipeRight={index > 0 ? () => onMonth(-1) : undefined} onSwipeLeft={index < rosters.length - 1 ? () => onMonth(1) : undefined} threshold={38}><View style={[styles.innerWindow, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><FlatList
      ref={listRef}
      data={timeline}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialScrollIndex={todayIndex > 0 ? todayIndex : undefined}
      getItemLayout={getItemLayout}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: info.index, animated: false }));
      }}
      renderItem={renderTimelineRow}
    /></View></SwipeSurface>}
    {selectedRow && <FlightDetail row={selectedRow} roster={roster} palette={palette} onClose={() => onSelect(undefined)} onPrevious={selectedIndex > 0 ? () => onSelect(flights[selectedIndex - 1].sector.id) : undefined} onNext={selectedIndex < flights.length - 1 ? () => onSelect(flights[selectedIndex + 1].sector.id) : undefined} />}
  </View>;
}
const RosterScreen = memo(RosterScreenImpl);

function FlightRosterCard({ roster, duty, sector, selected, isToday, palette, onPress, onLayout }: { roster?: RosterWithNormalized; duty: Duty; sector: Sector; selected: boolean; isToday: boolean; palette: Palette; onPress: () => void; onLayout: (event: LayoutChangeEvent) => void }) {
  const dateMeta = rosterDateMeta(duty);
  const stay = stayForSector(roster, sector);
  const forecastStartDate = arrivalForecastDate(roster, duty, sector);
  return <Pressable onPress={onPress} onLayout={onLayout} style={[styles.rosterCard, isToday && styles.rosterCardToday, styles.depthSurface, { backgroundColor: selected || isToday ? palette.accentSoft : palette.surfaceStrong, borderColor: isToday ? palette.accent : palette.line, ...(isToday ? todayGlow(palette) : null) }]}>
    <View style={styles.flightCardTop}><Text style={[styles.label, { color: isToday ? palette.accent : dateMeta.weekend ? palette.weekend : palette.muted }]}>{dateMeta.label}{isToday ? ' · TODAY' : ''}</Text><Text style={[styles.flightNumber, { color: palette.muted }]}>{sector.flightNumber}{sector.deadhead ? ' · DHC' : ''}</Text></View>
    <Text style={[styles.rosterRoute, { color: palette.text }]}>{sector.departure} → {sector.arrival}</Text>
    <Text style={[styles.meta, { color: palette.muted }]}>{sector.departureTime} – {sector.arrivalTime} · Report {duty.reportTime}</Text>
    <WeatherChip code={sector.arrival} homeBase={roster?.subject?.base} palette={palette} stay={stay} forecastStartDate={forecastStartDate} />
  </Pressable>;
}

function RosterEventCard({ item, isToday, palette, onLayout }: { item: Extract<RosterTimelineRow, { kind: 'event' }>; isToday: boolean; palette: Palette; onLayout: (event: LayoutChangeEvent) => void }) {
  const dateMeta = eventDateMeta(item.date);
  const detail = [item.detail, item.station].filter(Boolean).join(' · ');
  return <View onLayout={onLayout} style={[styles.rosterCard, isToday && styles.rosterCardToday, styles.depthSurface, { backgroundColor: isToday ? palette.accentSoft : palette.surfaceStrong, borderColor: isToday ? palette.accent : palette.line, ...(isToday ? todayGlow(palette) : null) }]}>
    <View style={styles.flightCardTop}><Text style={[styles.label, { color: isToday ? palette.accent : dateMeta.weekend ? palette.weekend : palette.muted }]}>{dateMeta.label}{isToday ? ' · TODAY' : ''}</Text><Text style={[styles.flightNumber, { color: palette.muted }]}>{item.badge}</Text></View>
    <Text numberOfLines={2} style={[styles.rosterEventTitle, { color: palette.text }]}>{item.title}</Text>
    {detail ? <Text style={[styles.meta, { color: palette.muted }]}>{detail}</Text> : null}
  </View>;
}

function FlightDetail({ row, roster, palette, onClose, onPrevious, onNext }: { row: FlightRow; roster?: RosterWithNormalized; palette: Palette; onClose: () => void; onPrevious?: () => void; onNext?: () => void }) {
  const extra = flightExtra(roster, row.sector);
  const stay = stayForSector(roster, row.sector);
  const forecastStartDate = arrivalForecastDate(roster, row.duty, row.sector);
  const status = [row.sector.deadhead ? 'DHC' : undefined, extra?.actualTimes ? 'Actual times' : undefined, extra?.aircraftType].filter(Boolean).join(' · ');
  const [headerHeight, setHeaderHeight] = useState(0);
  const renderCrewMember: ListRenderItem<CrewMember> = useCallback(({ item }) => <View style={styles.crewRow}><View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}><Text style={[styles.avatarText, { color: palette.accent }]}>{item.name[0]}</Text></View><View style={styles.grow}><Text style={[styles.crewName, { color: palette.text }]}>{item.name}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.position ?? item.role}</Text></View></View>, [palette]);
  const scrollHeader = <View>
    {stay && <View style={[styles.stayCard, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><View style={styles.flightCardTop}><Text style={[styles.label, { color: palette.muted }]}>STAY{stay.station ? ` · ${stay.station}` : ''}</Text>{stay.rest ? <Text style={[styles.flightNumber, { color: palette.gold }]}>REST {stay.rest}</Text> : null}</View>{stay.hotel ? <Text style={[styles.stayTitle, { color: palette.text }]}>{stay.hotel}</Text> : null}{stay.checkIn || stay.checkOut ? <Text style={[styles.meta, { color: palette.muted }]}>{stay.checkIn ?? '—'} → {stay.checkOut ?? '—'}</Text> : null}{stay.address ? <Text numberOfLines={2} style={[styles.stayMeta, { color: palette.muted }]}>{stay.address}</Text> : null}{stay.phone ? <Text numberOfLines={2} style={[styles.stayMeta, { color: palette.muted }]}>{stay.phone}</Text> : null}</View>}
    <Text style={[styles.swipeHint, { color: palette.muted }]}>{onPrevious ? '‹ ' : ''}swipe flight{onNext ? ' ›' : ''} · swipe down to close</Text>
    <Text style={[styles.flyingWith, { color: palette.accent }]}>Flying with · {row.sector.crew.length}</Text>
  </View>;
  return <IOSSheet visible onClose={onClose} handleColor={palette.line} style={[styles.flightSheet, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><SwipeSurface style={styles.flightSheetContent} onSwipeLeft={onNext} onSwipeRight={onPrevious} threshold={44}>
    <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
      <Text style={[styles.label, { color: palette.muted }]}>{row.duty.dateLabel} · {row.sector.flightNumber}{row.sector.deadhead ? ' · DHC' : ''}</Text>
      <Text style={[styles.sheetRoute, { color: palette.text }]}>{row.sector.departure} → {row.sector.arrival}</Text>
      {status ? <Text style={[styles.meta, { color: palette.muted }]}>{status}</Text> : null}
      <WeatherChip code={row.sector.arrival} homeBase={roster?.subject?.base} palette={palette} stay={stay} forecastStartDate={forecastStartDate} />
      <View style={[styles.flightFacts, { borderColor: palette.line }]}><FlightFact label="REPORT" value={row.duty.reportTime} palette={palette} /><FlightFact label="DEP" value={row.sector.departureTime} palette={palette} /><FlightFact label="ARR" value={row.sector.arrivalTime} palette={palette} /><FlightFact label="RELEASE" value={row.duty.releaseTime} palette={palette} /></View>
    </View>
    <FlatList
      data={row.sector.crew}
      keyExtractor={(member) => member.id}
      style={[styles.crewScroll, Platform.OS === 'web' ? ({ maxHeight: `calc(78vh - ${headerHeight + 90}px)` } as any) : undefined]}
      contentContainerStyle={styles.crewList}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={scrollHeader}
      ListEmptyComponent={<Text style={[styles.meta, { color: palette.muted, marginTop: 12 }]}>Crew is not listed for this flight in the imported report.</Text>}
      renderItem={renderCrewMember}
    />
  </SwipeSurface></IOSSheet>;
}

function FlightFact({ label, value, palette }: { label: string; value: string; palette: Palette }) {
  return <View style={styles.flightFact}><Text style={[styles.flightFactLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.flightFactValue, { color: palette.text }]}>{value}</Text></View>;
}

function MoreScreenImpl({ rosters, palette, onRestoreBackup, onDeleteRoster, onErase }: { rosters: RosterWithNormalized[]; palette: Palette; onRestoreBackup: () => Promise<{ restored: number }>; onDeleteRoster: (periodStart: string) => void; onErase: () => void }) {
  const expiries = rosters.at(-1)?.normalized?.expiries ?? [];
  const sortedExpiries = useMemo(() => [...expiries].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')), [expiries]);
  const [expiriesOpen, setExpiriesOpen] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string>();

  const handleExport = () => {
    try { exportBackup(); setBackupNotice('Backup saved.'); }
    catch (error) { setBackupNotice(error instanceof Error ? error.message : String(error)); }
  };
  const handleRestore = async () => {
    setBackupBusy(true);
    setBackupNotice(undefined);
    try {
      const { restored } = await onRestoreBackup();
      if (restored) setBackupNotice(`Restored ${restored} roster${restored === 1 ? '' : 's'}.`);
    } catch (error) {
      setBackupNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBackupBusy(false);
    }
  };
  const backupThenClose = () => { handleExport(); setConfirmErase(false); };
  const confirmAndErase = () => { setConfirmErase(false); onErase(); };
  const renderRosterRow: ListRenderItem<RosterWithNormalized> = useCallback(({ item }) => <View style={[styles.libraryRow, { borderColor: palette.line }]}><View style={styles.grow}><Text style={[styles.libraryMonth, { color: palette.text }]}>{rosterMonthLabel(item)}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.subject?.base ?? 'Roster'} · stored locally</Text></View><Pressable onPress={() => onDeleteRoster(item.period.start)} style={[styles.deleteRosterButton, { backgroundColor: palette.accentSoft }]}><Text style={[styles.deleteRosterText, { color: palette.danger }]}>Delete</Text></Pressable></View>, [palette, onDeleteRoster]);
  const renderExpiryRow: ListRenderItem<NormalizedExpiry> = useCallback(({ item }) => <ExpiryRow expiry={item} palette={palette} />, [palette]);

  return <View style={styles.screen}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>More</Text>
    <ScrollView style={styles.grow} contentContainerStyle={styles.moreContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.libraryCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Rosters</Text>{rosters.length ? <FlatList data={rosters} keyExtractor={(item) => item.period.start} style={styles.libraryList} showsVerticalScrollIndicator={false} renderItem={renderRosterRow} /> : <Text style={[styles.meta, { color: palette.muted }]}>No rosters stored</Text>}</View>

      {rosters.length > 0 && <Pressable onPress={() => setConfirmErase(true)} style={[styles.dangerButton, { backgroundColor: palette.danger + '16', borderColor: palette.danger }]}><Text style={[styles.dangerText, { color: palette.danger }]}>⚠ Erase local roster data</Text></Pressable>}

      <View style={[styles.infoCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>Backup</Text>
        <Text style={[styles.meta, { color: palette.muted }]}>Save every stored roster to a file, or restore from one. Nothing leaves this device.</Text>
        <View style={styles.backupRow}>
          <Pressable onPress={handleExport} disabled={!rosters.length} style={[styles.compactButton, styles.grow, { backgroundColor: palette.accentSoft, borderColor: palette.line, opacity: rosters.length ? 1 : .5 }]}><Text style={[styles.compactText, { color: palette.accent }]}>Save backup</Text></Pressable>
          <Pressable onPress={handleRestore} disabled={backupBusy} style={[styles.compactButton, styles.grow, { backgroundColor: palette.surface, borderColor: palette.line }]}>{backupBusy ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.text }]}>Restore backup</Text>}</Pressable>
        </View>
        {backupNotice ? <Text style={[styles.meta, { color: palette.muted }]}>{backupNotice}</Text> : null}
      </View>

      <View style={[styles.libraryCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
        <Pressable onPress={() => setExpiriesOpen(true)} style={styles.expiryHeaderRow} accessibilityRole="button">
          <Text style={[styles.cardTitle, { color: palette.text }]}>Expiry Dates{sortedExpiries.length ? ` · ${sortedExpiries.length}` : ''}</Text>
          <Text style={[styles.expiryChevron, { color: palette.muted }]}>›</Text>
        </Pressable>
        {sortedExpiries.length === 0 && <Text style={[styles.meta, { color: palette.muted, marginTop: 8 }]}>No expiry data in the imported roster.</Text>}
      </View>

      <View style={[styles.infoCard, styles.depthSurface, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Privacy</Text><Text style={[styles.meta, { color: palette.muted }]}>Roster PDFs are parsed locally. AIMS sends roster data only; credentials and session data are not stored by eScrew. Weather sends only an airport code to Open-Meteo — no roster or crew data.</Text></View>

      <VersionFooter palette={palette} />
    </ScrollView>

    <IOSDialog visible={confirmErase} onClose={() => setConfirmErase(false)} style={[styles.confirmDialog, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
      <Text style={[styles.cardTitle, { color: palette.text }]}>Erase all local roster data?</Text>
      <Text style={[styles.meta, { color: palette.muted, marginTop: 6 }]}>This removes every imported roster and expiry record from this device. This cannot be undone — back up first if you want to keep a copy.</Text>
      <View style={styles.confirmActions}>
        <Pressable onPress={backupThenClose} style={[styles.confirmCancel, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.compactText, { color: palette.text }]}>Backup</Text></Pressable>
        <Pressable onPress={confirmAndErase} style={[styles.confirmErase, { backgroundColor: palette.danger }]}><Text style={[styles.compactText, { color: '#fff' }]}>Erase</Text></Pressable>
      </View>
    </IOSDialog>

    <IOSSheet visible={expiriesOpen} onClose={() => setExpiriesOpen(false)} handleColor={palette.line} style={[styles.expirySheet, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
      <Text style={[styles.cardTitle, { color: palette.text }]}>Expiry Dates{sortedExpiries.length ? ` · ${sortedExpiries.length}` : ''}</Text>
      <FlatList
        data={sortedExpiries}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        style={[styles.expirySheetList, Platform.OS === 'web' ? ({ maxHeight: 'calc(78vh - 60px)' } as any) : undefined]}
        contentContainerStyle={styles.expirySheetListContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={[styles.meta, { color: palette.muted, marginTop: 8 }]}>No expiry data in the imported roster.</Text>}
        renderItem={renderExpiryRow}
      />
    </IOSSheet>
  </View>;
}
const MoreScreen = memo(MoreScreenImpl);

function VersionFooter({ palette }: { palette: Palette }) {
  const version = process.env.EXPO_PUBLIC_ESCREW_VERSION;
  const builtAt = process.env.EXPO_PUBLIC_ESCREW_BUILT_AT ? formatBuiltAt(process.env.EXPO_PUBLIC_ESCREW_BUILT_AT) : undefined;
  if (!version || version === 'unknown') return null;
  return <Text style={[styles.versionText, { color: palette.muted }]}>PR {version}{builtAt ? ` · ${builtAt}` : ''}</Text>;
}

function formatBuiltAt(iso: string): string | undefined {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return undefined;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ExpiryRow({ expiry, palette }: { expiry: NormalizedExpiry; palette: Palette }) {
  const status = expiryStatus(expiry.date);
  const color = status === 'expired' ? palette.danger : status === 'soon' ? palette.gold : palette.text;
  return <View style={[styles.libraryRow, { borderColor: palette.line }]}>
    <View style={styles.grow}>
      <Text style={[styles.libraryMonth, { color: palette.text }]}>{expiry.code}</Text>
      {expiry.description ? <Text numberOfLines={1} style={[styles.meta, { color: palette.muted }]}>{expiry.description}</Text> : null}
    </View>
    <Text style={[styles.expiryDate, { color }]}>{formatExpiryDate(expiry.date)}</Text>
  </View>;
}

function expiryStatus(date?: string): 'expired' | 'soon' | 'ok' | undefined {
  if (!date) return undefined;
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(target)) return undefined;
  const days = (target - Date.now()) / 86400000;
  return days < 0 ? 'expired' : days <= 60 ? 'soon' : 'ok';
}

function formatExpiryDate(date?: string): string {
  if (!date) return '—';
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  if (!Number.isFinite(parsed.getTime())) return date;
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${String(parsed.getUTCDate()).padStart(2, '0')} ${months[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

function useNow(): number { const [now, setNow] = useState(() => Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); return now; }
function timedDuties(items: RosterDuty[]): FocusDuty[] { return items.flatMap((item) => { const duty = item.duty; if (!duty.date || !duty.sectors.length) return []; const first = duty.sectors[0], last = duty.sectors[duty.sectors.length - 1]; const reportMs = stationLocalDateTimeMs(first.departure, duty.reportDate ?? duty.date, duty.reportTime); const releaseMs = stationLocalDateTimeMs(last.arrival, duty.releaseDate ?? duty.date, duty.releaseTime); return reportMs === undefined || releaseMs === undefined ? [] : [{ ...item, reportMs, releaseMs }]; }).sort((a, b) => a.reportMs - b.reportMs); }
function pickFocusDuty(timed: FocusDuty[], now: number): FocusDuty | undefined { return timed.filter((item) => item.reportMs <= now && item.releaseMs >= now).sort((a, b) => b.reportMs - a.reportMs)[0] ?? timed.find((item) => item.reportMs > now) ?? timed[timed.length - 1]; }
function crewOnDuty(duty: Duty): CrewMember[] { const seen = new Set<string>(); return duty.sectors.flatMap((sector) => sector.crew).filter((member) => { const key = member.id || `${member.name}|${member.position ?? member.role}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function formatCountdown(milliseconds: number): string { const total = Math.max(0, Math.floor(milliseconds / 1000)); const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60; const clock = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`; return days > 0 ? `${days}d ${clock}` : clock; }
function rosterDateMeta(duty: Duty): { label: string; weekend: boolean } { if (!duty.date) return { label: duty.dateLabel, weekend: false }; return eventDateMeta(duty.date); }
function localTodayIso(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function eventDateMeta(value: string): { label: string; weekend: boolean } { const [year, month, day] = value.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day)); if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { label: value, weekend: false }; const weekdayIndex = date.getUTCDay(); const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][weekdayIndex]; const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']; return { label: `${String(day).padStart(2, '0')} ${months[month - 1]} · ${weekday}`, weekend: weekdayIndex === 0 || weekdayIndex === 6 }; }
function routeChain(duty: Duty): string { return [duty.sectors[0]?.departure, ...duty.sectors.map((sector) => sector.arrival)].filter(Boolean).join(' → '); }
function isHomeBaseAirport(code: string, homeBase?: string): boolean { return Boolean(homeBase && code.trim().toUpperCase() === homeBase.trim().toUpperCase()); }
function clockMinutes(value: string | undefined): number | undefined { const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? ''); if (!match) return undefined; const hours = Number(match[1]); const minutes = Number(match[2]); return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined; }
function addIsoDays(value: string, offset: number): string { const [year, month, day] = value.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day + offset)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function arrivalForecastDate(roster: RosterWithNormalized | undefined, duty: Duty, sector: Sector): string | undefined {
  const extra = flightExtra(roster, sector);
  if (extra?.arrivalDate) return extra.arrivalDate;
  const departureDate = extra?.date ?? duty.date;
  if (!departureDate) return duty.releaseDate;
  const departure = clockMinutes(sector.departureTime);
  const arrival = clockMinutes(sector.arrivalTime);
  return departure !== undefined && arrival !== undefined && arrival < departure ? addIsoDays(departureDate, 1) : departureDate;
}
function TimeCell({ label, value, palette }: { label: string; value: string; palette: Palette }) { return <View style={styles.timeCell}><Text numberOfLines={1} style={[styles.timeLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.timeValue, { color: palette.text }]}>{value}</Text></View>; }
function WeatherChip({ code, homeBase, palette, stay, forecastStartDate }: { code: string; homeBase?: string; palette: Palette; stay?: StayInfo; forecastStartDate?: string }) {
  const { weather, status: weatherStatus } = useAirportWeatherState(code);
  const [forecastOpen, setForecastOpen] = useState(false);
  const expandLayover = !isHomeBaseAirport(code, homeBase);
  const { forecast, status: forecastStatus, startDate: resolvedForecastStartDate, retry } = useAirportForecastState(code, 1, forecastStartDate, expandLayover);
  if (!airportCoords(code)) return null;
  const conditions = weather ? weatherIcon(weather.weatherCode, weather.isDay) : undefined;
  const displayDate = resolvedForecastStartDate ?? forecastStartDate;
  const futureTarget = Boolean(displayDate && displayDate > localTodayIso());
  const targetForecast = displayDate ? forecast?.find((day) => day.date === displayDate) : undefined;
  const targetConditions = targetForecast ? weatherIcon(targetForecast.weatherCode, true) : undefined;
  return <>
    <Pressable onPress={(event) => { event.stopPropagation?.(); setForecastOpen(true); }} accessibilityRole="button" accessibilityLabel={`Weather forecast at ${code}`} style={styles.weatherRow}>
      {futureTarget ? <>
        <Text style={styles.weatherIcon}>{targetConditions?.icon ?? '✈︎'}</Text>
        {targetForecast && <Text style={[styles.weatherTemp, { color: palette.text }]}>{targetForecast.tempMax}°/{targetForecast.tempMin}°</Text>}
        <Text numberOfLines={1} style={[styles.weatherMeta, { color: palette.muted }]}>{code} · {displayDate ? forecastDayLabel(displayDate) : ''}{targetConditions ? ` · ${targetConditions.label}` : forecastStatus === 'loading' ? ' · Loading forecast' : forecastStatus === 'offline' ? ' · Offline' : ' · Forecast unavailable'}</Text>
      </> : <>
        <Text style={styles.weatherIcon}>{conditions?.icon ?? '✈︎'}</Text>
        {weather ? <>
          <Text style={[styles.weatherTemp, { color: palette.text }]}>{weather.temp}°</Text>
          <Text numberOfLines={1} style={[styles.weatherMeta, { color: palette.muted }]}>{code} · {conditions!.label} · {windDirectionLabel(weather.windDeg)} {weather.windSpeed}kt · {weather.pressure}hPa</Text>
        </> : (
          <Text numberOfLines={1} style={[styles.weatherMeta, { color: palette.muted }]}>{code} · {weatherStatus === 'loading' ? 'Loading weather' : weatherStatus === 'offline' ? 'Offline' : 'Weather unavailable'}</Text>
        )}
      </>}
    </Pressable>
    <IOSDialog visible={forecastOpen} onClose={() => setForecastOpen(false)} style={[styles.stayPopup, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
      <Text style={[styles.label, { color: palette.muted }]}>FORECAST · {code}{displayDate ? ` · FROM ${forecastDayLabel(displayDate)}` : ''}</Text>
      {stay?.rest ? <Text style={[styles.stayPopupRest, { color: palette.text }]}>{stay.rest}</Text> : null}
      {forecast && forecast.length > 0
        ? <View style={styles.stayForecastList}>
            {forecast.map((day) => {
              const dayConditions = weatherIcon(day.weatherCode, true);
              return <View key={day.date} style={[styles.stayForecastRow, { borderColor: palette.line }]}>
                <Text style={[styles.stayForecastDay, { color: palette.muted }]}>{forecastDayLabel(day.date)}</Text>
                <View style={styles.stayForecastConditions}>
                  <Text style={[styles.stayForecastIcon, { flex: 0 }]}>{dayConditions.icon}</Text>
                  <Text numberOfLines={1} style={[styles.meta, styles.stayForecastDescription, { color: palette.muted }]}>{dayConditions.label}</Text>
                </View>
                <Text style={[styles.stayForecastTemp, { color: palette.text }]}>{day.tempMax}° / {day.tempMin}°</Text>
              </View>;
            })}
          </View>
        : forecastStatus === 'loading'
          ? <View style={styles.forecastStateRow}><ActivityIndicator size="small" /><Text style={[styles.meta, { color: palette.muted }]}>Loading forecast…</Text></View>
          : forecastStatus === 'offline'
            ? <Text style={[styles.meta, { color: palette.muted, marginTop: 6 }]}>Forecast unavailable while offline.</Text>
            : <Pressable onPress={retry} accessibilityRole="button" style={styles.forecastRetry}><Text style={[styles.meta, { color: palette.accent }]}>Forecast unavailable. Tap to retry.</Text></Pressable>}
    </IOSDialog>
  </>;
}
function forecastDayLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][date.getUTCDay()];
  return `${weekday} ${day}`;
}
function CrewRow({ member, palette }: { member: CrewMember; palette: Palette }) { return <View style={[styles.crewRow, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}><Text style={[styles.avatarText, { color: palette.accent }]}>{member.name?.trim()?.[0]?.toUpperCase() ?? '•'}</Text></View><View style={styles.grow}><Text numberOfLines={1} style={[styles.crewName, { color: palette.text }]}>{member.name}</Text><Text style={[styles.meta, { color: palette.muted }]}>{member.position ?? member.role}</Text></View></View>; }
function Summary({ title, value, detail, palette }: { title: string; value: string; detail: string; palette: Palette }) { const night = title.includes('NIGHT'); return <View style={[styles.summary, styles.depthSurface, { backgroundColor: palette.surface, borderColor: palette.line }]}><View style={[styles.summaryIconOrb, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.summaryIcon, { color: palette.accent }]}>{night ? '☾' : '▮▮▮'}</Text></View><View style={styles.summaryText}><Text style={[styles.label, { color: palette.muted }]}>{title}</Text><Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text><Text numberOfLines={1} style={[styles.meta, { color: palette.muted }]}>{detail}</Text></View></View>; }
function PrimaryButton({ title, onPress, loading, palette }: { title: string; onPress: () => void; loading: boolean; palette: Palette }) { return <Pressable onPress={onPress} disabled={loading} style={[styles.primaryButton, styles.depthSurface, { backgroundColor: palette.accent }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{title}</Text>}</Pressable>; }
function operatingCount(roster: ParsedAirAstanaRoster) { return roster.sectors.filter((sector) => !sector.deadhead).length; }

const styles = StyleSheet.create({
  safe:{flex:1}, app:{flex:1,width:'100%',maxWidth:620,alignSelf:'center',paddingHorizontal:16,paddingTop:8},
  header:{height:78,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, brand:{fontSize:30,lineHeight:34,fontWeight:'800',letterSpacing:-1.1}, brandSubtitle:{fontSize:8.5,lineHeight:12,fontWeight:'700',letterSpacing:2.2,marginTop:2},
  modeButton:{width:68,height:42,borderRadius:21,borderWidth:1,alignItems:'center',justifyContent:'center'}, aimsGlyph:{fontSize:12,lineHeight:15,fontWeight:'800',letterSpacing:.4},
  aimsStatus:{minHeight:66,borderWidth:1,borderRadius:22,padding:12,marginBottom:8,flexDirection:'row',alignItems:'center',gap:10}, aimsStatusIcon:{width:28,height:28,alignItems:'center',justifyContent:'center'}, aimsStatusGlyph:{fontSize:18,fontWeight:'800'}, aimsStatusTitle:{fontSize:14,lineHeight:18,fontWeight:'700'}, statusDismiss:{width:24,height:34,alignItems:'center',justifyContent:'center'}, statusDismissText:{fontSize:22,lineHeight:24},
  viewport:{flex:1,minHeight:0}, tabPane:{position:'absolute',top:0,left:0,right:0,bottom:0}, tabPaneHidden:{opacity:0}, screen:{flex:1,paddingTop:8,gap:12}, grow:{flex:1,minWidth:0}, sectionTitle:{fontSize:28,lineHeight:34,fontWeight:'750',letterSpacing:-.8}, intro:{fontSize:15,lineHeight:22}, label:{fontSize:10.5,fontWeight:'800',letterSpacing:1.05}, meta:{fontSize:13,lineHeight:18},
  dutyHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, heroCard:{borderWidth:1,borderRadius:32,padding:20,overflow:'hidden'}, heroRouteRow:{flexDirection:'row',alignItems:'center',gap:13}, planeOrb:{width:60,height:60,borderRadius:30,borderWidth:1,alignItems:'center',justifyContent:'center'}, planeGlyph:{fontSize:29,lineHeight:32,fontWeight:'800'}, heroRouteBlock:{flex:1,minWidth:0}, heroRoute:{fontSize:27,lineHeight:31,fontWeight:'800',letterSpacing:-.8},
  flightBadgeRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:7}, flightBadge:{height:32,borderWidth:1,borderRadius:16,paddingHorizontal:12,alignItems:'center',justifyContent:'center'}, flightBadgeText:{fontSize:12,fontWeight:'800',letterSpacing:.3,...MONO_FONT},
  heroCountdownRow:{alignItems:'flex-end',marginTop:12}, countdownPill:{minWidth:150,borderWidth:1,borderRadius:22,paddingHorizontal:16,paddingVertical:8,alignItems:'center'}, countdown:{fontSize:19,fontWeight:'800',fontVariant:['tabular-nums'],...MONO_FONT}, countdownLabel:{fontSize:9,fontWeight:'800',letterSpacing:1.1,marginTop:1},
  timeDivider:{height:StyleSheet.hairlineWidth,marginVertical:12}, timeRow:{flexDirection:'row',alignItems:'flex-start',gap:8}, timeCell:{flex:1,minWidth:0}, timeLabel:{fontSize:9.5,lineHeight:12,fontWeight:'800',letterSpacing:.45}, timeValue:{fontSize:18,lineHeight:22,fontWeight:'750',marginTop:3,fontVariant:['tabular-nums'],...MONO_FONT}, heroFooterDivider:{marginTop:13,marginBottom:9}, heroFooterRow:{flexDirection:'row',alignItems:'center',gap:10}, heroWeatherWrap:{flex:1,minWidth:0}, heroFoot:{fontSize:11.5,fontWeight:'700',textAlign:'right'}, weatherRow:{flexDirection:'row',alignItems:'center',gap:6,marginTop:0,minHeight:28}, weatherIcon:{fontSize:17}, weatherTemp:{fontSize:14,fontWeight:'800',...MONO_FONT}, weatherMeta:{flex:1,fontSize:11.5,fontWeight:'650'},
  summaryRow:{flexDirection:'row',gap:12}, summary:{flex:1,minHeight:124,borderWidth:1,borderRadius:26,padding:16,alignItems:'flex-start'}, summaryIconOrb:{width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:10}, summaryIcon:{fontSize:18,fontWeight:'800',letterSpacing:-2}, summaryText:{flex:1,minWidth:0,width:'100%'}, summaryValue:{fontSize:28,fontWeight:'750',marginTop:5,fontVariant:['tabular-nums'],...MONO_FONT}, ytdMeta:{textAlign:'center',paddingHorizontal:4}, upNext:{flex:1,minHeight:0,gap:7,...Platform.select({web:{maxHeight:'34vh' as any},default:{}})}, upNextList:{flex:1}, crewCardList:{gap:7,paddingTop:2,paddingBottom:4},
  primaryButton:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center'}, actionText:{color:'#fff',fontWeight:'700'}, titleRow:{flexDirection:'row',alignItems:'center',gap:8}, titleActions:{flexDirection:'row',gap:7}, compactButton:{height:40,minWidth:74,borderWidth:1,borderRadius:16,alignItems:'center',justifyContent:'center',paddingHorizontal:11}, compactText:{fontWeight:'700',fontSize:12}, monthNav:{height:40,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, monthNavText:{fontSize:12,fontWeight:'600'}, monthSwipeWrap:{flex:1,minHeight:0},
  emptyCard:{borderWidth:1,borderRadius:24,padding:16}, innerWindow:{flex:1,minHeight:0,borderWidth:1,borderRadius:26,overflow:'hidden'}, listContent:{padding:9,gap:8,paddingBottom:20}, rosterCard:{borderWidth:1,borderRadius:22,padding:14}, rosterCardToday:{borderWidth:1.5}, flightCardTop:{flexDirection:'row',justifyContent:'space-between'}, flightNumber:{fontSize:11,fontWeight:'700'}, rosterRoute:{fontSize:20,fontWeight:'750',marginTop:4}, rosterEventTitle:{fontSize:18,lineHeight:22,fontWeight:'700',marginTop:4},
  infoCard:{borderWidth:1,borderRadius:24,padding:16,gap:4}, cardTitle:{fontSize:17,lineHeight:22,fontWeight:'750'}, libraryCard:{borderWidth:1,borderRadius:24,padding:16,minHeight:88,maxHeight:190}, libraryList:{marginTop:5}, libraryRow:{minHeight:56,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:StyleSheet.hairlineWidth}, libraryMonth:{fontSize:14,fontWeight:'700'}, deleteRosterButton:{minWidth:58,height:34,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:8}, deleteRosterText:{fontSize:11,fontWeight:'700'}, expiryDate:{fontSize:12,fontWeight:'700',fontVariant:['tabular-nums'],...MONO_FONT},
  dangerButton:{height:48,borderWidth:1,borderRadius:17,alignItems:'center',justifyContent:'center'}, dangerText:{fontWeight:'700',fontSize:14}, backupRow:{flexDirection:'row',gap:8,marginTop:10}, expiryHeaderRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, expiryChevron:{fontSize:20,fontWeight:'700'}, expirySheet:{width:'100%',maxWidth:620,maxHeight:'78%',alignSelf:'center',borderTopWidth:1,borderTopLeftRadius:30,borderTopRightRadius:30,paddingHorizontal:18,paddingBottom:12,overflow:'hidden',...WEB_GLASS}, expirySheetList:{marginTop:10}, expirySheetListContent:{paddingBottom:12}, versionText:{fontSize:10,fontWeight:'600',letterSpacing:.2,opacity:.5,textAlign:'center',marginTop:2}, confirmDialog:{width:'88%',maxWidth:360,borderWidth:1,borderRadius:26,padding:18,...WEB_GLASS}, confirmActions:{flexDirection:'row',gap:10,marginTop:16}, stayPopup:{width:'88%',maxWidth:340,borderWidth:1,borderRadius:26,padding:18,...WEB_GLASS}, stayPopupRest:{fontSize:28,fontWeight:'800',marginTop:6,fontVariant:['tabular-nums'],...MONO_FONT}, stayForecastList:{marginTop:14,gap:2}, stayForecastRow:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:8,borderTopWidth:StyleSheet.hairlineWidth}, stayForecastDay:{width:34,fontSize:12,fontWeight:'700'}, stayForecastConditions:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6}, stayForecastDescription:{flex:1,minWidth:0,fontSize:12}, stayForecastIcon:{fontSize:18,flex:1}, stayForecastTemp:{fontSize:14,fontWeight:'700',fontVariant:['tabular-nums'],...MONO_FONT}, forecastStateRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8}, forecastRetry:{marginTop:6,paddingVertical:4}, confirmCancel:{flex:1,height:44,borderWidth:1,borderRadius:14,alignItems:'center',justifyContent:'center'}, confirmErase:{flex:1,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'}, moreContent:{gap:12,paddingBottom:26},
  depthSurface:{shadowColor:'#0A2348',shadowOffset:{width:0,height:8},shadowOpacity:.10,shadowRadius:22,elevation:5,...WEB_GLASS}, tabBar:{height:96,marginTop:8,marginBottom:8,borderWidth:1,borderRadius:34,flexDirection:'row',padding:5,...WEB_TAB_GLASS}, tabSelection:{position:'absolute',left:5,top:5,bottom:5,borderRadius:29,shadowColor:'#0A2348',shadowOffset:{width:0,height:5},shadowOpacity:.09,shadowRadius:14,elevation:2}, tabItem:{flex:1,zIndex:1,alignItems:'center',justifyContent:'center',gap:4}, tabIconWrap:{minWidth:40,height:31,borderRadius:16,alignItems:'center',justifyContent:'center'}, tabIcon:{textAlign:'center'}, tabText:{fontSize:11.5,fontWeight:'700'},
  flightSheet:{width:'100%',maxWidth:620,maxHeight:'78%',alignSelf:'center',borderTopWidth:1,borderTopLeftRadius:30,borderTopRightRadius:30,paddingHorizontal:18,paddingBottom:12,overflow:'hidden',...WEB_GLASS}, flightSheetContent:{minHeight:0,flexShrink:1}, sheetRoute:{fontSize:28,lineHeight:33,fontWeight:'750',marginTop:5}, swipeHint:{fontSize:10,marginTop:7}, flyingWith:{fontSize:11,fontWeight:'700',letterSpacing:.45,opacity:.82,marginTop:12,marginBottom:7}, crewScroll:{minHeight:0,flexShrink:1,flex:1,...Platform.select({web:{maxHeight:'calc(78vh - 46px)' as any},default:{}})}, crewList:{paddingBottom:12}, crewRow:{minHeight:64,flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:22,paddingHorizontal:14}, avatar:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',marginRight:12}, avatarText:{fontSize:13,fontWeight:'800'}, crewName:{fontSize:14,fontWeight:'650'},
  flightFacts:{flexDirection:'row',gap:6,borderTopWidth:StyleSheet.hairlineWidth,borderBottomWidth:StyleSheet.hairlineWidth,paddingVertical:10,marginTop:10}, flightFact:{flex:1,minWidth:0}, flightFactLabel:{fontSize:9,lineHeight:12,fontWeight:'700',letterSpacing:.45}, flightFactValue:{fontSize:16,lineHeight:20,fontWeight:'700',fontVariant:['tabular-nums'],marginTop:2,...MONO_FONT}, stayCard:{borderWidth:1,borderRadius:20,padding:13,marginTop:12}, stayTitle:{fontSize:16,lineHeight:21,fontWeight:'700',marginTop:4}, stayMeta:{fontSize:11,lineHeight:15,marginTop:4},
});
