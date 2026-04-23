/**
 * Phase L tests: Home Screen Footer — active digestion window indicator
 * Spec Section 8.6
 */
import { getActiveDigestionInfo } from '../../services/activeDigestion';
import type { Meal, Session } from '../../services/storage';

function makeMeal(overrides: Partial<Meal> & { id: string; loggedAt: string }): Meal {
  return {
    name: 'Test meal',
    photoUri: null,
    insulinUnits: 0,
    startGlucose: null,
    carbsEstimated: null,
    sessionId: null,
    glucoseResponse: null,
    digestionWindowMinutes: 180,
    classificationBucket: 'mixed_meal',
    classificationMethod: 'fallback',
    classificationMatchedKeyword: null,
    classificationKeywordsVersion: '1',
    matchingKey: 'test_meal',
    matchingKeyVersion: 1,
    overlapDetectedAtLog: null,
    classificationSnapshot: 'mixed_meal',
    returnToBaselineMinutes: null,
    endedElevated: false,
    endedLow: false,
    cgmCoveragePercent: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    mealIds: [],
    startedAt: new Date().toISOString(),
    confidence: 'high',
    glucoseResponse: null,
    ...overrides,
  };
}

describe('getActiveDigestionInfo', () => {
  // Section 8.6: "meal active: 1h 45m remaining" during any active digestion window

  it('returns null when there are no meals', () => {
    const result = getActiveDigestionInfo([], [], new Date());
    expect(result).toBeNull();
  });

  it('returns null when all meals are past their digestion window', () => {
    const now = new Date('2026-04-23T14:00:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T10:00:00Z', // 4 hours ago, 180min window expired
        digestionWindowMinutes: 180,
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).toBeNull();
  });

  it('returns remaining time for a solo meal within its digestion window', () => {
    const now = new Date('2026-04-23T12:15:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z', // 15 min ago, 180min window
        digestionWindowMinutes: 180,
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    expect(result!.remainingMinutes).toBe(165); // 180 - 15
    expect(result!.displayText).toBe('meal active: 2h 45m remaining');
  });

  it('uses 60min window for quick_sugar classification', () => {
    const now = new Date('2026-04-23T12:30:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z', // 30 min ago, 60min window
        digestionWindowMinutes: 60,
        classificationBucket: 'quick_sugar',
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    expect(result!.remainingMinutes).toBe(30);
    expect(result!.displayText).toBe('meal active: 30m remaining');
  });

  it('returns null when quick_sugar 60min window has expired', () => {
    const now = new Date('2026-04-23T13:01:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z', // 61 min ago, 60min window
        digestionWindowMinutes: 60,
        classificationBucket: 'quick_sugar',
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).toBeNull();
  });

  it('uses session_end for multi-meal sessions (latest window end)', () => {
    const now = new Date('2026-04-23T12:30:00Z');
    // Session with two meals: first at 12:00, second at 12:20
    // Second meal has 180min window → session_end = 12:20 + 180min = 15:20
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z',
        digestionWindowMinutes: 180,
        sessionId: 's1',
      }),
      makeMeal({
        id: 'm2',
        loggedAt: '2026-04-23T12:20:00Z',
        digestionWindowMinutes: 180,
        sessionId: 's1',
      }),
    ];
    const sessions = [
      makeSession({
        id: 's1',
        mealIds: ['m1', 'm2'],
        startedAt: '2026-04-23T12:00:00Z',
        sessionEnd: '2026-04-23T15:20:00Z', // latest member timestamp + window
      }),
    ];
    const result = getActiveDigestionInfo(meals, sessions, now);
    expect(result).not.toBeNull();
    // Remaining = session_end (15:20) - now (12:30) = 170 minutes
    expect(result!.remainingMinutes).toBe(170);
    expect(result!.displayText).toBe('meal active: 2h 50m remaining');
  });

  it('picks the latest active window when multiple meals are active', () => {
    const now = new Date('2026-04-23T12:30:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z', // ends at 15:00
        digestionWindowMinutes: 180,
      }),
      makeMeal({
        id: 'm2',
        loggedAt: '2026-04-23T12:15:00Z', // ends at 16:15 (fat_heavy)
        digestionWindowMinutes: 240,
        classificationBucket: 'fat_heavy',
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    // Latest end: 12:15 + 240min = 16:15. Remaining = 16:15 - 12:30 = 225 min
    expect(result!.remainingMinutes).toBe(225);
    expect(result!.displayText).toBe('meal active: 3h 45m remaining');
  });

  it('formats hours and minutes correctly for exact hours', () => {
    const now = new Date('2026-04-23T12:00:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z',
        digestionWindowMinutes: 120,
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    expect(result!.displayText).toBe('meal active: 2h 0m remaining');
  });

  it('formats minutes only when less than 60 minutes', () => {
    const now = new Date('2026-04-23T12:35:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z',
        digestionWindowMinutes: 60,
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    expect(result!.remainingMinutes).toBe(25);
    expect(result!.displayText).toBe('meal active: 25m remaining');
  });

  it('defaults to 180min when digestionWindowMinutes is null (pre-migration meals)', () => {
    const now = new Date('2026-04-23T12:30:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z',
        digestionWindowMinutes: null,
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    expect(result!.remainingMinutes).toBe(150); // 180 - 30
  });

  it('excludes session members — uses session_end instead of individual windows', () => {
    const now = new Date('2026-04-23T15:10:00Z');
    // m1 solo window would end at 15:00 — but it's in a session with session_end at 15:20
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z',
        digestionWindowMinutes: 180,
        sessionId: 's1',
      }),
      makeMeal({
        id: 'm2',
        loggedAt: '2026-04-23T12:20:00Z',
        digestionWindowMinutes: 180,
        sessionId: 's1',
      }),
    ];
    const sessions = [
      makeSession({
        id: 's1',
        mealIds: ['m1', 'm2'],
        startedAt: '2026-04-23T12:00:00Z',
        sessionEnd: '2026-04-23T15:20:00Z',
      }),
    ];
    const result = getActiveDigestionInfo(meals, sessions, now);
    expect(result).not.toBeNull();
    expect(result!.remainingMinutes).toBe(10); // 15:20 - 15:10
  });

  it('does not contain advisory or predictive language in displayText', () => {
    const now = new Date('2026-04-23T12:00:00Z');
    const meals = [
      makeMeal({
        id: 'm1',
        loggedAt: '2026-04-23T12:00:00Z',
        digestionWindowMinutes: 180,
      }),
    ];
    const result = getActiveDigestionInfo(meals, [], now);
    expect(result).not.toBeNull();
    const text = result!.displayText.toLowerCase();
    // Spec: no CTA, no advisory language
    const banned = ['recommend', 'should', 'try', 'suggested', 'expected', 'predict', 'advice', 'wait', 'avoid'];
    for (const word of banned) {
      expect(text).not.toContain(word);
    }
    // Must start with "meal active:" per spec
    expect(result!.displayText).toMatch(/^meal active:/);
  });
});
