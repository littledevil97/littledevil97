# Meridian — World Time & Wallpapers

An installable web app (PWA) for people who work across time zones.

- **Now:** widget-style cards: home clock, focus timer, weather for 6 hours back to 6 hours ahead, world clock, and a live day/night map.
- **Timeline:** drag across the hours to see the same moment in every city, with day, twilight and night shading and "Tomorrow"/"Yesterday" labels.
- **Map:** a live day/night world map based on the real sun position, plus each city's next sunrise or sunset.
- **Focus:** a Pomodoro timer with configurable focus and break lengths, long breaks every N sessions, a sound, a notification, and today's totals.
- **Wallpaper:** creates PNG lock-screen wallpapers in three styles (Hour grid, Daylight ribbons, World map), four themes, and iPhone, Android and iPad sizes. The top third is left empty so the lock-screen clock stays readable.
- Add any city with search. Includes 12/24-hour time, °C/°F, light/dark/auto themes, and works offline once loaded.

Weather and city search use [Open-Meteo](https://open-meteo.com) (free, no API key). Map outlines come from Natural Earth (public domain).

## Run locally

It has no build step and no dependencies. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Put it on your phone

1. Host the folder on any static host over HTTPS (GitHub Pages, Netlify, Cloudflare Pages, Vercel).
2. On iPhone, open the URL in Safari, tap **Share**, then **Add to Home Screen**. It opens full-screen like a native app.
3. In the **Wallpaper** tab, tap **Save wallpaper**, choose **Save Image**, then set it from Photos.

## Limits compared with a native iOS app

A web app cannot add real iOS home-screen or lock-screen widgets, and it cannot set the wallpaper automatically. Those need a native Swift/WidgetKit app built in Xcode on a Mac. The code in `js/time.js` and `js/render.js` (time-zone math, sun position, wallpaper layouts) maps directly onto a SwiftUI version.

## Files

```
index.html            app shell and screens
styles.css            styling (light and dark)
js/app.js             UI, state, focus timer, wallpaper export
js/time.js            time-zone offsets and sun position
js/render.js          canvas map and wallpaper renderers
js/weather.js         Open-Meteo weather and city search
js/land.js            world land outlines
sw.js                 offline cache
manifest.webmanifest  install metadata
```
