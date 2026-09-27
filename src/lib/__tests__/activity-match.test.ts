import { describe, it, expect } from 'vitest';
import { findExistingActivity } from '../activity-match';

describe('findExistingActivity', () => {
  const morning = { id: 1, startTimeLabel: '08:25' };
  const evening = { id: 2, startTimeLabel: '17:24' };

  it('matches the same session on a re-import (same start time)', () => {
    expect(findExistingActivity([morning, evening], { startTimeLabel: '17:24' })).toBe(evening);
  });

  it('does not overwrite a different session of the same sport on the same day', () => {
    // The real stub-data case: two rides on 4 Sep, 08:25 and 17:24.
    expect(findExistingActivity([morning], { startTimeLabel: '17:24' })).toBeUndefined();
  });

  it('finds nothing when there are no same-day same-sport activities', () => {
    expect(findExistingActivity([], { startTimeLabel: '08:25' })).toBeUndefined();
  });

  it('falls back to date + sport when the parsed activity has no start time', () => {
    expect(findExistingActivity([morning, evening], { startTimeLabel: '' })).toBe(morning);
  });
});
