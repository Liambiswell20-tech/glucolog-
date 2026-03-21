import type { GlucoseResponse } from '../services/storage';

export type OutcomeBadge = 'GREEN' | 'ORANGE' | 'DARK_AMBER' | 'RED' | 'PENDING' | 'NONE';

export function classifyOutcome(glucoseResponse: GlucoseResponse | null): OutcomeBadge {
  if (!glucoseResponse) return 'NONE';
  if (glucoseResponse.isPartial) return 'PENDING';
  const { peakGlucose, endGlucose } = glucoseResponse;
  if (endGlucose < 3.9 || endGlucose >= 14.0 || peakGlucose >= 14.0) return 'RED';
  if (endGlucose > 10.0 && endGlucose < 14.0) return 'DARK_AMBER';
  if (peakGlucose > 10.0 && endGlucose >= 3.9 && endGlucose <= 10.0) return 'ORANGE';
  return 'GREEN';
}
