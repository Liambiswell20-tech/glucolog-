/**
 * Confidence Scoring + CGM Coverage — Phase F Tests
 * Spec: Session Grouping Design Spec, Section 6 (Confidence scoring model)
 *
 * Tests written TDD-first: these should FAIL before implementation.
 */
import {
  computeMealConfidence,
  computeSessionConfidence,
  computeCgmCoverage,
  computeEndedElevated,
  computeEndedLow,
  computeReturnToBaselineMinutes,
} from '../../services/confidenceScoring';
import type { CurvePoint } from '../../services/nightscout';
import type { ClassificationMethod } from '../../services/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a CurvePoint at a given offset (minutes) from a base timestamp */
function point(baseMs: number, offsetMins: number, mmol: number): CurvePoint {
  return { mmol, date: baseMs + offsetMins * 60_000 };
}

/** Generate evenly-spaced readings every 5 min for a given window.
 *  Produces exactly floor(windowMinutes / 5) points at t=5, t=10, ..., t=windowMinutes.
 *  This matches the expected count in computeCgmCoverage. */
function fullCurve(
  baseMs: number,
  windowMinutes: number,
  mmolValue: number = 7.0,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const count = Math.floor(windowMinutes / 5);
  for (let i = 1; i <= count; i++) {
    points.push(point(baseMs, i * 5, mmolValue));
  }
  return points;
}

// ---------------------------------------------------------------------------
// computeMealConfidence — Section 6 rules
// ---------------------------------------------------------------------------
describe('computeMealConfidence', () => {
  // HIGH: all conditions met (Section 6)
  test('HIGH — solo, no contamination, override_keyword, cgm >= 80%', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'override_keyword',
        cgmCoveragePercent: 85,
      }),
    ).toBe('high');
  });

  test('HIGH — solo, no contamination, carb_bucket, cgm = 80% (boundary)', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 80,
      }),
    ).toBe('high');
  });

  test('HIGH — solo, no contamination, carb_bucket, cgm = 100%', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 100,
      }),
    ).toBe('high');
  });

  // MEDIUM cases (Section 6)
  test('MEDIUM — session member (caps at MEDIUM)', () => {
    expect(
      computeMealConfidence({
        sessionId: 'session-123',
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'override_keyword',
        cgmCoveragePercent: 95,
      }),
    ).toBe('medium');
  });

  test('MEDIUM — solo, fallback classification', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'fallback',
        cgmCoveragePercent: 90,
      }),
    ).toBe('medium');
  });

  test('MEDIUM — solo, CGM coverage 50-80% (55%)', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 55,
      }),
    ).toBe('medium');
  });

  test('MEDIUM — solo, CGM coverage exactly 50% (boundary)', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 50,
      }),
    ).toBe('medium');
  });

  test('MEDIUM — solo, CGM coverage 79.9%', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 79.9,
      }),
    ).toBe('medium');
  });

  // LOW cases (Section 6)
  test('LOW — curve_corrected = true (overrides everything)', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: true,
        hypoDuringSession: false,
        classificationMethod: 'override_keyword',
        cgmCoveragePercent: 95,
      }),
    ).toBe('low');
  });

  test('LOW — hypo_during_session = true (overrides everything)', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: true,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 90,
      }),
    ).toBe('low');
  });

  test('LOW — CGM coverage < 50%', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 40,
      }),
    ).toBe('low');
  });

  test('LOW — CGM coverage 0%', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 0,
      }),
    ).toBe('low');
  });

  // Session member degraded to LOW by session-level flags
  test('LOW — session member with curve_corrected', () => {
    expect(
      computeMealConfidence({
        sessionId: 'session-123',
        curveCorrected: true,
        hypoDuringSession: false,
        classificationMethod: 'override_keyword',
        cgmCoveragePercent: 95,
      }),
    ).toBe('low');
  });

  test('LOW — session member with hypo_during_session', () => {
    expect(
      computeMealConfidence({
        sessionId: 'session-456',
        curveCorrected: false,
        hypoDuringSession: true,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 85,
      }),
    ).toBe('low');
  });

  // ended_elevated is NOT a confidence degrader (Section 6)
  test('ended_elevated does NOT degrade confidence', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: 90,
        endedElevated: true,
      }),
    ).toBe('high');
  });

  // Null CGM coverage — no curve data yet
  test('MEDIUM — null CGM coverage (no curve captured yet)', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
        cgmCoveragePercent: null,
      }),
    ).toBe('medium');
  });

  test('MEDIUM — undefined CGM coverage treated as null', () => {
    expect(
      computeMealConfidence({
        sessionId: null,
        curveCorrected: false,
        hypoDuringSession: false,
        classificationMethod: 'carb_bucket',
      }),
    ).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// computeSessionConfidence — MIN(member confidences)
// ---------------------------------------------------------------------------
describe('computeSessionConfidence', () => {
  test('all HIGH members → HIGH', () => {
    // Note: in practice session members are MEDIUM-capped,
    // but this tests the MIN logic itself
    expect(computeSessionConfidence(['high', 'high', 'high'])).toBe('high');
  });

  test('mixed HIGH and MEDIUM → MEDIUM', () => {
    expect(computeSessionConfidence(['high', 'medium', 'high'])).toBe('medium');
  });

  test('any LOW → LOW', () => {
    expect(computeSessionConfidence(['high', 'medium', 'low'])).toBe('low');
  });

  test('all LOW → LOW', () => {
    expect(computeSessionConfidence(['low', 'low'])).toBe('low');
  });

  test('single member', () => {
    expect(computeSessionConfidence(['medium'])).toBe('medium');
  });

  test('empty array → defaults to low', () => {
    expect(computeSessionConfidence([])).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// computeCgmCoverage — Section 6 CGM coverage thresholds
// ---------------------------------------------------------------------------
describe('computeCgmCoverage', () => {
  const baseMs = new Date('2026-04-22T12:00:00Z').getTime();

  test('full 180-min curve → 100%', () => {
    // 180 / 5 = 36 expected readings, 36 points at t=5 through t=180
    const readings = fullCurve(baseMs, 180);
    expect(computeCgmCoverage(readings, 180, baseMs)).toBeCloseTo(100, 0);
  });

  test('full 60-min curve → 100%', () => {
    const readings = fullCurve(baseMs, 60);
    expect(computeCgmCoverage(readings, 60, baseMs)).toBeCloseTo(100, 0);
  });

  test('15-min dropout on 180-min window → ~91%', () => {
    // Remove 3 readings (15 min gap) from a full 180-min curve
    const readings = fullCurve(baseMs, 180).filter((_, i) => i < 10 || i >= 13);
    const coverage = computeCgmCoverage(readings, 180, baseMs);
    expect(coverage).toBeGreaterThanOrEqual(80);
    expect(coverage).toBeLessThan(100);
  });

  test('two 15-min dropouts on 180-min window → ~83%', () => {
    const readings = fullCurve(baseMs, 180).filter(
      (_, i) => (i < 10 || i >= 13) && (i < 20 || i >= 23),
    );
    const coverage = computeCgmCoverage(readings, 180, baseMs);
    expect(coverage).toBeGreaterThanOrEqual(80);
    expect(coverage).toBeLessThan(92);
  });

  test('45-min gap → MEDIUM range (50-80%)', () => {
    // Remove 9 readings (45 min)
    const readings = fullCurve(baseMs, 180).filter((_, i) => i < 5 || i >= 14);
    const coverage = computeCgmCoverage(readings, 180, baseMs);
    expect(coverage).toBeGreaterThanOrEqual(50);
    expect(coverage).toBeLessThan(80);
  });

  test('90+ min gap → LOW (< 50%)', () => {
    // Only keep first 10 readings (50 min) out of 180-min window
    const readings = fullCurve(baseMs, 180).slice(0, 10);
    const coverage = computeCgmCoverage(readings, 180, baseMs);
    expect(coverage).toBeLessThan(50);
  });

  test('zero readings → 0%', () => {
    expect(computeCgmCoverage([], 180, baseMs)).toBe(0);
  });

  test('readings outside window not counted', () => {
    // All readings end well before the window start
    const beforeBase = baseMs - 120 * 60_000; // 2 hours before window
    const readings = fullCurve(beforeBase, 60);
    expect(computeCgmCoverage(readings, 180, baseMs)).toBe(0);
  });

  test('90-min window expected count', () => {
    const readings = fullCurve(baseMs, 90);
    expect(computeCgmCoverage(readings, 90, baseMs)).toBeCloseTo(100, 0);
  });

  test('240-min window (fat_heavy) full coverage', () => {
    const readings = fullCurve(baseMs, 240);
    expect(computeCgmCoverage(readings, 240, baseMs)).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// computeEndedElevated — Section 4.3 / 6
// ---------------------------------------------------------------------------
describe('computeEndedElevated', () => {
  test('last reading > 10.0 → true', () => {
    const readings: CurvePoint[] = [
      { mmol: 6.0, date: 1000 },
      { mmol: 12.5, date: 2000 },
      { mmol: 11.2, date: 3000 }, // last reading, still elevated
    ];
    expect(computeEndedElevated(readings)).toBe(true);
  });

  test('last reading = 10.0 → false (in range)', () => {
    const readings: CurvePoint[] = [
      { mmol: 6.0, date: 1000 },
      { mmol: 12.0, date: 2000 },
      { mmol: 10.0, date: 3000 },
    ];
    expect(computeEndedElevated(readings)).toBe(false);
  });

  test('last reading = 8.5 → false (in range)', () => {
    const readings: CurvePoint[] = [
      { mmol: 5.0, date: 1000 },
      { mmol: 9.0, date: 2000 },
      { mmol: 8.5, date: 3000 },
    ];
    expect(computeEndedElevated(readings)).toBe(false);
  });

  test('empty readings → false', () => {
    expect(computeEndedElevated([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeEndedLow — Section 6 / CLAUDE.md glucose ranges
// ---------------------------------------------------------------------------
describe('computeEndedLow', () => {
  test('last reading < 3.9 → true', () => {
    const readings: CurvePoint[] = [
      { mmol: 6.0, date: 1000 },
      { mmol: 4.5, date: 2000 },
      { mmol: 3.5, date: 3000 }, // hypo
    ];
    expect(computeEndedLow(readings)).toBe(true);
  });

  test('last reading = 3.9 → false (in range)', () => {
    const readings: CurvePoint[] = [
      { mmol: 6.0, date: 1000 },
      { mmol: 3.9, date: 2000 },
    ];
    expect(computeEndedLow(readings)).toBe(false);
  });

  test('last reading = 5.0 → false', () => {
    const readings: CurvePoint[] = [
      { mmol: 6.0, date: 1000 },
      { mmol: 5.0, date: 2000 },
    ];
    expect(computeEndedLow(readings)).toBe(false);
  });

  test('empty readings → false', () => {
    expect(computeEndedLow([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeReturnToBaselineMinutes — Section 10.6
// ---------------------------------------------------------------------------
describe('computeReturnToBaselineMinutes', () => {
  const baseMs = new Date('2026-04-22T12:00:00Z').getTime();

  test('glucose rises then returns near start → returns minutes to return', () => {
    const startGlucose = 5.5;
    const readings: CurvePoint[] = [
      point(baseMs, 0, 5.5),   // start
      point(baseMs, 15, 8.0),  // rising
      point(baseMs, 30, 10.5), // peak
      point(baseMs, 45, 9.0),  // falling
      point(baseMs, 60, 7.0),  // falling
      point(baseMs, 75, 5.8),  // returned to within ±1.0 of start
    ];
    const result = computeReturnToBaselineMinutes(readings, startGlucose);
    expect(result).toBe(75);
  });

  test('glucose never returns to baseline → null', () => {
    const startGlucose = 5.5;
    const readings: CurvePoint[] = [
      point(baseMs, 0, 5.5),
      point(baseMs, 30, 12.0),
      point(baseMs, 60, 11.5),
      point(baseMs, 90, 10.5), // still elevated, never returns
    ];
    expect(computeReturnToBaselineMinutes(readings, startGlucose)).toBeNull();
  });

  test('glucose starts elevated and stays elevated → null', () => {
    const startGlucose = 11.0;
    const readings: CurvePoint[] = [
      point(baseMs, 0, 11.0),
      point(baseMs, 30, 13.0),
      point(baseMs, 60, 12.5),
    ];
    // Start is already elevated — return to baseline means return to start ± 1.0
    // 12.5 > 12.0 (start + 1.0), so not returned
    expect(computeReturnToBaselineMinutes(readings, startGlucose)).toBeNull();
  });

  test('immediate return (first reading after start is at baseline) → returns early', () => {
    const startGlucose = 6.0;
    const readings: CurvePoint[] = [
      point(baseMs, 0, 6.0),
      point(baseMs, 5, 6.2), // already within ±1.0
    ];
    expect(computeReturnToBaselineMinutes(readings, startGlucose)).toBe(5);
  });

  test('empty readings → null', () => {
    expect(computeReturnToBaselineMinutes([], 6.0)).toBeNull();
  });

  test('single reading → null (need at least start + one more)', () => {
    const readings: CurvePoint[] = [point(baseMs, 0, 6.0)];
    expect(computeReturnToBaselineMinutes(readings, 6.0)).toBeNull();
  });
});
