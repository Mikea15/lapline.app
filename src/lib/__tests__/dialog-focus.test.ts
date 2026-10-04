import { describe, it, expect } from 'vitest';
import { trapTabTarget } from '../dialog-focus';

describe('trapTabTarget', () => {
  it('wraps forward from the last element to the first', () => {
    expect(trapTabTarget(3, 2, false)).toBe(0);
  });
  it('wraps backward from the first element to the last', () => {
    expect(trapTabTarget(3, 0, true)).toBe(2);
  });
  it('lets the browser move focus within the dialog', () => {
    expect(trapTabTarget(3, 1, false)).toBeNull();
    expect(trapTabTarget(3, 1, true)).toBeNull();
  });
  it('pulls focus in from the dialog itself', () => {
    expect(trapTabTarget(3, -1, false)).toBe(0);
    expect(trapTabTarget(3, -1, true)).toBe(2);
  });
  it('keeps focus on the dialog when nothing is focusable', () => {
    expect(trapTabTarget(0, -1, false)).toBe(-1);
  });
});
