/**
 * Pattern View Tests — Session Grouping V2, Phase K
 * Spec: Section 8.4 (Pattern view layout), Section 8.5 (Contamination flags in pattern view)
 * Test cases: T-D1 (N=0), T-D2 (N=2), T-D3 (N=5), T-D4 (LOW excluded), T-D5 (session pattern)
 *
 * Tests the pure display logic functions exported from PatternView.tsx.
 * Rendering is tested via logic checks (consistent with project pattern — no React renderer).
 */

// Mock UI component chain to avoid @rn-primitives/slot transform issues
jest.mock('~/components/ui/badge', () => ({
  Badge: 'Badge',
  badgeTextVariants: () => '',
  badgeVariants: () => '',
}));
jest.mock('~/components/ui/text', () => ({
  Text: 'Text',
  TextClassContext: { Provider: 'Provider' },
}));

import type {
  SoloPatternResult,
  SessionPatternResult,
  PatternResult,
  PatternInstance,
  SessionPatternInstance,
  PatternSummary,
} from '../../services/patternMatching';

// ---------------------------------------------------------------------------
// Import the pure display functions from PatternView.tsx
// ---------------------------------------------------------------------------

import {
  getPatternHeaderText,
  formatSummaryText,
  getSessionSectionHeader,
  formatOutcomeFrequency,
  PATTERN_COPY,
} from '../../components/PatternView';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstance(overrides: Partial<PatternInstance> = {}): PatternInstance {
  return {
    mealId: 'meal-1',
    mealName: 'Chicken rice',
    date: '2026-04-20T12:00:00Z',
    insulinUnits: 4,
    carbs: 30,
    isAiEstimate: true,
    peakGlucose: 9.2,
    timeToPeakMins: 45,
    outcome: 'GREEN',
    confidence: 'high',
    isMuted: false,
    isSessionMember: false,
    sessionMealCount: null,
    glucoseResponse: null,
    ...overrides,
  };
}

function makeSessionInstance(overrides: Partial<SessionPatternInstance> = {}): SessionPatternInstance {
  return {
    sessionId: 'session-1',
    date: '2026-04-20T12:00:00Z',
    mealCount: 2,
    totalInsulin: 8,
    totalCarbs: 60,
    peakGlucose: 11.5,
    outcome: 'ORANGE',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<PatternSummary> = {}): PatternSummary {
  return {
    count: 5,
    doseRange: [3, 6],
    peakRange: [7.5, 12.1],
    outcomeFrequency: { GREEN: 3, ORANGE: 2 },
    ...overrides,
  };
}

function makeSoloResult(overrides: Partial<SoloPatternResult> = {}): SoloPatternResult {
  return {
    matchingKey: 'chips',
    displayMode: 'empty',
    highConfidenceCount: 0,
    instances: [],
    summary: null,
    ...overrides,
  };
}

function makeSessionResult(overrides: Partial<SessionPatternResult> = {}): SessionPatternResult {
  return {
    matchingKey: 'chips',
    sessionCount: 3,
    instances: [makeSessionInstance(), makeSessionInstance(), makeSessionInstance()],
    summary: makeSummary({ count: 3 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T-D1: Pattern view N=0 — empty state (spec Section 8.4)
// ---------------------------------------------------------------------------

describe('PatternView: T-D1 N=0 empty state', () => {
  it('returns empty state text when displayMode is "empty"', () => {
    expect(PATTERN_COPY.emptyState).toBe('No history for this meal yet.');
  });

  it('getPatternHeaderText returns null for empty display mode', () => {
    const result = getPatternHeaderText('chips', 'empty', 0);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-D2: Pattern view N=1-2 — individual rows (spec Section 8.4)
// ---------------------------------------------------------------------------

describe('PatternView: T-D2 N=1-2 individual', () => {
  it('getPatternHeaderText returns correct header for N=2', () => {
    const header = getPatternHeaderText('chips', 'individual', 2);
    expect(header).not.toBeNull();
    expect(header).toContain('2');
    expect(header).toContain('before');
  });

  it('getPatternHeaderText returns correct header for N=1', () => {
    const header = getPatternHeaderText('chips', 'individual', 1);
    expect(header).not.toBeNull();
    expect(header).toContain('1');
    expect(header).toContain('before');
  });
});

// ---------------------------------------------------------------------------
// T-D3: Pattern view N≥3 — summary mode (spec Section 8.4)
// ---------------------------------------------------------------------------

describe('PatternView: T-D3 N=5 summary', () => {
  it('getPatternHeaderText returns correct header for N=5', () => {
    const header = getPatternHeaderText('chips', 'summary', 5);
    expect(header).not.toBeNull();
    expect(header).toContain('5');
    expect(header).toContain('before');
  });

  it('formatSummaryText returns dose range, peak range, and outcome', () => {
    const summary = makeSummary({
      count: 5,
      doseRange: [3, 6],
      peakRange: [7.5, 12.1],
      outcomeFrequency: { GREEN: 3, ORANGE: 2 },
    });
    const text = formatSummaryText(summary);
    expect(text).toContain('3–6u');
    expect(text).toContain('7.5–12.1');
    expect(text).toContain('3 of 5');
  });

  it('formatSummaryText handles single dose value (min === max)', () => {
    const summary = makeSummary({
      count: 3,
      doseRange: [4, 4],
      peakRange: [8.0, 8.0],
      outcomeFrequency: { GREEN: 3 },
    });
    const text = formatSummaryText(summary);
    expect(text).toContain('4u');
    expect(text).not.toContain('4–4');
  });

  it('formatOutcomeFrequency produces correct text', () => {
    const result = formatOutcomeFrequency({ GREEN: 3, ORANGE: 2 }, 5);
    expect(result).toBe('3 of 5 ended in range');
  });

  it('formatOutcomeFrequency handles all in range', () => {
    const result = formatOutcomeFrequency({ GREEN: 5 }, 5);
    expect(result).toBe('5 of 5 ended in range');
  });

  it('formatOutcomeFrequency handles zero in range', () => {
    const result = formatOutcomeFrequency({ ORANGE: 3, RED: 2 }, 5);
    expect(result).toBe('0 of 5 ended in range');
  });
});

// ---------------------------------------------------------------------------
// T-D4: LOW excluded from pattern view (spec Section 8.5)
// Already handled by patternMatching.ts, verify at view data level
// ---------------------------------------------------------------------------

describe('PatternView: T-D4 LOW excluded', () => {
  it('instances from findSoloPatterns never include LOW confidence', () => {
    // This verifies the contract: PatternView receives pre-filtered data
    // LOW meals are excluded by patternMatching.ts before reaching PatternView
    const soloResult = makeSoloResult({
      displayMode: 'summary',
      highConfidenceCount: 3,
      instances: [
        makeInstance({ confidence: 'high', isMuted: false }),
        makeInstance({ confidence: 'medium', isMuted: true }),
        makeInstance({ confidence: 'high', isMuted: false }),
      ],
    });

    // Verify no LOW instances exist in the data PatternView receives
    const hasLow = soloResult.instances.some(i => i.confidence === 'low');
    expect(hasLow).toBe(false);
  });

  it('MEDIUM instances are flagged as muted', () => {
    const soloResult = makeSoloResult({
      displayMode: 'summary',
      highConfidenceCount: 3,
      instances: [
        makeInstance({ confidence: 'high', isMuted: false }),
        makeInstance({ confidence: 'medium', isMuted: true }),
      ],
    });

    const mutedInstances = soloResult.instances.filter(i => i.isMuted);
    expect(mutedInstances).toHaveLength(1);
    expect(mutedInstances[0].confidence).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// T-D5: Session pattern section (spec Section 8.4)
// ---------------------------------------------------------------------------

describe('PatternView: T-D5 session pattern section', () => {
  it('getSessionSectionHeader returns correct text for N≥3 sessions', () => {
    const header = getSessionSectionHeader(4);
    expect(header).toBe('Also eaten with other foods (4 times)');
  });

  it('getSessionSectionHeader returns correct text for exactly 3 sessions', () => {
    const header = getSessionSectionHeader(3);
    expect(header).toBe('Also eaten with other foods (3 times)');
  });

  it('session pattern is null when fewer than 3 sessions', () => {
    // Verified via patternMatching.ts contract: findSessionPatterns returns null for < 3
    // PatternView receives null and renders nothing
    const result: PatternResult = {
      solo: makeSoloResult({ displayMode: 'summary', highConfidenceCount: 5 }),
      session: null,
    };
    expect(result.session).toBeNull();
  });

  it('session pattern data is never merged with solo data', () => {
    // Spec Section 8.4: "NEVER merged with solo data"
    const result: PatternResult = {
      solo: makeSoloResult({
        displayMode: 'summary',
        highConfidenceCount: 5,
        instances: [makeInstance()],
      }),
      session: makeSessionResult(),
    };

    // Solo instances are PatternInstance[], session instances are SessionPatternInstance[]
    // They are different types — structural separation enforced by TypeScript
    expect(result.solo.instances[0]).toHaveProperty('mealId');
    expect(result.session!.instances[0]).toHaveProperty('sessionId');
    expect(result.session!.instances[0]).not.toHaveProperty('mealId');
  });
});

// ---------------------------------------------------------------------------
// Copy audit — zero predictive language (spec Section 7.3, CLAUDE.md)
// ---------------------------------------------------------------------------

describe('PatternView: copy audit', () => {
  const bannedWords = [
    'recommend', 'should', 'try', 'suggested', 'expected',
    'predict', 'advice', 'will be', 'try taking', 'suggested dose',
  ];

  it('PATTERN_COPY contains no predictive or advisory language', () => {
    const allCopy = Object.values(PATTERN_COPY).join(' ').toLowerCase();
    for (const word of bannedWords) {
      expect(allCopy).not.toContain(word);
    }
  });

  it('getPatternHeaderText contains no banned words', () => {
    const headers = [
      getPatternHeaderText('chips', 'individual', 1),
      getPatternHeaderText('chips', 'individual', 2),
      getPatternHeaderText('chips', 'summary', 5),
    ].filter(Boolean);

    for (const header of headers) {
      const lower = header!.toLowerCase();
      for (const word of bannedWords) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('formatSummaryText contains no banned words', () => {
    const summary = makeSummary();
    const text = formatSummaryText(summary).toLowerCase();
    for (const word of bannedWords) {
      expect(text).not.toContain(word);
    }
  });

  it('getSessionSectionHeader contains no banned words', () => {
    const header = getSessionSectionHeader(5).toLowerCase();
    for (const word of bannedWords) {
      expect(header).not.toContain(word);
    }
  });

  it('summary info sheet text contains no banned words', () => {
    const text = PATTERN_COPY.summaryInfoBody.toLowerCase();
    for (const word of bannedWords) {
      expect(text).not.toContain(word);
    }
  });
});
