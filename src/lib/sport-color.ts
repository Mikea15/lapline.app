// lib/sport-color.ts
// Sport identity: the design assigns specific, fixed colors to specific real
// sports (Running/Cycling/Pool swim/Cardio) rather than rotating through a
// generic categorical palette - so sport -> color is a direct lookup here,
// keyed the same way sportIconName below matches FIT's sport vocabulary.

// 'climbing' is deliberately narrow (bouldering/climbing-profile activities
// only) rather than a catch-all for every custom device profile - per your
// call on the logged "per-sport visualization ideas" bug, using this app's
// one real example (a watch's own "Bouldering" profile, sport_profile_name
// carried through by resolveSport() in fit-parser.ts since FIT has no
// dedicated sport enum value for it). That one real file has no ascent,
// no distance, and only a single session-length lap - not the "multiple
// routes/attempts" the original idea speculated about - so this family
// gets its own colour only for now; adding dedicated Session Record fields
// (route/attempt count, etc.) would mean fabricating a shape this app's
// only real climbing data doesn't actually have.
export type SportFamily = 'running' | 'cycling' | 'pool-swim' | 'cardio' | 'climbing' | 'other';

const FAMILY_COLOR: Record<SportFamily, string> = {
  running: 'var(--sport-running)',
  cycling: 'var(--sport-cycling)',
  'pool-swim': 'var(--sport-pool-swim)',
  cardio: 'var(--sport-cardio)',
  climbing: 'var(--sport-climbing)',
  other: 'var(--sport-other)'
};

// Keyword match against the FIT sport/sub_sport string (e.g. "running",
// "trail_running", "lap_swimming", "indoor_cycling") rather than an exact
// lookup table, since Garmin's sport vocabulary has many variants of each
// activity family.
export function sportFamily(sport: string): SportFamily {
  const s = sport.toLowerCase();
  if (s.includes('run')) return 'running';
  if (s.includes('cycl') || s.includes('bik')) return 'cycling';
  if (s.includes('swim')) return 'pool-swim';
  if (s.includes('bould') || s.includes('climb')) return 'climbing';
  if (s.includes('cardio') || s.includes('training') || s.includes('strength') || s.includes('hiit')) return 'cardio';
  return 'other';
}

export function sportColorVar(sport: string): string {
  return FAMILY_COLOR[sportFamily(sport)];
}

export function familyColorVar(family: SportFamily): string {
  return FAMILY_COLOR[family];
}

const FAMILY_LABEL: Record<SportFamily, string> = {
  running: 'Running',
  cycling: 'Cycling',
  'pool-swim': 'Pool Swim',
  cardio: 'Cardio',
  climbing: 'Climbing',
  other: 'Other'
};

export function sportFamilyLabel(sport: string): string {
  return FAMILY_LABEL[sportFamily(sport)];
}

export function familyLabel(family: SportFamily): string {
  return FAMILY_LABEL[family];
}

// One-word names for tight spots (Today's KPI bars and heatmap legend).
const FAMILY_SHORT_LABEL: Record<SportFamily, string> = {
  running: 'Run',
  cycling: 'Bike',
  'pool-swim': 'Swim',
  cardio: 'Cardio',
  climbing: 'Climb',
  other: 'Other'
};

export function familyShortLabel(family: SportFamily): string {
  return FAMILY_SHORT_LABEL[family];
}

export function formatSport(sport: string): string {
  const family = sportFamily(sport);
  if (family === 'pool-swim') return 'Pool Swim';
  return sport
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type SportIconName =
  | 'activities'
  | 'sport-running'
  | 'sport-cycling'
  | 'sport-swimming'
  | 'sport-walking'
  | 'sport-hiking'
  | 'sport-strength'
  | 'sport-cardio'
  | 'sport-climbing';

export function sportIconName(sport: string): SportIconName {
  const s = sport.toLowerCase();
  if (s.includes('cycl') || s.includes('bik')) return 'sport-cycling';
  if (s.includes('swim')) return 'sport-swimming';
  if (s.includes('hik')) return 'sport-hiking';
  if (s.includes('walk')) return 'sport-walking';
  if (s.includes('run')) return 'sport-running';
  if (s.includes('bould') || s.includes('climb')) return 'sport-climbing';
  if (s.includes('strength') || s.includes('weight')) return 'sport-strength';
  if (s.includes('cardio') || s.includes('training')) return 'sport-cardio';
  return 'activities';
}
