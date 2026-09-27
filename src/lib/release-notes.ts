// lib/release-notes.ts
// Manually-maintained changelog shown on the Release Notes panel (see
// ReleaseNotesPanel.svelte, opened from About). Newest release first.
// CURRENT_VERSION drives package.json's own version field too - bump both
// together when cutting a release.
export interface ReleaseNote {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.4.0',
    date: '2026-09-25',
    changes: [
      'The app is now called Lapline, with a new icon: a running track.',
      'A new home page at the site\'s address explains what Lapline is. The app itself now lives at /app/; bookmarks and installed apps keep working.',
      'Try it with sample data: six anonymised sessions (runs, a ride, a pool swim and a cardio session) to explore, removable with one click.',
      'Back up everything as one file and restore it in another browser or on another device: Settings → Backup.',
      'Much better on phones: a tab bar at the bottom, a compact header, full-screen dialogs, larger text, activity lists instead of sideways-scrolling tables, explanations that open with a tap, and charts that fit the screen.',
      'The installed app now keeps clear of the notch and the home indicator.',
      'In Safari, Lapline now reminds you to add it to your Home Screen or Dock, because Safari deletes a website\'s data after 7 days without a visit.',
      'Anonymous usage statistics are now off unless you turn them on, and the Privacy page lists exactly what the app sends and where.',
      'The Import window has step-by-step guides for getting files out of Garmin, COROS, Wahoo, Suunto, Polar, Zwift, Apple Watch and Strava.',
      'New Text size setting (S, M, L, XL) that scales everything together.',
      'Activity detail: a redesigned Stats panel, elevation moved into Streams, lap numbers on the route map, and the timeline stays in view while you scroll (on larger screens).',
      'The Training Load chart has a tooltip and real week dates.',
      'Estimates (VO₂ max, training effect, recovery time) are now labelled "est.", and About explains that they\'re training guidance, not medical advice.',
      'Fixed: two sessions of the same sport on the same day no longer overwrite each other when imported.'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-09-20',
    changes: [
      'You can now import GPX files (like the ones Strava exports), not just .fit files.',
      'Swimming: your shown average pace now reflects only the time you were actually swimming, not rest breaks between lengths - so each length compares more sensibly against it.',
      'Cycling: the per-kilometre tiles now show speed instead of pace, matching the rest of the app.',
      'Bouldering and climbing activities now get their own colour and filter, instead of being grouped under "Other".',
      'Cardio and other no-distance workouts now show your heart-rate breakdown more prominently, right under the timeline.',
      'The Import window no longer shows last time\'s results when you reopen it - it starts fresh, even after resetting all your data.',
      'The "type RESET to confirm" box now focuses automatically, and pressing Enter confirms once you\'ve typed it.',
      'The timeline no longer shows a misleading "0 bpm" heart-rate reading, or a confusing effort breakdown, for activities that don\'t track heart rate.',
      'Decided against two ideas for now: labelling extra points along a route (like street names), and a training-plan calendar feature - both would need real data this app doesn\'t have a source for.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-09-20',
    changes: [
      'Added a Calendar screen: a real month grid of completed sessions, with a week rollup column, a month stat strip, and a responsive week-list layout below ~1080px.',
      'The Avg HR column on the Today and Activities ledgers is now color-coded by heart-rate zone, matching the adjacent HR Zones bar.',
      'Fixed a bug where re-parsing a stored file after a sport-name fix (e.g. Generic → Bouldering) could create a duplicate activity instead of correcting the original.',
      'A device’s own custom activity profile name (e.g. "Footy") is now shown even when the underlying sport is already specific, instead of being silently dropped.',
      'The Today and Activities ledgers now show an activity’s cached city name next to the sport, when it’s already been looked up.',
      'Tape: added a real elevation/gradient profile chart, plotting altitude against distance for GPS activities.',
      'Tape: the Timeline chart now shows a real tooltip (time, HR, zone, pace, elevation) instead of a static "Scrub the run" label.',
      'Tape: pool-swim Rest periods now highlight in the length grid and pool schematic while scrubbing, matching how active lengths already did.',
      'Tape: accessibility fixes for the Route panel’s default Plan view, the zone-mix tiles, and the Plan/Relief toggle.'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-17',
    changes: [
      'Swimming activities now show a schematic pool instead of an empty Route panel, colored by heart-rate zone per length.',
      'Added an About page explaining what this app does and how your data is handled.',
      'Added Terms & Conditions and Privacy Policy pages, linked from About.',
      'The Import screen now has a short guide on getting .fit files off your watch or bike computer.',
      'Added a first-time welcome guide for new browsers, with a step-by-step guide to importing your first activity (replayable any time from About).',
      'Consecutive rest lengths in the Swim Splits table are now merged into a single row instead of several near-identical ones.',
      'The Ascent stat is now hidden for pool-swim activities, where it never meant anything.',
      'Fixed the Elevation chart occasionally showing an impossible reading (e.g. a sudden negative spike) from a single bad barometric sensor sample.',
      'Added this Release Notes page.'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-09',
    changes: ['Initial release: import .fit files and track training via Today, Activities, Trends, and Records.']
  }
];

export const CURRENT_VERSION = RELEASE_NOTES[0]!.version;
