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
    version: '1.6.0',
    date: '2026-10-02',
    changes: [
      'A new home page, with a look at each screen, how your data stays on your device, and how to get your workouts out of your watch.',
      'Light mode: choose Dark, Light or Auto (follows your device) in Settings → Theme, or tap the sun/moon button next to Sync. The website follows the same choice.',
      'Import is now the Sync button at the top of every screen.',
      'You can drop a Garmin "Export Original" .zip straight into Sync: the workouts inside are imported, no unzipping needed.',
      'The date range picker moved from the header into the filter bar on Trends, which is now a single compact row. Today follows your default range in Settings.',
      'Records always covers all time. The critical pace curve moved to Trends, where it follows the range and filters you pick.',
      'Aerobic base now counts time in zone 2 only.',
      'VO₂ max now comes from your best hard run in the last 90 days, so it can go down as well as up.',
      'One set of names for training load bands everywhere: Detrain, Productive, Caution and Risk.',
      'Clearer wording across the app: explanations for training load, training effect, SWOLF and more, plain error messages when a file can’t be imported, and "Time trained" used everywhere.',
      'More of the app now follows the imperial setting, including Trends, Records, the Calendar and Run volume.',
      'Fixed: on some laptop screens the Calendar’s Week column was cut off.',
      'Removed the Maximum heart rate setting, which had no effect: heart-rate zones come from your watch.'
    ]
  },
  {
    version: '1.5.0',
    date: '2026-10-01',
    changes: [
      'Today has a new look: six cards up top, covering your fitness trend (chronic load), VO₂ max rating, run volume, aerobic base, time per sport and recovery.',
      'VO₂ max is now rated Poor to Superior for your age and sex. Add your birth year and sex in Settings → Training; both stay on your device.',
      'Consistency: each day is coloured by its main sport and shaded by minutes, months are split apart, and it shows active days, best streak, week streak and how often you train each weekday.',
      'Training load: your acute:chronic ratio on a Detrain / Productive / Caution / Risk scale, with advice for next week, bars and a per-week ratio strip coloured by band, and a key explaining each band.',
      "Time in zone: your easy / moderate / hard split against polarised-training targets, each week's zone mix, and time per zone.",
      'On wide screens, Recent Activities sits beside the charts.',
      "Fixed: brief GPS altitude glitches no longer throw off an activity's altitude range."
    ]
  },
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
      'You can now import .gpx files (like the ones Strava exports), not just .fit files.',
      'Swimming: your shown average pace now reflects only the time you were actually swimming, not rest breaks between lengths - so each length compares more sensibly against it.',
      'Cycling: the per-kilometre tiles now show speed instead of pace, matching the rest of the app.',
      'Bouldering and climbing activities now get their own colour and filter, instead of being grouped under "Other".',
      'Cardio and other no-distance workouts now show your heart-rate breakdown more prominently, right under the timeline.',
      'The Import window no longer shows last time\'s results when you reopen it - it starts fresh, even after resetting all your data.',
      'The "type RESET to confirm" box now focuses automatically, and pressing Enter confirms once you\'ve typed it.',
      'The timeline no longer shows a misleading "0 bpm" heart-rate reading, or a confusing effort breakdown, for activities that don\'t track heart rate.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-09-20',
    changes: [
      'New Calendar screen: your sessions on a month grid, with weekly totals and a month summary. On smaller screens it switches to a week-by-week list.',
      'Average heart rate in the Today and Activities lists is now coloured by heart-rate zone, matching the zones bar next to it.',
      'Fixed: updating your activities after a sport-name fix (e.g. Generic → Bouldering) could create a duplicate instead of correcting the original.',
      'Your device’s own name for an activity (e.g. "Footy") now always shows.',
      'The Today and Activities lists show where an activity took place, once its place name has been looked up.',
      'Activity detail: a new elevation profile for GPS activities, showing height and gradient along the route.',
      'Activity detail: hover the timeline to see time, heart rate, zone, pace and elevation at that point.',
      'Activity detail: rest periods in a pool swim now highlight as you move along the timeline, like lengths do.',
      'Activity detail: accessibility fixes for the route map and zone tiles.'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-17',
    changes: [
      'Swimming activities now show a schematic pool instead of an empty Route panel, coloured by heart-rate zone per length.',
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
    changes: ['Initial release: open your workouts and follow your training in Today, Activities, Trends and Records.']
  }
];

export const CURRENT_VERSION = RELEASE_NOTES[0]!.version;
