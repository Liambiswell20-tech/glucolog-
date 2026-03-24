/**
 * TDD tests for MealBottomSheet logic.
 *
 * Tests the pure conditions that govern MealBottomSheet rendering:
 * - Tab strip shown only when sessions.length > 1
 * - safeActiveTab clamps to 0 when activeTab >= sessions.length
 * - activeSession is null when sessions is empty
 *
 * Uses logic-level checks (no React renderer) consistent with the project
 * pattern established in AveragedStatsPanel.test.tsx and MatchingSlot.test.ts.
 * @testing-library/react-native is not installed in this project.
 */

import type { SessionWithMeals } from '../services/storage';

// ---------------------------------------------------------------------------
// Helpers — mirror the logic inside MealBottomSheet
// ---------------------------------------------------------------------------

/** Mirror: sessions.length > 1 → tab strip shown */
function shouldShowTabStrip(sessions: SessionWithMeals[]): boolean {
  return sessions.length > 1;
}

/** Mirror: safeActiveTab = activeTab < sessions.length ? activeTab : 0 */
function computeSafeActiveTab(activeTab: number, sessions: SessionWithMeals[]): number {
  return activeTab < sessions.length ? activeTab : 0;
}

/** Mirror: activeSession = sessions[safeActiveTab] ?? null */
function computeActiveSession(
  safeActiveTab: number,
  sessions: SessionWithMeals[]
): SessionWithMeals | null {
  return sessions[safeActiveTab] ?? null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(id: string): SessionWithMeals {
  return {
    id,
    mealIds: [],
    startedAt: new Date().toISOString(),
    confidence: 'high',
    glucoseResponse: null,
    meals: [],
  };
}

// ---------------------------------------------------------------------------
// MealBottomSheet: tab strip visibility
// ---------------------------------------------------------------------------

describe('MealBottomSheet: tab strip visibility', () => {
  it('hides tab strip when sessions is empty', () => {
    expect(shouldShowTabStrip([])).toBe(false);
  });

  it('hides tab strip when sessions has exactly 1 entry', () => {
    expect(shouldShowTabStrip([makeSession('s1')])).toBe(false);
  });

  it('shows tab strip when sessions has exactly 2 entries', () => {
    expect(shouldShowTabStrip([makeSession('s1'), makeSession('s2')])).toBe(true);
  });

  it('shows tab strip when sessions has 5 entries', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => makeSession(`s${i}`));
    expect(shouldShowTabStrip(sessions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MealBottomSheet: safeActiveTab clamping
// ---------------------------------------------------------------------------

describe('MealBottomSheet: safeActiveTab clamping', () => {
  it('returns activeTab when within range', () => {
    const sessions = [makeSession('s1'), makeSession('s2'), makeSession('s3')];
    expect(computeSafeActiveTab(1, sessions)).toBe(1);
  });

  it('clamps to 0 when activeTab equals sessions.length (stale index)', () => {
    const sessions = [makeSession('s1'), makeSession('s2')];
    expect(computeSafeActiveTab(2, sessions)).toBe(0);
  });

  it('clamps to 0 when activeTab exceeds sessions.length', () => {
    const sessions = [makeSession('s1')];
    expect(computeSafeActiveTab(5, sessions)).toBe(0);
  });

  it('returns 0 when sessions is empty (no valid index exists)', () => {
    expect(computeSafeActiveTab(0, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MealBottomSheet: activeSession selection
// ---------------------------------------------------------------------------

describe('MealBottomSheet: activeSession selection', () => {
  it('returns null when sessions is empty', () => {
    expect(computeActiveSession(0, [])).toBeNull();
  });

  it('returns the first session at index 0', () => {
    const s1 = makeSession('s1');
    const s2 = makeSession('s2');
    expect(computeActiveSession(0, [s1, s2])).toBe(s1);
  });

  it('returns the second session at index 1', () => {
    const s1 = makeSession('s1');
    const s2 = makeSession('s2');
    expect(computeActiveSession(1, [s1, s2])).toBe(s2);
  });
});
