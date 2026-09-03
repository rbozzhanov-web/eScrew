import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IOSSheet } from './IOSOverlay';
import { SwipeSurface } from './SwipeSurface';
import { exportRosterCalendar } from '@/src/domain/calendar';
import { formatMinutes, rosterMonthLabel, rosterToDuties } from '@/src/domain/rosterView';
import { stationLocalDateTimeMs } from '@/src/domain/stationTime';
import type { Duty, Sector } from '@/src/domain/types';
import { pickAndParseRoster } from '@/src/import/pickRoster';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
import { clearStoredRosters, loadStoredRosters, removeStoredRoster, upsertStoredRoster } from '@/src/storage/rosterStorage';

type Tab = 'Home' | 'Roster' | 'More';
const TABS: Tab[] = ['Home', 'Roster', 'More'];
const ICONS: Record<Tab, string> = { Home: '⌂', Roster: '✈︎', More: '•••' };
type Palette = { background:string; surface:string; surfaceStrong:string; text:string; muted:string; line:string; accent:string; accentSoft:string; gold:string; danger:string; weekend:string };
type RosterDuty = { roster: ParsedAirAstanaRoster; duty: Duty };
type FocusDuty = RosterDuty & { reportMs: number; releaseMs: number };
type FlightRow = { duty: Duty; sector: Sector };
const WEB_GLASS = Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)' } as any) : undefined;

export default function MainScreen() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;
  const palette = useMemo<Palette>(() => dark ? {
    background:'#081519', surface:'rgba(15,34,39,.78)', surfaceStrong:'rgba(21,44,50,.88)', text:'#F3FAFA', muted:'#A8BABC', line:'rgba(174,214,216,.14)', accent:'#35B8C0', accentSoft:'rgba(53,184,192,.16)', gold:'#D4AE62', danger:'#E08383', weekend:'#DCA17B',
  } : {
    background:'#F2F6F6', surface:'rgba(255,255,255,.74)', surfaceStrong:'rgba(255,255,255,.92)', text:'#102326', muted:'#60777A', line:'rgba(16,74,79,.11)', accent:'#007F86', accentSoft:'#DFF1F2', gold:'#A67A24', danger:'#B84B52', weekend:'#9B613B',
  }, [dark]);

  const [tab, setTab] = useState<Tab>('Home');
  const [rosters, setRosters] = useState<ParsedAirAstanaRoster[]>([]);
  const [activeMonth, setActiveMonth] = useState<string>();
  const [selectedFlight, setSelectedFlight] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();

  useEffect(() => {
    const stored = loadStoredRosters();
    setRosters(stored);
    setActiveMonth(stored.at(-1)?.period.start);
  }, []);

  const roster = rosters.find((item) => item.period.start === activeMonth) ?? rosters.at(-1);
  const duties = useMemo(() => roster ? rosterToDuties(roster) : [], [roster]);
  const allDuties = useMemo<RosterDuty[]>(() => rosters.flatMap((item) => rosterToDuties(item).map((duty) => ({ roster: item, duty }))), [rosters]);
  const selectedSector = duties.flatMap((duty) => duty.sectors).find((sector) => sector.id === selectedFlight);

  const changeTab = (direction: -1 | 1) => {
    const next = TABS[TABS.indexOf(tab) + direction];
    if (!next) return;
    setSelectedFlight(undefined);
    setTab(next);
  };

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

  const deleteRoster = (periodStart: string) => {
    const next = removeStoredRoster(periodStart);
    setRosters(next);
    setActiveMonth((current) => current && current !== periodStart && next.some((item) => item.period.start === current) ? current : next.at(-1)?.period.start);
    setSelectedFlight(undefined);
  };

  const eraseAll = () => {
    clearStoredRosters();
    setRosters([]);
    setActiveMonth(undefined);
    setSelectedFlight(undefined);
    setTab('Home');
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={desktop ? ['bottom'] : ['top', 'bottom']}>
    <View style={styles.app}>
      <View style={styles.header}>
        <View><Text style={[styles.brand, { color: palette.text }]}>eScrew</Text><Text style={[styles.kicker, { color: palette.muted }]}>CREW SCHEDULE</Text></View>
        <View style={[styles.brandMark, { borderColor: palette.accent }]}><View style={[styles.brandMarkCore, { backgroundColor: palette.gold }]} /></View>
      </View>

      <SwipeSurface style={styles.viewport} onSwipeLeft={tab === 'More' ? undefined : () => changeTab(1)} onSwipeRight={tab === 'Home' ? undefined : () => changeTab(-1)}>
        {tab === 'Home' && <Home allDuties={allDuties} fallbackRoster={roster} rosters={rosters} palette={palette} onImport={importRoster} importing={importing} />}
        {tab === 'Roster' && <RosterScreen roster={roster} rosters={rosters} duties={duties} selectedSector={selectedSector} palette={palette} importing={importing} error={importError} onImport={importRoster} onSelect={setSelectedFlight} onMonth={setActiveMonth} />}
        {tab === 'More' && <MoreScreen rosters={rosters} palette={palette} onDeleteRoster={deleteRoster} onErase={eraseAll} />}
      </SwipeSurface>

      <View style={[styles.tabBar, WEB_GLASS, { backgroundColor: palette.surface, borderColor: palette.line }]}>
        {TABS.map((item) => {
          const active = item === tab;
          return <Pressable key={item} onPress={() => { setSelectedFlight(undefined); setTab(item); }} style={[styles.tabItem, active && { backgroundColor: palette.surfaceStrong }]}>
            <Text style={[styles.tabIcon, { color: active ? palette.accent : palette.muted }]}>{ICONS[item]}</Text>
            <Text style={[styles.tabText, { color: active ? palette.text : palette.muted }]}>{item}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </SafeAreaView>;
}

function Home({ allDuties, fallbackRoster, rosters, palette, onImport, importing }: { allDuties: RosterDuty[]; fallbackRoster?: ParsedAirAstanaRoster; rosters: ParsedAirAstanaRoster[]; palette: Palette; onImport: () => void; importing: boolean }) {
  const now = useNow();
  const timeline = useMemo(() => timedDuties(allDuties), [allDuties]);
  const focus = useMemo(() => pickFocusDuty(timeline, now), [timeline, now]);
  const roster = focus?.roster ?? fallbackRoster;
  const duty = focus?.duty;

  if (!roster || !duty) return <View style={styles.screen}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>Your roster, simplified.</Text>
    <Text style={[styles.intro, { color: palette.muted }]}>Import an Air Astana Personal Crew Schedule Report.</Text>
    <PrimaryButton title="Import roster PDF" onPress={onImport} loading={importing} palette={palette} />
  </View>;

  const first = duty.sectors[0];
  const last = duty.sectors[duty.sectors.length - 1];
  const isUpcoming = focus ? focus.reportMs > now : false;
  const isActive = focus ? focus.reportMs <= now && focus.releaseMs >= now : false;
  const countdown = focus ? (isUpcoming ? formatCountdown(focus.reportMs - now) : isActive ? formatCountdown(now - focus.reportMs) : undefined) : undefined;
  const previous = previousDuties(timeline, focus, now, 6);
  const block = roster.totals.blockMinutes;
  const night = roster.totals.nightMinutes;
  const year = roster.period.start.slice(0, 4);
  const yearRosters = rosters.filter((item) => item.period.start.startsWith(`${year}-`));
  const ytdBlock = yearRosters.reduce((total, item) => total + (item.totals.blockMinutes ?? 0), 0);
  const ytdNight = yearRosters.reduce((total, item) => total + (item.totals.nightMinutes ?? 0), 0);

  return <View style={styles.screen}>
    <View style={styles.rowBetween}><Text style={[styles.label, { color: isActive ? palette.gold : palette.accent }]}>{isUpcoming ? 'NEXT DUTY' : isActive ? 'ON DUTY NOW' : 'LATEST DUTY'}</Text><Text style={[styles.label, { color: palette.muted }]}>{duty.dateLabel}</Text></View>
    <View style={[styles.heroCard, WEB_GLASS, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.heroRoute, { color: palette.text }]}>{routeChain(duty)}</Text>
      <View style={styles.heroMeta}><Text style={[styles.meta, { color: palette.muted }]}>{duty.sectors.map((sector) => sector.flightNumber).join(' · ')}</Text>{countdown && <View style={[styles.countdownPill, { backgroundColor: palette.accentSoft }]}><Text style={[styles.countdown, { color: palette.accent }]}>{countdown}</Text><Text style={[styles.countdownLabel, { color: palette.accent }]}>{isUpcoming ? 'TO REPORT' : 'ON DUTY'}</Text></View>}</View>
      <View style={[styles.divider, { backgroundColor: palette.line }]} />
      <View style={styles.timeRow}><TimeCell label="REPORT" value={duty.reportTime} palette={palette} /><TimeCell label={`DEP · ${first.departure}`} value={first.departureTime} palette={palette} /><TimeCell label={`ARR · ${last.arrival}`} value={last.arrivalTime} palette={palette} /><TimeCell label="RELEASE" value={duty.releaseTime} palette={palette} /></View>
    </View>

    <Text style={[styles.label, { color: palette.muted }]}>{rosterMonthLabel(roster)}</Text>
    <View style={styles.summaryRow}><Summary title="BLOCK HOURS" value={formatMinutes(block)} detail={`${roster.sectors.filter((sector) => !sector.deadhead).length} sectors`} palette={palette} /><Summary title="NIGHT HOURS" value={formatMinutes(night)} detail="reported by roster" palette={palette} /></View>
    {yearRosters.length > 1 && <Text style={[styles.meta, { color: palette.muted }]}>{year} to date · {formatMinutes(ytdBlock)} block · {formatMinutes(ytdNight)} night · {yearRosters.length} months imported</Text>}

    {previous.length > 0 && <View style={styles.previousWrap}><Text style={[styles.label, { color: palette.muted }]}>PREVIOUS FLIGHTS</Text><FlatList data={previous} keyExtractor={(item) => item.duty.id} showsVerticalScrollIndicator={false} renderItem={({ item }) => <View style={[styles.previousRow, { borderColor: palette.line }]}><Text style={[styles.previousDate, { color: palette.muted }]}>{item.duty.dateLabel}</Text><Text numberOfLines={1} style={[styles.previousRoute, { color: palette.text }]}>{routeChain(item.duty)}</Text><View style={styles.previousTime}><Text style={[styles.tinyLabel, { color: palette.muted }]}>RELEASED</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.duty.releaseTime}</Text></View></View>} /></View>}
  </View>;
}

function RosterScreen({ roster, rosters, duties, selectedSector, palette, importing, error, onImport, onSelect, onMonth }: { roster?: ParsedAirAstanaRoster; rosters: ParsedAirAstanaRoster[]; duties: Duty[]; selectedSector?: Sector; palette: Palette; importing: boolean; error?: string; onImport: () => void; onSelect: (id?: string) => void; onMonth: (period: string) => void }) {
  const [calendarState, setCalendarState] = useState<'idle'|'working'|'done'|'error'>('idle');
  const flights = useMemo<FlightRow[]>(() => duties.flatMap((duty) => duty.sectors.map((sector) => ({ duty, sector }))), [duties]);
  const selectedIndex = selectedSector ? flights.findIndex(({ sector }) => sector.id === selectedSector.id) : -1;
  const selectedRow = selectedIndex >= 0 ? flights[selectedIndex] : undefined;

  useEffect(() => setCalendarState('idle'), [roster?.period.start]);
  const exportCalendar = async () => {
    if (!roster || calendarState === 'working') return;
    setCalendarState('working');
    try { await exportRosterCalendar(roster); setCalendarState('done'); }
    catch (exportError) { setCalendarState(exportError instanceof Error && /cancel/i.test(exportError.message) ? 'idle' : 'error'); }
  };

  return <View style={styles.screen}>
    <View style={styles.titleRow}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>{roster ? rosterMonthLabel(roster) : 'Roster'}</Text><Text style={[styles.meta, { color: palette.muted }]}>{roster?.subject ? `${roster.subject.base ?? '—'} · ${roster.subject.rank ?? 'crew'}` : 'Personal schedule'}</Text></View><View style={styles.actionsRow}>{roster && <Pressable onPress={exportCalendar} style={[styles.compactButton, { backgroundColor: palette.surface, borderColor: palette.line }]}>{calendarState === 'working' ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.text }]}>{calendarState === 'done' ? 'Added' : calendarState === 'error' ? 'Retry' : 'Calendar'}</Text>}</Pressable>}<Pressable onPress={onImport} style={[styles.compactButton, { backgroundColor: palette.accentSoft, borderColor: palette.accentSoft }]}>{importing ? <ActivityIndicator size="small" /> : <Text style={[styles.compactText, { color: palette.accent }]}>{roster ? 'Add PDF' : 'Import'}</Text>}</Pressable></View></View>
    {error && <Text style={{ color: palette.danger }}>{error}</Text>}
    {rosters.length > 1 && <View style={styles.months}>{rosters.map((item) => <Pressable key={item.period.start} onPress={() => onMonth(item.period.start)} style={[styles.monthPill, { backgroundColor: item.period.start === roster?.period.start ? palette.accentSoft : palette.surface }]}><Text style={[styles.meta, { color: item.period.start === roster?.period.start ? palette.accent : palette.muted }]}>{rosterMonthLabel(item).split(' ')[0]}</Text></Pressable>)}</View>}
    {!roster ? <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.meta, { color: palette.muted }]}>Import a roster PDF to begin.</Text></View> : <View style={[styles.listWindow, WEB_GLASS, { backgroundColor: palette.surface, borderColor: palette.line }]}><FlatList data={flights} keyExtractor={({ sector }) => sector.id} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} renderItem={({ item }) => <Pressable onPress={() => onSelect(item.sector.id)} style={[styles.flightCard, { backgroundColor: selectedSector?.id === item.sector.id ? palette.accentSoft : palette.surfaceStrong, borderColor: palette.line }]}><View style={styles.rowBetween}><Text style={[styles.label, { color: isWeekend(item.duty.date) ? palette.weekend : palette.muted }]}>{item.duty.dateLabel}</Text><Text style={[styles.label, { color: palette.muted }]}>{item.sector.flightNumber}{item.sector.deadhead ? ' · DHC' : ''}</Text></View><Text style={[styles.routeText, { color: palette.text }]}>{item.sector.departure} → {item.sector.arrival}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.sector.departureTime} – {item.sector.arrivalTime} · Report {item.duty.reportTime}</Text></Pressable>} /></View>}
    {selectedRow && <FlightDetail row={selectedRow} palette={palette} onClose={() => onSelect(undefined)} onPrevious={selectedIndex > 0 ? () => onSelect(flights[selectedIndex - 1].sector.id) : undefined} onNext={selectedIndex < flights.length - 1 ? () => onSelect(flights[selectedIndex + 1].sector.id) : undefined} />}
  </View>;
}

function FlightDetail({ row, palette, onClose, onPrevious, onNext }: { row: FlightRow; palette: Palette; onClose: () => void; onPrevious?: () => void; onNext?: () => void }) {
  return <IOSSheet visible onClose={onClose} handleColor={palette.line} style={[styles.flightSheet, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}>
    <SwipeSurface style={styles.flightSheetContent} onSwipeLeft={onNext} onSwipeRight={onPrevious} threshold={44}>
      <Text style={[styles.label, { color: palette.muted }]}>{row.duty.dateLabel} · {row.sector.flightNumber}{row.sector.deadhead ? ' · DHC' : ''}</Text>
      <Text style={[styles.sheetRoute, { color: palette.text }]}>{row.sector.departure} → {row.sector.arrival}</Text>
      <Text style={[styles.meta, { color: palette.muted }]}>{row.sector.departureTime} – {row.sector.arrivalTime}</Text>
      <Text style={[styles.swipeHint, { color: palette.muted }]}>{onPrevious ? '‹ ' : ''}swipe flight{onNext ? ' ›' : ''} · swipe down to close</Text>
      <Text style={[styles.crewHeading, { color: palette.accent }]}>Flying with · {row.sector.crew.length}</Text>
      {row.sector.crew.length > 0 ? <FlatList data={row.sector.crew} keyExtractor={(member) => member.id} style={styles.crewList} showsVerticalScrollIndicator={false} renderItem={({ item }) => <View style={styles.crewRow}><View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}><Text style={[styles.avatarText, { color: palette.accent }]}>{item.name[0]}</Text></View><View style={styles.grow}><Text style={[styles.crewName, { color: palette.text }]}>{item.name}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.position ?? item.role}</Text></View></View>} /> : <Text style={[styles.meta, { color: palette.muted, marginTop: 12 }]}>Crew is not listed for this flight in the imported report.</Text>}
    </SwipeSurface>
  </IOSSheet>;
}

function MoreScreen({ rosters, palette, onDeleteRoster, onErase }: { rosters: ParsedAirAstanaRoster[]; palette: Palette; onDeleteRoster: (periodStart: string) => void; onErase: () => void }) {
  return <View style={styles.screen}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>More</Text>
    <View style={[styles.infoCard, WEB_GLASS, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Imported rosters</Text>{rosters.length ? rosters.map((item) => <View key={item.period.start} style={[styles.libraryRow, { borderColor: palette.line }]}><View style={styles.grow}><Text style={[styles.cardTitle, { color: palette.text }]}>{rosterMonthLabel(item)}</Text><Text style={[styles.meta, { color: palette.muted }]}>{item.subject?.base ?? 'Roster'} · parsed locally</Text></View><Pressable onPress={() => onDeleteRoster(item.period.start)}><Text style={{ color: palette.danger, fontWeight: '700' }}>Delete</Text></Pressable></View>) : <Text style={[styles.meta, { color: palette.muted }]}>No months imported</Text>}</View>
    <View style={[styles.infoCard, WEB_GLASS, { backgroundColor: palette.surfaceStrong, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Privacy</Text><Text style={[styles.meta, { color: palette.muted }]}>Roster PDFs are parsed locally. The source PDF bytes are not stored by eScrew.</Text></View>
    {rosters.length > 0 && <Pressable onPress={onErase} style={[styles.eraseButton, { borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Erase local roster data</Text></Pressable>}
  </View>;
}

function useNow(): number { const [now, setNow] = useState(() => Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); return now; }
function timedDuties(items: RosterDuty[]): FocusDuty[] { return items.flatMap((item) => { const duty = item.duty; if (!duty.date || !duty.sectors.length) return []; const first = duty.sectors[0], last = duty.sectors[duty.sectors.length - 1]; const reportMs = stationLocalDateTimeMs(first.departure, duty.reportDate ?? duty.date, duty.reportTime); const releaseMs = stationLocalDateTimeMs(last.arrival, duty.releaseDate ?? duty.date, duty.releaseTime); return reportMs === undefined || releaseMs === undefined ? [] : [{ ...item, reportMs, releaseMs }]; }).sort((a, b) => a.reportMs - b.reportMs); }
function pickFocusDuty(timed: FocusDuty[], now: number): FocusDuty | undefined { return timed.filter((item) => item.reportMs <= now && item.releaseMs >= now).sort((a, b) => b.reportMs - a.reportMs)[0] ?? timed.find((item) => item.reportMs > now) ?? timed[timed.length - 1]; }
function previousDuties(timed: FocusDuty[], focus: FocusDuty | undefined, now: number, count: number): FocusDuty[] { return timed.filter((item) => item.releaseMs < now && item.duty.id !== focus?.duty.id).sort((a, b) => b.releaseMs - a.releaseMs).slice(0, count); }
function formatCountdown(milliseconds: number): string { const total = Math.max(0, Math.floor(milliseconds / 1000)); const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60; const clock = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`; return days > 0 ? `${days}d ${clock}` : clock; }
function routeChain(duty: Duty): string { return [duty.sectors[0]?.departure, ...duty.sectors.map((sector) => sector.arrival)].filter(Boolean).join(' → '); }
function isWeekend(date?: string): boolean { if (!date) return false; const [year, month, day] = date.split('-').map(Number); const value = new Date(Date.UTC(year, month - 1, day)); if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return false; const weekday = value.getUTCDay(); return weekday === 0 || weekday === 6; }
function TimeCell({ label, value, palette }: { label: string; value: string; palette: Palette }) { return <View style={styles.timeCell}><Text numberOfLines={1} style={[styles.timeLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.timeValue, { color: palette.text }]}>{value}</Text></View>; }
function Summary({ title, value, detail, palette }: { title: string; value: string; detail: string; palette: Palette }) { return <View style={[styles.summary, WEB_GLASS, { backgroundColor: palette.surface, borderColor: palette.line }]}><Text style={[styles.label, { color: palette.muted }]}>{title}</Text><Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text><Text style={[styles.meta, { color: palette.muted }]}>{detail}</Text></View>; }
function PrimaryButton({ title, onPress, loading, palette }: { title: string; onPress: () => void; loading: boolean; palette: Palette }) { return <Pressable onPress={onPress} disabled={loading} style={[styles.primaryButton, { backgroundColor: palette.accent }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}</Pressable>; }

const styles = StyleSheet.create({
  safe:{flex:1}, app:{flex:1,width:'100%',maxWidth:620,alignSelf:'center',paddingHorizontal:16}, header:{height:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, brand:{fontSize:28,fontWeight:'800',letterSpacing:-1}, kicker:{fontSize:10,fontWeight:'800',letterSpacing:1.4}, brandMark:{width:34,height:34,borderRadius:17,borderWidth:2,alignItems:'center',justifyContent:'center'}, brandMarkCore:{width:9,height:9,borderRadius:5}, viewport:{flex:1,minHeight:0}, screen:{flex:1,paddingTop:8,gap:12}, grow:{flex:1,minWidth:0}, sectionTitle:{fontSize:27,lineHeight:31,fontWeight:'700',letterSpacing:-.8}, intro:{fontSize:15,lineHeight:22}, label:{fontSize:11,fontWeight:'700',letterSpacing:.8}, meta:{fontSize:13,lineHeight:18}, tinyLabel:{fontSize:8,fontWeight:'700',letterSpacing:.45}, rowBetween:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  heroCard:{borderWidth:1,borderRadius:26,padding:18,shadowColor:'#000',shadowOpacity:.09,shadowRadius:22,shadowOffset:{width:0,height:10}}, heroRoute:{fontSize:35,lineHeight:41,fontWeight:'700',letterSpacing:-1}, heroMeta:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:4}, countdownPill:{borderRadius:15,paddingHorizontal:12,paddingVertical:6,alignItems:'center'}, countdown:{fontSize:18,fontWeight:'800',fontVariant:['tabular-nums']}, countdownLabel:{fontSize:9,fontWeight:'700',letterSpacing:.7}, divider:{height:StyleSheet.hairlineWidth,marginVertical:14}, timeRow:{flexDirection:'row',gap:5}, timeCell:{flex:1,minWidth:0}, timeLabel:{fontSize:9,fontWeight:'700'}, timeValue:{fontSize:20,fontWeight:'700',marginTop:4,fontVariant:['tabular-nums']},
  summaryRow:{flexDirection:'row',gap:10}, summary:{flex:1,borderWidth:1,borderRadius:20,padding:14}, summaryValue:{fontSize:28,fontWeight:'700',marginTop:6,fontVariant:['tabular-nums']}, previousWrap:{flex:1,minHeight:0,gap:2}, previousRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:11,borderBottomWidth:StyleSheet.hairlineWidth}, previousDate:{fontSize:12,fontWeight:'700',width:54}, previousRoute:{flex:1,fontSize:15,fontWeight:'600'}, previousTime:{minWidth:70,alignItems:'flex-end'},
  primaryButton:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center'}, primaryText:{color:'#fff',fontWeight:'700'}, titleRow:{flexDirection:'row',alignItems:'center',gap:8}, actionsRow:{flexDirection:'row',gap:7}, compactButton:{height:38,minWidth:72,borderWidth:1,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:10}, compactText:{fontWeight:'700',fontSize:12}, months:{flexDirection:'row',gap:7,flexWrap:'wrap'}, monthPill:{paddingHorizontal:10,paddingVertical:7,borderRadius:12}, emptyCard:{borderWidth:1,borderRadius:20,padding:16}, listWindow:{flex:1,minHeight:0,borderWidth:1,borderRadius:20,overflow:'hidden'}, listContent:{padding:8,gap:7,paddingBottom:18}, flightCard:{borderWidth:1,borderRadius:16,padding:13}, routeText:{fontSize:20,fontWeight:'700',marginTop:4},
  infoCard:{borderWidth:1,borderRadius:20,padding:14,gap:8}, cardTitle:{fontSize:15,fontWeight:'700'}, libraryRow:{minHeight:58,flexDirection:'row',alignItems:'center',borderBottomWidth:StyleSheet.hairlineWidth,gap:10}, eraseButton:{height:48,borderWidth:1,borderRadius:15,alignItems:'center',justifyContent:'center'}, tabBar:{height:68,marginTop:8,marginBottom:4,borderWidth:1,borderRadius:22,flexDirection:'row',padding:4,gap:4}, tabItem:{flex:1,borderRadius:18,alignItems:'center',justifyContent:'center',gap:2}, tabIcon:{fontSize:22,fontWeight:'700'}, tabText:{fontSize:11,fontWeight:'600'},
  flightSheet:{width:'100%',maxWidth:620,maxHeight:'78%',borderTopWidth:1,borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:18,paddingBottom:18,overflow:'hidden'}, flightSheetContent:{minHeight:0,flexShrink:1}, sheetRoute:{fontSize:28,lineHeight:33,fontWeight:'700',marginTop:5}, swipeHint:{fontSize:10,marginTop:7}, crewHeading:{fontSize:12,fontWeight:'700',marginTop:14,marginBottom:7}, crewList:{minHeight:0,flexShrink:1}, crewRow:{minHeight:50,flexDirection:'row',alignItems:'center'}, avatar:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',marginRight:11}, avatarText:{fontSize:12,fontWeight:'800'}, crewName:{fontSize:14,fontWeight:'600'},
});
