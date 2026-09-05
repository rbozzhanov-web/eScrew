import { useEffect, useState } from 'react';
import { airportCoords } from './airports';

export type AirportWeather = {
  code: string;
  temp: number;
  weatherCode: number;
  isDay: boolean;
  windSpeed: number;
  windDeg: number;
  pressure: number;
  fetchedAt: number;
};

const KEY = 'escrew.weather.v1';
const STALE_AFTER_MS = 45 * 60 * 1000;

type Cache = Record<string, AirportWeather>;

function loadCache(): Cache {
  if (typeof localStorage === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Cache) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or unavailable — cached view still works this session */ }
}

function getCached(code: string): AirportWeather | undefined {
  return loadCache()[code];
}

function setCached(code: string, weather: AirportWeather) {
  const cache = loadCache();
  cache[code] = weather;
  saveCache(cache);
}

async function fetchAirportWeather(code: string): Promise<AirportWeather | undefined> {
  const coords = airportCoords(code);
  if (!coords) return undefined;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=kn`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
  const data = await response.json();
  const current = data?.current;
  if (!current) return undefined;
  const weather: AirportWeather = {
    code,
    temp: Math.round(current.temperature_2m),
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
    windSpeed: Math.round(current.wind_speed_10m),
    windDeg: current.wind_direction_10m,
    pressure: Math.round(current.surface_pressure),
    fetchedAt: Date.now(),
  };
  setCached(code, weather);
  return weather;
}

/**
 * Always renders whatever is cached immediately — no loading state blocks the first
 * paint. A background refresh only ever fires when the cache is stale AND the
 * browser reports it's online; offline (or a fresh cache) is a pure no-op, so
 * going offline never triggers a retry loop or a delay — just the last known reading.
 */
export function useAirportWeather(code: string | undefined): AirportWeather | undefined {
  const [weather, setWeather] = useState<AirportWeather | undefined>(() => (code ? getCached(code) : undefined));

  useEffect(() => {
    setWeather(code ? getCached(code) : undefined);
    if (!code) return;

    let cancelled = false;
    const refreshIfStale = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const cached = getCached(code);
      if (cached && Date.now() - cached.fetchedAt < STALE_AFTER_MS) return;
      fetchAirportWeather(code)
        .then((fresh) => { if (fresh && !cancelled) setWeather(fresh); })
        .catch(() => { /* keep showing whatever was cached (or nothing) — never surface a fetch error here */ });
    };

    refreshIfStale();
    const onOnline = () => refreshIfStale();
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    };
  }, [code]);

  return weather;
}
