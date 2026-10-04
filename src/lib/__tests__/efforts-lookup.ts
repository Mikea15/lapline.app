// Test helper: a GetEfforts over in-memory activity details, computing each
// activity's efforts from its streams the way the app does on import.

import { computeActivityEfforts, type GetEfforts } from '../activity-efforts';
import type { ActivityDetail } from '../types';

export function effortsFromDetails(details: Map<number, ActivityDetail>): GetEfforts {
  return async (a) => {
    const d = details.get(a.id);
    return d ? computeActivityEfforts(a.id, a.sport, d.distance, d.t) : null;
  };
}
