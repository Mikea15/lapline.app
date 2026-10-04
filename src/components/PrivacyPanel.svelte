<!-- PrivacyPanel.svelte - Privacy Policy. Read-only, opened from About. Every
     claim here is checked against what the codebase actually does: storage
     is Dexie/IndexedDB only, and the complete list of network requests is
     loading the app itself (and, on request, its bundled sample files) from
     its own host, the SimpleAnalytics script and events (lib/analytics.ts,
     opt-in), Nominatim reverse geocoding (lib/geocode.ts, opt-in),
     Open-Meteo's weather archive (lib/weather.ts, opt-in) and CARTO's map
     tiles (lib/map-tiles.ts, opt-in). Keep this in step
     with those files - and with the event names passed to trackEvent - when
     either changes. -->
<div class="card" style="max-width: 688px;">
  <span class="section-title">Your activity files never leave your device</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    There's no account and no Lapline server that receives your data. Whatever you import
    (.fit and .gpx files and everything calculated from them) is read in your browser and
    saved in this browser's own database (IndexedDB) on this device, and stays there. We
    can't see it, collect it or store it.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Loading the app</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Lapline is a website hosted on GitHub Pages. Like any web host, GitHub sees your IP
    address and browser details when your browser downloads the app's files. After that the
    app works offline. <strong>Try it with sample data</strong> downloads the sample files from
    the same site. Fonts and icons are part of the app, so no other site is contacted to show
    them.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Analytics (off unless you turn it on)</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    If you turn on <strong>Settings → Analytics</strong>, the app loads
    <strong>SimpleAnalytics</strong>' script (from scripts.simpleanalyticscdn.com) and reports:
  </p>
  <ul style="margin: var(--space-3) 0 0; padding-left: var(--space-8); color: var(--ink-secondary); font-size: var(--fs-md);">
    <li>which screen you open: Today, Activities, Calendar, Trends or Records (an open activity is reported only as "activity detail", never which one);</li>
    <li>when a file fails to import: only whether it was .fit or .gpx, which device maker wrote it (e.g. "garmin", read from the file) and the kind of error (e.g. "not a FIT file") - never the file's name or contents;</li>
    <li>when you import files (how many files and activities, and how many failed), export or restore a backup (how many files), change the date range (which preset), use the sport filter (which sport), open Settings, Import or About, or load or remove the sample data;</li>
    <li>the basics SimpleAnalytics' own script adds to each page view, such as browser, operating system, device type, screen size, referrer and time zone. Their page on <a href="https://docs.simpleanalytics.com/what-we-collect" target="_blank" rel="noopener">what they collect</a> has the full list.</li>
  </ul>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    SimpleAnalytics uses no cookies, doesn't store IP addresses and doesn't follow you across
    visits or sites. It never receives your activity data. Turning it off stops it
    immediately.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Location lookup (off unless you turn it on)</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    If you turn on <strong>Settings → Location lookup</strong>, opening an activity that has GPS
    data sends its <strong>start coordinate</strong> (not the route, and nothing else from the
    activity) to <strong>OpenStreetMap's Nominatim</strong> service, to show a place name on that
    activity (e.g. "City of Amsterdam Running" instead of just "Running"). As with any web
    request, Nominatim also sees your IP address and that the request came from Lapline. Once an
    activity gets an answer, it's saved in this browser, so reopening it sends nothing. If the
    lookup fails (for example while offline), it's tried again the next time you open that
    activity.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Weather lookup (off unless you turn it on)</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    If you turn on <strong>Settings → Weather lookup</strong>, opening an activity that has GPS
    data sends its <strong>start coordinate and date</strong> (not the time, not the route, and
    nothing else from the activity) to <strong>Open-Meteo's</strong> historical weather archive,
    to show the weather (e.g. "Clear", "Rain") next to its temperature. The app picks the hour
    itself from that day's answer. As with any web request, Open-Meteo also sees your IP
    address. Once an activity gets an answer, it's saved in this browser. If there isn't one
    yet (offline, or the archive hasn't caught up with a recent day - it lags by a few days),
    it's tried again the next time you open that activity.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Map backgrounds (off unless you turn it on)</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    If you turn on <strong>Settings → Map backgrounds</strong>, the route map on an activity with
    GPS data loads map images of that area from <strong>CARTO</strong> (map data from OpenStreetMap).
    The route itself is never sent: the app asks for the square map tiles that cover the part of
    the map you're looking at, so CARTO can tell roughly which area it is, at street level. As with
    any web request, CARTO also sees your IP address and that the request came from Lapline. Your
    browser may keep the tiles in its cache, so reopening an activity may send nothing.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">That's the complete list</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    GitHub Pages (the host) and, only if you turn them on, SimpleAnalytics, Nominatim,
    Open-Meteo and CARTO are the only services Lapline talks to, and each receives only what's described
    above. If a future feature needs another service, it will be off until you turn it on and
    it will be listed here first.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Your control over your data</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Because everything lives in this browser, you hold the only copy.
    <strong>Settings → Backup → Export all data</strong> saves all of it as one file you keep.
    <strong>Settings → Danger zone → Reset all data</strong>, or clearing this site's data in
    your browser, erases it permanently. Nobody can restore it afterwards unless you kept a
    backup, because there's no copy on our side.
  </p>
</div>

<div class="card mt-4" style="max-width: 688px;">
  <span class="section-title">Changes to this policy</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    If Lapline's data handling ever changes, this page will be updated before that change
    ships, not after.
  </p>
</div>
