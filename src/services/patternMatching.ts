/**
 * Pattern Matching — Session Grouping V2, Phase G
 * Spec: Session Grouping Design Spec, Section 7 (Pattern matching) + Section 8.4-8.5 (Display)
 *
 * Pure functions (except PatternCache). No storage writes, no network calls.
 * Replaces findSimilarSessions() + getMealFingerprint() from matching.ts/mealFingerprint.ts.
 *
 * Key design decisions (Section 7):
 * - Uses stored matching_key (Section 7.1) — NOT computed at query time
 * - Solo vs session pattern separation (Section 7.2)
 * - N-based display thresholds (Section 7.3): 0 / 1-2 / 3+ for solo, 3+ for sessions
 * - Confidence filtering (Section 8.5): HIGH counted, MEDIUM shown muted, LOW excluded
 * - Lazy computation with 5-min in-memory cache (Section 3)
 */
import type { Meal, SessionWithMeals, SessionConfidence } from './storage';
import { computeMealConfidence, computeSessionConfidence } from './confidenceScoring';
import { classifyOutcome, type OutcomeBadge } from '../utils/outcomeClassifier';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum pattern instances returned in summary mode (Section 8.4) */
const MAX_PATTERN_INSTANCES = 10;

/** Cache time-to-live: 5 minutes (Section 3 lazy computation) */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Display mode driven by N (HIGH-confidence count) — Section 7.3 */
export type PatternDisplayMode = 'empty' | 'individual' | 'summary';

/** Per-instance data for pattern view rows — Section 7.4 / 8.4 */
export interface PatternInstance {
  mealId: string;
  date: string;
  insulinUnits: number;
  carbs: number | null;
  peakGlucose: number | null;
  timeToPeakMins: number | null;
  outcome: OutcomeBadge;
  confidence: SessionConfidence;
  /** true for MEDIUM-confidence meals — visually de-emphasised (Section 8.5) */
  isMuted: boolean;
}

/** Summary stats for N ≥ 3 — Section 7.4 */
export interface PatternSummary {
  count: number;
  doseRange: [number, number];
  peakRange: [number, number];
  outcomeFrequency: Record<string, number>;
}

/** Solo pattern result — Section 7.2 */
export interface SoloPatternResult {
  matchingKey: string;
  displayMode: PatternDisplayMode;
  /** Count of HIGH-confidence solo meals — drives N threshold */
  highConfidenceCount: number;
  /** HIGH + MEDIUM instances, newest first. MEDIUM flagged isMuted. */
  instances: PatternInstance[];
  /** Present when highConfidenceCount ≥ 3. Computed from HIGH meals only. */
  summary: PatternSummary | null;
}

/** Per-session instance for session pattern view — Section 8.4 */
export interface SessionPatternInstance {
  sessionId: string;
  date: string;
  mealCount: number;
  totalInsulin: number;
  totalCarbs: number | null;
  peakGlucose: number | null;
  outcome: OutcomeBadge;
}

/** Session pattern result — Section 7.2 */
export interface SessionPatternResult {
  matchingKey: string;
  sessionCount: number;
  instances: SessionPatternInstance[];
  summary: PatternSummary | null;
}

/** Combined pattern lookup result */
export interface PatternResult {
  solo: SoloPatternResult;
  session: SessionPatternResult | null;
}

/** Options for findPatterns */
export interface FindPatternsOptions {
  excludeMealId?: string;
  cache?: PatternCache;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute confidence for a solo meal.
 * Solo meals have no session-level contamination flags (curveCorrected, hypoDuringSession).
 */
function soloMealConfidence(meal: Meal): SessionConfidence {
  return computeMealConfidence({
    sessionId: meal.sessionId,
    classificationMethod: meal.classificationMethod,
    cgmCoveragePercent: meal.cgmCoveragePercent,
    curveCorrected: false,
    hypoDuringSession: false,
  });
}

/** Convert a Meal + confidence into a PatternInstance for display */
function mealToInstance(meal: Meal, confidence: SessionConfidence): PatternInstance {
  return {
    mealId: meal.id,
    date: meal.loggedAt,
    insulinUnits: meal.insulinUnits,
    carbs: meal.carbsEstimated,
    peakGlucose: meal.glucoseResponse?.peakGlucose ?? null,
    timeToPeakMins: meal.glucoseResponse?.timeToPeakMins ?? null,
    outcome: classifyOutcome(meal.glucoseResponse),
    confidence,
    isMuted: confidence === 'medium',
  };
}

/** Compute summary stats from a set of meals — Section 7.4 */
function computeMealSummary(meals: Meal[]): PatternSummary {
  const doses = meals.map(m => m.insulinUnits);
  const peaks = meals
    .map(m => m.glucoseResponse?.peakGlucose)
    .filter((p): p is number => p != null);

  const outcomeFrequency: Record<string, number> = {};
  for (const m of meals) {
    const outcome = classifyOutcome(m.glucoseResponse);
    outcomeFrequency[outcome] = (outcomeFrequency[outcome] ?? 0) + 1;
  }

  return {
    count: meals.length,
    doseRange: doses.length > 0 ? [Math.min(...doses), Math.max(...doses)] : [0, 0],
    peakRange: peaks.length > 0 ? [Math.min(...peaks), Math.max(...peaks)] : [0, 0],
    outcomeFrequency,
  };
}

// ---------------------------------------------------------------------------
// findSoloPatterns — Section 7.2 solo patterns
// ---------------------------------------------------------------------------

/**
 * Find solo meal patterns for a given matching_key.
 *
 * Section 7.2: averages across HIGH-confidence solo meals with same matching_key.
 * Section 7.3: N = count of HIGH. N=0 empty, N=1-2 individual, N≥3 summary.
 * Section 8.5: MEDIUM shown muted, LOW excluded.
 *
 * @param matchingKey  The normalised key to match (stored on meal at save time)
 * @param allMeals     All meals (function filters internally)
 * @param excludeMealId  Optional meal ID to exclude (e.g. the meal being logged)
 */
export function findSoloPatterns(
  matchingKey: string,
  allMeals: Meal[],
  excludeMealId?: string,
): SoloPatternResult {
  const empty: SoloPatternResult = {
    matchingKey,
    displayMode: 'empty',
    highConfidenceCount: 0,
    instances: [],
    summary: null,
  };

  if (!matchingKey) return empty;

  // Filter: solo meals with matching key and complete glucose response
  const candidates = allMeals.filter(
    m =>
      m.sessionId == null &&
      m.matchingKey === matchingKey &&
      m.id !== excludeMealId &&
      m.glucoseResponse != null &&
      !m.glucoseResponse.isPartial,
  );

  // Compute confidence for each
  const withConfidence = candidates.map(m => ({
    meal: m,
    confidence: soloMealConfidence(m),
  }));

  // Section 8.5: exclude LOW
  const eligible = withConfidence.filter(({ confidence }) => confidence !== 'low');

  // Section 7.3: N = count of HIGH-confidence solo meals
  const highConfidenceCount = eligible.filter(
    ({ confidence }) => confidence === 'high',
  ).length;

  if (highConfidenceCount === 0) return empty;

  // Sort newest first (Section 8.4: recency order)
  eligible.sort(
    (a, b) => new Date(b.meal.loggedAt).getTime() - new Date(a.meal.loggedAt).getTime(),
  );

  // Section 7.3: display mode from N threshold
  const displayMode: PatternDisplayMode =
    highConfidenceCount >= 3 ? 'summary' : 'individual';

  // Build instances (HIGH + MEDIUM, MEDIUM flagged as muted)
  const instances = eligible.map(({ meal, confidence }) =>
    mealToInstance(meal, confidence),
  );

  // Section 8.4: cap at 10 in summary mode
  const cappedInstances =
    displayMode === 'summary'
      ? instances.slice(0, MAX_PATTERN_INSTANCES)
      : instances;

  // Section 7.3: summary from HIGH meals only when N ≥ 3
  let summary: PatternSummary | null = null;
  if (displayMode === 'summary') {
    const highMeals = eligible
      .filter(({ confidence }) => confidence === 'high')
      .map(({ meal }) => meal);
    summary = computeMealSummary(highMeals);
  }

  return {
    matchingKey,
    displayMode,
    highConfidenceCount,
    instances: cappedInstances,
    summary,
  };
}

// ---------------------------------------------------------------------------
// findSessionPatterns — Section 7.2 session patterns
// ---------------------------------------------------------------------------

/**
 * Find session patterns for a given matching_key.
 *
 * Section 7.2: averages across sessions containing this matching_key.
 * Display threshold: N ≥ 3 sessions. Below 3 → null (too variable).
 * Section 8.5: LOW-confidence sessions excluded.
 *
 * @param matchingKey  The normalised key to match
 * @param allSessions  All sessions with their meals
 */
export function findSessionPatterns(
  matchingKey: string,
  allSessions: SessionWithMeals[],
): SessionPatternResult | null {
  if (!matchingKey) return null;

  // Find sessions where at least one member has matching matching_key
  // and session has complete glucose response
  const candidates = allSessions.filter(
    s =>
      s.glucoseResponse != null &&
      !s.glucoseResponse.isPartial &&
      s.meals.some(m => m.matchingKey === matchingKey),
  );

  // Compute session confidence and exclude LOW
  const eligible = candidates.filter(s => {
    const memberConfidences = s.meals.map(m =>
      computeMealConfidence({
        sessionId: m.sessionId,
        curveCorrected: s.curveCorrected ?? false,
        hypoDuringSession: s.hypoDuringSession ?? false,
        classificationMethod: m.classificationMethod,
        cgmCoveragePercent: m.cgmCoveragePercent,
      }),
    );
    return computeSessionConfidence(memberConfidences) !== 'low';
  });

  // Section 7.2: session pattern threshold N ≥ 3
  if (eligible.length < 3) return null;

  // Sort newest first
  eligible.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  // Build instances
  const instances: SessionPatternInstance[] = eligible.map(s => {
    const totalInsulin = s.meals.reduce(
      (sum, m) => sum + (m.insulinUnits ?? 0),
      0,
    );
    const hasCarbData = s.meals.some(m => m.carbsEstimated != null);
    const totalCarbs = s.totalCarbs ??
      (hasCarbData
        ? s.meals.reduce((sum, m) => sum + (m.carbsEstimated ?? 0), 0)
        : null);

    return {
      sessionId: s.id,
      date: s.startedAt,
      mealCount: s.meals.length,
      totalInsulin,
      totalCarbs,
      peakGlucose: s.glucoseResponse?.peakGlucose ?? null,
      outcome: classifyOutcome(s.glucoseResponse),
    };
  });

  // Build summary from session-level data
  const doses = instances.map(i => i.totalInsulin);
  const peaks = instances
    .map(i => i.peakGlucose)
    .filter((p): p is number => p != null);
  const outcomeFrequency: Record<string, number> = {};
  for (const inst of instances) {
    const o = inst.outcome;
    outcomeFrequency[o] = (outcomeFrequency[o] ?? 0) + 1;
  }

  const summary: PatternSummary = {
    count: eligible.length,
    doseRange: doses.length > 0 ? [Math.min(...doses), Math.max(...doses)] : [0, 0],
    peakRange: peaks.length > 0 ? [Math.min(...peaks), Math.max(...peaks)] : [0, 0],
    outcomeFrequency,
  };

  return {
    matchingKey,
    sessionCount: eligible.length,
    instances: instances.slice(0, MAX_PATTERN_INSTANCES),
    summary,
  };
}

// ---------------------------------------------------------------------------
// findPatterns — combined lookup
// ---------------------------------------------------------------------------

/**
 * Combined pattern lookup: solo + session patterns for a matching_key.
 * Optionally uses a PatternCache for 5-min in-memory caching.
 */
export function findPatterns(
  matchingKey: string,
  allMeals: Meal[],
  allSessions: SessionWithMeals[],
  options?: FindPatternsOptions,
): PatternResult {
  const cache = options?.cache;
  const excludeMealId = options?.excludeMealId;

  // Check cache
  if (cache) {
    const cached = cache.get(matchingKey);
    if (cached) return cached;
  }

  const result: PatternResult = {
    solo: findSoloPatterns(matchingKey, allMeals, excludeMealId),
    session: findSessionPatterns(matchingKey, allSessions),
  };

  // Populate cache
  if (cache) {
    cache.set(matchingKey, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// PatternCache — 5-min in-memory cache (Section 3 lazy computation)
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: PatternResult;
  timestamp: number;
}

/**
 * Simple in-memory cache for pattern results with 5-minute TTL.
 * Section 3: lazy computation, no database caching, in-memory UI cache only.
 *
 * Intended to be held in React state or component scope.
 * Not a global singleton — each consumer manages its own cache instance.
 */
export class PatternCache {
  private cache = new Map<string, CacheEntry>();

  /** Get cached result, or null if missing/expired */
  get(matchingKey: string): PatternResult | null {
    const entry = this.cache.get(matchingKey);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(matchingKey);
      return null;
    }
    return entry.result;
  }

  /** Store a result in the cache */
  set(matchingKey: string, result: PatternResult): void {
    this.cache.set(matchingKey, { result, timestamp: Date.now() });
  }

  /** Invalidate a specific key, or all keys if no key provided */
  invalidate(matchingKey?: string): void {
    if (matchingKey) {
      this.cache.delete(matchingKey);
    } else {
      this.cache.clear();
    }
  }

  /** Number of entries currently cached */
  get size(): number {
    return this.cache.size;
  }
}
