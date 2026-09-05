/** Maps Open-Meteo's WMO weather codes to a small icon/label set. */
export function weatherIcon(code: number, isDay: boolean): { icon: string; label: string } {
  if (code === 0) return isDay ? { icon: '☀️', label: 'Clear' } : { icon: '🌙', label: 'Clear' };
  if (code <= 2) return isDay ? { icon: '🌤️', label: 'Partly cloudy' } : { icon: '☁️', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Overcast' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: 'Rain' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code >= 80 && code <= 82) return { icon: '🌧️', label: 'Showers' };
  if (code >= 85 && code <= 86) return { icon: '🌨️', label: 'Snow showers' };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '🌡️', label: 'Weather' };
}

export function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}
