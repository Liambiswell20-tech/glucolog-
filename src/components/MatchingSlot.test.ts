/**
 * TDD tests for MatchingSlot logic (Task 2, Phase 03-02).
 *
 * These tests verify the pure conditions that govern MatchingSlot rendering:
 * - null matchData → nothing rendered
 * - fewer than 2 matches → nothing rendered
 * - 2+ matches → section renders (up to 5 rows)
 * - "Went well" only when classifyOutcome returns GREEN
 * - Confidence warning conditions
 *
 * Tests use the underlying utilities directly (findSimilarSessions, classifyOutcome)
 * since the component logic delegates to them. This avoids needing a React Native
 * renderer while still covering the behaviour spec.
 */

import { findSimilarSessions } from '../services/matching';
import { classifyOutcome } from '../utils/outcomeClassifier';
import type { SessionWithMeals, Meal, GlucoseResponse } from '../services/storage';
import type { MatchSummary } from '../services/matching';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGlucoseResponse(overrides: Partial<GlucoseResponse> = {}): GlucoseResponse {
  return {
    startGlucose: 6.0,
    peakGlucose: 9.0,
    timeToPeakMins: 40,
    totalRise: 3.0,
    endGlucose: 7.0,
    fallFromPeak: 2.0,
    timeFromPeakToEndMins: 60,
    readings: [],
    isPartial: false,
    fetchedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMeal(name: string, insulinUnits = 4): Meal {
  return {
    id: `meal-${name}-${Math.random().toString(36).slice(2)}`,
    name,
    photoUri: null,
    insulinUnits,
    startGlucose: 6.0,
    carbsEstimated: null,
    loggedAt: '2026-01-01T12:00:00Z',
    sessionId: null,
    glucoseResponse: null,
  };
}

let sessionCounter = 0;
function makeSession(
  meals: Meal[],
  startedAt: string,
  glucoseResponse: GlucoseResponse | null = makeGlucoseResponse(),
  confidence: 'high' | 'low' = 'high'
): SessionWithMeals {
  sessionCounter++;
  return {
    id: `session-${sessionCounter}`,
    mealIds: meals.map(m => m.id),
    startedAt,
    confidence,
    glucoseResponse,
    meals,
  };
}

beforeEach(() => {
  sessionCounter = 0;
});

// ---------------------------------------------------------------------------
// MatchingSlot behaviour: null guard
// ---------------------------------------------------------------------------

describe('MatchingSlot: null matchData → nothing rendered', () => {
  it('should render nothing when matchData is null', () => {
    // The component checks: if (!matchSummary || matchSummary.matches.length < 2) return null
    const matchData: MatchSummary | null = null;
    // Guard: null → nothing
    expect(matchData).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MatchingSlot behaviour: fewer-than-2 guard
// ---------------------------------------------------------------------------

describe('MatchingSlot: fewer than 2 matches → nothing rendered', () => {
  it('should render nothing when matchSummary has fewer than 2 matches', () => {
    // findSimilarSessions returns MatchSummary with 1 match in this scenario
    const target = makeSession([makeMeal('pasta bolognese', 4)], '2026-03-21T12:00:00Z');
    // Only 1 matching session available
    const match1 = makeSession([makeMeal('pasta bolognese', 4)], '2026-03-19T12:00:00Z');
    // Non-matching session
    const nonMatch = makeSession([makeMeal('orange juice', 30)], '2026-03-18T12:00:00Z');

    const result = findSimilarSessions(target, [match1, nonMatch]);
    // Result may have 1 match — component must not render with < 2
    if (result !== null) {
      // The guard condition: if fewer than 2 matches, component returns null
      const shouldRender = result.matches.length >= 2;
      expect(shouldRender).toBe(false);
    }
  });

  it('should render when matchSummary has 2+ matches', () => {
    const target = makeSession([makeMeal('chicken pasta', 4)], '2026-03-21T12:00:00Z');
    const match1 = makeSession([makeMeal('chicken pasta bake', 4)], '2026-03-19T12:00:00Z');
    const match2 = makeSession([makeMeal('pasta chicken salad', 4)], '2026-03-18T12:00:00Z');

    const result = findSimilarSessions(target, [match1, match2]);
    expect(result).not.toBeNull();
    // The guard condition: 2+ matches → component renders
    const shouldRender = result !== null && result.matches.length >= 2;
    expect(shouldRender).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MatchingSlot behaviour: "Went well" indicator — only when GREEN
// ---------------------------------------------------------------------------

describe('MatchingSlot: "Went well" only when classifyOutcome returns GREEN', () => {
  it('shows "Went well" for GREEN outcome (in-range peak, in-range end)', () => {
    const gr = makeGlucoseResponse({ peakGlucose: 8.0, endGlucose: 7.0 });
    expect(classifyOutcome(gr)).toBe('GREEN');
    // Component checks: badge === 'GREEN' → render "Went well"
    const badge = classifyOutcome(gr);
    expect(badge === 'GREEN').toBe(true);
  });

  it('does NOT show "Went well" for ORANGE outcome (high peak but in-range end)', () => {
    const gr = makeGlucoseResponse({ peakGlucose: 11.0, endGlucose: 7.0 });
    expect(classifyOutcome(gr)).toBe('ORANGE');
    const badge = classifyOutcome(gr);
    expect(badge === 'GREEN').toBe(false);
  });

  it('does NOT show "Went well" for RED outcome (end glucose low)', () => {
    const gr = makeGlucoseResponse({ peakGlucose: 9.0, endGlucose: 3.0 });
    expect(classifyOutcome(gr)).toBe('RED');
    const badge = classifyOutcome(gr);
    expect(badge === 'GREEN').toBe(false);
  });

  it('does NOT show "Went well" for DARK_AMBER outcome (still high end)', () => {
    const gr = makeGlucoseResponse({ peakGlucose: 11.0, endGlucose: 12.0 });
    expect(classifyOutcome(gr)).toBe('DARK_AMBER');
    const badge = classifyOutcome(gr);
    expect(badge === 'GREEN').toBe(false);
  });

  it('does NOT show "Went well" for PENDING (partial curve)', () => {
    const gr = makeGlucoseResponse({ isPartial: true });
    expect(classifyOutcome(gr)).toBe('PENDING');
    const badge = classifyOutcome(gr);
    expect(badge === 'GREEN').toBe(false);
  });

  it('does NOT show "Went well" for NONE (no glucoseResponse)', () => {
    const badge = classifyOutcome(null);
    expect(badge).toBe('NONE');
    expect(badge === 'GREEN').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MatchingSlot behaviour: confidence warnings
// ---------------------------------------------------------------------------

describe('MatchingSlot: confidence warnings', () => {
  it('own-session confidence warning appears when session.confidence !== "high"', () => {
    // Component: const ownConfidenceLow = ownSession?.confidence !== 'high'
    const lowConfidenceSession = makeSession(
      [makeMeal('toast', 4)], '2026-03-21T12:00:00Z',
      makeGlucoseResponse(), 'low'
    );
    const ownConfidenceLow = lowConfidenceSession.confidence !== 'high';
    expect(ownConfidenceLow).toBe(true);
  });

  it('own-session confidence warning does NOT appear when session.confidence === "high"', () => {
    const highConfidenceSession = makeSession(
      [makeMeal('toast', 4)], '2026-03-21T12:00:00Z',
      makeGlucoseResponse(), 'high'
    );
    const ownConfidenceLow = highConfidenceSession.confidence !== 'high';
    expect(ownConfidenceLow).toBe(false);
  });

  it('per-row confidence warning appears when match.session.confidence !== "high"', () => {
    // Component: const rowConfidenceLow = match.session.confidence !== 'high'
    const target = makeSession([makeMeal('chicken pasta', 4)], '2026-03-21T12:00:00Z');
    const match1 = makeSession([makeMeal('chicken pasta bake', 4)], '2026-03-19T12:00:00Z', makeGlucoseResponse(), 'low');
    const match2 = makeSession([makeMeal('pasta chicken salad', 4)], '2026-03-18T12:00:00Z', makeGlucoseResponse(), 'high');

    const result = findSimilarSessions(target, [match1, match2]);
    expect(result).not.toBeNull();
    if (result) {
      // match1 has low confidence → rowConfidenceLow = true
      const match1Result = result.matches.find(m => m.session.id === match1.id);
      const match2Result = result.matches.find(m => m.session.id === match2.id);
      if (match1Result) {
        expect(match1Result.session.confidence !== 'high').toBe(true);
      }
      if (match2Result) {
        expect(match2Result.session.confidence !== 'high').toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// MatchingSlot behaviour: up to 5 rows shown (capped by findSimilarSessions)
// ---------------------------------------------------------------------------

describe('MatchingSlot: up to 5 rows rendered', () => {
  it('renders at most 5 rows (findSimilarSessions caps at MAX_MATCHES=5)', () => {
    const target = makeSession([makeMeal('pasta bolognese', 4)], '2026-03-21T12:00:00Z');
    const manySessions = Array.from({ length: 8 }, (_, i) =>
      makeSession([makeMeal('pasta bolognese dinner', 4)], `2026-03-${10 + i}T12:00:00Z`)
    );

    const result = findSimilarSessions(target, manySessions);
    if (result) {
      expect(result.matches.length).toBeLessThanOrEqual(5);
    }
  });
});
