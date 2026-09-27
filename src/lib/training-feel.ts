// lib/training-feel.ts
// Garmin's post-activity "How did that feel?" prompt records a 0-100 scale
// (workout_feel) in 25-point steps, each with its own official label - this
// maps the raw number back to that label. Real Garmin field, present only
// when the athlete answered the prompt (recent watches/firmware only).

const FEEL_LABELS = ['Very weak', 'Weak', 'Normal', 'Strong', 'Very strong'];

export function feelLabel(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  const index = Math.round(clamped / 25);
  return FEEL_LABELS[index]!;
}

// Garmin/Firstbeat's own published Training Effect benefit scale - the same
// six bands Garmin Connect itself shows next to an Aerobic/Anaerobic TE
// score. Real vendor scale, not this app's invention, so it's safe to show
// as a qualitative label alongside the raw 0-5 number.
export function trainingEffectLabel(te: number): string {
  if (te < 1) return 'no benefit';
  if (te < 2) return 'minor benefit';
  if (te < 3) return 'maintaining';
  if (te < 4) return 'improving';
  if (te < 5) return 'highly improving';
  return 'overreaching';
}
