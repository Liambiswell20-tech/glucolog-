/**
 * Phase H Integration Tests — saveMeal() + updateMeal() + deleteMeal()
 * Spec: Session Grouping Design Spec, Section 11 (Test Categories A, C, E)
 *
 * These tests verify the FULL pipeline: save → classify → overlap → session → audit.
 * They call the real saveMeal/updateMeal/deleteMeal from storage.ts against AsyncStorage mock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveMeal,
  updateMeal,
  deleteMeal,
  loadMeals,
  loadSessionsWithMeals,
  validateMealTimestamp,
  isBackdateWarningNeeded,
} from '../../services/storage';
import { getAllSessionEvents } from '../../services/sessionEventLog';

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseMeal = (name: string, carbs: number | null = null) => ({
  name,
  photoUri: null,
  insulinUnits: 2,
  startGlucose: 7.0,
  carbsEstimated: carbs,
});

function makeTime(hour: number, minute: number = 0): Date {
  return new Date(`2026-04-22T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
}

// ---------------------------------------------------------------------------
// Category A — Basic classification & grouping (Sections 2, 3)
// ---------------------------------------------------------------------------

describe('Category A — Basic classification & grouping', () => {
  // T-A1: Solo quick sugar via override keyword
  test('T-A1: solo quick sugar via override keyword — jelly beans 12g', async () => {
    const meal = await saveMeal(baseMeal('jelly beans', 12), makeTime(14, 0));

    expect(meal.classificationBucket).toBe('quick_sugar');
    expect(meal.classificationMethod).toBe('override_keyword');
    expect(meal.classificationMatchedKeyword).toBe('jelly beans');
    expect(meal.digestionWindowMinutes).toBe(60);
    expect(meal.sessionId).toBeNull();
    expect(meal.matchingKey).toBe('jelly beans');
  });

  // T-A2: Solo mixed meal via carb bucket
  test('T-A2: solo mixed meal via carb bucket — chicken dinner 45g', async () => {
    const meal = await saveMeal(baseMeal('chicken dinner', 45), makeTime(18, 0));

    expect(meal.classificationBucket).toBe('mixed_meal');
    expect(meal.classificationMethod).toBe('carb_bucket');
    expect(meal.classificationMatchedKeyword).toBeNull();
    expect(meal.digestionWindowMinutes).toBe(180);
    expect(meal.sessionId).toBeNull();
  });

  // T-A3: Fallback classification (carbs null)
  test('T-A3: fallback classification — stew, carbs unknown', async () => {
    const meal = await saveMeal(baseMeal('stew', null), makeTime(19, 0));

    expect(meal.classificationBucket).toBe('mixed_meal');
    expect(meal.classificationMethod).toBe('fallback');
    expect(meal.digestionWindowMinutes).toBe(180);
  });

  // T-A4: Non-carb excluded from grouping
  test('T-A4: non-carb log excluded from session grouping — black coffee 0g', async () => {
    // Existing meal "chips" at 12:00 (fat_heavy, primary ends ~15:00)
    const chips = await saveMeal(baseMeal('chips', 40), makeTime(12, 0));

    // "black coffee" at 13:00, 0g carbs — should be non_carb
    const coffee = await saveMeal(baseMeal('black coffee', 0), makeTime(13, 0));

    expect(coffee.classificationBucket).toBe('non_carb');
    expect(coffee.digestionWindowMinutes).toBe(0);
    expect(coffee.sessionId).toBeNull();

    // Chips should remain solo (not grouped with coffee)
    const meals = await loadMeals();
    const chipsUpdated = meals.find(m => m.id === chips.id);
    expect(chipsUpdated?.sessionId).toBeNull();
  });

  // T-A5: Overlap creates session with backfill
  test('T-A5: overlap creates session with backfill — apple 14:00 + biscuit 14:30', async () => {
    // Apple at 14:00 — simple_snack (90min), primary = 67.5min → ends 15:07:30
    const apple = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    expect(apple.sessionId).toBeNull(); // solo initially

    // Biscuit at 14:30 — within apple's primary window
    const biscuit = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));

    // Both should now be in the same session
    expect(biscuit.sessionId).toBeTruthy();

    // Apple should have been backfilled into the session
    const meals = await loadMeals();
    const appleUpdated = meals.find(m => m.id === apple.id);
    expect(appleUpdated?.sessionId).toBe(biscuit.sessionId);

    // Audit trail should have 'created' + 'member_added_via_backfill'
    const events = await getAllSessionEvents();
    const createdEvents = events.filter(e => e.eventType === 'created');
    const backfillEvents = events.filter(e => e.eventType === 'member_added_via_backfill');
    expect(createdEvents.length).toBeGreaterThanOrEqual(1);
    expect(backfillEvents.length).toBeGreaterThanOrEqual(1);
  });

  // T-A6: Tail overlap stays solo
  test('T-A6: tail overlap stays solo — chips 12:00 + biscuit 14:30', async () => {
    // Chips at 12:00 — fat_heavy (240min), primary = 180min → ends 15:00
    const chips = await saveMeal(baseMeal('chips', 40), makeTime(12, 0));

    // Biscuit at 14:30 — within chips' PRIMARY window (14:30 < 15:00)
    // Actually: fat_heavy primary = 240 * 0.75 = 180min = 3hr → ends at 15:00
    // 14:30 < 15:00 → OVERLAPS. Let me use a time outside the window.
    // Let me use a mixed_meal instead: mixed_meal (180min), primary = 135min → 12:00 + 2h15m = 14:15
    // Biscuit at 14:30 → outside primary window (14:30 > 14:15) → stays solo

    // Reset — use a specific scenario where biscuit is OUTSIDE primary window
    await AsyncStorage.clear();
    // mixed_meal at 12:00, primary window = 180 * 0.75 = 135min → ends at 14:15
    const meal1 = await saveMeal(baseMeal('chicken dinner', 45), makeTime(12, 0));
    // Biscuit at 14:30 — AFTER 14:15 → no overlap
    const meal2 = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));

    expect(meal1.sessionId).toBeNull();
    expect(meal2.sessionId).toBeNull();
  });

  // T-A7: Transitive chain
  test('T-A7: transitive chain — 3 meals chained via overlaps', async () => {
    // Meal A "chips" at 12:00 — fat_heavy (240min), primary = 180min → ends 15:00
    const mealA = await saveMeal(baseMeal('chips', 40), makeTime(12, 0));
    expect(mealA.sessionId).toBeNull();

    // Meal B "biscuit" at 13:00 — within A's primary (13:00 < 15:00)
    const mealB = await saveMeal(baseMeal('biscuit', 15), makeTime(13, 0));
    expect(mealB.sessionId).toBeTruthy(); // session created with A

    // Meal C "apple" at 14:00 — within A's primary (14:00 < 15:00) AND B's primary
    // B is simple_snack (90min), primary = 67.5min → B ends at 14:07:30
    const mealC = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));

    // All three should be in the same session
    const meals = await loadMeals();
    const sessionIds = new Set(meals.map(m => m.sessionId).filter(Boolean));
    expect(sessionIds.size).toBe(1); // all in one session
    expect(mealC.sessionId).toBeTruthy();

    const mealAUpdated = meals.find(m => m.id === mealA.id);
    expect(mealAUpdated?.sessionId).toBe(mealC.sessionId);
  });
});

// ---------------------------------------------------------------------------
// Category C — Edits & lifecycle (Section 4)
// ---------------------------------------------------------------------------

describe('Category C — Edits & lifecycle', () => {
  // T-C1: Timestamp edit dissolves session
  test('T-C1: timestamp edit dissolves session', async () => {
    // Apple at 14:00 + biscuit at 14:30 → session
    const apple = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    const biscuit = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));
    expect(biscuit.sessionId).toBeTruthy();

    // Edit biscuit timestamp to 16:00 — outside apple's primary window
    await updateMeal(biscuit.id, { loggedAt: makeTime(16, 0).toISOString() });

    // Both should now be solo
    const meals = await loadMeals();
    const appleUpdated = meals.find(m => m.id === apple.id);
    const biscuitUpdated = meals.find(m => m.id === biscuit.id);
    expect(appleUpdated?.sessionId).toBeNull();
    expect(biscuitUpdated?.sessionId).toBeNull();

    // Audit trail should have 'dissolved'
    const events = await getAllSessionEvents();
    const dissolvedEvents = events.filter(e => e.eventType === 'dissolved');
    expect(dissolvedEvents.length).toBeGreaterThanOrEqual(1);
  });

  // T-C2: Delete splits transitive chain
  test('T-C2: delete splits transitive chain', async () => {
    // A at 12:00 (fat_heavy, primary 180min→15:00), B at 13:00 (bridge), C at 14:00
    // A–B overlap, B–C overlap, but A–C depend on B as bridge
    const mealA = await saveMeal(baseMeal('chips', 40), makeTime(12, 0));
    const mealB = await saveMeal(baseMeal('biscuit', 15), makeTime(13, 0));
    const mealC = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));

    // All three should be in one session
    let meals = await loadMeals();
    const sessionId = meals.find(m => m.id === mealC.id)?.sessionId;
    expect(sessionId).toBeTruthy();

    // Delete B (the bridge)
    await deleteMeal(mealB.id);

    // Without B: A's primary ends 15:00, C at 14:00 — C is still within A's window
    // So A and C should still be in a session if they directly overlap
    // Actually: A is fat_heavy primary = 180min → ends 15:00. C at 14:00 < 15:00 → overlaps A
    // So A and C stay grouped. Let me adjust the test to use a scenario where they DON'T overlap.

    // Better scenario: A at 12:00 (mixed_meal primary=135min→14:15),
    //                  B at 13:30 (simple_snack primary=67.5min→14:37:30),
    //                  C at 14:45 (simple_snack)
    // A–B overlap (13:30 < 14:15), B–C overlap (14:45 > 14:37:30? No...)
    // Let me think more carefully:
    // A mixed_meal at 12:00 → primary = 135min → ends 14:15
    // B simple_snack at 14:00 → overlaps A (14:00 < 14:15), primary = 67.5min → ends 15:07:30
    // C simple_snack at 15:00 → overlaps B (15:00 < 15:07:30) but NOT A (15:00 > 14:15)
    // Delete B → A alone (14:15 primary), C alone (15:00 outside A) → both solo

    await AsyncStorage.clear();
    const a = await saveMeal(baseMeal('chicken dinner', 45), makeTime(12, 0)); // mixed_meal
    const b = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 0)); // overlaps A
    const c = await saveMeal(baseMeal('toast', 20), makeTime(15, 0)); // overlaps B but not A

    meals = await loadMeals();
    const allInSession = meals.every(m => m.sessionId != null);
    expect(allInSession).toBe(true);

    // Delete B — the bridge
    await deleteMeal(b.id);

    meals = await loadMeals();
    const aAfter = meals.find(m => m.id === a.id);
    const cAfter = meals.find(m => m.id === c.id);

    // A and C should no longer share a session
    // A at 12:00 primary ends 14:15, C at 15:00 → no overlap → both solo
    expect(aAfter?.sessionId).toBeNull();
    expect(cAfter?.sessionId).toBeNull();
  });

  // T-C3: Backdate >6hr returns warning
  test('T-C3: backdate >6hr triggers warning flag', () => {
    const now = new Date('2026-04-22T20:00:00.000Z');
    const eightHoursAgo = new Date('2026-04-22T12:00:00.000Z');
    const fiveHoursAgo = new Date('2026-04-22T15:00:00.000Z');

    expect(isBackdateWarningNeeded(eightHoursAgo, now)).toBe(true);
    expect(isBackdateWarningNeeded(fiveHoursAgo, now)).toBe(false);
  });

  // T-C4: Future timestamp >10min rejected
  test('T-C4: future timestamp >10min rejected', () => {
    const now = new Date('2026-04-22T14:00:00.000Z');
    const thirtyMinFuture = new Date('2026-04-22T14:30:00.000Z');
    const fiveMinFuture = new Date('2026-04-22T14:05:00.000Z');

    const rejected = validateMealTimestamp(thirtyMinFuture, now);
    expect(rejected.valid).toBe(false);
    expect(rejected.error).toBeTruthy();

    const allowed = validateMealTimestamp(fiveMinFuture, now);
    expect(allowed.valid).toBe(true);
  });

  // T-C4b: saveMeal rejects future timestamp
  test('T-C4b: saveMeal throws on future timestamp >10min', async () => {
    const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30min in future
    await expect(
      saveMeal(baseMeal('test', 10), futureTime)
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Category E — Edge cases
// ---------------------------------------------------------------------------

describe('Category E — Edge cases', () => {
  // T-E1: Simultaneous logging
  test('T-E1: simultaneous meals create session (boundary inclusive)', async () => {
    const sameTime = makeTime(14, 0);
    const meal1 = await saveMeal(baseMeal('apple', 10), sameTime);
    const meal2 = await saveMeal(baseMeal('biscuit', 15), sameTime);

    // Both at same timestamp — should overlap (boundary inclusive, Section 3 E2)
    expect(meal2.sessionId).toBeTruthy();

    const meals = await loadMeals();
    const m1 = meals.find(m => m.id === meal1.id);
    expect(m1?.sessionId).toBe(meal2.sessionId);
  });
});

// ---------------------------------------------------------------------------
// V2 field population
// ---------------------------------------------------------------------------

describe('V2 field population', () => {
  test('saveMeal populates all classification fields', async () => {
    const meal = await saveMeal(baseMeal('pizza', 60), makeTime(19, 0));

    // Should have all V2 classification fields
    expect(meal.classificationBucket).toBe('fat_heavy');
    expect(meal.classificationMethod).toBe('override_keyword');
    expect(meal.classificationMatchedKeyword).toBe('pizza');
    expect(meal.classificationKeywordsVersion).toBe('1');
    expect(meal.digestionWindowMinutes).toBe(240);
    expect(meal.matchingKey).toBe('pizza');
    expect(meal.matchingKeyVersion).toBe(1);
    expect(meal.classificationSnapshot).toBe('fat_heavy');
  });

  test('saveMeal stores overlap_detected_at_log for session members', async () => {
    const apple = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    const biscuit = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));

    const meals = await loadMeals();
    const biscuitMeal = meals.find(m => m.id === biscuit.id);
    expect(biscuitMeal?.overlapDetectedAtLog).toContain(apple.id);
  });
});

// ---------------------------------------------------------------------------
// Audit trail coverage
// ---------------------------------------------------------------------------

describe('Audit trail — session_event_log', () => {
  test('saveMeal creating session writes created + backfill events', async () => {
    await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));

    const events = await getAllSessionEvents();
    const types = events.map(e => e.eventType);
    expect(types).toContain('created');
    expect(types).toContain('member_added_via_backfill');
  });

  test('updateMeal with timestamp change writes dissolved event', async () => {
    await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    const biscuit = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));

    await updateMeal(biscuit.id, { loggedAt: makeTime(18, 0).toISOString() });

    const events = await getAllSessionEvents();
    const types = events.map(e => e.eventType);
    expect(types).toContain('dissolved');
  });

  test('deleteMeal writes dissolved event when session breaks', async () => {
    const apple = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    const biscuit = await saveMeal(baseMeal('biscuit', 15), makeTime(14, 30));

    await deleteMeal(biscuit.id);

    const events = await getAllSessionEvents();
    const types = events.map(e => e.eventType);
    expect(types).toContain('dissolved');
  });
});

// ---------------------------------------------------------------------------
// updateMeal re-classification
// ---------------------------------------------------------------------------

describe('updateMeal re-classification', () => {
  test('name change triggers re-classification', async () => {
    const meal = await saveMeal(baseMeal('apple', 10), makeTime(14, 0));
    expect(meal.classificationBucket).toBe('simple_snack');

    // Rename to a fat_heavy keyword
    await updateMeal(meal.id, { name: 'pizza' });

    const meals = await loadMeals();
    const updated = meals.find(m => m.id === meal.id);
    expect(updated?.classificationBucket).toBe('fat_heavy');
    expect(updated?.matchingKey).toBe('pizza');
  });
});

// ---------------------------------------------------------------------------
// Feature flag — V1 fallback (smoke test)
// ---------------------------------------------------------------------------

describe('V2 error resilience', () => {
  test('saveMeal still saves meal even with basic inputs', async () => {
    // Minimal input — should always work
    const meal = await saveMeal(baseMeal('test meal', null), makeTime(12, 0));
    expect(meal.id).toBeTruthy();
    expect(meal.name).toBe('test meal');
    expect(meal.loggedAt).toBeTruthy();
  });
});
