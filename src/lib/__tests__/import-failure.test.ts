import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fitManufacturer, fitFailureReason, gpxFailureReason } from '../import-failure';

const DEMO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../public/demo');
const ride = new Uint8Array(readFileSync(path.join(DEMO, 'sample-ride.fit')));

describe('fitManufacturer', () => {
  it("reads the maker from a FIT file's file_id", () => {
    expect(fitManufacturer(ride)).toBe('garmin');
  });
  it('still reads it from a file cut off after the header', () => {
    expect(fitManufacturer(ride.slice(0, 200))).toBe('garmin');
  });
  it("says 'unknown' for something that isn't a FIT file", () => {
    expect(fitManufacturer(new TextEncoder().encode('hello, this is not a fit file'))).toBe('unknown');
  });
});

describe('fitFailureReason', () => {
  it('tells apart empty, not-FIT, corrupt, no workout data and a decoder error', () => {
    expect(fitFailureReason(new Uint8Array(0), 'file is empty')).toBe('empty');
    expect(fitFailureReason(new TextEncoder().encode('<gpx>renamed to .fit, not really one</gpx>'), 'x')).toBe('not_fit');
    expect(fitFailureReason(ride.slice(0, 200), 'x')).toBe('corrupt_fit');
    expect(fitFailureReason(ride, 'no workout data found (file may be corrupted...)')).toBe('no_workout_data');
    expect(fitFailureReason(ride, 'something inside the decoder broke')).toBe('fit_parse_error');
  });
});

describe('gpxFailureReason', () => {
  it('separates a GPX with no track from other GPX errors', () => {
    expect(gpxFailureReason(new Uint8Array(3), 'no track points found (...)')).toBe('gpx_no_track');
    expect(gpxFailureReason(new Uint8Array(3), 'bad xml')).toBe('gpx_parse_error');
    expect(gpxFailureReason(new Uint8Array(0), 'file is empty')).toBe('empty');
  });
});
