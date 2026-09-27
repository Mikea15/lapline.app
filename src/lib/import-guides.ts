// lib/import-guides.ts - how to get original .fit (or .gpx) files out of
// each device maker's app, shown in the Import dialog (ImportPanel.svelte)
// and meant to be reused by the landing page. Plain data, so the wording
// lives in one place. Menu names move between app versions: keep steps to
// what a user will recognise, and say where a step may differ.

export interface ImportGuide {
  id: string;
  name: string;
  /** Steps in order. `**text**` marks a menu item or button name. */
  steps: string[];
  /** An alternative route, or a caveat. */
  note?: string;
}

export const IMPORT_GUIDES: ImportGuide[] = [
  {
    id: 'garmin',
    name: 'Garmin',
    steps: [
      'On the Garmin Connect website (connect.garmin.com), open the activity. The mobile app has no export.',
      'Open the **gear** menu at the top right and choose **Export Original**.',
      'You get a .zip with the .fit file inside: unzip it, then import the .fit.'
    ],
    note: 'Or plug the watch in by USB: in Chrome or Edge use **Connect device folder** above; elsewhere, pick files from the watch\'s GARMIN/Activity folder.'
  },
  {
    id: 'coros',
    name: 'COROS',
    steps: [
      'In the COROS app, open the activity.',
      'Tap the **share** icon at the top right, choose **Export data**, then **.fit**, and save the file.'
    ],
    note: 'On a computer: COROS Training Hub (t.coros.com), open the activity and use its export button.'
  },
  {
    id: 'wahoo',
    name: 'Wahoo',
    steps: [
      'In the ELEMNT app (for ELEMNT, BOLT and ROAM), open **History** and choose the ride.',
      'Tap the **share** icon and choose the **.fit** file, then save it to Files or send it to your computer.'
    ],
    note: 'If rides auto-upload to Dropbox, the .fit files are already in your Dropbox Apps/WahooFitness folder.'
  },
  {
    id: 'suunto',
    name: 'Suunto',
    steps: [
      'In the Suunto app, open the workout.',
      'Tap the **⋯** menu and choose **Export** (FIT), then save the file.'
    ],
    note: "If your app version has no export, connect Suunto to Strava and use Strava's Export Original (below)."
  },
  {
    id: 'polar',
    name: 'Polar',
    steps: [
      'On the Polar Flow website (flow.polar.com), open the training session.',
      'Open the **⋯** menu, choose **Export session** and pick the .fit option if it\'s offered, otherwise **GPX**.'
    ],
    note: "Lapline can't read TCX or CSV yet. A GPX has the route and elevation but no heart rate; for everything, connect Polar Flow to Strava and use Strava's Export Original (below)."
  },
  {
    id: 'zwift',
    name: 'Zwift',
    steps: [
      'Zwift saves every ride as a .fit file on the computer you rode on, in **Documents / Zwift / Activities**.',
      'Import the files from that folder.'
    ],
    note: 'On a phone or tablet, open the activity on zwift.com and download its .fit file there.'
  },
  {
    id: 'apple',
    name: 'Apple Watch',
    steps: [
      "Apple's Fitness and Health apps can't export .fit files, so install an export app on your iPhone, such as HealthFit or RunGap.",
      'In the app, open a workout and export it as a **.fit** file (HealthFit can also export every new workout to iCloud Drive automatically).',
      'Import the .fit files here.'
    ]
  },
  {
    id: 'strava',
    name: 'Strava',
    steps: [
      'On strava.com, open the activity.',
      'Open the **⋯** menu and choose **Export Original**: the file exactly as your device uploaded it, usually .fit.'
    ],
    note: 'Export GPX works for any activity but carries only the route and elevation. To get everything at once, request your archive under Settings → My Account → Download or Delete Your Account.'
  }
];

/** Splits a step into plain and **bold** parts for rendering without {@html}. */
export function stepParts(step: string): { text: string; bold: boolean }[] {
  return step.split(/\*\*(.+?)\*\*/g).map((text, i) => ({ text, bold: i % 2 === 1 })).filter((p) => p.text);
}
