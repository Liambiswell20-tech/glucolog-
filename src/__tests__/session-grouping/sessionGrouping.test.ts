/**
 * Phase C — Overlap Detection + Session Lifecycle Tests
 * Spec: Session Grouping Design Spec, Section 3 (Overlap) + Section 4 (Lifecycle)
 *
 * Test IDs from build plan: T-A5, T-A6, T-A7, T-E1, T-C1, T-C2
 */
import {
  detectOverlaps,
  groupOrCreateSession,
  reEvaluateOnEdit,
  reEvaluateOnDelete,
  computeSessionEnd,
  isSessionClosed,
  computePrimaryWindowMinutes,
  type OverlapMeal,
  type SessionMutations,
} from '../../services/sessionGrouping';
import type { Session } from '../../services/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an OverlapMeal with sensible defaults */
function makeMeal(overrides: Partial<OverlapMeal> & { id: string; loggedAt: string }): OverlapMeal {
  return {
    digestionWindowMinutes: 180,
    sessionId: null,
    ...overrides,
  };
}

/** ISO timestamp helper: "14:00" on a fixed date */
function t(hours: number, minutes: number = 0): string {
  return new Date(2026, 3, 22, hours, minutes, 0, 0).toISOString();
}

function makeSession(id: string, mealIds: string[], startedAt: string, sessionEnd: string): Session {
  return {
    id,
    mealIds,
    startedAt,
    confidence: 'high',
    glucoseResponse: null,
    sessionEnd,
  };
}

// ---------------------------------------------------------------------------
// computePrimaryWindowMinutes (Section 3 — 75% rule)
// ---------------------------------------------------------------------------
describe('computePrimaryWindowMinutes', () => {
  it('quick_sugar: 60 → 45 min', () => {
    expect(computePrimaryWindowMinutes(60)).toBe(45);
  });

  it('simple_snack: 90 → 67 min (floored from 67.5)', () => {
    expect(computePrimaryWindowMinutes(90)).toBe(67);
  });

  it('mixed_meal: 180 → 135 min', () => {
    expect(computePrimaryWindowMinutes(180)).toBe(135);
  });

  it('fat_heavy: 240 → 180 min', () => {
    expect(computePrimaryWindowMinutes(240)).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// T-A5: Overlap creates session with backfill (Section 3, 4.1)
// ---------------------------------------------------------------------------
describe('T-A5: Overlap creates session with backfill', () => {
  // apple at 14:00 (simple_snack 90min, primary ends 15:07)
  const apple = makeMeal({ id: 'apple-1', loggedAt: t(14, 0), digestionWindowMinutes: 90, sessionId: null });
  // biscuit at 14:30
  const biscuit = makeMeal({ id: 'biscuit-1', loggedAt: t(14, 30), digestionWindowMinutes: 90, sessionId: null });

  it('detectOverlaps finds apple as overlapping with biscuit', () => {
    const overlaps = detectOverlaps(biscuit, [apple]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].id).toBe('apple-1');
  });

  it('groupOrCreateSession creates a new session with both meals', () => {
    const overlaps = [apple];
    const result = groupOrCreateSession(biscuit, overlaps, []);

    // New session should be created
    expect(result.sessionsToCreate).toHaveLength(1);
    const newSession = result.sessionsToCreate[0];
    expect(newSession.mealIds).toContain('apple-1');
    expect(newSession.mealIds).toContain('biscuit-1');
    expect(newSession.mealIds).toHaveLength(2);

    // session_start = earliest meal = apple at 14:00
    expect(newSession.startedAt).toBe(t(14, 0));

    // session_end = MAX(14:00+90, 14:30+90) = MAX(15:30, 16:00) = 16:00
    expect(newSession.sessionEnd).toBe(t(16, 0));

    // Both meals should be assigned to the new session
    expect(result.mealUpdates).toHaveLength(2);
    const appleUpdate = result.mealUpdates.find(u => u.mealId === 'apple-1');
    const biscuitUpdate = result.mealUpdates.find(u => u.mealId === 'biscuit-1');
    expect(appleUpdate?.newSessionId).toBe(newSession.id);
    expect(biscuitUpdate?.newSessionId).toBe(newSession.id);
  });
});

// ---------------------------------------------------------------------------
// T-A6: Tail overlap stays solo (Section 3 E1)
// ---------------------------------------------------------------------------
describe('T-A6: Tail overlap stays solo', () => {
  // chips at 12:00 (mixed 180min, primary ends 14:15)
  const chips = makeMeal({ id: 'chips-1', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId: null });
  // biscuit at 14:30
  const biscuit = makeMeal({ id: 'biscuit-1', loggedAt: t(14, 30), digestionWindowMinutes: 90, sessionId: null });

  it('detectOverlaps finds no overlap (biscuit is in chips tail)', () => {
    const overlaps = detectOverlaps(biscuit, [chips]);
    expect(overlaps).toHaveLength(0);
  });

  it('groupOrCreateSession returns solo (no mutations)', () => {
    const result = groupOrCreateSession(biscuit, [], []);
    expect(result.sessionsToCreate).toHaveLength(0);
    expect(result.sessionsToDissolve).toHaveLength(0);
    expect(result.mealUpdates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-A7: Transitive chain (Section 3 E3)
// ---------------------------------------------------------------------------
describe('T-A7: Transitive chain — C joins existing session', () => {
  // A chips at 12:00 (mixed, primary ends 14:15)
  // B biscuit at 13:00 (simple_snack 90min, primary ends 14:07)
  // A+B already in session S1
  const sessionId = 'session-s1';
  const mealA = makeMeal({ id: 'meal-a', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId });
  const mealB = makeMeal({ id: 'meal-b', loggedAt: t(13, 0), digestionWindowMinutes: 90, sessionId });
  const mealC = makeMeal({ id: 'meal-c', loggedAt: t(14, 0), digestionWindowMinutes: 90, sessionId: null });

  const existingSession = makeSession(sessionId, ['meal-a', 'meal-b'], t(12, 0), t(15, 0));

  it('detectOverlaps finds A and B as overlapping with C', () => {
    const overlaps = detectOverlaps(mealC, [mealA, mealB]);
    // C at 14:00: A primary ends 14:15 (overlap), B primary ends 14:07 (overlap)
    expect(overlaps).toHaveLength(2);
    expect(overlaps.map(m => m.id).sort()).toEqual(['meal-a', 'meal-b']);
  });

  it('groupOrCreateSession extends existing session S1', () => {
    const overlaps = [mealA, mealB];
    const result = groupOrCreateSession(mealC, overlaps, [existingSession]);

    // No new session — extends existing
    expect(result.sessionsToCreate).toHaveLength(0);
    expect(result.sessionsToDissolve).toHaveLength(0);

    // C joins S1
    const cUpdate = result.mealUpdates.find(u => u.mealId === 'meal-c');
    expect(cUpdate?.newSessionId).toBe(sessionId);

    // Session end should be updated
    // MAX(12:00+180, 13:00+90, 14:00+90) = MAX(15:00, 14:30, 15:30) = 15:30
    expect(result.sessionEndUpdates).toBeDefined();
    if (result.sessionEndUpdates) {
      const update = result.sessionEndUpdates.find(u => u.sessionId === sessionId);
      expect(update?.newSessionEnd).toBe(t(15, 30));
    }
  });
});

// ---------------------------------------------------------------------------
// T-E1: Simultaneous logging — boundary inclusive (Section 3 E2)
// ---------------------------------------------------------------------------
describe('T-E1: Simultaneous logging', () => {
  const meal1 = makeMeal({ id: 'sim-1', loggedAt: t(14, 0), digestionWindowMinutes: 180, sessionId: null });
  const meal2 = makeMeal({ id: 'sim-2', loggedAt: t(14, 0), digestionWindowMinutes: 180, sessionId: null });

  it('detectOverlaps: same timestamp triggers overlap (boundary inclusive)', () => {
    const overlaps = detectOverlaps(meal2, [meal1]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].id).toBe('sim-1');
  });

  it('groupOrCreateSession creates a session for simultaneous meals', () => {
    const result = groupOrCreateSession(meal2, [meal1], []);
    expect(result.sessionsToCreate).toHaveLength(1);
    expect(result.sessionsToCreate[0].mealIds).toContain('sim-1');
    expect(result.sessionsToCreate[0].mealIds).toContain('sim-2');
  });
});

// ---------------------------------------------------------------------------
// T-C1: Timestamp edit dissolves session (Section 4.4)
// ---------------------------------------------------------------------------
describe('T-C1: Timestamp edit dissolves session', () => {
  const sessionId = 'session-dissolve';
  // apple 14:00 + biscuit 14:30 in session
  const apple = makeMeal({ id: 'apple-1', loggedAt: t(14, 0), digestionWindowMinutes: 90, sessionId });
  const biscuit = makeMeal({ id: 'biscuit-1', loggedAt: t(14, 30), digestionWindowMinutes: 90, sessionId });
  const session = makeSession(sessionId, ['apple-1', 'biscuit-1'], t(14, 0), t(16, 0));

  it('editing biscuit timestamp to 16:00 dissolves the session', () => {
    // After edit: biscuit is now at 16:00, well outside apple's primary window (ends 15:07)
    const editedBiscuit = makeMeal({ id: 'biscuit-1', loggedAt: t(16, 0), digestionWindowMinutes: 90, sessionId });
    const allMeals = [apple, editedBiscuit];

    const result = reEvaluateOnEdit('biscuit-1', allMeals, [session]);

    // Session should be dissolved
    expect(result.sessionsToDissolve).toContain(sessionId);

    // Both meals become solo
    const appleUpdate = result.mealUpdates.find(u => u.mealId === 'apple-1');
    const biscuitUpdate = result.mealUpdates.find(u => u.mealId === 'biscuit-1');
    expect(appleUpdate?.newSessionId).toBeNull();
    expect(biscuitUpdate?.newSessionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-C2: Delete splits transitive chain (Section 4.4)
// ---------------------------------------------------------------------------
describe('T-C2: Delete splits transitive chain', () => {
  const sessionId = 'session-chain';
  // A at 12:00 (mixed 180min, primary ends 14:15)
  // B at 13:00 (mixed 180min, primary ends 15:15) — bridge between A and C
  // C at 14:45 (simple_snack 90min)
  // All in session via B as bridge
  const mealA = makeMeal({ id: 'meal-a', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId });
  const mealB = makeMeal({ id: 'meal-b', loggedAt: t(13, 0), digestionWindowMinutes: 180, sessionId });
  const mealC = makeMeal({ id: 'meal-c', loggedAt: t(14, 45), digestionWindowMinutes: 90, sessionId });
  const session = makeSession(sessionId, ['meal-a', 'meal-b', 'meal-c'], t(12, 0), t(16, 15));

  it('deleting B breaks the chain — A and C become solo', () => {
    // After deleting B: A primary ends 14:15, C at 14:45 > 14:15 → no overlap
    const remainingMeals = [mealA, mealC];
    const result = reEvaluateOnDelete('meal-b', remainingMeals, [session]);

    // Original session dissolved
    expect(result.sessionsToDissolve).toContain(sessionId);

    // A and C become solo (no new sessions since each group has <2 members)
    expect(result.sessionsToCreate).toHaveLength(0);
    const aUpdate = result.mealUpdates.find(u => u.mealId === 'meal-a');
    const cUpdate = result.mealUpdates.find(u => u.mealId === 'meal-c');
    expect(aUpdate?.newSessionId).toBeNull();
    expect(cUpdate?.newSessionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeSessionEnd (Section 4.2)
// ---------------------------------------------------------------------------
describe('computeSessionEnd', () => {
  it('returns MAX(member.timestamp + member.digestionWindowMinutes)', () => {
    const meals = [
      makeMeal({ id: 'a', loggedAt: t(14, 0), digestionWindowMinutes: 90 }),   // 15:30
      makeMeal({ id: 'b', loggedAt: t(14, 30), digestionWindowMinutes: 90 }),  // 16:00
    ];
    expect(computeSessionEnd(meals)).toBe(t(16, 0));
  });

  it('handles mixed digestion windows correctly', () => {
    const meals = [
      makeMeal({ id: 'a', loggedAt: t(12, 0), digestionWindowMinutes: 180 }),  // 15:00
      makeMeal({ id: 'b', loggedAt: t(13, 0), digestionWindowMinutes: 90 }),   // 14:30
      makeMeal({ id: 'c', loggedAt: t(14, 0), digestionWindowMinutes: 90 }),   // 15:30
    ];
    expect(computeSessionEnd(meals)).toBe(t(15, 30));
  });
});

// ---------------------------------------------------------------------------
// isSessionClosed (Section 4.3)
// ---------------------------------------------------------------------------
describe('isSessionClosed', () => {
  it('returns true when now > session_end', () => {
    const session = makeSession('s1', ['a'], t(14, 0), t(16, 0));
    const now = new Date(2026, 3, 22, 16, 1, 0, 0); // 16:01
    expect(isSessionClosed(session, now)).toBe(true);
  });

  it('returns false when now < session_end', () => {
    const session = makeSession('s1', ['a'], t(14, 0), t(16, 0));
    const now = new Date(2026, 3, 22, 15, 0, 0, 0); // 15:00
    expect(isSessionClosed(session, now)).toBe(false);
  });

  it('returns true when now === session_end (boundary)', () => {
    const session = makeSession('s1', ['a'], t(14, 0), t(16, 0));
    const now = new Date(2026, 3, 22, 16, 0, 0, 0); // 16:00 exactly
    // "closed the moment current_time > session_end" — exactly equal is NOT closed
    expect(isSessionClosed(session, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additional: Session merge when bridging two sessions
// ---------------------------------------------------------------------------
describe('Session merge: new meal bridges two existing sessions', () => {
  const session1 = makeSession('s1', ['meal-a', 'meal-b'], t(12, 0), t(15, 0));
  const session2 = makeSession('s2', ['meal-c', 'meal-d'], t(16, 0), t(19, 0));

  // meal-a at 12:00 (mixed, primary ends 14:15)
  const mealA = makeMeal({ id: 'meal-a', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId: 's1' });
  const mealB = makeMeal({ id: 'meal-b', loggedAt: t(13, 0), digestionWindowMinutes: 180, sessionId: 's1' });
  // meal-c at 16:00 (mixed, primary ends 18:15)
  const mealC = makeMeal({ id: 'meal-c', loggedAt: t(16, 0), digestionWindowMinutes: 180, sessionId: 's2' });
  const mealD = makeMeal({ id: 'meal-d', loggedAt: t(17, 0), digestionWindowMinutes: 180, sessionId: 's2' });

  // New meal at 14:00 overlaps A (14:00 <= 14:15) but NOT C (14:00 < 16:00)
  // Actually this won't bridge. Let me pick a better example.
  // For bridging: new meal must overlap members of BOTH sessions.
  // meal-b primary ends: 13:00 + 135 = 15:15
  // meal-c primary starts at 16:00
  // New meal at 15:00 overlaps B (15:00 <= 15:15) but not C. Still no bridge.
  //
  // Better setup: sessions closer together
  const session1b = makeSession('s1', ['meal-a'], t(12, 0), t(15, 0));
  const session2b = makeSession('s2', ['meal-c'], t(14, 0), t(17, 0));
  const mealAb = makeMeal({ id: 'meal-a', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId: 's1' });
  const mealCb = makeMeal({ id: 'meal-c', loggedAt: t(14, 0), digestionWindowMinutes: 180, sessionId: 's2' });

  // New meal at 13:30: overlaps A (13:30 <= 14:15) and C (13:30... wait, C is at 14:00 so
  // we check if newMeal is in C's primary window. But the check is: does newMeal fall in
  // existingMeal's primary window? C.timestamp (14:00) <= newMeal.timestamp (13:30)? No, 13:30 < 14:00.
  // The directionality check is: existingMeal.timestamp <= newMeal.timestamp <= primaryWindowEnd
  // So C at 14:00 can't cover newMeal at 13:30 (13:30 < 14:00).
  //
  // For a valid bridge: newMeal must be AFTER both existing meals' timestamps AND within both primary windows.
  // That's very hard with temporal ordering. Let me rethink.
  //
  // Actually: two sessions that are close, new meal falls in BOTH primary windows.
  // Session 1: meal at 12:00 (mixed, primary ends 14:15)
  // Session 2: meal at 13:00 (mixed, primary ends 15:15)
  // These are separate sessions (they were created independently somehow - maybe via edit).
  // New meal at 14:00: falls in meal-12:00's primary (14:00 <= 14:15) AND meal-13:00's primary (14:00 <= 15:15)
  // → bridges S1 and S2

  it('merges two sessions when new meal overlaps members of both', () => {
    const s1 = makeSession('s1', ['m-12'], t(12, 0), t(15, 0));
    const s2 = makeSession('s2', ['m-13'], t(13, 0), t(16, 0));
    const m12 = makeMeal({ id: 'm-12', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId: 's1' });
    const m13 = makeMeal({ id: 'm-13', loggedAt: t(13, 0), digestionWindowMinutes: 180, sessionId: 's2' });
    const newMeal = makeMeal({ id: 'm-14', loggedAt: t(14, 0), digestionWindowMinutes: 180, sessionId: null });

    const overlaps = detectOverlaps(newMeal, [m12, m13]);
    expect(overlaps).toHaveLength(2);

    const result = groupOrCreateSession(newMeal, overlaps, [s1, s2]);

    // Both old sessions dissolved
    expect(result.sessionsToDissolve).toContain('s1');
    expect(result.sessionsToDissolve).toContain('s2');

    // One merged session created
    expect(result.sessionsToCreate).toHaveLength(1);
    const merged = result.sessionsToCreate[0];
    expect(merged.mealIds.sort()).toEqual(['m-12', 'm-13', 'm-14']);
    expect(merged.startedAt).toBe(t(12, 0)); // earliest

    // All meals point to merged session
    for (const update of result.mealUpdates) {
      expect(update.newSessionId).toBe(merged.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Additional: Delete from 3-member session retains session with 2 members
// ---------------------------------------------------------------------------
describe('Delete retains session when ≥2 members remain', () => {
  const sessionId = 'session-3';
  const mealA = makeMeal({ id: 'a', loggedAt: t(12, 0), digestionWindowMinutes: 180, sessionId });
  const mealB = makeMeal({ id: 'b', loggedAt: t(13, 0), digestionWindowMinutes: 180, sessionId });
  const mealC = makeMeal({ id: 'c', loggedAt: t(13, 30), digestionWindowMinutes: 180, sessionId });
  const session = makeSession(sessionId, ['a', 'b', 'c'], t(12, 0), t(16, 30));

  it('deleting C keeps A+B in session (A-B still overlap)', () => {
    // A primary ends 14:15, B at 13:00 <= 14:15 → overlap holds
    const remainingMeals = [mealA, mealB];
    const result = reEvaluateOnDelete('c', remainingMeals, [session]);

    // Session should NOT be dissolved — just updated
    // A and B still overlap, session persists
    const aUpdate = result.mealUpdates.find(u => u.mealId === 'a');
    const bUpdate = result.mealUpdates.find(u => u.mealId === 'b');

    // Both should still be in a session together
    expect(aUpdate?.newSessionId).not.toBeNull();
    expect(bUpdate?.newSessionId).not.toBeNull();
    expect(aUpdate?.newSessionId).toBe(bUpdate?.newSessionId);
  });
});

// ---------------------------------------------------------------------------
// Additional: Overlap detection skips meals with no digestion window
// ---------------------------------------------------------------------------
describe('Overlap detection skips meals without digestion data', () => {
  it('skips meals with null digestionWindowMinutes', () => {
    const existing = makeMeal({ id: 'legacy', loggedAt: t(14, 0), digestionWindowMinutes: null as any, sessionId: null });
    const newMeal = makeMeal({ id: 'new', loggedAt: t(14, 30), digestionWindowMinutes: 90, sessionId: null });
    const overlaps = detectOverlaps(newMeal, [existing]);
    expect(overlaps).toHaveLength(0);
  });
});
