import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurvePoint, fetchGlucoseRange } from './nightscout';

const MEALS_KEY = 'glucolog_meals';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export interface GlucoseResponse {
  startGlucose: number;    // mmol/L at time of meal
  peakGlucose: number;     // mmol/L highest in 3hr window
  timeToPeakMins: number;  // minutes from meal to peak
  totalRise: number;       // peak minus start
  readings: CurvePoint[];  // full curve
  isPartial: boolean;      // true if 3hr window not yet complete
  fetchedAt: string;       // ISO — when we last fetched the curve
}

export interface Meal {
  id: string;
  name: string;
  photoUri: string | null;
  insulinUnits: number;
  startGlucose: number | null; // mmol/L at time of logging
  loggedAt: string;            // ISO timestamp
  glucoseResponse: GlucoseResponse | null;
}

export async function saveMeal(
  meal: Omit<Meal, 'id' | 'loggedAt' | 'glucoseResponse'>
): Promise<Meal> {
  const existing = await loadMeals();
  const newMeal: Meal = {
    ...meal,
    id: Date.now().toString(),
    loggedAt: new Date().toISOString(),
    glucoseResponse: null,
  };
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify([newMeal, ...existing]));
  return newMeal;
}

export async function loadMeals(): Promise<Meal[]> {
  const raw = await AsyncStorage.getItem(MEALS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Meal[];
}

// Fetches the 3hr glucose curve for a meal and stores it.
// Call this after saving a meal, and again when viewing history if isPartial.
export async function fetchAndStoreCurve(mealId: string): Promise<void> {
  const meals = await loadMeals();
  const meal = meals.find(m => m.id === mealId);
  if (!meal) return;

  const fromMs = new Date(meal.loggedAt).getTime();
  const toMs = fromMs + THREE_HOURS_MS;
  const nowMs = Date.now();
  const windowComplete = nowMs >= toMs;

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const startGlucose = readings[0].mmol;
  const peak = readings.reduce((best, r) => (r.mmol > best.mmol ? r : best), readings[0]);
  const timeToPeakMins = Math.round((peak.date - fromMs) / 60000);
  const totalRise = Math.round((peak.mmol - startGlucose) * 10) / 10;

  const glucoseResponse: GlucoseResponse = {
    startGlucose,
    peakGlucose: peak.mmol,
    timeToPeakMins,
    totalRise,
    readings,
    isPartial: !windowComplete,
    fetchedAt: new Date().toISOString(),
  };

  const updated = meals.map(m =>
    m.id === mealId ? { ...m, glucoseResponse } : m
  );
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(updated));
}
