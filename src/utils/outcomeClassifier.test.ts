import { classifyOutcome } from './outcomeClassifier';
import type { GlucoseResponse } from '../services/storage';

function makeResponse(overrides: Partial<GlucoseResponse>): GlucoseResponse {
  return {
    startGlucose: 6.0,
    peakGlucose: 0,
    timeToPeakMins: 0,
    totalRise: 0,
    endGlucose: 0,
    fallFromPeak: 0,
    timeFromPeakToEndMins: 0,
    readings: [],
    isPartial: false,
    fetchedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('returns NONE when glucoseResponse is null', () => {
  expect(classifyOutcome(null)).toBe('NONE');
});

test('returns PENDING when isPartial is true', () => {
  expect(classifyOutcome(makeResponse({ isPartial: true, peakGlucose: 8.0, endGlucose: 7.0 }))).toBe('PENDING');
});

test('returns GREEN when peakGlucose <= 10.0 and endGlucose in range', () => {
  expect(classifyOutcome(makeResponse({ isPartial: false, peakGlucose: 8.0, endGlucose: 7.0 }))).toBe('GREEN');
});

test('returns ORANGE when peakGlucose > 10.0 and endGlucose in range', () => {
  expect(classifyOutcome(makeResponse({ isPartial: false, peakGlucose: 12.0, endGlucose: 7.0 }))).toBe('ORANGE');
});

test('returns DARK_AMBER when endGlucose > 10.0 and < 14.0', () => {
  expect(classifyOutcome(makeResponse({ isPartial: false, peakGlucose: 11.0, endGlucose: 11.5 }))).toBe('DARK_AMBER');
});

test('returns RED when endGlucose < 3.9 (hypo)', () => {
  expect(classifyOutcome(makeResponse({ isPartial: false, peakGlucose: 8.0, endGlucose: 3.5 }))).toBe('RED');
});

test('returns RED when endGlucose >= 14.0 (extreme high)', () => {
  expect(classifyOutcome(makeResponse({ isPartial: false, peakGlucose: 15.0, endGlucose: 14.0 }))).toBe('RED');
});

test('returns RED when peakGlucose >= 14.0', () => {
  expect(classifyOutcome(makeResponse({ isPartial: false, peakGlucose: 14.0, endGlucose: 7.0 }))).toBe('RED');
});
