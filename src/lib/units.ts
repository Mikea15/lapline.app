// lib/units.ts
// Metric/imperial display formatting. Pure functions - data is always
// stored/entered in metric (km, kg, °C, m); these only affect how values
// are *displayed*, driven by the settingsStore.getUnitSystem() preference.

export type UnitSystem = 'metric' | 'imperial';

const KM_TO_MI = 0.621371;
const KG_TO_LB = 2.20462;
const M_TO_FT = 3.28084;
const PACE_KM_TO_MI = 1.60934; // min/km -> min/mi: multiply by this

// Raw numeric converters (metric -> display units, or passthrough for
// metric) - for feeding chart y-value arrays, which need numbers, not the
// formatted "12.3 km"-style strings the format* functions below return.
export function toDisplayDistance(km: number, system: UnitSystem): number {
  return system === 'imperial' ? km * KM_TO_MI : km;
}
export function toDisplaySpeed(kmh: number, system: UnitSystem): number {
  return system === 'imperial' ? kmh * KM_TO_MI : kmh;
}
export function toDisplayElevation(m: number, system: UnitSystem): number {
  return system === 'imperial' ? m * M_TO_FT : m;
}
export function toDisplayWeight(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? kg * KG_TO_LB : kg;
}
export function toDisplayTemp(celsius: number, system: UnitSystem): number {
  return system === 'imperial' ? (celsius * 9) / 5 + 32 : celsius;
}

export function distanceUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'mi' : 'km';
}

export function speedUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'mph' : 'km/h';
}

export function paceUnit(system: UnitSystem): string {
  return system === 'imperial' ? '/mi' : '/km';
}

export function elevationUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'ft' : 'm';
}

export function weightUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'lb' : 'kg';
}

export function tempUnit(system: UnitSystem): string {
  return system === 'imperial' ? '°F' : '°C';
}

export function formatDistance(km: number, system: UnitSystem, digits = 2): string {
  return `${toDisplayDistance(km, system).toFixed(digits)} ${distanceUnit(system)}`;
}

export function formatSpeed(kmh: number, system: UnitSystem, digits = 1): string {
  return `${toDisplaySpeed(kmh, system).toFixed(digits)} ${speedUnit(system)}`;
}

// minPerKm <= 0 (not available) is the caller's responsibility to check
// beforehand, same convention as the existing local formatPace helpers.
export function formatPace(minPerKm: number, system: UnitSystem): string {
  const perUnit = system === 'imperial' ? minPerKm * PACE_KM_TO_MI : minPerKm;
  let m = Math.floor(perUnit);
  let s = Math.round((perUnit - m) * 60);
  // Rounding the fractional minute up to 60 seconds (e.g. 5:59.7 -> "5:60")
  // instead of carrying it into the next minute ("6:00").
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')} ${paceUnit(system)}`;
}

// Same "M:SS" as formatPace, without the trailing unit token - for
// space-constrained readouts (the Tape view's km tiles and effort-phase
// captions) that already state the unit once elsewhere on the page.
export function formatPaceBare(minPerKm: number, system: UnitSystem): string {
  return formatPace(minPerKm, system).split(' ')[0]!;
}

// Same idea as formatPaceBare, for formatSpeed - the Tape view's km tiles
// show cycling laps as speed instead of pace (matching the hero/ledger,
// which already do) and, like formatPaceBare, state the unit once
// elsewhere rather than repeating it on every tile.
export function formatSpeedBare(kmh: number, system: UnitSystem, digits = 1): string {
  return toDisplaySpeed(kmh, system).toFixed(digits);
}

export function formatElevation(m: number, system: UnitSystem): string {
  return `${toDisplayElevation(m, system).toFixed(0)} ${elevationUnit(system)}`;
}

export function formatWeight(kg: number, system: UnitSystem, digits = 1): string {
  return `${toDisplayWeight(kg, system).toFixed(digits)} ${weightUnit(system)}`;
}

export function formatTemp(celsius: number, system: UnitSystem): string {
  return `${toDisplayTemp(celsius, system).toFixed(1)}${tempUnit(system)}`;
}

export function formatStride(m: number, system: UnitSystem): string {
  return `${toDisplayElevation(m, system).toFixed(2)} ${elevationUnit(system)}`;
}
