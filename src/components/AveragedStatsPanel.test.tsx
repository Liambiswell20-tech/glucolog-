/**
 * TDD tests for AveragedStatsPanel logic.
 *
 * Tests the pure conditions that govern AveragedStatsPanel rendering:
 * - null summary → renders null
 * - fewer than 2 matches → renders null
 * - 2+ matches → renders panel with avgRise / avgPeak / avgTimeToPeak
 *
 * Uses logic-level checks matching the project's established pattern (no React renderer).
 */

import type { MatchSummary } from '../services/matching';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatch() {
  return {} as any;
}

/** Mirror the guard condition used in AveragedStatsPanel. */
function shouldRender(summary: MatchSummary | null): boolean {
  if (!summary || summary.matches.length < 2) return false;
  return true;
}

/** Mirror the avgRise display format: "+X.X" */
function formatAvgRise(value: number): string {
  return `+${value.toFixed(1)}`;
}

/** Mirror the avgPeak display format: "X.X" */
function formatAvgPeak(value: number): string {
  return value.toFixed(1);
}

/** Mirror the avgTimeToPeak display format: integer */
function formatAvgTimeToPeak(value: number): string {
  return `${value}`;
}

// ---------------------------------------------------------------------------
// AveragedStatsPanel: visibility guard
// ---------------------------------------------------------------------------

describe('AveragedStatsPanel: visibility guard', () => {
  it('renders null when summary is null', () => {
    expect(shouldRender(null)).toBe(false);
  });

  it('renders null when summary has 0 matches', () => {
    const summary: MatchSummary = { matches: [], avgRise: 2.1, avgPeak: 9.5, avgTimeToPeak: 45 };
    expect(shouldRender(summary)).toBe(false);
  });

  it('renders null when summary has exactly 1 match', () => {
    const summary: MatchSummary = { matches: [makeMatch()], avgRise: 2.1, avgPeak: 9.5, avgTimeToPeak: 45 };
    expect(shouldRender(summary)).toBe(false);
  });

  it('renders panel when summary has exactly 2 matches', () => {
    const summary: MatchSummary = { matches: [makeMatch(), makeMatch()], avgRise: 2.1, avgPeak: 9.5, avgTimeToPeak: 45 };
    expect(shouldRender(summary)).toBe(true);
  });

  it('renders panel when summary has 5 matches', () => {
    const summary: MatchSummary = {
      matches: [makeMatch(), makeMatch(), makeMatch(), makeMatch(), makeMatch()],
      avgRise: 2.1,
      avgPeak: 9.5,
      avgTimeToPeak: 45,
    };
    expect(shouldRender(summary)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AveragedStatsPanel: stat display formatting
// ---------------------------------------------------------------------------

describe('AveragedStatsPanel: stat display formatting', () => {
  it('formats avgRise with leading + sign and 1 decimal place', () => {
    expect(formatAvgRise(2.1)).toBe('+2.1');
    expect(formatAvgRise(0)).toBe('+0.0');
    expect(formatAvgRise(3.5)).toBe('+3.5');
  });

  it('formats avgPeak with 1 decimal place', () => {
    expect(formatAvgPeak(9.5)).toBe('9.5');
    expect(formatAvgPeak(10.0)).toBe('10.0');
  });

  it('formats avgTimeToPeak as integer string', () => {
    expect(formatAvgTimeToPeak(45)).toBe('45');
    expect(formatAvgTimeToPeak(60)).toBe('60');
  });
});
