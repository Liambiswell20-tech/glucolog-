import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurvePoint, fetchGlucoseRange } from './nightscout';

const MEALS_KEY = 'glucolog_meals';
const SESSIONS_KEY = 'glucolog_sessions';
const INSULIN_LOGS_KEY = 'glucolog_insulin_logs';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

// Long-acting and correction dose logs — stored separately, never used in meal patterns.
export type InsulinLogType = 'long-acting' | 'correction' | 'tablets';

// 12-hour overnight curve tracked against long-acting doses.
// Tracks trough (lowest point) rather than peak — the key metric for basal insulin.
export interface BasalCurve {
  startGlucose: number;      // mmol/L at time of injection
  lowestGlucose: number;     // trough — lowest point in 12hr window
  timeToTroughMins: number;  // minutes from injection to trough
  endGlucose: number;        // mmol/L at 12hr mark (or latest reading if partial)
  totalDrop: number;         // start minus trough (positive = came down)
  readings: CurvePoint[];    // full 12hr curve
  isPartial: boolean;        // true if 12hr window not yet complete
  fetchedAt: string;         // ISO
}

export interface InsulinLog {
  id: string;
  type: InsulinLogType;
  units: number;
  startGlucose: number | null; // mmol/L at time of logging
  loggedAt: string;            // ISO
  basalCurve: BasalCurve | null; // only populated for long-acting
}

export async function saveInsulinLog(
  type: InsulinLogType,
  units: number,
  startGlucose: number | null
): Promise<InsulinLog> {
  const existing = await loadInsulinLogs();
  const log: InsulinLog = {
    id: Date.now().toString(),
    type,
    units,
    startGlucose,
    loggedAt: new Date().toISOString(),
    basalCurve: null,
  };
  await AsyncStorage.setItem(INSULIN_LOGS_KEY, JSON.stringify([log, ...existing]));
  return log;
}

export async function loadInsulinLogs(): Promise<InsulinLog[]> {
  const raw = await AsyncStorage.getItem(INSULIN_LOGS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as InsulinLog[];
}

// Fetches the 12hr glucose curve for a long-acting dose and stores it.
export async function fetchAndStoreBasalCurve(logId: string): Promise<void> {
  const logs = await loadInsulinLogs();
  const log = logs.find(l => l.id === logId);
  if (!log || log.type !== 'long-acting') return;

  const fromMs = new Date(log.loggedAt).getTime();
  const toMs = fromMs + TWELVE_HOURS_MS;
  const nowMs = Date.now();

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const trough = readings.reduce((low, r) => (r.mmol < low.mmol ? r : low), readings[0]);
  const endReading = readings[readings.length - 1];

  const basalCurve: BasalCurve = {
    startGlucose: readings[0].mmol,
    lowestGlucose: trough.mmol,
    timeToTroughMins: Math.round((trough.date - fromMs) / 60000),
    endGlucose: endReading.mmol,
    totalDrop: Math.round((readings[0].mmol - trough.mmol) * 10) / 10,
    readings,
    isPartial: nowMs < toMs,
    fetchedAt: new Date().toISOString(),
  };

  const updated = logs.map(l => (l.id === logId ? { ...l, basalCurve } : l));
  await AsyncStorage.setItem(INSULIN_LOGS_KEY, JSON.stringify(updated));
}

export interface GlucoseResponse {
  startGlucose: number;       // mmol/L at start of session
  peakGlucose: number;        // mmol/L highest in 3hr window
  timeToPeakMins: number;     // minutes from session start to peak
  totalRise: number;          // peak minus start
  endGlucose: number;         // mmol/L at end of window (or latest reading)
  fallFromPeak: number;       // peak minus end (positive = came back down)
  timeFromPeakToEndMins: number; // minutes from peak to end reading
  readings: CurvePoint[];     // full curve
  isPartial: boolean;         // true if 3hr window not yet complete
  fetchedAt: string;          // ISO
}

export type SessionConfidence = 'high' | 'medium' | 'low';

export interface Session {
  id: string;
  mealIds: string[];          // ordered oldest-first
  startedAt: string;          // ISO — time of first meal in session
  confidence: SessionConfidence;
  glucoseResponse: GlucoseResponse | null;
}

export interface Meal {
  id: string;
  name: string;
  photoUri: string | null;
  insulinUnits: number;
  startGlucose: number | null;  // mmol/L at time of logging
  loggedAt: string;             // ISO
  sessionId: string | null;
  glucoseResponse: GlucoseResponse | null; // kept for backward-compat with pre-session data
}

export interface SessionWithMeals extends Session {
  meals: Meal[];
}

// --- raw storage helpers ---

async function loadMealsRaw(): Promise<Meal[]> {
  const raw = await AsyncStorage.getItem(MEALS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Meal[];
}

async function saveMealsRaw(meals: Meal[]): Promise<void> {
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(meals));
}

async function loadSessionsRaw(): Promise<Session[]> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Session[];
}

async function saveSessionsRaw(sessions: Session[]): Promise<void> {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function computeConfidence(mealCount: number): SessionConfidence {
  if (mealCount === 1) return 'high';
  if (mealCount === 2) return 'medium';
  return 'low';
}

// --- public API ---

export async function loadMeals(): Promise<Meal[]> {
  return loadMealsRaw();
}

export async function saveMeal(
  meal: Omit<Meal, 'id' | 'loggedAt' | 'glucoseResponse' | 'sessionId'>
): Promise<Meal> {
  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);
  const now = new Date();

  const newMeal: Meal = {
    ...meal,
    id: now.getTime().toString(),
    loggedAt: now.toISOString(),
    glucoseResponse: null,
    sessionId: null,
  };

  // Sessions that started within the last 3 hours are still "open"
  const activeSessions = new Set(
    sessions
      .filter(s => now.getTime() - new Date(s.startedAt).getTime() <= THREE_HOURS_MS)
      .map(s => s.id)
  );

  // Only consider meals that are recent AND belong to an open session (or no session yet)
  const recentMeals = meals.filter(m => {
    const withinWindow = now.getTime() - new Date(m.loggedAt).getTime() <= THREE_HOURS_MS;
    const sessionOpen = m.sessionId === null || activeSessions.has(m.sessionId);
    return withinWindow && sessionOpen;
  });

  let session: Session;

  if (recentMeals.length === 0) {
    // Solo — new high-confidence session
    session = {
      id: `s_${now.getTime()}`,
      mealIds: [newMeal.id],
      startedAt: newMeal.loggedAt,
      confidence: 'high',
      glucoseResponse: null,
    };
  } else {
    // Find if any eligible recent meal already belongs to an open session
    const existingSessionId = recentMeals.find(m => m.sessionId)?.sessionId ?? null;

    if (existingSessionId) {
      // Add to existing open session
      const existing = sessions.find(s => s.id === existingSessionId)!;
      const updatedIds = [...existing.mealIds, newMeal.id];
      session = {
        ...existing,
        mealIds: updatedIds,
        confidence: computeConfidence(updatedIds.length),
      };
    } else {
      // No session yet — group eligible recent meals + this one into a new session
      const allIds = [...recentMeals.map(m => m.id), newMeal.id];
      const earliestStart = recentMeals.reduce(
        (earliest, m) => (m.loggedAt < earliest ? m.loggedAt : earliest),
        recentMeals[0].loggedAt
      );
      session = {
        id: `s_${now.getTime()}`,
        mealIds: allIds,
        startedAt: earliestStart,
        confidence: computeConfidence(allIds.length),
        glucoseResponse: null,
      };
    }
  }

  newMeal.sessionId = session.id;

  // Write sessionId onto every meal that belongs to this session
  const updatedMeals = [newMeal, ...meals].map(m =>
    session.mealIds.includes(m.id) ? { ...m, sessionId: session.id } : m
  );

  const updatedSessions = [...sessions.filter(s => s.id !== session.id), session];

  await Promise.all([saveMealsRaw(updatedMeals), saveSessionsRaw(updatedSessions)]);

  return newMeal;
}

// Load sessions with their meals populated, newest-first.
// Meals with no sessionId (pre-session data) are surfaced as synthetic solo sessions.
export async function loadSessionsWithMeals(): Promise<SessionWithMeals[]> {
  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);
  const mealMap = new Map(meals.map(m => [m.id, m]));
  const mealIdsInSessions = new Set(sessions.flatMap(s => s.mealIds));

  const real: SessionWithMeals[] = sessions.map(session => ({
    ...session,
    meals: session.mealIds
      .map(id => mealMap.get(id))
      .filter((m): m is Meal => !!m)
      .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()),
  }));

  // Legacy meals that pre-date the session system
  const legacy: SessionWithMeals[] = meals
    .filter(m => !mealIdsInSessions.has(m.id))
    .map(m => ({
      id: `legacy_${m.id}`,
      mealIds: [m.id],
      startedAt: m.loggedAt,
      confidence: 'high' as SessionConfidence,
      glucoseResponse: m.glucoseResponse ?? null,
      meals: [m],
    }));

  return [...real, ...legacy].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

// Fetch the 3hr glucose curve for a meal and store it on the meal object.
// This is the primary curve fetch used by MealLogScreen and the history screen.
export async function fetchAndStoreCurveForMeal(mealId: string): Promise<void> {
  const meals = await loadMealsRaw();
  const meal = meals.find(m => m.id === mealId);
  if (!meal) return;

  const fromMs = new Date(meal.loggedAt).getTime();
  const toMs = fromMs + THREE_HOURS_MS;
  const nowMs = Date.now();

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const startGlucose = readings[0].mmol;
  const peak = readings.reduce((best, r) => (r.mmol > best.mmol ? r : best), readings[0]);
  const endReading = readings[readings.length - 1];

  const glucoseResponse: GlucoseResponse = {
    startGlucose,
    peakGlucose: peak.mmol,
    timeToPeakMins: Math.round((peak.date - fromMs) / 60000),
    totalRise: Math.round((peak.mmol - startGlucose) * 10) / 10,
    endGlucose: endReading.mmol,
    fallFromPeak: Math.round((peak.mmol - endReading.mmol) * 10) / 10,
    timeFromPeakToEndMins: Math.round((endReading.date - peak.date) / 60000),
    readings,
    isPartial: nowMs < toMs,
    fetchedAt: new Date().toISOString(),
  };

  const updated = meals.map(m => (m.id === mealId ? { ...m, glucoseResponse } : m));
  await saveMealsRaw(updated);
}

// Kept for call-site compatibility (MealLogScreen). Delegates to fetchAndStoreCurveForMeal.
export async function fetchAndStoreCurve(mealId: string): Promise<void> {
  await fetchAndStoreCurveForMeal(mealId);
}

// Fetch the curve directly by session ID (used by the history screen refresh button).
export async function fetchAndStoreCurveForSession(sessionId: string): Promise<void> {
  const sessions = await loadSessionsRaw();
  await _fetchCurveForSession(sessionId, sessions);
}

async function _fetchCurveForSession(sessionId: string, sessions: Session[]): Promise<void> {
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;

  const fromMs = new Date(session.startedAt).getTime();
  const toMs = fromMs + THREE_HOURS_MS;
  const nowMs = Date.now();

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const startGlucose = readings[0].mmol;
  const peak = readings.reduce((best, r) => (r.mmol > best.mmol ? r : best), readings[0]);
  const endReading = readings[readings.length - 1];

  const glucoseResponse: GlucoseResponse = {
    startGlucose,
    peakGlucose: peak.mmol,
    timeToPeakMins: Math.round((peak.date - fromMs) / 60000),
    totalRise: Math.round((peak.mmol - startGlucose) * 10) / 10,
    endGlucose: endReading.mmol,
    fallFromPeak: Math.round((peak.mmol - endReading.mmol) * 10) / 10,
    timeFromPeakToEndMins: Math.round((endReading.date - peak.date) / 60000),
    readings,
    isPartial: nowMs < toMs,
    fetchedAt: new Date().toISOString(),
  };

  const updated = sessions.map(s => (s.id === sessionId ? { ...s, glucoseResponse } : s));
  await saveSessionsRaw(updated);
}
