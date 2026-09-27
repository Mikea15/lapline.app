// lib/range-preset.ts
// The global time-filter's quick presets (App.svelte's header segmented
// control - "Custom" is a distinct, separately-handled mode there, not part
// of this list). Pulled into their own module, rather than declared inline
// in App.svelte, so the Settings panel can let the user pick which one the
// app should default to without a shared lib file importing from a page
// component.
export type RangePreset = '7d' | '4w' | '12w' | '1y' | 'all';

export const RANGE_PRESET_OPTIONS: RangePreset[] = ['7d', '4w', '12w', '1y', 'all'];

export function isRangePreset(value: string): value is RangePreset {
  return (RANGE_PRESET_OPTIONS as string[]).includes(value);
}

export function rangePresetLabel(preset: RangePreset): string {
  return preset === 'all' ? 'All' : preset;
}
