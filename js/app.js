import {
  formatTime, formatDay, relativeOffset, dayLabel, hourOfDay, zonedParts,
  isDaylight, subsolarPoint, sunAltitudeSin,
} from './time.js';
import { hourlyWindow, describe, searchCities } from './weather.js';
import { drawMap, drawWallpaper, THEMES, SIZES, hourLabel } from './render.js';

/* ---------------- storage ---------------- */
const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem('meridian:' + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem('meridian:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const KNOWN = {
  'Europe/London': ['London', 'United Kingdom', 51.507, -0.128],
  'America/New_York': ['New York', 'United States', 40.713, -74.006],
  'America/Chicago': ['Chicago', 'United States', 41.878, -87.630],
  'America/Denver': ['Denver', 'United States', 39.739, -104.990],
  'America/Los_Angeles': ['Los Angeles', 'United States', 34.052, -118.244],
  'America/Toronto': ['Toronto', 'Canada', 43.653, -79.383],
  'America/Sao_Paulo': ['São Paulo', 'Brazil', -23.551, -46.633],
  'America/Mexico_City': ['Mexico City', 'Mexico', 19.433, -99.133],
  'Europe/Paris': ['Paris', 'France', 48.857, 2.352],
  'Europe/Berlin': ['Berlin', 'Germany', 52.520, 13.405],
  'Europe/Madrid': ['Madrid', 'Spain', 40.417, -3.704],
  'Europe/Istanbul': ['Istanbul', 'Türkiye', 41.008, 28.978],
  'Africa/Lagos': ['Lagos', 'Nigeria', 6.524, 3.379],
  'Africa/Cairo': ['Cairo', 'Egypt', 30.044, 31.236],
  'Asia/Dubai': ['Dubai', 'United Arab Emirates', 25.205, 55.271],
  'Asia/Kolkata': ['Mumbai', 'India', 19.076, 72.878],
  'Asia/Karachi': ['Karachi', 'Pakistan', 24.861, 67.010],
  'Asia/Dhaka': ['Dhaka', 'Bangladesh', 23.811, 90.413],
  'Asia/Bangkok': ['Bangkok', 'Thailand', 13.756, 100.502],
  'Asia/Singapore': ['Singapore', 'Singapore', 1.352, 103.820],
  'Asia/Shanghai': ['Shanghai', 'China', 31.230, 121.474],
  'Asia/Hong_Kong': ['Hong Kong', 'Hong Kong', 22.320, 114.169],
  'Asia/Seoul': ['Seoul', 'South Korea', 37.567, 126.978],
  'Asia/Tokyo': ['Tokyo', 'Japan', 35.676, 139.650],
  'Australia/Sydney': ['Sydney', 'Australia', -33.869, 151.209],
  'Pacific/Auckland': ['Auckland', 'New Zealand', -36.849, 174.763],
};
const uid = () => Math.random().toString(36).slice(2, 9);
function cityFromTz(tz, home = false) {
  const k = KNOWN[tz];
  if (k) return { id: uid(), name: k[0], region: k[1], tz, lat: k[2], lon: k[3], home };
  const name = tz.split('/').pop().replace(/_/g, ' ');
  return { id: uid(), name, region: tz.split('/')[0], tz, lat: null, lon: null, home };
}
function defaultCities() {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const list = [cityFromTz(local, true)];
  for (const tz of ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney']) {
    if (tz !== local) list.push(cityFromTz(tz));
  }
  return list.slice(0, 5);
}

const DEFAULT_SETTINGS = {
  use24: false, fahrenheit: false, autoStart: false, theme: 'auto',
  focusMin: 25, shortMin: 5, longMin: 15, every: 4,
  wpStyle: 'grid', wpTheme: 'dusk', wpSize: 'iphone-6.1', wpNight: true,
};
let settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
let cities = store.get('cities', null) || defaultCities();
if (!cities.some(c => c.home)) cities[0].home = true;
const saveCities = () => store.set('cities', cities);
const saveSettings = () => store.set('settings', settings);
const home = () => cities.find(c => c.home) || cities[0];

/* ---------------- helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function appTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? THEMES.midnight : THEMES.paper;
}
function applyTheme() {
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = settings.theme;
}

/* ---------------- navigation ---------------- */
const TITLES = { now: 'Now', timeline: 'Timeline', map: 'Map', focus: 'Focus', wallpaper: 'Wallpaper' };
let view = 'now';
function show(v) {
  view = v;
  $$('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + v));
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#title').textContent = TITLES[v];
  renderSubtitle();
  render();
  window.scrollTo({ top: 0 });
  try { history.replaceState(null, '', '#' + v); } catch { /* sandboxed */ }
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
function renderSubtitle() {
  const h = home();
  const map = {
    now: formatDay(new Date(), h.tz) + ' · ' + h.name,
    timeline: 'Compare hours across cities',
    map: 'Where the sun is right now',
    focus: 'Pomodoro focus timer',
    wallpaper: 'Make a lock-screen wallpaper',
  };
  $('#subtitle').textContent = map[view];
}

/* ---------------- NOW: widgets ---------------- */
function renderClock() {
  const h = home(), now = new Date();
  const day = isDaylight(now, h);
  const el = $('#w-clock');
  el.classList.toggle('day', day);
  el.innerHTML = `<div class="arc"></div>
    <div class="city">${day ? '☀️' : '🌙'} ${esc(h.name)}</div>
    <div><div class="big">${esc(formatTime(now, h.tz, settings.use24).replace(/\s?[AP]M$/i, ''))}</div>
    <div class="date">${esc(formatDay(now, h.tz))}${settings.use24 ? '' : ' · ' + (hourOfDay(now, h.tz) < 12 ? 'AM' : 'PM')}</div></div>`;
}

let weatherCityId = store.get('weatherCity', null);
const wxData = new Map();
async function loadWeather() {
  const unit = settings.fahrenheit ? 'fahrenheit' : 'celsius';
  await Promise.all(cities.map(async c => {
    const d = await hourlyWindow(c, unit);
    if (d) wxData.set(c.id, d);
  }));
  renderWeather(); renderCityList();
}
function renderWeather() {
  const el = $('#w-weather');
  const withCoords = cities.filter(c => c.lat != null);
  if (!withCoords.length) {
    el.innerHTML = `<div class="widget-head"><h2>Weather</h2></div><p class="muted">Add a city with “Edit” to see its weather.</p>`;
    return;
  }
  let c = withCoords.find(x => x.id === weatherCityId) || withCoords.find(x => x.home) || withCoords[0];
  const d = wxData.get(c.id);
  const tabs = withCoords.length > 1 ? `<div class="wx-tabs">${withCoords.map(x =>
    `<button class="chip ${x.id === c.id ? 'active' : ''}" data-wx="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : '';
  if (!d) {
    el.innerHTML = `<div class="widget-head"><h2>Weather · ${esc(c.name)}</h2></div>${tabs}<p class="muted">Weather unavailable offline.</p>`;
  } else {
    const nowI = Math.max(0, d.findIndex(x => x.now));
    const cur = d[nowI]; const desc = describe(cur.code, cur.isDay);
    el.innerHTML = `<div class="widget-head"><h2>Weather · ${esc(c.name)}</h2><span class="muted" style="font-size:13px">6h back · 6h ahead</span></div>
      ${tabs}
      <div class="wx-now"><span style="font-size:38px">${desc.icon}</span><div><div class="temp">${cur.temp}°</div><div class="muted" style="font-size:14px">${desc.label}</div></div></div>
      <div class="wx-strip">${d.map((x, i) => {
        const p = zonedParts(x.time, c.tz); const dd = describe(x.code, x.isDay);
        return `<div class="wx ${i < nowI ? 'past' : ''} ${i === nowI ? 'now' : ''}">
          <div class="h">${i === nowI ? 'Now' : hourLabel(p.hour, p.minute, settings.use24)}</div>
          <div class="i" title="${dd.label}">${dd.icon}</div><div class="tt">${x.temp}°</div></div>`;
      }).join('')}</div>`;
    requestAnimationFrame(() => {
      const strip = $('.wx-strip', el), nowEl = $('.wx.now', el);
      if (strip && nowEl) strip.scrollLeft = nowEl.offsetLeft - strip.clientWidth / 2 + nowEl.clientWidth / 2;
    });
  }
  $$('[data-wx]', el).forEach(b => b.addEventListener('click', () => {
    weatherCityId = b.dataset.wx; store.set('weatherCity', weatherCityId); renderWeather();
  }));
}

function renderCityList() {
  const now = new Date(), h = home();
  $('#city-list').innerHTML = cities.map(c => {
    const d = wxData.get(c.id); const cur = d && (d.find(x => x.now) || d[6]);
    const wx = cur ? ` · ${describe(cur.code, cur.isDay).icon} ${cur.temp}°` : '';
    const rel = c.home ? 'Home' : relativeOffset(now, c.tz, h.tz);
    const dl = dayLabel(now, c.tz, h.tz);
    return `<li>
      <span class="sun" aria-label="${isDaylight(now, c) ? 'Day' : 'Night'}">${isDaylight(now, c) ? '☀️' : '🌙'}</span>
      <div style="min-width:0"><div class="name">${esc(c.name)}${c.home ? '<span class="home-badge">★</span>' : ''}</div>
        <div class="sub">${esc(rel)}${dl !== 'Today' ? ' · ' + dl : ''}${wx}</div></div>
      <div class="time">${esc(formatTime(now, c.tz, settings.use24))}</div></li>`;
  }).join('');
}

function renderMiniMap() {
  const f = fitCanvas($('#mini-map')); if (!f) return;
  f.ctx.clearRect(0, 0, f.w, f.h);
  drawMap(f.ctx, new Date(), 0, 0, f.w, f.h, { theme: appTheme(), cities, homeTz: home().tz, labels: false });
}
$('#w-map').addEventListener('click', () => show('map'));
$('#w-focus').addEventListener('click', () => show('focus'));

/* ---------------- TIMELINE ---------------- */
let tlShift = 0; // minutes from now
const CW = 54;
function cellClass(c, when) {
  if (c.lat == null) { const h = hourOfDay(when, c.tz); return h >= 7 && h < 19 ? 'day' : (h >= 6 && h < 20 ? 'dusk' : 'night'); }
  const s = sunAltitudeSin(c.lat, c.lon, subsolarPoint(when));
  return s > 0.06 ? 'day' : s < -0.1 ? 'night' : 'dusk';
}
function renderTimeline() {
  const wrap = $('#timeline'); const W = wrap.clientWidth; if (!W) return;
  const T = Date.now() + tlShift * 60000;
  const H = 3600000;
  const base = Math.floor(T / H) * H;
  const N = Math.ceil(W / 2 / CW) + 2;
  const tx = W / 2 + (base - N * H - T) / H * CW;
  const h = home(), at = new Date(T);
  $('#tl-rows').innerHTML = cities.map(c => {
    let cells = '';
    for (let k = -N; k <= N; k++) {
      const start = new Date(base + k * H);
      const p = zonedParts(start, c.tz);
      const mid = new Date(base + k * H + H / 2);
      const day = p.hour === 0 && p.minute === 0 ? `<span class="d">${esc(formatDay(start, c.tz).split(',')[0])}</span>` : '';
      cells += `<div class="tl-cell ${cellClass(c, mid)} ${p.hour === 0 ? 'midnight' : ''}">${day ? `<span>${day}${hourLabel(p.hour, p.minute, settings.use24)}</span>` : hourLabel(p.hour, p.minute, settings.use24)}</div>`;
    }
    const dl = dayLabel(at, c.tz, h.tz);
    return `<div class="tl-row">
      <div class="tl-label">${esc(c.name)}<span class="o">${c.home ? 'home' : esc(relativeOffset(at, c.tz, h.tz))}</span></div>
      <div class="tl-time">${dl !== 'Today' ? `<span class="dl">${dl}</span>` : ''}${esc(formatTime(at, c.tz, settings.use24))}</div>
      <div class="tl-track" style="transform:translateX(${tx}px)">${cells}</div></div>`;
  }).join('');
  const diff = Math.round(tlShift);
  const rel = diff === 0 ? 'Now' : `${diff > 0 ? 'in ' : ''}${Math.floor(Math.abs(diff) / 60)}h ${String(Math.abs(diff) % 60).padStart(2, '0')}m${diff < 0 ? ' ago' : ''}`;
  $('#tl-readout').innerHTML = `<div><div class="muted" style="font-size:13px">${esc(h.name)} · ${esc(formatDay(at, h.tz))}</div>
    <div class="when">${esc(formatTime(at, h.tz, settings.use24))}</div></div><span class="chip ${diff === 0 ? 'active' : ''}">${rel}</span>`;
  $('#tl-range').value = Math.round(tlShift / 15) * 15;
}
function setShift(m) { tlShift = Math.max(-1440, Math.min(1440, m)); renderTimeline(); }
$('#tl-range').addEventListener('input', e => setShift(+e.target.value));
$('#tl-now').addEventListener('click', () => setShift(0));
$$('[data-shift]').forEach(b => b.addEventListener('click', () => setShift(Math.round(tlShift / 60) * 60 + +b.dataset.shift)));
(() => {
  const el = $('#timeline'); let x0 = null, s0 = 0, raf = 0, pid = null;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; s0 = tlShift; pid = e.pointerId; el.setPointerCapture(pid); });
  el.addEventListener('pointermove', e => {
    if (x0 == null) return;
    const m = s0 - (e.clientX - x0) / CW * 60;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setShift(Math.round(m / 5) * 5));
  });
  const end = () => { x0 = null; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
})();

/* ---------------- MAP ---------------- */
function nextSunEvent(c, from) {
  if (c.lat == null) return null;
  const up = t => sunAltitudeSin(c.lat, c.lon, subsolarPoint(new Date(t))) > -0.0145;
  const start = up(from.getTime());
  for (let m = 5; m <= 26 * 60; m += 5) {
    const t = from.getTime() + m * 60000;
    if (up(t) !== start) return { type: start ? 'Sunset' : 'Sunrise', at: new Date(t) };
  }
  return { type: start ? 'Midnight sun' : 'Polar night', at: null };
}
function renderBigMap() {
  const f = fitCanvas($('#big-map')); if (!f) return;
  const now = new Date();
  f.ctx.clearRect(0, 0, f.w, f.h);
  const scale = Math.max(0.9, Math.min(1.3, f.w / 700));
  drawMap(f.ctx, now, 0, 0, f.w, f.h, {
    theme: appTheme(), cities, homeTz: home().tz, scale,
    labelFn: c => `${c.name} ${formatTime(now, c.tz, settings.use24)}`,
  });
  $('#sun-list').innerHTML = cities.map(c => {
    const ev = nextSunEvent(c, now); const day = isDaylight(now, c);
    let sub = 'Add coordinates for sun times';
    if (ev) sub = ev.at ? `${ev.type} at ${formatTime(ev.at, c.tz, settings.use24)}` : ev.type;
    return `<li><span class="sun">${day ? '☀️' : '🌙'}</span>
      <div style="min-width:0"><div class="name">${esc(c.name)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="time">${esc(formatTime(now, c.tz, settings.use24))}</div></li>`;
  }).join('');
}

/* ---------------- FOCUS ---------------- */
const MODES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const durMs = m => settings[{ focus: 'focusMin', short: 'shortMin', long: 'longMin' }[m]] * 60000;
const todayKey = () => new Date().toDateString();
let focus = store.get('focus', null) || { mode: 'focus', endAt: null, remaining: null, done: 0 };
let stats = store.get('focusStats', { day: todayKey(), sessions: 0, minutes: 0 });
if (stats.day !== todayKey()) stats = { day: todayKey(), sessions: 0, minutes: 0 };
const saveFocus = () => { store.set('focus', focus); store.set('focusStats', stats); };
const remainingMs = () => focus.endAt ? Math.max(0, focus.endAt - Date.now()) : (focus.remaining ?? durMs(focus.mode));
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function setMode(m, autostart = false) {
  focus.mode = m; focus.remaining = durMs(m); focus.endAt = autostart ? Date.now() + durMs(m) : null;
  saveFocus(); renderFocus();
}
function toggleFocus() {
  if (focus.endAt) { focus.remaining = remainingMs(); focus.endAt = null; }
  else {
    focus.endAt = Date.now() + remainingMs(); focus.remaining = null;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    audio(); // unlock audio on user gesture
  }
  saveFocus(); renderFocus();
}
let actx = null;
function audio(play = false) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!play) return;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = [660, 880, 990][i]; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, actx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d + 0.5);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.55);
    });
  } catch { /* no audio */ }
}
function completeFocus() {
  const was = focus.mode;
  let next = 'focus';
  if (was === 'focus') {
    focus.done += 1; stats.sessions += 1; stats.minutes += settings.focusMin;
    next = focus.done % settings.every === 0 ? 'long' : 'short';
  } else if (was === 'long') focus.done = 0;
  audio(true);
  const msg = was === 'focus' ? 'Focus session done — take a break.' : 'Break over — back to it.';
  toast(msg);
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Meridian', { body: msg, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
  setMode(next, settings.autoStart);
}
function renderFocus() {
  const rem = remainingMs(), total = durMs(focus.mode);
  const running = !!focus.endAt;
  const C = 2 * Math.PI * 96;
  const fg = $('#ring-fg');
  fg.style.strokeDasharray = C; fg.style.strokeDashoffset = C * (1 - rem / total);
  $('#focus-time').textContent = mmss(rem);
  $('#focus-label').textContent = running ? MODES[focus.mode] : (rem === total ? `Ready · ${MODES[focus.mode]}` : 'Paused');
  $('#focus-toggle').textContent = running ? 'Pause' : (rem === total ? 'Start' : 'Resume');
  $$('#mode-chips .chip').forEach(b => b.classList.toggle('active', b.dataset.mode === focus.mode));
  const inRound = focus.done % settings.every || (focus.done && focus.mode === 'long' ? settings.every : 0);
  $('#focus-dots').innerHTML = Array.from({ length: settings.every }, (_, i) => `<span class="${i < inRound ? 'on' : ''}"></span>`).join('');
  $('#focus-stats').textContent = `Today: ${stats.sessions} session${stats.sessions === 1 ? '' : 's'} · ${stats.minutes} min focused`;
  // mini widget
  const mC = 2 * Math.PI * 26;
  $('#w-focus').innerHTML = `<svg class="mini-ring" viewBox="0 0 64 64" style="transform:rotate(-90deg)">
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--card-2)" stroke-width="7"/>
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${mC}" stroke-dashoffset="${mC * (1 - rem / total)}"/></svg>
    <div><div class="t">${mmss(rem)}</div><div class="l">${running ? MODES[focus.mode] : 'Focus · tap to start'}</div></div>`;
  document.title = running ? `${mmss(rem)} · ${MODES[focus.mode]}` : 'Meridian';
}
$('#focus-toggle').addEventListener('click', toggleFocus);
$('#focus-reset').addEventListener('click', () => setMode(focus.mode));
$('#focus-skip').addEventListener('click', () => { focus.endAt = null; completeFocus(); });
$$('#mode-chips .chip').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

/* ---------------- WALLPAPER ---------------- */
function initWallpaperControls() {
  $('#wp-theme').innerHTML = Object.entries(THEMES).map(([k, t]) =>
    `<button data-v="${k}" aria-label="${t.name}" title="${t.name}" style="background:linear-gradient(135deg,${t.bg[0]},${t.bg[1]} 55%,${t.bg[2]})"></button>`).join('');
  $('#wp-size').innerHTML = Object.entries(SIZES).map(([k, s]) => `<option value="${k}">${s.label} — ${s.w}×${s.h}</option>`).join('');
  $$('#wp-style button').forEach(b => b.addEventListener('click', () => { settings.wpStyle = b.dataset.v; saveSettings(); renderWallpaper(); }));
  $$('#wp-theme button').forEach(b => b.addEventListener('click', () => { settings.wpTheme = b.dataset.v; saveSettings(); renderWallpaper(); }));
  $('#wp-size').addEventListener('change', e => { settings.wpSize = e.target.value; saveSettings(); renderWallpaper(); });
  $('#wp-night').addEventListener('change', e => { settings.wpNight = e.target.checked; saveSettings(); renderWallpaper(); });
  $('#wp-save').addEventListener('click', saveWallpaper);
}
function wpConfig() {
  return {
    style: settings.wpStyle, theme: settings.wpTheme, size: SIZES[settings.wpSize] || SIZES['iphone-6.1'],
    cities, homeTz: home().tz, use24: settings.use24, night: settings.wpNight, date: new Date(),
  };
}
function renderWallpaper() {
  $$('#wp-style button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.wpStyle));
  $$('#wp-theme button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.wpTheme));
  $('#wp-size').value = settings.wpSize;
  $('#wp-night').checked = settings.wpNight;
  $('#wp-night-row').style.display = settings.wpStyle === 'map' ? '' : 'none';
  drawWallpaper($('#wp-canvas'), wpConfig());
}
async function saveWallpaper() {
  const canvas = document.createElement('canvas');
  drawWallpaper(canvas, wpConfig());
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if (!blob) return toast('Could not create image');
  const file = new File([blob], `meridian-${settings.wpStyle}-${settings.wpTheme}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Meridian wallpaper' });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Wallpaper saved');
}

/* ---------------- City editor ---------------- */
const cityDialog = $('#city-dialog');
$('#edit-cities').addEventListener('click', () => { renderEditList(); cityDialog.showModal(); $('#city-search').value = ''; $('#city-results').innerHTML = ''; });
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
cityDialog.addEventListener('close', () => { saveCities(); loadWeather(); render(); renderSubtitle(); });

function renderEditList() {
  $('#edit-list').innerHTML = cities.map((c, i) => `<li data-id="${c.id}">
    <button class="star ${c.home ? 'on' : ''}" data-act="home" aria-label="Set ${esc(c.name)} as home">${c.home ? '★' : '☆'}</button>
    <div class="nm">${esc(c.name)}<small>${esc(c.region || c.tz)}</small></div>
    <button data-act="up" aria-label="Move up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button>
    <button data-act="del" aria-label="Remove ${esc(c.name)}">✕</button></li>`).join('');
}
$('#edit-list').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const id = btn.closest('li').dataset.id; const i = cities.findIndex(c => c.id === id);
  if (btn.dataset.act === 'home') cities.forEach(c => { c.home = c.id === id; });
  if (btn.dataset.act === 'up' && i > 0) [cities[i - 1], cities[i]] = [cities[i], cities[i - 1]];
  if (btn.dataset.act === 'del') {
    if (cities.length === 1) return toast('Keep at least one city');
    const wasHome = cities[i].home; cities.splice(i, 1); if (wasHome) cities[0].home = true;
  }
  saveCities(); renderEditList(); render();
});
let searchT = 0, lastResults = [];
$('#city-search').addEventListener('input', e => {
  clearTimeout(searchT);
  const q = e.target.value;
  searchT = setTimeout(async () => {
    try { lastResults = await searchCities(q); } catch { lastResults = []; if (q.trim().length > 1) toast('City search needs a connection'); }
    $('#city-results').innerHTML = lastResults.map((r, i) => `<li><button data-i="${i}"><div>${esc(r.name)}</div><div class="r">${esc(r.region)} · ${esc(r.tz)}</div></button></li>`).join('');
  }, 280);
});
$('#city-results').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const r = lastResults[+b.dataset.i];
  if (cities.some(c => c.name === r.name && c.tz === r.tz)) return toast(`${r.name} is already added`);
  cities.push({ id: uid(), name: r.name, region: r.region, tz: r.tz, lat: r.lat, lon: r.lon, home: false });
  saveCities(); renderEditList(); render();
  $('#city-search').value = ''; $('#city-results').innerHTML = '';
  toast(`Added ${r.name}`);
});

/* ---------------- Settings ---------------- */
$('#settings-btn').addEventListener('click', () => {
  $('#set-24h').checked = settings.use24; $('#set-f').checked = settings.fahrenheit; $('#set-auto').checked = settings.autoStart;
  $('#set-focus').value = settings.focusMin; $('#set-short').value = settings.shortMin; $('#set-long').value = settings.longMin; $('#set-every').value = settings.every;
  $$('#set-theme button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.theme));
  $('#settings-dialog').showModal();
});
$('#set-24h').addEventListener('change', e => { settings.use24 = e.target.checked; saveSettings(); render(); });
$('#set-f').addEventListener('change', e => { settings.fahrenheit = e.target.checked; saveSettings(); loadWeather(); });
$('#set-auto').addEventListener('change', e => { settings.autoStart = e.target.checked; saveSettings(); });
for (const [id, key, min, max] of [['set-focus', 'focusMin', 1, 180], ['set-short', 'shortMin', 1, 60], ['set-long', 'longMin', 1, 90], ['set-every', 'every', 2, 10]]) {
  $('#' + id).addEventListener('change', e => {
    settings[key] = Math.max(min, Math.min(max, Math.round(+e.target.value) || DEFAULT_SETTINGS[key]));
    e.target.value = settings[key]; saveSettings();
    if (!focus.endAt) setMode(focus.mode); else renderFocus();
  });
}
$$('#set-theme button').forEach(b => b.addEventListener('click', () => {
  settings.theme = b.dataset.v; saveSettings(); applyTheme();
  $$('#set-theme button').forEach(x => x.classList.toggle('active', x === b)); render();
}));

/* ---------------- loop ---------------- */
function render() {
  if (view === 'now') { renderClock(); renderCityList(); renderWeather(); renderMiniMap(); }
  if (view === 'timeline') renderTimeline();
  if (view === 'map') renderBigMap();
  if (view === 'wallpaper') renderWallpaper();
  renderFocus();
}
let lastMinute = -1;
setInterval(() => {
  if (focus.endAt && Date.now() >= focus.endAt) completeFocus();
  renderFocus();
  const m = Math.floor(Date.now() / 60000);
  if (m !== lastMinute) {
    lastMinute = m;
    if (view === 'now') { renderClock(); renderCityList(); renderMiniMap(); }
    if (view === 'timeline') renderTimeline();
    if (view === 'map') renderBigMap();
    renderSubtitle();
  }
}, 1000);
setInterval(loadWeather, 20 * 60 * 1000);
addEventListener('resize', () => { clearTimeout(render.t); render.t = setTimeout(render, 120); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); loadWeather(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', render);

applyTheme();
initWallpaperControls();
const initial = location.hash.slice(1);
show(TITLES[initial] ? initial : 'now');
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (TITLES[v] && v !== view) show(v); });
lastMinute = Math.floor(Date.now() / 60000);
loadWeather();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
