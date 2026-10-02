// lib/import-failure.ts - why a file failed to import: a coarse error type,
// the message shown for it, and the anonymous "a file failed to import"
// analytics event (only sent when the user has turned analytics on), which
// says which device maker wrote the file and the error type, never the
// file's name or contents, so fixes can go where files actually fail.
import { rewriteFit } from './fit-rewrite';

export type ImportFailureReason =
  | 'empty'
  | 'not_fit' // no FIT header: probably a different file type renamed .fit
  | 'corrupt_fit' // FIT header, but the records don't walk to the end
  | 'no_workout_data' // decoded, but no session (e.g. a settings or monitoring file)
  | 'fit_parse_error' // walks fine, but the decoder threw
  | 'gpx_no_track'
  | 'gpx_parse_error'
  | 'save_error'; // parsed, but writing to the browser's database failed

// FIT manufacturer ids (the FIT SDK profile, as in fit-file-parser's
// garmin_profile.generated.js) for the makers worth telling apart.
const MANUFACTURERS: Record<number, string> = {
  1: 'garmin',
  6: 'srm',
  13: 'dynastream_oem',
  15: 'dynastream',
  23: 'suunto',
  32: 'wahoo',
  40: 'concept2',
  69: 'stages',
  70: 'sigma',
  71: 'tomtom',
  89: 'tacx',
  115: 'igpsport',
  123: 'polar',
  129: 'coros',
  144: 'zwift',
  255: 'development',
  258: 'lezyne',
  260: 'zwift',
  263: 'favero',
  265: 'strava',
  267: 'bryton',
  289: 'hammerhead',
  294: 'coros',
  305: 'whoop',
  310: 'decathlon'
};

/** The maker named in a FIT file's file_id message: a known name, `id_<n>`, or 'unknown'. */
export function fitManufacturer(bytes: Uint8Array): string {
  let id: number | null = null;
  try {
    // `partial`: a damaged or cut-off file usually still has its file_id,
    // which comes first.
    rewriteFit(bytes, {
      partial: true,
      edit(msg) {
        if (id === null && msg.global === 0) id = msg.get(1);
      }
    });
  } catch {
    // Not a FIT file at all.
  }
  if (id === null) return 'unknown';
  return MANUFACTURERS[id] ?? `id_${id}`;
}

/** Why a FIT file failed, when the failure happened while reading it. */
export function fitFailureReason(bytes: Uint8Array, message: string): ImportFailureReason {
  if (bytes.byteLength === 0) return 'empty';
  if (/no workout data/i.test(message)) return 'no_workout_data';
  try {
    rewriteFit(bytes);
  } catch (e) {
    return /not a fit file/i.test(String(e)) ? 'not_fit' : 'corrupt_fit';
  }
  return 'fit_parse_error';
}

export function gpxFailureReason(bytes: Uint8Array, message: string): ImportFailureReason {
  if (bytes.byteLength === 0) return 'empty';
  return /no track points/i.test(message) ? 'gpx_no_track' : 'gpx_parse_error';
}

export const GENERIC_IMPORT_ERROR = 'Something went wrong with this import. Try again, or send the file via About → Feedback.';

/** What to tell the user about a failed file, in place of the raw parser error. */
export function failureMessage(reason: ImportFailureReason): string {
  switch (reason) {
    case 'empty':
      return 'This file is empty. Try exporting it again.';
    case 'not_fit':
      return "Not a workout file. Export the original .fit from your device's app.";
    case 'corrupt_fit':
      return 'This file is damaged or cut short. Try exporting it again.';
    case 'no_workout_data':
      return 'No workout in this file. It may be a settings or daily-health file.';
    case 'gpx_no_track':
      return 'No timed GPS track in this file. Try exporting it again.';
    case 'gpx_parse_error':
      return "This GPX file couldn't be read. Try exporting it again.";
    case 'save_error':
      return "Couldn't save this activity. Check your browser has free storage, then try again.";
    case 'fit_parse_error':
      return GENERIC_IMPORT_ERROR;
  }
}
