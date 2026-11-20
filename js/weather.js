// Weather from Open-Meteo (free, no API key). Covers 6 hours back to 6 hours ahead.

const CACHE_MS = 20 * 60 * 1000;
const cache = new Map();

const CODES = [
  [[0], '☀️', 'Clear', '🌙'],
  [[1, 2], '🌤️', 'Partly cloudy', '☁️'],
  [[3], '☁️', 'Cloudy'],
  [[45, 48], '🌫️', 'Fog'],
  [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'],
  [[95, 96, 99], '⛈️', 'Storm'],
];

export function describe(code, isDay = true) {
  for (const [codes, icon, label, night] of CODES) {
    if (codes.includes(code)) return { icon: !isDay && night ? night : icon, label };
  }
  return { icon: '·', label: '—' };
}

/**
 * Returns [{ time: Date, temp, code, isDay, now: bool }] for −6h … +6h,
 * or null when offline / failed.
 */
export async function hourlyWindow(city, unit = 'celsius') {
  if (city.lat == null) return null;
  const key = `${city.lat},${city.lon},${unit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: city.lat, longitude: city.lon,
    hourly: 'temperature_2m,weather_code,is_day',
    timezone: 'GMT', timeformat: 'unixtime',
    past_hours: 6, forecast_hours: 7,
    temperature_unit: unit,
  });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    const nowHour = Math.floor(Date.now() / 3600000);
    const data = j.hourly.time.map((t, i) => ({
      time: new Date(t * 1000),
      temp: Math.round(j.hourly.temperature_2m[i]),
      code: j.hourly.weather_code[i],
      isDay: j.hourly.is_day[i] === 1,
      now: Math.floor(t / 3600) === nowHour,
    }));
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return hit ? hit.data : null;
  }
}

/** City search via Open-Meteo geocoding. */
export async function searchCities(q) {
  if (q.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=${encodeURIComponent(q.trim())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('search failed');
  const j = await res.json();
  return (j.results || []).filter(r => r.timezone).map(r => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    country: r.country_code,
    lat: +r.latitude.toFixed(3), lon: +r.longitude.toFixed(3),
    tz: r.timezone,
  }));
}
