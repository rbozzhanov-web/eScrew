const STATION_TIME_ZONES: Record<string, string> = {
  ALA: 'Asia/Almaty', NQZ: 'Asia/Almaty', SCO: 'Asia/Aqtau', CXR: 'Asia/Ho_Chi_Minh',
  IST: 'Europe/Istanbul', ICN: 'Asia/Seoul', LHR: 'Europe/London', AYT: 'Europe/Istanbul',
  SYX: 'Asia/Shanghai', FRA: 'Europe/Berlin', AMS: 'Europe/Amsterdam', HER: 'Europe/Athens',
  DEL: 'Asia/Kolkata', DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', DOH: 'Asia/Qatar', BKK: 'Asia/Bangkok',
  HKT: 'Asia/Bangkok', PEK: 'Asia/Shanghai', CAN: 'Asia/Shanghai', CTU: 'Asia/Shanghai', URC: 'Asia/Urumqi',
  TAS: 'Asia/Tashkent', FRU: 'Asia/Bishkek', OSS: 'Asia/Bishkek', TBS: 'Asia/Tbilisi', BUS: 'Asia/Tbilisi',
  GYD: 'Asia/Baku', DME: 'Europe/Moscow', LED: 'Europe/Moscow', BOM: 'Asia/Kolkata', GOI: 'Asia/Kolkata',
  CMB: 'Asia/Colombo', MLE: 'Indian/Maldives', PQC: 'Asia/Ho_Chi_Minh', DAD: 'Asia/Ho_Chi_Minh',
  JED: 'Asia/Riyadh', MED: 'Asia/Riyadh', HRG: 'Africa/Cairo', SSH: 'Africa/Cairo', TLV: 'Asia/Jerusalem',
  TGD: 'Europe/Podgorica', UBN: 'Asia/Ulaanbaatar', OVB: 'Asia/Novosibirsk', DYU: 'Asia/Dushanbe',
  AKX: 'Asia/Aqtobe', GUW: 'Asia/Atyrau', KGF: 'Asia/Almaty', KZO: 'Asia/Qyzylorda', PWQ: 'Asia/Almaty',
  UKK: 'Asia/Almaty', URA: 'Asia/Oral', CIT: 'Asia/Almaty', KSN: 'Asia/Qostanay', PLX: 'Asia/Almaty',
};

const KAZAKHSTAN_UNIFIED_UTC5_FROM = Date.UTC(2024, 2, 1);
function pinnedOffsetMinutes(zone: string, year: number, month: number, day: number): number | undefined {
  switch (zone) {
    case 'Asia/Almaty':
    case 'Asia/Qostanay':
      return Date.UTC(year, month - 1, day) >= KAZAKHSTAN_UNIFIED_UTC5_FROM ? 300 : 360;
    case 'Asia/Aqtau': case 'Asia/Aqtobe': case 'Asia/Atyrau': case 'Asia/Oral': case 'Asia/Qyzylorda': return 300;
    default: return undefined;
  }
}

export function stationLocalDateTimeMs(station: string, date: string, time: string): number | undefined {
  const zone = STATION_TIME_ZONES[station.trim().toUpperCase()];
  if (!zone) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if ([year, month, day, hour, minute].some((part) => !Number.isFinite(part))) return undefined;
  const pinned = pinnedOffsetMinutes(zone, year, month, day);
  if (pinned !== undefined) return Date.UTC(year, month - 1, day, hour, minute) - pinned * 60000;
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utc));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const rendered = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    utc += Date.UTC(year, month - 1, day, hour, minute) - rendered;
  }
  return utc;
}
