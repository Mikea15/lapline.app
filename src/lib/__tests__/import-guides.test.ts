import { describe, it, expect } from 'vitest';
import { IMPORT_GUIDES, stepParts } from '../import-guides';

describe('stepParts', () => {
  it('splits **bold** menu names out of a step', () => {
    expect(stepParts('Open the **gear** menu and choose **Export Original**.')).toEqual([
      { text: 'Open the ', bold: false },
      { text: 'gear', bold: true },
      { text: ' menu and choose ', bold: false },
      { text: 'Export Original', bold: true },
      { text: '.', bold: false }
    ]);
  });
  it('returns plain text unchanged', () => {
    expect(stepParts('Import the files.')).toEqual([{ text: 'Import the files.', bold: false }]);
  });
});

describe('IMPORT_GUIDES', () => {
  it('covers every device the launch plan names, with unique ids and no unclosed markers', () => {
    const names = IMPORT_GUIDES.map((g) => g.name);
    for (const n of ['Garmin', 'COROS', 'Wahoo', 'Suunto', 'Polar', 'Zwift', 'Apple Watch']) expect(names).toContain(n);
    expect(new Set(IMPORT_GUIDES.map((g) => g.id)).size).toBe(IMPORT_GUIDES.length);
    for (const g of IMPORT_GUIDES) for (const t of [...g.steps, g.note ?? '']) expect((t.match(/\*\*/g) ?? []).length % 2).toBe(0);
  });
});
