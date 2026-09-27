import { describe, it, expect } from 'vitest';
import { feelLabel } from '../training-feel';

describe('feelLabel', () => {
  it('maps the five documented 25-point steps to their Garmin labels', () => {
    expect(feelLabel(0)).toBe('Very weak');
    expect(feelLabel(25)).toBe('Weak');
    expect(feelLabel(50)).toBe('Normal');
    expect(feelLabel(75)).toBe('Strong');
    expect(feelLabel(100)).toBe('Very strong');
  });

  it('rounds an intermediate value to its nearest step', () => {
    expect(feelLabel(70)).toBe('Strong');
    expect(feelLabel(60)).toBe('Normal');
  });

  it('clamps out-of-range values instead of throwing', () => {
    expect(feelLabel(-10)).toBe('Very weak');
    expect(feelLabel(150)).toBe('Very strong');
  });
});
