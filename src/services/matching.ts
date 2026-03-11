import { SessionWithMeals } from './storage';

export interface SessionMatch {
  session: SessionWithMeals;
  score: number; // 0–1 Jaccard similarity
}

export interface MatchSummary {
  matches: SessionMatch[];
  avgRise: number;       // average totalRise across matched sessions
  avgPeak: number;       // average peakGlucose
  avgTimeToPeak: number; // average timeToPeakMins
}

const SIMILARITY_THRESHOLD = 0.25;
const MAX_MATCHES = 5;

// Weight given to meal-name similarity vs insulin similarity (must sum to 1)
const MEAL_WEIGHT = 0.75;
const INSULIN_WEIGHT = 0.25;

// Insulin units within this tolerance are considered "similar"
const INSULIN_TOLERANCE_UNITS = 2;

// Stop-words that add no signal when comparing meal names
const STOP_WORDS = new Set([
  'and', 'with', 'a', 'the', 'of', 'on', 'in', 'at', 'some', 'bit', 'few',
]);

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[\s,&+/]+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

function sessionTokens(session: SessionWithMeals): Set<string> {
  const all = new Set<string>();
  for (const meal of session.meals) {
    for (const tok of tokenize(meal.name)) {
      all.add(tok);
    }
  }
  return all;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
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
 * Find past sessions that are similar to the target session.
 * Only considers sessions with a completed glucoseResponse.
 * Excludes the target session itself and any session from the same day.
 */
export function findSimilarSessions(
  target: SessionWithMeals,
  allSessions: SessionWithMeals[]
): MatchSummary | null {
  const targetTokens = sessionTokens(target);
  if (targetTokens.size === 0) return null;

  const matches: SessionMatch[] = allSessions
    .filter(
      s =>
        s.id !== target.id &&
        s.glucoseResponse !== null &&
        !s.glucoseResponse.isPartial &&
        !sameDay(s.startedAt, target.startedAt)
    )
    .map(s => {
      const mealScore = jaccard(targetTokens, sessionTokens(s));
      const insulinScore = insulinSimilarity(target, s);
      const score = mealScore * MEAL_WEIGHT + insulinScore * INSULIN_WEIGHT;
      return { session: s, score };
    })
    .filter(m => m.score >= SIMILARITY_THRESHOLD)
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
