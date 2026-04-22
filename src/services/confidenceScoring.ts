/**
 * Confidence Scoring + CGM Coverage — Session Grouping V2, Phase F
 * Spec: Session Grouping Design Spec, Section 6 (Confidence scoring model)
 *
 * Pure functions. No side effects, no storage writes, no network calls.
 * Confidence is computed at read time (not stored) per Section 3 lazy-computation principle.
 * CGM coverage, ended_elevated, ended_low, return_to_baseline_minutes are computed
 * at curve capture completion and stored.
 *
 * Rules (Section 6):
 * - HIGH: solo, no contamination, override_keyword|carb_bucket, cgm >= 80%
 * - MEDIUM: session member | fallback classification | cgm 50-80% | null cgm
 * - LOW: curve_corrected | hypo_during_session | cgm < 50%
 * - ended_elevated is NOT a confidence degrader
 * - Session confidence = MIN(member confidences)
 * - Session member floor: MEDIUM, degraded to LOW only by session-level flags
 */
import type { CurvePoint } from './nightscout';
import type { ClassificationMethod, SessionConfidence } from './storage';

// ---------------------------------------------------------------------------
// Glucose thresholds — matching CLAUDE.md glucose colour ranges
// ---------------------------------------------------------------------------

/** Above 10.0 mmol/L = elevated (orange) */
const ELEVATED_THRESHOLD = 10.0;

/** Below 3.9 mmol/L = low / hypo (red) */
const LOW_THRESHOLD = 3.9;

// ---------------------------------------------------------------------------
// CGM coverage thresholds (Section 6)
// ---------------------------------------------------------------------------

/** CGM coverage >= 80% → HIGH eligible */
const CGM_HIGH_THRESHOLD = 80;

/** CGM coverage >= 50% → MEDIUM floor; below 50% → LOW */
const CGM_LOW_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Nightscout reading interval
// ---------------------------------------------------------------------------

/** Nightscout delivers readings every 5 minutes */
const READING_INTERVAL_MINUTES = 5;

// ---------------------------------------------------------------------------
// Return to baseline tolerance
// ---------------------------------------------------------------------------

/** Glucose returned to within ±1.0 mmol/L of start_glucose = baseline return */
const BASELINE_TOLERANCE = 1.0;

// ---------------------------------------------------------------------------
// Input type for computeMealConfidence
// ---------------------------------------------------------------------------

export interface MealConfidenceInput {
  sessionId: string | null;
  curveCorrected?: boolean;
  hypoDuringSession?: boolean;
  classificationMethod?: ClassificationMethod | null;
  cgmCoveragePercent?: number | null;
  /** ended_elevated is NOT a confidence degrader (Section 6) — accepted but ignored */
  endedElevated?: boolean;
}

// ---------------------------------------------------------------------------
// computeMealConfidence — Section 6 rule-based model
// ---------------------------------------------------------------------------

/**
 * Compute per-meal curve confidence.
 *
 * Section 6 evaluation order:
 *   1. Check LOW conditions first (contamination flags, cgm < 50%)
 *   2. Check if session member → cap at MEDIUM
 *   3. Check MEDIUM conditions (fallback classification, cgm 50-80%, null cgm)
 *   4. All remaining → HIGH
 */
export function computeMealConfidence(input: MealConfidenceInput): SessionConfidence {
  const {
    sessionId,
    curveCorrected = false,
    hypoDuringSession = false,
    classificationMethod,
    cgmCoveragePercent,
  } = input;

  // --- LOW conditions (override everything) ---
  // Section 6: curve_corrected = true → LOW
  if (curveCorrected) return 'low';
  // Section 6: hypo_during_session = true → LOW
  if (hypoDuringSession) return 'low';
  // Section 6: CGM coverage < 50% → LOW
  if (cgmCoveragePercent != null && cgmCoveragePercent < CGM_LOW_THRESHOLD) return 'low';

  // --- Session member floor: MEDIUM ---
  // Section 6: being a session member is itself a confidence cap at MEDIUM
  if (sessionId != null) return 'medium';

  // --- MEDIUM conditions (solo meal) ---
  // Section 6: solo meal with classification_method = fallback → MEDIUM
  if (classificationMethod === 'fallback') return 'medium';
  // Section 6: solo meal with CGM coverage 50-80% → MEDIUM
  if (cgmCoveragePercent != null && cgmCoveragePercent < CGM_HIGH_THRESHOLD) return 'medium';
  // Null/undefined CGM coverage (no curve captured yet) → MEDIUM
  if (cgmCoveragePercent == null) return 'medium';

  // --- HIGH: all conditions met ---
  return 'high';
}

// ---------------------------------------------------------------------------
// computeSessionConfidence — MIN(member confidences)
// ---------------------------------------------------------------------------

/**
 * Compute session-level confidence as MIN of member confidences.
 * Section 6: "A session's confidence is the lowest among its members."
 */
export function computeSessionConfidence(
  memberConfidences: SessionConfidence[],
): SessionConfidence {
  if (memberConfidences.length === 0) return 'low';

  const order: Record<SessionConfidence, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  let min: SessionConfidence = 'high';
  for (const conf of memberConfidences) {
    if (order[conf] < order[min]) {
      min = conf;
    }
  }
  return min;
}

// ---------------------------------------------------------------------------
// computeCgmCoverage — Section 6 CGM coverage
// ---------------------------------------------------------------------------

/**
 * Compute CGM coverage percentage for a digestion window.
 *
 * Section 6 definition:
 *   cgm_coverage_percent = (count of CGM readings with timestamps inside
 *   the digestion window) / (expected count, based on 5-min interval) × 100
 *
 * @param readings  CGM curve points
 * @param windowMinutes  Digestion window duration (60/90/180/240)
 * @param windowStartMs  Start of the digestion window (epoch ms)
 * @returns Coverage percentage (0-100+)
 */
export function computeCgmCoverage(
  readings: CurvePoint[],
  windowMinutes: number,
  windowStartMs: number,
): number {
  if (windowMinutes <= 0) return 0;

  // Expected readings: one every 5 minutes across the window
  const expectedCount = Math.floor(windowMinutes / READING_INTERVAL_MINUTES);
  if (expectedCount === 0) return 0;

  const windowEndMs = windowStartMs + windowMinutes * 60_000;

  // Count readings inside the window (inclusive boundaries)
  let count = 0;
  for (const r of readings) {
    if (r.date >= windowStartMs && r.date <= windowEndMs) {
      count++;
    }
  }

  return (count / expectedCount) * 100;
}

// ---------------------------------------------------------------------------
// computeEndedElevated — Section 4.3 / 6
// ---------------------------------------------------------------------------

/**
 * Check if the last CGM reading in the curve is above 10.0 mmol/L.
 * Section 4.3: "Glucose still elevated at session_end? Captured as ended_elevated: true"
 * Section 6: NOT a confidence degrader — it's a curve characteristic.
 */
export function computeEndedElevated(readings: CurvePoint[]): boolean {
  if (readings.length === 0) return false;
  const last = readings[readings.length - 1];
  return last.mmol > ELEVATED_THRESHOLD;
}

// ---------------------------------------------------------------------------
// computeEndedLow — Section 6 / CLAUDE.md glucose ranges
// ---------------------------------------------------------------------------

/**
 * Check if the last CGM reading in the curve is below 3.9 mmol/L.
 * Uses CLAUDE.md glucose colour ranges: < 3.9 = hypo (red).
 */
export function computeEndedLow(readings: CurvePoint[]): boolean {
  if (readings.length === 0) return false;
  const last = readings[readings.length - 1];
  return last.mmol < LOW_THRESHOLD;
}

// ---------------------------------------------------------------------------
// computeReturnToBaselineMinutes — Section 10.6
// ---------------------------------------------------------------------------

/**
 * Compute minutes from meal start to when glucose returned to baseline.
 *
 * Section 10.6: field storage only, no Tier A logic.
 * "Baseline" = within ±1.0 mmol/L of startGlucose.
 * Nullable: if glucose never returns within the window, returns null.
 *
 * Skips the first reading (t=0, the start point itself).
 * Looks for the first subsequent reading where glucose is back near start.
 *
 * @param readings  Full curve readings (sorted by time)
 * @param startGlucose  Glucose at meal start (mmol/L)
 * @returns Minutes to return, or null if never returned
 */
export function computeReturnToBaselineMinutes(
  readings: CurvePoint[],
  startGlucose: number,
): number | null {
  if (readings.length < 2) return null;

  const startMs = readings[0].date;

  // Skip first reading (it's the start point)
  for (let i = 1; i < readings.length; i++) {
    const r = readings[i];
    if (Math.abs(r.mmol - startGlucose) <= BASELINE_TOLERANCE) {
      return Math.round((r.date - startMs) / 60_000);
    }
  }

  return null;
}
