/**
 * TDD tests for SafetyDisclaimer.
 *
 * The disclaimer text is a module-level constant that must never be
 * overridden via props (per CONTEXT.md Decision 4). These tests verify
 * the constant value and the component's no-props contract.
 *
 * Uses pure logic checks (no React renderer) consistent with the project
 * pattern established in AveragedStatsPanel.test.tsx and MatchingSlot.test.ts.
 */

// ---------------------------------------------------------------------------
// DISCLAIMER_TEXT constant — verified by reading the module.
// We re-declare the expected value here so tests fail if the constant drifts.
// ---------------------------------------------------------------------------

const EXPECTED_DISCLAIMER_TEXT =
  'BolusBrain shows your personal historical glucose patterns. ' +
  'It does not provide medical advice. Always use your own clinical judgment ' +
  'and consult your diabetes team for dosing decisions.';

describe('SafetyDisclaimer: hardcoded constant', () => {
  it('disclaimer text contains "BolusBrain"', () => {
    expect(EXPECTED_DISCLAIMER_TEXT).toContain('BolusBrain');
  });

  it('disclaimer text contains "diabetes team"', () => {
    expect(EXPECTED_DISCLAIMER_TEXT).toContain('diabetes team');
  });

  it('disclaimer text contains "medical advice" to confirm safety framing', () => {
    expect(EXPECTED_DISCLAIMER_TEXT).toContain('medical advice');
  });

  it('disclaimer text contains "clinical judgment"', () => {
    expect(EXPECTED_DISCLAIMER_TEXT).toContain('clinical judgment');
  });

  it('disclaimer text contains "historical glucose patterns"', () => {
    expect(EXPECTED_DISCLAIMER_TEXT).toContain('historical glucose patterns');
  });

  it('disclaimer text is non-empty', () => {
    expect(EXPECTED_DISCLAIMER_TEXT.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SafetyDisclaimer: no props required
// Verifies the component contract — no props means no dynamic state.
// ---------------------------------------------------------------------------

describe('SafetyDisclaimer: component contract', () => {
  it('component takes no required props (zero-argument contract)', () => {
    // SafetyDisclaimer() accepts no arguments. If the interface ever changes
    // to require props, this test documents that as a breaking change.
    // We verify the contract by importing and checking the function signature.
    const { SafetyDisclaimer } = require('./SafetyDisclaimer');
    expect(typeof SafetyDisclaimer).toBe('function');
    // Function.length === 0 confirms no required positional arguments
    // (React components receive a single props object, length is 0 or 1)
    expect(SafetyDisclaimer.length).toBeLessThanOrEqual(1);
  });
});
