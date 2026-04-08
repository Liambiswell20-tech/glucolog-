import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurvePoint, fetchGlucoseRange } from './nightscout';

import type { HypoTreatment, UserProfile, TabletDosing } from '../types/equipment';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const MEALS_KEY = 'glucolog_meals';
const SESSIONS_KEY = 'glucolog_sessions';
const INSULIN_LOGS_KEY = 'glucolog_insulin_logs';
const MIGRATION_V1_KEY = 'glucolog_migration_v1';
const HBA1C_CACHE_KEY = 'glucolog_hba1c_cache';
const GLUCOSE_STORE_KEY = 'glucolog_glucose_store';
const HYPO_TREATMENTS_KEY = 'hypo_treatments';
const USER_PROFILE_KEY = 'user_profile';
const TABLET_DOSING_KEY = 'tablet_dosing';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
  startGlucose: number | null,
  loggedAt?: Date  // optional — defaults to new Date() if not provided
): Promise<InsulinLog> {
  const existing = await loadInsulinLogs();
  const now = loggedAt ?? new Date();
  const log: InsulinLog = {
    id: generateId(),
    type,
    units,
    startGlucose,
    loggedAt: now.toISOString(),
    basalCurve: null,
  };
  await AsyncStorage.setItem(INSULIN_LOGS_KEY, JSON.stringify([log, ...existing]));
  return log;
}

export async function loadInsulinLogs(): Promise<InsulinLog[]> {
  try {
    const raw = await AsyncStorage.getItem(INSULIN_LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InsulinLog[];
  } catch {
    console.warn('[storage] loadInsulinLogs: getItem/parse failed', INSULIN_LOGS_KEY);
    return [];
  }
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

// --- rolling 30-day glucose store ---
// Stores { date, sgv } points locally. On each refresh, only new readings are fetched.
// Avg12h and avg30d are derived from this store — no repeated API calls.

export interface GlucosePoint {
  date: number; // epoch ms
  sgv: number;  // mg/dL
}

export interface GlucoseStore {
  readings: GlucosePoint[]; // sorted oldest-first, max 30d window
  sum: number;              // sum of all sgv values (for fast avg without re-reducing)
  lastFetchedAt: number;    // epoch ms — used as fromMs on next fetch
}

export async function loadGlucoseStore(): Promise<GlucoseStore | null> {
  try {
    const raw = await AsyncStorage.getItem(GLUCOSE_STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlucoseStore;
  } catch {
    console.warn('[storage] loadGlucoseStore: getItem/parse failed', GLUCOSE_STORE_KEY);
    return null;
  }
}

// Merges new entries into the store, drops readings older than 30 days,
// and returns computed avg12h, avg30d, and daysOfData.
export async function updateGlucoseStore(
  newEntries: GlucosePoint[]
): Promise<{ avg12h: number | null; avg30d: number | null; daysOfData: number }> {
  const existing = await loadGlucoseStore();
  const now = Date.now();
  const cutoff30d = now - THIRTY_DAYS_MS;
  const cutoff12h = now - TWELVE_HOURS_MS;

  let readings: GlucosePoint[] = existing?.readings ?? [];

  // Append new entries, deduplicating by date
  const existingDates = new Set(readings.map(r => r.date));
  for (const e of newEntries) {
    if (!existingDates.has(e.date)) {
      readings.push(e);
    }
  }

  // Drop readings older than 30 days
  const toKeep: GlucosePoint[] = [];
  for (const r of readings) {
    if (r.date >= cutoff30d) {
      toKeep.push(r);
    }
  }
  readings = toKeep.sort((a, b) => a.date - b.date);

  // Recompute sum from array — prevents incremental drift from floating-point accumulation
  const sum = readings.reduce((acc, r) => acc + r.sgv, 0);

  const store: GlucoseStore = { readings, sum, lastFetchedAt: now };
  await AsyncStorage.setItem(GLUCOSE_STORE_KEY, JSON.stringify(store));

  const count = readings.length;
  const avg30d = count > 0 ? Math.round((sum / count / 18) * 10) / 10 : null;

  const recent = readings.filter(r => r.date >= cutoff12h);
  const avg12h = recent.length > 0
    ? Math.round((recent.reduce((s, r) => s + r.sgv, 0) / recent.length / 18) * 10) / 10
    : null;

  const oldest = readings.length > 0 ? readings[0].date : now;
  const daysOfData = Math.max(1, Math.min(30, Math.round((now - oldest) / (24 * 60 * 60 * 1000))));

  return { avg12h, avg30d, daysOfData };
}

export interface Hba1cEstimate {
  percent: number;     // e.g. 6.8
  mmolMol: number;     // e.g. 51
  daysOfData: number;  // how many days of readings the estimate is based on
  calculatedDate: string; // YYYY-MM-DD — used to invalidate cache daily
}

export async function loadCachedHba1c(): Promise<Hba1cEstimate | null> {
  try {
    const raw = await AsyncStorage.getItem(HBA1C_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Hba1cEstimate;
    const today = new Date().toISOString().slice(0, 10);
    return cached.calculatedDate === today ? cached : null;
  } catch {
    console.warn('[storage] loadCachedHba1c: getItem/parse failed', HBA1C_CACHE_KEY);
    return null;
  }
}

export async function computeAndCacheHba1c(
  avgMmol: number,
  daysOfData: number
): Promise<Hba1cEstimate> {
  const percent = Math.round(((avgMmol + 2.59) / 1.59) * 10) / 10;
  const mmolMol = Math.round(10.929 * (avgMmol - 2.15));
  const estimate: Hba1cEstimate = {
    percent,
    mmolMol,
    daysOfData,
    calculatedDate: new Date().toISOString().slice(0, 10),
  };
  await AsyncStorage.setItem(HBA1C_CACHE_KEY, JSON.stringify(estimate));
  return estimate;
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
  carbsEstimated: number | null; // grams, from AI estimate — null if no estimate generated
  loggedAt: string;             // ISO
  sessionId: string | null;
  glucoseResponse: GlucoseResponse | null; // kept for backward-compat with pre-session data
  // PHASE 8 — B2B-05: stamped immutably at save time from getCurrentEquipmentProfile()
  // Do NOT include insulin_brand or delivery_method in updateMeal() changes — they must never be edited
  insulin_brand?: string;
  delivery_method?: string;
}

export interface SessionWithMeals extends Session {
  meals: Meal[];
}

// --- raw storage helpers ---

async function loadMealsRaw(): Promise<Meal[]> {
  try {
    const raw = await AsyncStorage.getItem(MEALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Meal[];
  } catch {
    console.warn('[storage] loadMealsRaw: getItem/parse failed', MEALS_KEY);
    return [];
  }
}

async function saveMealsRaw(meals: Meal[]): Promise<void> {
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(meals));
}

async function loadSessionsRaw(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Session[];
  } catch {
    console.warn('[storage] loadSessionsRaw: getItem/parse failed', SESSIONS_KEY);
    return [];
  }
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

export async function updateMeal(
  id: string,
  changes: Partial<Pick<Meal, 'name' | 'photoUri' | 'insulinUnits' | 'loggedAt' | 'carbsEstimated'>>
): Promise<void> {
  const meals = await loadMealsRaw();
  // If loggedAt is changing, the old curve is no longer valid — clear it
  const patch = 'loggedAt' in changes ? { ...changes, glucoseResponse: null } : changes;
  const updated = meals.map(m => (m.id === id ? { ...m, ...patch } : m));
  await saveMealsRaw(updated);
}

export async function updateInsulinLog(
  id: string,
  changes: Partial<Pick<InsulinLog, 'units' | 'loggedAt'>>
): Promise<void> {
  const logs = await loadInsulinLogs();
  const updated = logs.map(l => (l.id === id ? { ...l, ...changes } : l));
  await AsyncStorage.setItem(INSULIN_LOGS_KEY, JSON.stringify(updated));
}

export async function deleteMeal(id: string): Promise<void> {
  const meals = await loadMealsRaw();
  await saveMealsRaw(meals.filter(m => m.id !== id));
}

export async function deleteInsulinLog(id: string): Promise<void> {
  const logs = await loadInsulinLogs();
  await AsyncStorage.setItem(INSULIN_LOGS_KEY, JSON.stringify(logs.filter(l => l.id !== id)));
}

export async function saveMeal(
  meal: Omit<Meal, 'id' | 'loggedAt' | 'glucoseResponse' | 'sessionId'>,
  loggedAt?: Date
): Promise<Meal> {
  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);
  const now = loggedAt ?? new Date();

  const newMeal: Meal = {
    ...meal,
    id: generateId(),
    loggedAt: now.toISOString(),
    glucoseResponse: null,
    sessionId: null,
  };

  // Sessions that started within the last 3 hours are still "open".
  // elapsed must be >= 0: backdated entries must not attach to sessions that
  // started AFTER the backdated time (negative elapsed would otherwise pass <= check).
  const activeSessions = new Set(
    sessions
      .filter(s => {
        const elapsed = now.getTime() - new Date(s.startedAt).getTime();
        return elapsed >= 0 && elapsed <= THREE_HOURS_MS;
      })
      .map(s => s.id)
  );

  // Only consider meals that are recent AND belong to an open session (or no session yet).
  // elapsed >= 0 guard mirrors the activeSessions fix — a backdated `now` must not
  // treat future meals as "recent".
  const recentMeals = meals.filter(m => {
    const elapsed = now.getTime() - new Date(m.loggedAt).getTime();
    const withinWindow = elapsed >= 0 && elapsed <= THREE_HOURS_MS;
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

  const real: SessionWithMeals[] = sessions.map(session => {
    const meals = session.mealIds
      .map(id => mealMap.get(id))
      .filter((m): m is Meal => !!m)
      .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());
    // Canonical glucoseResponse lives on Meal — fall back to primary meal's response
    // if the session itself doesn't have one (normal case for all current data).
    const glucoseResponse =
      session.glucoseResponse ??
      meals.find(m => m.glucoseResponse && !m.glucoseResponse.isPartial)?.glucoseResponse ??
      meals.find(m => m.glucoseResponse)?.glucoseResponse ??
      null;
    return { ...session, glucoseResponse, meals };
  });

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

// Pure function — builds GlucoseResponse from a curve fetch result.
// Called by both fetchAndStoreCurveForMeal and _fetchCurveForSession.
function buildGlucoseResponse(
  fromMs: number,
  readings: CurvePoint[],
  nowMs: number
): GlucoseResponse {
  const startGlucose = readings[0].mmol;
  const peak = readings.reduce((best, r) => (r.mmol > best.mmol ? r : best), readings[0]);
  const endReading = readings[readings.length - 1];
  return {
    startGlucose,
    peakGlucose: peak.mmol,
    timeToPeakMins: Math.round((peak.date - fromMs) / 60000),
    totalRise: Math.round((peak.mmol - startGlucose) * 10) / 10,
    endGlucose: endReading.mmol,
    fallFromPeak: Math.round((peak.mmol - endReading.mmol) * 10) / 10,
    timeFromPeakToEndMins: Math.round((endReading.date - peak.date) / 60000),
    readings,
    isPartial: nowMs < (fromMs + THREE_HOURS_MS),
    fetchedAt: new Date().toISOString(),
  };
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

  const glucoseResponse = buildGlucoseResponse(fromMs, readings, nowMs);

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

// DEPRECATED write path: this function saves glucoseResponse onto the Session object.
// The canonical curve location is Meal.glucoseResponse — use fetchAndStoreCurveForMeal() instead.
// This function is kept for call-site compatibility but should not be used for new features.
async function _fetchCurveForSession(sessionId: string, sessions: Session[]): Promise<void> {
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;

  const fromMs = new Date(session.startedAt).getTime();
  const toMs = fromMs + THREE_HOURS_MS;
  const nowMs = Date.now();

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const glucoseResponse = buildGlucoseResponse(fromMs, readings, nowMs);

  const updated = sessions.map(s => (s.id === sessionId ? { ...s, glucoseResponse } : s));
  await saveSessionsRaw(updated);
}

// --- hypo treatment helpers ---

export async function loadHypoTreatments(): Promise<HypoTreatment[]> {
  try {
    const raw = await AsyncStorage.getItem(HYPO_TREATMENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HypoTreatment[];
  } catch {
    console.warn('[storage] loadHypoTreatments: getItem/parse failed');
    return [];
  }
}

export async function updateHypoTreatment(
  id: string,
  changes: Partial<Pick<HypoTreatment, 'treatment_type' | 'amount_value' | 'amount_unit' | 'notes' | 'logged_at'>>
): Promise<void> {
  const treatments = await loadHypoTreatments();
  const updated = treatments.map(t => (t.id === id ? { ...t, ...changes } : t));
  await AsyncStorage.setItem(HYPO_TREATMENTS_KEY, JSON.stringify(updated));
}

export async function deleteHypoTreatment(id: string): Promise<void> {
  const treatments = await loadHypoTreatments();
  await AsyncStorage.setItem(HYPO_TREATMENTS_KEY, JSON.stringify(treatments.filter(t => t.id !== id)));
}

export async function fetchAndStoreHypoRecoveryCurve(treatmentId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(HYPO_TREATMENTS_KEY);
  const treatments: HypoTreatment[] = raw ? JSON.parse(raw) : [];
  const treatment = treatments.find(t => t.id === treatmentId);
  if (!treatment) return;

  const fromMs = new Date(treatment.logged_at).getTime();
  const toMs = fromMs + TWO_HOURS_MS;
  const nowMs = Date.now();

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const mmolValues = readings.map(r => r.mmol);
  const updated = treatments.map(t =>
    t.id === treatmentId ? { ...t, glucose_readings_after: mmolValues } : t
  );
  await AsyncStorage.setItem(HYPO_TREATMENTS_KEY, JSON.stringify(updated));
}

// --- user profile ---

export async function loadUserProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    console.warn('[storage] loadUserProfile: getItem/parse failed', USER_PROFILE_KEY);
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

// --- tablet dosing ---

export async function loadTabletDosing(): Promise<TabletDosing[]> {
  try {
    const raw = await AsyncStorage.getItem(TABLET_DOSING_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TabletDosing[];
  } catch {
    console.warn('[storage] loadTabletDosing: getItem/parse failed', TABLET_DOSING_KEY);
    return [];
  }
}

export async function saveTabletDosing(tablets: TabletDosing[]): Promise<void> {
  await AsyncStorage.setItem(TABLET_DOSING_KEY, JSON.stringify(tablets));
}

export async function migrateTabletDosing(): Promise<void> {
  const existing = await loadTabletDosing();
  if (existing.length > 0) return; // already migrated or user has added tablets
  try {
    const raw = await AsyncStorage.getItem('glucolog_settings');
    if (!raw) return;
    const settings = JSON.parse(raw) as { tabletName?: string; tabletDose?: string };
    if (settings.tabletName && settings.tabletName.trim()) {
      const migrated: TabletDosing = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        name: settings.tabletName.trim(),
        mg: settings.tabletDose?.replace(/[^0-9.]/g, '') || '',
        amount_per_day: '1',
      };
      await saveTabletDosing([migrated]);
    }
  } catch {
    console.warn('[storage] migrateTabletDosing: migration failed (non-fatal)');
  }
}

// One-time idempotent migration: creates proper Session records for meals that pre-date
// the session system (meals where sessionId is null). Runs on app startup, guarded by
// AsyncStorage flag. If storage write fails, logs a warning and the synthetic fallback
// in loadSessionsWithMeals() keeps the history screen working — migration retries next launch.
// Per D-11: totally silent (no spinner, no user message). Per D-12: idempotent, runs once.
// Per D-13: on failure, console.warn and continue.
export async function migrateLegacySessions(): Promise<void> {
  // Guard: skip if already migrated
  const done = await AsyncStorage.getItem(MIGRATION_V1_KEY);
  if (done === 'true') return;

  try {
    const [mealsRaw, sessionsRaw] = await Promise.all([
      AsyncStorage.getItem(MEALS_KEY),
      AsyncStorage.getItem(SESSIONS_KEY),
    ]);

    const meals: Meal[] = mealsRaw ? JSON.parse(mealsRaw) : [];
    const sessions: Session[] = sessionsRaw ? JSON.parse(sessionsRaw) : [];

    const sessionMealIds = new Set(sessions.flatMap(s => s.mealIds));
    const legacyMeals = meals.filter(m => !sessionMealIds.has(m.id));

    if (legacyMeals.length === 0) {
      // No legacy meals — mark done and return
      await AsyncStorage.setItem(MIGRATION_V1_KEY, 'true');
      return;
    }

    // Create one solo Session per legacy meal, using the meal's own loggedAt as startedAt.
    // sessionId on the meal is updated to match the new session id.
    const newSessions: Session[] = legacyMeals.map(m => ({
      id: `legacy_migrated_${m.id}`,
      mealIds: [m.id],
      startedAt: m.loggedAt,
      confidence: 'high' as SessionConfidence,
      glucoseResponse: m.glucoseResponse ?? null,
    }));

    // Update meals to set their sessionId
    const updatedMeals = meals.map(m => {
      const newSession = newSessions.find(s => s.mealIds[0] === m.id);
      return newSession ? { ...m, sessionId: newSession.id } : m;
    });

    const updatedSessions = [...sessions, ...newSessions];

    await Promise.all([
      AsyncStorage.setItem(MEALS_KEY, JSON.stringify(updatedMeals)),
      AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updatedSessions)),
    ]);

    // Mark migration complete only after successful write
    await AsyncStorage.setItem(MIGRATION_V1_KEY, 'true');
    console.log(`[storage] migrateLegacySessions: migrated ${legacyMeals.length} legacy meal(s)`);
  } catch (err) {
    // Per D-13: warn and continue. loadSessionsWithMeals() synthetic fallback still works.
    // Migration will retry on next launch (MIGRATION_V1_KEY was never set to 'true').
    console.warn('[storage] migrateLegacySessions: failed, will retry on next launch', err);
  }
}
