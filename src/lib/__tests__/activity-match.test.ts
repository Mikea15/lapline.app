import { describe, it, expect } from 'vitest';
import { findExistingActivity } from '../activity-match';

describe('findExistingActivity', () => {
  const morning = { id: 1, startTimeLabel: '08:25' };
  const evening = { id: 2, startTimeLabel: '17:24' };

  it('matches the same session on a re-import (same start time)', () => {
    expect(findExistingActivity([morning, evening], { startTimeLabel: '17:24' })).toBe(evening);
  });

  it('does not overwrite a different session of the same sport on the same day', () => {
    // A real stub-data case: two rides on the same day, morning and evening.
    expect(findExistingActivity([morning], { startTimeLabel: '17:24' })).toBeUndefined();
  });

  it('finds nothing when there are no same-day same-sport activities', () => {
    expect(findExistingActivity([], { startTimeLabel: '08:25' })).toBeUndefined();
  });

  it('falls back to date + sport when the parsed activity has no start time', () => {
    expect(findExistingActivity([morning, evening], { startTimeLabel: '' })).toBe(morning);
  });

  it('matches on the UTC start when both have one, even if the local label differs (re-imported in another timezone)', () => {
    const stored = { id: 3, startTimeLabel: '08:25', startUtc: '2026-06-01T06:25:00.000Z' };
    expect(findExistingActivity([stored], { startTimeLabel: '02:25', startUtc: '2026-06-01T06:25:00.000Z' })).toBe(stored);
    expect(findExistingActivity([stored], { startTimeLabel: '08:25', startUtc: '2026-06-01T07:25:00.000Z' })).toBeUndefined();
  });

  it('falls back to the label when the stored activity predates startUtc', () => {
    expect(findExistingActivity([morning, evening], { startTimeLabel: '17:24', startUtc: '2026-06-01T15:24:00.000Z' })).toBe(evening);
  });
});
