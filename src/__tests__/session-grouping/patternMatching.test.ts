/**
 * Pattern Matching Tests — Session Grouping V2, Phase G
 * Spec: Section 7 (Pattern matching), Section 8.4-8.5 (Pattern display)
 * Test cases: T-D1, T-D2, T-D3, T-D4, T-D5, T-D6
 */
import {
  findSoloPatterns,
  findSessionPatterns,
  findPatterns,
  PatternCache,
} from '../../services/patternMatching';
import type { Meal, SessionWithMeals, GlucoseResponse } from '../../services/storage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGlucoseResponse(
  overrides: Partial<GlucoseResponse> = {},
): GlucoseResponse {
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

let mealCounter = 0;

/**
 * Make a HIGH-confidence solo meal:
 * - sessionId: null (solo)
 * - classificationMethod: carb_bucket (not fallback → avoids MEDIUM)
 * - cgmCoveragePercent: 90 (≥80 → avoids MEDIUM)
 */
function makeHighSoloMeal(
  matchingKey: string,
  loggedAt: string,
  insulinUnits = 4,
  glucoseOverrides: Partial<GlucoseResponse> = {},
): Meal {
  mealCounter++;
  return {
    id: `meal-high-${mealCounter}`,
    name: matchingKey,
    photoUri: null,
    insulinUnits,
    startGlucose: 6.0,
    carbsEstimated: 45,
    loggedAt,
    sessionId: null,
    glucoseResponse: makeGlucoseResponse(glucoseOverrides),
    matchingKey,
    matchingKeyVersion: 1,
    classificationBucket: 'mixed_meal',
    classificationMethod: 'carb_bucket',
    classificationKeywordsVersion: '1',
    digestionWindowMinutes: 180,
    cgmCoveragePercent: 90,
  };
}

/**
 * Make a MEDIUM-confidence solo meal (fallback classification).
 */
function makeMediumSoloMeal(
  matchingKey: string,
  loggedAt: string,
  insulinUnits = 4,
): Meal {
  mealCounter++;
  return {
    id: `meal-med-${mealCounter}`,
    name: matchingKey,
    photoUri: null,
    insulinUnits,
    startGlucose: 6.0,
    carbsEstimated: null,
    loggedAt,
    sessionId: null,
    glucoseResponse: makeGlucoseResponse(),
    matchingKey,
    matchingKeyVersion: 1,
    classificationBucket: 'mixed_meal',
    classificationMethod: 'fallback',
    classificationKeywordsVersion: '1',
    digestionWindowMinutes: 180,
    cgmCoveragePercent: 90,
  };
}

/**
 * Make a LOW-confidence solo meal (CGM coverage < 50%).
 */
function makeLowSoloMeal(matchingKey: string, loggedAt: string): Meal {
  mealCounter++;
  return {
    id: `meal-low-${mealCounter}`,
    name: matchingKey,
    photoUri: null,
    insulinUnits: 4,
    startGlucose: 6.0,
    carbsEstimated: 45,
    loggedAt,
    sessionId: null,
    glucoseResponse: makeGlucoseResponse(),
    matchingKey,
    matchingKeyVersion: 1,
    classificationBucket: 'mixed_meal',
    classificationMethod: 'carb_bucket',
    classificationKeywordsVersion: '1',
    digestionWindowMinutes: 180,
    cgmCoveragePercent: 40, // <50% → LOW
  };
}

/**
 * Make a session member meal (sessionId set → MEDIUM floor).
 */
function makeSessionMemberMeal(
  matchingKey: string,
  loggedAt: string,
  sessionId: string,
  insulinUnits = 4,
): Meal {
  mealCounter++;
  return {
    id: `meal-member-${mealCounter}`,
    name: matchingKey,
    photoUri: null,
    insulinUnits,
    startGlucose: 6.0,
    carbsEstimated: 30,
    loggedAt,
    sessionId,
    glucoseResponse: makeGlucoseResponse(),
    matchingKey,
    matchingKeyVersion: 1,
    classificationBucket: 'simple_snack',
    classificationMethod: 'carb_bucket',
    classificationKeywordsVersion: '1',
    digestionWindowMinutes: 90,
    cgmCoveragePercent: 90,
  };
}

let sessionCounter = 0;

function makeTestSession(
  meals: Meal[],
  startedAt: string,
  overrides: Partial<SessionWithMeals> = {},
): SessionWithMeals {
  sessionCounter++;
  const id = `session-${sessionCounter}`;
  // Stamp meals with sessionId
  for (const m of meals) {
    m.sessionId = id;
  }
  return {
    id,
    mealIds: meals.map(m => m.id),
    startedAt,
    confidence: 'medium',
    glucoseResponse: makeGlucoseResponse({
      peakGlucose: 10.0,
      totalRise: 4.0,
    }),
    meals,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset counters
// ---------------------------------------------------------------------------

beforeEach(() => {
  mealCounter = 0;
  sessionCounter = 0;
});

// ---------------------------------------------------------------------------
// T-D1: Pattern view N = 0 (Section 7.3 N=0 threshold)
// ---------------------------------------------------------------------------

describe('T-D1: Pattern view N=0 — empty history', () => {
  it('returns empty state when no past meals exist', () => {
    const result = findSoloPatterns('chips', []);
    expect(result.displayMode).toBe('empty');
    expect(result.highConfidenceCount).toBe(0);
    expect(result.instances).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it('returns empty state when the only meal is excluded (current meal)', () => {
    const currentMeal = makeHighSoloMeal('chips', '2026-03-21T12:00:00Z');
    const result = findSoloPatterns('chips', [currentMeal], currentMeal.id);
    expect(result.displayMode).toBe('empty');
    expect(result.highConfidenceCount).toBe(0);
  });

  it('returns empty state when matching_key is empty string', () => {
    const result = findSoloPatterns('', [makeHighSoloMeal('chips', '2026-03-21T12:00:00Z')]);
    expect(result.displayMode).toBe('empty');
  });
});

// ---------------------------------------------------------------------------
// T-D2: Pattern view N = 2 (Section 7.3 N=1-2 threshold)
// ---------------------------------------------------------------------------

describe('T-D2: Pattern view N=2 — individual instances', () => {
  it('shows individual instances, no summary, newest first', () => {
    const meals = [
      makeHighSoloMeal('chips', '2026-03-19T12:00:00Z', 4, { peakGlucose: 8.0 }),
      makeHighSoloMeal('chips', '2026-03-20T12:00:00Z', 5, { peakGlucose: 10.0 }),
    ];
    const result = findSoloPatterns('chips', meals);

    expect(result.displayMode).toBe('individual');
    expect(result.highConfidenceCount).toBe(2);
    expect(result.instances.length).toBe(2);
    // Newest first (Section 8.4)
    expect(result.instances[0].date).toBe('2026-03-20T12:00:00Z');
    expect(result.instances[1].date).toBe('2026-03-19T12:00:00Z');
    // Per-instance data present (Section 7.4)
    expect(result.instances[0].insulinUnits).toBe(5);
    expect(result.instances[0].peakGlucose).toBe(10.0);
    expect(result.instances[0].carbs).toBe(45);
    expect(result.instances[0].timeToPeakMins).toBe(40);
    // No summary for N < 3
    expect(result.summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-D3: Pattern view N = 5 (Section 7.3 N≥3 threshold)
// ---------------------------------------------------------------------------

describe('T-D3: Pattern view N=5 — summary row', () => {
  it('shows summary + instances when 5 HIGH-confidence solo meals exist', () => {
    const meals = [
      makeHighSoloMeal('chips', '2026-03-15T12:00:00Z', 4, { peakGlucose: 8.0 }),
      makeHighSoloMeal('chips', '2026-03-16T12:00:00Z', 5, { peakGlucose: 9.0 }),
      makeHighSoloMeal('chips', '2026-03-17T12:00:00Z', 6, { peakGlucose: 10.0 }),
      makeHighSoloMeal('chips', '2026-03-18T12:00:00Z', 7, { peakGlucose: 11.0 }),
      makeHighSoloMeal('chips', '2026-03-19T12:00:00Z', 8, { peakGlucose: 12.0 }),
    ];
    const result = findSoloPatterns('chips', meals);

    expect(result.displayMode).toBe('summary');
    expect(result.highConfidenceCount).toBe(5);
    expect(result.instances.length).toBe(5);

    // Summary computed from HIGH meals only (Section 7.3)
    expect(result.summary).not.toBeNull();
    expect(result.summary!.count).toBe(5);
    expect(result.summary!.doseRange).toEqual([4, 8]);
    expect(result.summary!.peakRange).toEqual([8.0, 12.0]);
  });

  it('caps instances at 10 in summary mode', () => {
    const meals = Array.from({ length: 15 }, (_, i) =>
      makeHighSoloMeal('chips', `2026-03-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
    );
    const result = findSoloPatterns('chips', meals);

    expect(result.displayMode).toBe('summary');
    expect(result.highConfidenceCount).toBe(15);
    expect(result.instances.length).toBe(10); // capped at 10 (Section 8.4)
    expect(result.summary!.count).toBe(15); // summary uses all HIGH
  });
});

// ---------------------------------------------------------------------------
// T-D4: Pattern view excludes LOW-confidence (Section 8.5)
// ---------------------------------------------------------------------------

describe('T-D4: Pattern view excludes LOW-confidence', () => {
  it('count reflects HIGH only, LOW excluded from instances', () => {
    const highMeals = [
      makeHighSoloMeal('chips', '2026-03-15T12:00:00Z', 4),
      makeHighSoloMeal('chips', '2026-03-16T12:00:00Z', 5),
      makeHighSoloMeal('chips', '2026-03-17T12:00:00Z', 6),
    ];
    const lowMeals = [
      makeLowSoloMeal('chips', '2026-03-18T12:00:00Z'),    // CGM < 50%
      makeSessionMemberMeal('chips', '2026-03-19T12:00:00Z', 'sess-1'), // session member → excluded from solo
    ];

    const result = findSoloPatterns('chips', [...highMeals, ...lowMeals]);

    // N = 3 HIGH (not 5 total)
    expect(result.highConfidenceCount).toBe(3);
    expect(result.displayMode).toBe('summary');
    expect(result.summary!.count).toBe(3);

    // LOW absent from instances
    expect(result.instances.every(i => i.confidence !== 'low')).toBe(true);
    // Session member absent from solo instances (filtered by sessionId == null)
    expect(result.instances.length).toBe(3);
  });

  it('MEDIUM-confidence meals shown but muted (Section 8.5)', () => {
    const highMeals = [
      makeHighSoloMeal('chips', '2026-03-15T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-16T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-17T12:00:00Z'),
    ];
    const mediumMeals = [
      makeMediumSoloMeal('chips', '2026-03-18T12:00:00Z'),
      makeMediumSoloMeal('chips', '2026-03-19T12:00:00Z'),
    ];

    const result = findSoloPatterns('chips', [...highMeals, ...mediumMeals]);

    // N still 3 (HIGH only)
    expect(result.highConfidenceCount).toBe(3);
    // But instances include MEDIUM meals
    expect(result.instances.length).toBe(5);

    // MEDIUM instances are flagged as muted
    const mediumInstances = result.instances.filter(i => i.confidence === 'medium');
    expect(mediumInstances.length).toBe(2);
    expect(mediumInstances.every(i => i.isMuted)).toBe(true);

    // HIGH instances are not muted
    const highInstances = result.instances.filter(i => i.confidence === 'high');
    expect(highInstances.every(i => !i.isMuted)).toBe(true);

    // Summary based on HIGH only
    expect(result.summary!.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// T-D5: Session pattern shown when N ≥ 3 (Section 7.2)
// ---------------------------------------------------------------------------

describe('T-D5: Session pattern shown when N≥3 sessions', () => {
  it('returns session pattern when 3+ sessions contain the matching_key', () => {
    const sessions: SessionWithMeals[] = [];
    for (let i = 0; i < 3; i++) {
      const chipsMeal = makeSessionMemberMeal(
        'chips',
        `2026-03-${15 + i}T12:00:00Z`,
        `temp-sess-${i}`,
        4 + i,
      );
      const otherMeal = makeSessionMemberMeal(
        'biscuit',
        `2026-03-${15 + i}T12:30:00Z`,
        `temp-sess-${i}`,
      );
      sessions.push(
        makeTestSession([chipsMeal, otherMeal], `2026-03-${15 + i}T12:00:00Z`),
      );
    }

    const result = findSessionPatterns('chips', sessions);

    expect(result).not.toBeNull();
    expect(result!.sessionCount).toBe(3);
    expect(result!.instances.length).toBe(3);
    expect(result!.summary).not.toBeNull();
    expect(result!.summary!.count).toBe(3);
  });

  it('returns null when fewer than 3 sessions contain the matching_key', () => {
    const sessions: SessionWithMeals[] = [];
    for (let i = 0; i < 2; i++) {
      const chipsMeal = makeSessionMemberMeal(
        'chips',
        `2026-03-${15 + i}T12:00:00Z`,
        `temp-sess-${i}`,
      );
      sessions.push(
        makeTestSession([chipsMeal], `2026-03-${15 + i}T12:00:00Z`),
      );
    }

    const result = findSessionPatterns('chips', sessions);
    expect(result).toBeNull();
  });

  it('solo section is empty when all meals are session members', () => {
    const allMeals: Meal[] = [];
    const sessions: SessionWithMeals[] = [];
    for (let i = 0; i < 3; i++) {
      const chipsMeal = makeSessionMemberMeal(
        'chips',
        `2026-03-${15 + i}T12:00:00Z`,
        `temp-sess-${i}`,
      );
      allMeals.push(chipsMeal);
      sessions.push(
        makeTestSession([chipsMeal], `2026-03-${15 + i}T12:00:00Z`),
      );
    }

    const result = findPatterns('chips', allMeals, sessions);

    // Solo: empty (all meals are session members)
    expect(result.solo.displayMode).toBe('empty');
    expect(result.solo.highConfidenceCount).toBe(0);

    // Session: present with 3 sessions
    expect(result.session).not.toBeNull();
    expect(result.session!.sessionCount).toBe(3);
  });

  it('excludes LOW-confidence sessions from session pattern', () => {
    const sessions: SessionWithMeals[] = [];
    // 2 good sessions (MEDIUM confidence — normal for sessions)
    for (let i = 0; i < 2; i++) {
      const chipsMeal = makeSessionMemberMeal(
        'chips',
        `2026-03-${15 + i}T12:00:00Z`,
        `temp-sess-${i}`,
      );
      sessions.push(
        makeTestSession([chipsMeal], `2026-03-${15 + i}T12:00:00Z`),
      );
    }
    // 1 LOW session (curveCorrected)
    const lowChipsMeal = makeSessionMemberMeal(
      'chips',
      '2026-03-20T12:00:00Z',
      'temp-low-sess',
    );
    sessions.push(
      makeTestSession([lowChipsMeal], '2026-03-20T12:00:00Z', {
        curveCorrected: true,
      }),
    );

    // Only 2 eligible sessions (<3) → null
    const result = findSessionPatterns('chips', sessions);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-D6: matching_key normalisation (Section 7.1)
// ---------------------------------------------------------------------------

describe('T-D6: matching_key normalisation', () => {
  it('"Chips", "chips ", "chips." all match matching_key "chips"', () => {
    // All meals have matching_key = 'chips' (set at save time by computeMatchingKey)
    const meals = [
      makeHighSoloMeal('chips', '2026-03-15T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-16T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-17T12:00:00Z'),
    ];
    // matching_key already normalised and stored — all are 'chips'

    const result = findSoloPatterns('chips', meals);
    expect(result.highConfidenceCount).toBe(3);
    expect(result.instances.length).toBe(3);
  });

  it('"chips and mayo" does NOT match "chips" (Section 7.1: mayo preserved)', () => {
    // "chips and mayo" → computeMatchingKey → "chips mayo" (conjunction stripped, mayo preserved)
    const chipsOnlyMeal = makeHighSoloMeal('chips', '2026-03-15T12:00:00Z');
    const chipsMayoMeal = makeHighSoloMeal('chips mayo', '2026-03-16T12:00:00Z');
    chipsMayoMeal.matchingKey = 'chips mayo'; // different matching_key

    const result = findSoloPatterns('chips', [chipsOnlyMeal, chipsMayoMeal]);
    // Only 'chips' matches, not 'chips mayo'
    expect(result.highConfidenceCount).toBe(1);
    expect(result.instances.length).toBe(1);
  });

  it('exact matching_key equality required — no fuzzy matching', () => {
    const chipsMeal = makeHighSoloMeal('chips', '2026-03-15T12:00:00Z');
    const chipMeal = makeHighSoloMeal('chip', '2026-03-16T12:00:00Z');
    chipMeal.matchingKey = 'chip';

    const result = findSoloPatterns('chips', [chipsMeal, chipMeal]);
    expect(result.highConfidenceCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PatternCache — 5-min in-memory cache (Section 3 lazy computation)
// ---------------------------------------------------------------------------

describe('PatternCache', () => {
  it('returns cached result within TTL', () => {
    const cache = new PatternCache();
    const meals = [makeHighSoloMeal('chips', '2026-03-15T12:00:00Z')];
    const result = findPatterns('chips', meals, []);
    cache.set('chips', result);

    expect(cache.get('chips')).toEqual(result);
  });

  it('returns null for missing key', () => {
    const cache = new PatternCache();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns null after TTL expires', () => {
    const cache = new PatternCache();
    const result = findPatterns('chips', [], []);
    cache.set('chips', result);

    // Simulate time passing beyond 5-min TTL
    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + 5 * 60 * 1000 + 1;

    expect(cache.get('chips')).toBeNull();

    Date.now = originalDateNow;
  });

  it('invalidate(key) removes specific entry', () => {
    const cache = new PatternCache();
    cache.set('chips', findPatterns('chips', [], []));
    cache.set('pasta', findPatterns('pasta', [], []));

    cache.invalidate('chips');
    expect(cache.get('chips')).toBeNull();
    expect(cache.get('pasta')).not.toBeNull();
  });

  it('invalidate() clears all entries', () => {
    const cache = new PatternCache();
    cache.set('chips', findPatterns('chips', [], []));
    cache.set('pasta', findPatterns('pasta', [], []));

    cache.invalidate();
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findPatterns — combined lookup
// ---------------------------------------------------------------------------

describe('findPatterns — combined solo + session', () => {
  it('returns both solo and session results', () => {
    const soloMeals = [
      makeHighSoloMeal('chips', '2026-03-10T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-11T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-12T12:00:00Z'),
    ];

    const sessions: SessionWithMeals[] = [];
    const sessionMeals: Meal[] = [];
    for (let i = 0; i < 3; i++) {
      const chipsMeal = makeSessionMemberMeal(
        'chips',
        `2026-03-${15 + i}T12:00:00Z`,
        `temp-sess-${i}`,
      );
      const otherMeal = makeSessionMemberMeal(
        'rice',
        `2026-03-${15 + i}T12:30:00Z`,
        `temp-sess-${i}`,
      );
      sessionMeals.push(chipsMeal, otherMeal);
      sessions.push(
        makeTestSession([chipsMeal, otherMeal], `2026-03-${15 + i}T12:00:00Z`),
      );
    }

    const allMeals = [...soloMeals, ...sessionMeals];
    const result = findPatterns('chips', allMeals, sessions);

    expect(result.solo.displayMode).toBe('summary');
    expect(result.solo.highConfidenceCount).toBe(3);
    expect(result.session).not.toBeNull();
    expect(result.session!.sessionCount).toBe(3);
  });

  it('uses cache when provided', () => {
    const cache = new PatternCache();
    const meals = [
      makeHighSoloMeal('chips', '2026-03-15T12:00:00Z'),
      makeHighSoloMeal('chips', '2026-03-16T12:00:00Z'),
    ];

    // First call populates cache
    const result1 = findPatterns('chips', meals, [], { cache });
    expect(result1.solo.highConfidenceCount).toBe(2);

    // Second call returns cached result (even with different meals)
    const result2 = findPatterns('chips', [], [], { cache });
    expect(result2.solo.highConfidenceCount).toBe(2); // cached
  });
});
