// Time-zone and solar helpers. No dependencies.

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return fmtCache.get(tz);
}

/** Wall-clock parts of `date` in time zone `tz`. */
export function zonedParts(date, tz) {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** UTC offset of `tz` at `date`, in minutes (e.g. Tokyo = +540). */
export function offsetMinutes(date, tz) {
  const p = zonedParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Fractional hour of day (0–24) in `tz`. */
export function hourOfDay(date, tz) {
  const p = zonedParts(date, tz);
  return p.hour + p.minute / 60 + p.second / 3600;
}

export function formatTime(date, tz, use24) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: !use24,
  }).format(date);
}

export function formatDay(date, tz) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
  }).format(date);
}

/** "+3h", "−5h30", "Same time" relative to a reference zone. */
export function relativeOffset(date, tz, refTz) {
  const diff = offsetMinutes(date, tz) - offsetMinutes(date, refTz);
  if (diff === 0) return 'Same time';
  const sign = diff > 0 ? '+' : '−';
  const a = Math.abs(diff);
  const h = Math.floor(a / 60), m = a % 60;
  return `${sign}${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

/** Day offset label vs reference: "Tomorrow", "Yesterday" or "Today". */
export function dayLabel(date, tz, refTz) {
  const a = zonedParts(date, tz), b = zonedParts(date, refTz);
  const da = Date.UTC(a.year, a.month - 1, a.day), db = Date.UTC(b.year, b.month - 1, b.day);
  const d = Math.round((da - db) / 86400000);
  return d === 0 ? 'Today' : d > 0 ? 'Tomorrow' : 'Yesterday';
}

const rad = Math.PI / 180;

/** Sub-solar point {lat, lon} in degrees for a Date. */
export function subsolarPoint(date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) / rad;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  let lon = ra - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec, lon };
}

/** Sine of solar elevation at (lat, lon) for sub-solar point `sun`. */
export function sunAltitudeSin(lat, lon, sun) {
  return Math.sin(lat * rad) * Math.sin(sun.lat * rad) +
    Math.cos(lat * rad) * Math.cos(sun.lat * rad) * Math.cos((lon - sun.lon) * rad);
}

/** Is it daytime at (lat, lon)? Falls back to 6–18h when no coordinates. */
export function isDaylight(date, city) {
  if (city.lat == null) {
    const h = hourOfDay(date, city.tz);
    return h >= 6 && h < 18;
  }
  return sunAltitudeSin(city.lat, city.lon, subsolarPoint(date)) > -0.0145; // ~−0.83°
}
