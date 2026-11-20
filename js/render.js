// Canvas renderers: day/night world map and wallpapers.
import { LAND } from './land.js';
import { subsolarPoint, sunAltitudeSin, zonedParts, offsetMinutes, relativeOffset } from './time.js';

export const THEMES = {
  dusk:     { name: 'Dusk',     bg: ['#1c1838', '#47305a', '#c9776a'], ink: '#fff7ee', muted: 'rgba(255,247,238,.62)', day: '#f6c27a', twilight: '#c9776a', night: '#2b2550', land: 'rgba(255,240,225,.28)', ocean: 'rgba(255,255,255,.04)', accent: '#ffb36b' },
  paper:    { name: 'Paper',    bg: ['#f4efe6', '#ece4d6', '#e2d6c2'], ink: '#26221d', muted: 'rgba(38,34,29,.58)', day: '#f1c96b', twilight: '#d99a7b', night: '#3c4a6b', land: 'rgba(38,34,29,.20)', ocean: 'rgba(38,34,29,.04)', accent: '#c4582f' },
  midnight: { name: 'Midnight', bg: ['#05070d', '#0b1426', '#132542'], ink: '#e8f0ff', muted: 'rgba(232,240,255,.55)', day: '#7fb4ff', twilight: '#4c6aa8', night: '#16213b', land: 'rgba(160,190,255,.22)', ocean: 'rgba(160,190,255,.03)', accent: '#8ad1ff' },
  sage:     { name: 'Sage',     bg: ['#dfe6d8', '#c8d4bf', '#a9b99c'], ink: '#1f2a1d', muted: 'rgba(31,42,29,.58)', day: '#f4e2a1', twilight: '#d7a77f', night: '#3d5240', land: 'rgba(31,42,29,.22)', ocean: 'rgba(31,42,29,.04)', accent: '#41643a' },
};

export const SIZES = {
  'iphone-6.1': { label: 'iPhone 6.1″', w: 1179, h: 2556 },
  'iphone-6.7': { label: 'iPhone 6.7″', w: 1290, h: 2796 },
  'iphone-se':  { label: 'iPhone SE',   w: 750,  h: 1334 },
  'android':    { label: 'Android FHD+', w: 1080, h: 2400 },
  'ipad':       { label: 'iPad',        w: 2048, h: 2732 },
};

const project = (lon, lat, x, y, w, h) => [x + (lon + 180) / 360 * w, y + (90 - lat) / 180 * h];

function landPath(ctx, x, y, w, h) {
  ctx.beginPath();
  for (const ring of LAND) {
    ring.forEach(([lon, lat], i) => {
      const [px, py] = project(lon, lat, x, y, w, h);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
  }
}

const nightCache = { key: '', canvas: null };
function nightLayer(date, color) {
  const key = `${Math.floor(date.getTime() / 120000)}|${color}`;
  if (nightCache.key === key) return nightCache.canvas;
  const W = 360, H = 180;
  const c = nightCache.canvas || document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  const img = cx.createImageData(W, H);
  const sun = subsolarPoint(date);
  const [r, g, b] = hexRGB(color);
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5);
    for (let i = 0; i < W; i++) {
      const lon = -180 + (i + 0.5);
      const s = sunAltitudeSin(lat, lon, sun);
      // 0 in day, ramps through twilight (~−12°) to full night.
      const a = Math.min(1, Math.max(0, (0.05 - s) / 0.26));
      const k = (j * W + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b;
      img.data[k + 3] = Math.round(a * 175);
    }
  }
  cx.putImageData(img, 0, 0);
  nightCache.key = key; nightCache.canvas = c;
  return c;
}

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Draw an equirectangular day/night map into (x, y, w, h).
 * opts: { theme, cities, night=true, labels=true, scale=1, homeTz, sun=true }
 */
export function drawMap(ctx, date, x, y, w, h, opts) {
  const t = opts.theme, s = opts.scale || 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = t.ocean; ctx.fillRect(x, y, w, h);

  // graticule
  ctx.strokeStyle = t.land; ctx.globalAlpha = 0.35; ctx.lineWidth = 1 * s;
  ctx.beginPath();
  for (let lon = -150; lon < 180; lon += 30) { const [px] = project(lon, 0, x, y, w, h); ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
  for (let lat = -60; lat <= 60; lat += 30) { const [, py] = project(0, lat, x, y, w, h); ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
  ctx.stroke(); ctx.globalAlpha = 1;

  ctx.fillStyle = t.land; landPath(ctx, x, y, w, h); ctx.fill();

  if (opts.night !== false) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(nightLayer(date, t.night), x, y, w, h);
    if (opts.sun !== false) {
      const sun = subsolarPoint(date);
      const [sx, sy] = project(sun.lon, sun.lat, x, y, w, h);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 28 * s);
      glow.addColorStop(0, t.day); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 28 * s, 0, 7); ctx.fill();
      ctx.fillStyle = t.day; ctx.beginPath(); ctx.arc(sx, sy, 6 * s, 0, 7); ctx.fill();
    }
  }

  const placed = [];
  const hit = r => placed.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  const pts = (opts.cities || []).filter(c => c.lat != null).map(c => ({ c, p: project(c.lon, c.lat, x, y, w, h) }));
  for (const { c, p: [px, py] } of pts) placed.push({ x: px - 5 * s, y: py - 5 * s, w: 10 * s, h: 10 * s });
  // home city labelled first so it wins collisions
  pts.sort((a, b) => (b.c.home ? 1 : 0) - (a.c.home ? 1 : 0));
  for (const { c, p: [px, py] } of pts) {
    const home = c.tz === opts.homeTz && c.home;
    ctx.fillStyle = home ? t.accent : t.ink;
    ctx.beginPath(); ctx.arc(px, py, (home ? 5 : 4) * s, 0, 7); ctx.fill();
    ctx.strokeStyle = t.bg[0]; ctx.lineWidth = 1.5 * s; ctx.stroke();
    if (opts.labels === false) continue;
    ctx.font = `600 ${11 * s}px ${FONT}`;
    const label = opts.labelFn ? opts.labelFn(c) : c.name;
    const tw = ctx.measureText(label).width, th = 13 * s, g = 8 * s;
    const cands = [
      { x: px + g, y: py - th / 2 }, { x: px - g - tw, y: py - th / 2 },
      { x: px - tw / 2, y: py - g - th }, { x: px - tw / 2, y: py + g },
      { x: px + g, y: py - th - 2 * s }, { x: px + g, y: py + 2 * s },
      { x: px - g - tw, y: py - th - 2 * s }, { x: px - g - tw, y: py + 2 * s },
    ].map(r => ({ ...r, w: tw, h: th }))
      .filter(r => r.x >= x + 2 && r.x + tw <= x + w - 2 && r.y >= y && r.y + th <= y + h);
    const spot = cands.find(r => !hit(r));
    if (!spot) continue;
    placed.push(spot);
    ctx.fillStyle = t.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4 * s;
    ctx.fillText(label, spot.x, spot.y + th / 2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

export const FONT = `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;

function background(ctx, W, H, t) {
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, t.bg[0]); g.addColorStop(0.55, t.bg[1]); g.addColorStop(1, t.bg[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function shortName(name, max) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

/** Colour for a sun altitude (sine): night → twilight → day. */
function skyColor(t, s) {
  const mix = (a, b, k) => {
    const A = hexRGB(a), B = hexRGB(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
  };
  if (s <= -0.21) return t.night;
  if (s < 0) return mix(t.night, t.twilight, (s + 0.21) / 0.21);
  if (s < 0.17) return mix(t.twilight, t.day, s / 0.17);
  return t.day;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

/**
 * Wallpaper renderer.
 * cfg: { style: 'grid'|'ribbon'|'map', theme, size:{w,h}, cities, homeTz, use24, night, date }
 * Top ~32% is left calm for the lock-screen clock.
 */
export function drawWallpaper(canvas, cfg) {
  const { w: W, h: H } = cfg.size;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = THEMES[cfg.theme] || THEMES.dusk;
  const s = Math.min(W / 393, H / 852); // 1 = iPhone point
  background(ctx, W, H, t);

  const cities = cfg.cities.slice(0, 6);
  const date = cfg.date || new Date();
  const home = cities.find(c => c.home) || cities[0];
  const top = H * 0.36, bottom = H * 0.9, side = 22 * s;

  // soft glow
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.12, 0, W * 0.8, H * 0.12, W * 0.9);
  glow.addColorStop(0, t.accent + '40'); glow.addColorStop(1, t.accent + '00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  if (cfg.style === 'map') {
    const mw = W - side * 2, mh = mw / 2;
    const my = top + (bottom - top - mh) / 2 - 30 * s;
    roundRect(ctx, side, my, mw, mh, 18 * s); ctx.save(); ctx.clip();
    drawMap(ctx, date, side, my, mw, mh, {
      theme: t, cities, night: cfg.night, homeTz: home?.tz, scale: s * 0.9,
      labelFn: c => c.name, sun: cfg.night,
    });
    ctx.restore();
    // offsets legend
    ctx.font = `500 ${12 * s}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const colW = mw / 2;
    cities.forEach((c, i) => {
      const cx = side + (i % 2) * colW, cy = my + mh + 22 * s + Math.floor(i / 2) * 22 * s;
      ctx.fillStyle = t.ink; ctx.fillText(shortName(c.name, 14), cx + 4 * s, cy);
      ctx.fillStyle = t.muted; ctx.textAlign = 'right';
      ctx.fillText(c === home ? 'home' : relativeOffset(date, c.tz, home.tz), cx + colW - 12 * s, cy);
      ctx.textAlign = 'left';
    });
    return;
  }

  // grid / ribbon: one column per city, 24 rows = home hours 00–23.
  const n = Math.max(1, cities.length);
  const headH = 46 * s;
  const gx = side, gw = W - side * 2;
  const colGap = 8 * s;
  const colW = (gw - colGap * (n - 1)) / n;
  const gy = top + headH, gh = bottom - gy;
  const rowH = gh / 24;

  // midnight (start of today) in home zone
  const hp = zonedParts(date, home.tz);
  const homeMidnight = Date.UTC(hp.year, hp.month - 1, hp.day) - offsetMinutes(date, home.tz) * 60000;

  // home-hour labels at left edge are implied by the home column; draw headers.
  cities.forEach((c, ci) => {
    const x = gx + ci * (colW + colGap);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = t.ink;
    ctx.font = `600 ${Math.min(13, 70 / n + 2) * s}px ${FONT}`;
    ctx.fillText(shortName(c.name, n > 4 ? 9 : 12), x + colW / 2, top + 18 * s);
    ctx.fillStyle = t.muted;
    ctx.font = `500 ${10.5 * s}px ${FONT}`;
    ctx.fillText(c === home ? 'home' : relativeOffset(date, c.tz, home.tz), x + colW / 2, top + 34 * s);

    roundRect(ctx, x, gy, colW, gh, Math.min(colW / 2, 14 * s));
    ctx.save(); ctx.clip();

    if (cfg.style === 'ribbon') {
      const steps = 96;
      for (let k = 0; k < steps; k++) {
        const when = new Date(homeMidnight + (k + 0.5) * 86400000 / steps);
        ctx.fillStyle = c.lat != null ? skyColor(t, sunAltitudeSin(c.lat, c.lon, subsolarPoint(when))) : t.twilight;
        ctx.fillRect(x, gy + k * gh / steps, colW, gh / steps + 1);
      }
    }

    for (let r = 0; r < 24; r++) {
      const when = new Date(homeMidnight + (r + 0.5) * 3600000);
      const y = gy + r * rowH;
      const p = zonedParts(new Date(homeMidnight + r * 3600000), c.tz);
      if (cfg.style !== 'ribbon') {
        const sAlt = c.lat != null ? sunAltitudeSin(c.lat, c.lon, subsolarPoint(when)) : (p.hour >= 6 && p.hour < 18 ? 1 : -1);
        ctx.fillStyle = skyColor(t, sAlt);
        ctx.fillRect(x, y, colW, rowH + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,.06)';
        ctx.fillRect(x, y + rowH - 1 * s * 0.5, colW, 0.5 * s);
      }
      const show = cfg.style !== 'ribbon' || p.minute !== 0 || p.hour % 6 === 0;
      if (show) {
        const sAlt = c.lat != null ? sunAltitudeSin(c.lat, c.lon, subsolarPoint(when)) : 1;
        ctx.fillStyle = sAlt > -0.1 ? 'rgba(20,16,12,.78)' : 'rgba(255,255,255,.85)';
        ctx.font = `${p.hour === 0 ? 700 : 500} ${Math.min(12, rowH / s * 0.55) * s}px ${FONT}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(hourLabel(p.hour, p.minute, cfg.use24), x + colW / 2, y + rowH / 2 + 0.5 * s);
      }
    }
    ctx.restore();
  });

  // working-hours bracket on the home column edge
  ctx.fillStyle = t.muted;
  ctx.font = `500 ${10 * s}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Each row is the same moment', W / 2, bottom + 14 * s);
}

export function hourLabel(h, m, use24) {
  if (use24) return `${String(h).padStart(2, '0')}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  const hh = h % 12 || 12;
  return `${hh}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
}
