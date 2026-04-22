/**
 * @deprecated Phase G: Use patternMatching.ts (findSoloPatterns, findSessionPatterns, findPatterns)
 * instead. This file uses getMealFingerprint() which strips too many stop words (Section 7.1).
 * The spec-compliant matching_key is computed by computeMatchingKey() in classification.ts
 * and stored on each meal at save time.
 *
 * This file is retained for backward compatibility with MealBottomSheet until Phase K.
 */
import levenshtein from 'fast-levenshtein';
import { getMealFingerprint } from '../utils/mealFingerprint';
import { SessionWithMeals } from './storage';

export interface SessionMatch {
  session: SessionWithMeals;
  score: number; // 0–1 insulin similarity score
}

export interface MatchSummary {
  matches: SessionMatch[];
  avgRise: number;       // average totalRise across matched sessions
  avgPeak: number;       // average peakGlucose
  avgTimeToPeak: number; // average timeToPeakMins
}

const MAX_MATCHES = 5;

// Insulin units within this tolerance are considered "similar"
const INSULIN_TOLERANCE_UNITS = 2;

// Maximum Levenshtein distance between fingerprints to treat meals as the same
const FUZZY_MAX_DISTANCE = 2;

/**
 * Canonical fingerprint for an entire session (all meals combined).
 * Multi-meal sessions: join all names, fingerprint the result.
 * "Chicken pasta" + "salad" → getMealFingerprint("Chicken pasta salad")
 */
function sessionFingerprint(session: SessionWithMeals): string {
  return getMealFingerprint(session.meals.map(m => m.name).join(' '));
}

function totalInsulin(session: SessionWithMeals): number {
  return session.meals.reduce((sum, m) => sum + (m.insulinUnits ?? 0), 0);
}

/**
 * Score how similar two sessions' insulin totals are.
 * Returns 1.0 if within tolerance, scaling down to 0 at 3x tolerance.
 */
function insulinSimilarity(a: SessionWithMeals, b: SessionWithMeals): number {
  const diff = Math.abs(totalInsulin(a) - totalInsulin(b));
  if (diff <= INSULIN_TOLERANCE_UNITS) return 1;
  const maxDiff = INSULIN_TOLERANCE_UNITS * 3;
  return Math.max(0, 1 - (diff - INSULIN_TOLERANCE_UNITS) / maxDiff);
}

function sameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Find past sessions that match the target session by fingerprint.
 *
 * Primary: exact fingerprint equality (stop-words stripped, tokens sorted).
 * Fallback: if no exact matches, sessions whose fingerprint is within
 *           Levenshtein distance ≤ 2 of the target fingerprint are included.
 *           This catches minor typos ("chiken" vs "chicken") without
 *           reverting to the false-positive risk of partial/LIKE matching.
 *
 * Only considers sessions with a completed glucoseResponse.
 * Excludes the target session itself and any session from the same day.
 * Ranks matches by insulin similarity; caps at MAX_MATCHES.
 */
export function findSimilarSessions(
  target: SessionWithMeals,
  allSessions: SessionWithMeals[]
): MatchSummary | null {
  const targetFp = sessionFingerprint(target);
  if (!targetFp) return null;

  const candidates = allSessions.filter(
    s =>
      s.id !== target.id &&
      s.glucoseResponse !== null &&
      !s.glucoseResponse.isPartial &&
      !sameDay(s.startedAt, target.startedAt)
  );

  // Primary: exact fingerprint match
  let matched = candidates.filter(s => sessionFingerprint(s) === targetFp);

  // Fallback: fuzzy match within Levenshtein distance ≤ 2
  if (matched.length === 0) {
    matched = candidates.filter(
      s => levenshtein.get(sessionFingerprint(s), targetFp) <= FUZZY_MAX_DISTANCE
    );
  }

  const matches: SessionMatch[] = matched
    .map(s => ({ session: s, score: insulinSimilarity(target, s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES);

  if (matches.length === 0) return null;

  const avgRise =
    matches.reduce((sum, m) => sum + m.session.glucoseResponse!.totalRise, 0) /
    matches.length;
  const avgPeak =
    matches.reduce((sum, m) => sum + m.session.glucoseResponse!.peakGlucose, 0) /
    matches.length;
  const avgTimeToPeak =
    matches.reduce((sum, m) => sum + m.session.glucoseResponse!.timeToPeakMins, 0) /
    matches.length;

  return {
    matches,
    avgRise: Math.round(avgRise * 10) / 10,
    avgPeak: Math.round(avgPeak * 10) / 10,
    avgTimeToPeak: Math.round(avgTimeToPeak),
  };
}
