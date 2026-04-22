import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurvePoint, fetchGlucoseRange } from './nightscout';
import { classifyMeal, computeMatchingKey, loadKeywordDictionary } from './classification';
import { detectOverlaps, groupOrCreateSession, reEvaluateOnEdit, reEvaluateOnDelete, computeSessionEnd } from './sessionGrouping';
import type { OverlapMeal, SessionMutations } from './sessionGrouping';
import { logSessionEvents } from './sessionEventLog';

import type { HypoTreatment, UserProfile, TabletDosing, EquipmentChangeEntry, DataConsent } from '../types/equipment';

// ---------------------------------------------------------------------------
// Feature flag: set to false for one-line rollback to V1 session grouping
// ---------------------------------------------------------------------------
const USE_V2_SESSION_GROUPING = true;

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
const TEN_MINUTES_MS = 10 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MATCHING_KEY_VERSION = 1;

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

// --- Session Grouping V2 types (Phase A) ---

export type ClassificationBucket = 'quick_sugar' | 'simple_snack' | 'mixed_meal' | 'fat_heavy' | 'non_carb';
export type ClassificationMethod = 'override_keyword' | 'carb_bucket' | 'fallback';

export type SessionEventType =
  | 'created'
  | 'extended'
  | 'dissolved'
  | 'split'
  | 'merged'
  | 'member_added_via_backfill'
  | 'member_removed_via_delete'
  | 'member_reassigned_via_edit'
  | 'correction_attached'
  | 'hypo_during_session'
  | 'migration_reassigned';

export interface SessionEventLog {
  id: string;
  sessionId: string;
  eventType: SessionEventType;
  triggeredByMealId: string | null;
  beforeState: Record<string, unknown> | null;  // snapshot before mutation
  afterState: Record<string, unknown> | null;   // snapshot after mutation
  classificationKeywordsVersion: string | null;
  triggeredAt: string;  // ISO
}

export interface SessionCorrection {
  id: string;
  sessionId: string;
  insulinLogId: string;
  units: number;
  loggedAt: string;  // ISO
  createdAt: string; // ISO
}

export interface SessionContextEvent {
  id: string;
  sessionId: string;
  eventType: string;     // e.g. 'exercise', 'stress', 'illness'
  description: string;
  loggedAt: string;  // ISO
  createdAt: string; // ISO
}

export interface SessionHypoAnnotation {
  id: string;
  sessionId: string;
  hypoTreatmentId: string;
  glucoseAtEvent: number;  // mmol/L
  loggedAt: string;  // ISO
  createdAt: string; // ISO
}

export interface Session {
  id: string;
  mealIds: string[];          // ordered oldest-first
  startedAt: string;          // ISO — time of first meal in session
  confidence: SessionConfidence;
  glucoseResponse: GlucoseResponse | null;
  // V2 fields (nullable for backward compat with existing sessions)
  sessionEnd?: string | null;          // ISO — latest member timestamp + digestion window
  totalCarbs?: number | null;
  totalInsulin?: number | null;
  curveCorrected?: boolean;
  hypoDuringSession?: boolean;
  endedElevated?: boolean;
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
  // V2 classification fields (nullable for backward compat with existing meals)
  classificationBucket?: ClassificationBucket | null;
  classificationMethod?: ClassificationMethod | null;
  classificationMatchedKeyword?: string | null;
  classificationKeywordsVersion?: string | null;
  digestionWindowMinutes?: number | null;
  matchingKey?: string | null;
  matchingKeyVersion?: number | null;
  overlapDetectedAtLog?: string[] | null;  // meal IDs that overlapped at log time
  classificationSnapshot?: ClassificationBucket | null;  // frozen at log time, never changes
  returnToBaselineMinutes?: number | null;
  endedElevated?: boolean;
  endedLow?: boolean;
  cgmCoveragePercent?: number | null;
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

// --- timestamp validation (Section 4.5, 4.6) ---

/** Section 4.6: reject timestamps >10min in the future. */
export function validateMealTimestamp(
  loggedAt: Date,
  now: Date = new Date(),
): { valid: boolean; error?: string } {
  const diff = loggedAt.getTime() - now.getTime();
  if (diff > TEN_MINUTES_MS) {
    return { valid: false, error: 'Meal time cannot be in the future' };
  }
  return { valid: true };
}

/** Section 4.5: flag if backdate >6 hours for confirmation dialog. */
export function isBackdateWarningNeeded(
  loggedAt: Date,
  now: Date = new Date(),
): boolean {
  const diff = now.getTime() - loggedAt.getTime();
  return diff > SIX_HOURS_MS;
}

// --- public API ---

export async function loadMeals(): Promise<Meal[]> {
  return loadMealsRaw();
}

// ---------------------------------------------------------------------------
// V1 preserved functions (rollback layer 2 — change USE_V2_SESSION_GROUPING to false)
// ---------------------------------------------------------------------------

async function _updateMealV1(
  id: string,
  changes: Partial<Pick<Meal, 'name' | 'photoUri' | 'insulinUnits' | 'loggedAt' | 'carbsEstimated'>>
): Promise<void> {
  const meals = await loadMealsRaw();
  const patch = 'loggedAt' in changes ? { ...changes, glucoseResponse: null } : changes;
  const updated = meals.map(m => (m.id === id ? { ...m, ...patch } : m));
  await saveMealsRaw(updated);
}

async function _deleteMealV1(id: string): Promise<void> {
  const meals = await loadMealsRaw();
  await saveMealsRaw(meals.filter(m => m.id !== id));
}

async function _saveMealV1(
  meal: Omit<Meal, 'id' | 'loggedAt' | 'glucoseResponse' | 'sessionId'>,
  loggedAt?: Date
): Promise<Meal> {
  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);
  const now = loggedAt ?? new Date();
  const newMeal: Meal = { ...meal, id: generateId(), loggedAt: now.toISOString(), glucoseResponse: null, sessionId: null };
  const activeSessions = new Set(
    sessions.filter(s => { const elapsed = now.getTime() - new Date(s.startedAt).getTime(); return elapsed >= 0 && elapsed <= THREE_HOURS_MS; }).map(s => s.id)
  );
  const recentMeals = meals.filter(m => {
    const elapsed = now.getTime() - new Date(m.loggedAt).getTime();
    return elapsed >= 0 && elapsed <= THREE_HOURS_MS && (m.sessionId === null || activeSessions.has(m.sessionId));
  });
  let session: Session;
  if (recentMeals.length === 0) {
    session = { id: `s_${now.getTime()}`, mealIds: [newMeal.id], startedAt: newMeal.loggedAt, confidence: 'high', glucoseResponse: null };
  } else {
    const existingSessionId = recentMeals.find(m => m.sessionId)?.sessionId ?? null;
    if (existingSessionId) {
      const existing = sessions.find(s => s.id === existingSessionId)!;
      const updatedIds = [...existing.mealIds, newMeal.id];
      session = { ...existing, mealIds: updatedIds, confidence: computeConfidence(updatedIds.length) };
    } else {
      const allIds = [...recentMeals.map(m => m.id), newMeal.id];
      const earliestStart = recentMeals.reduce((earliest, m) => (m.loggedAt < earliest ? m.loggedAt : earliest), recentMeals[0].loggedAt);
      session = { id: `s_${now.getTime()}`, mealIds: allIds, startedAt: earliestStart, confidence: computeConfidence(allIds.length), glucoseResponse: null };
    }
  }
  newMeal.sessionId = session.id;
  const updatedMeals = [newMeal, ...meals].map(m => session.mealIds.includes(m.id) ? { ...m, sessionId: session.id } : m);
  const updatedSessions = [...sessions.filter(s => s.id !== session.id), session];
  await Promise.all([saveMealsRaw(updatedMeals), saveSessionsRaw(updatedSessions)]);
  return newMeal;
}

// ---------------------------------------------------------------------------
// V2 implementations — Phase H integration (Sections 2, 3, 4, 7.1)
// ---------------------------------------------------------------------------

/** Helper: apply SessionMutations to meals and sessions arrays in-place. */
function applySessionMutations(
  meals: Meal[],
  sessions: Session[],
  mutations: SessionMutations,
): void {
  // Update meal sessionIds
  for (const update of mutations.mealUpdates) {
    const meal = meals.find(m => m.id === update.mealId);
    if (meal) meal.sessionId = update.newSessionId;
  }

  // Dissolve sessions
  for (const sid of mutations.sessionsToDissolve) {
    const idx = sessions.findIndex(s => s.id === sid);
    if (idx >= 0) sessions.splice(idx, 1);
  }

  // Create new sessions
  for (const newSess of mutations.sessionsToCreate) {
    sessions.push({
      id: newSess.id,
      mealIds: newSess.mealIds,
      startedAt: newSess.startedAt,
      confidence: computeConfidence(newSess.mealIds.length),
      glucoseResponse: null,
      sessionEnd: newSess.sessionEnd,
      totalCarbs: null,
      totalInsulin: null,
    });
  }

  // Update session ends
  for (const endUpdate of mutations.sessionEndUpdates ?? []) {
    const sess = sessions.find(s => s.id === endUpdate.sessionId);
    if (sess) sess.sessionEnd = endUpdate.newSessionEnd;
  }

  // Recompute session aggregates for affected sessions
  const affectedSessionIds = new Set([
    ...mutations.sessionsToCreate.map(s => s.id),
    ...(mutations.sessionEndUpdates ?? []).map(u => u.sessionId),
  ]);
  for (const sid of affectedSessionIds) {
    const sess = sessions.find(s => s.id === sid);
    if (!sess) continue;
    const memberMeals = meals.filter(m => m.sessionId === sid);
    sess.mealIds = memberMeals.map(m => m.id);
    sess.totalCarbs = memberMeals.reduce((sum, m) => sum + (m.carbsEstimated ?? 0), 0);
    sess.totalInsulin = memberMeals.reduce((sum, m) => sum + m.insulinUnits, 0);
  }
}

/** Convert a Meal to the OverlapMeal interface needed by sessionGrouping.ts */
function toOverlapMeal(m: Meal): OverlapMeal {
  return {
    id: m.id,
    loggedAt: m.loggedAt,
    digestionWindowMinutes: m.digestionWindowMinutes ?? null,
    sessionId: m.sessionId,
  };
}

async function _saveMealV2(
  meal: Omit<Meal, 'id' | 'loggedAt' | 'glucoseResponse' | 'sessionId'>,
  loggedAt?: Date
): Promise<Meal> {
  const now = loggedAt ?? new Date();
  // Note: timestamp validation already done in public saveMeal() before try-catch

  // Section 2: classify the meal
  const classification = classifyMeal(meal.name, meal.carbsEstimated ?? null);
  const matchingKey = computeMatchingKey(meal.name);
  const dict = loadKeywordDictionary();

  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);

  const newMeal: Meal = {
    ...meal,
    id: generateId(),
    loggedAt: now.toISOString(),
    glucoseResponse: null,
    sessionId: null,
    // V2 classification fields
    classificationBucket: classification.bucket,
    classificationMethod: classification.method,
    classificationMatchedKeyword: classification.matchedKeyword,
    classificationKeywordsVersion: classification.keywordsVersion,
    digestionWindowMinutes: classification.digestionWindowMinutes,
    matchingKey,
    matchingKeyVersion: MATCHING_KEY_VERSION,
    classificationSnapshot: classification.bucket,
    overlapDetectedAtLog: null,
  };

  // Section 2: non_carb meals are excluded from session grouping
  if (classification.bucket === 'non_carb') {
    const updatedMeals = [newMeal, ...meals];
    await saveMealsRaw(updatedMeals);
    return newMeal;
  }

  // Section 3: detect overlaps using primary window rule
  // Only consider classified meals (with digestionWindowMinutes) that are within a reasonable window
  const maxWindowMs = 240 * 60 * 1000; // fat_heavy max — no meal outside this can overlap
  const candidateMeals = meals.filter(m => {
    if (!m.digestionWindowMinutes || m.digestionWindowMinutes === 0) return false;
    if (m.classificationBucket === 'non_carb') return false;
    const elapsed = now.getTime() - new Date(m.loggedAt).getTime();
    return elapsed >= 0 && elapsed <= maxWindowMs;
  });

  const overlaps = detectOverlaps(toOverlapMeal(newMeal), candidateMeals.map(toOverlapMeal));

  // Store overlap audit trail (Section 3 — overlap_detected_at_log)
  newMeal.overlapDetectedAtLog = overlaps.map(o => o.id);

  // Section 3 + 4: group or create session
  const mutations = groupOrCreateSession(
    toOverlapMeal(newMeal),
    overlaps,
    sessions,
  );

  // Apply mutations to local arrays
  const allMeals = [newMeal, ...meals];
  const allSessions = [...sessions];
  applySessionMutations(allMeals, allSessions, mutations);

  // If no mutations (solo meal) — newMeal.sessionId stays null
  // Write audit events (Section 4.7)
  if (mutations.auditEvents.length > 0) {
    await logSessionEvents(mutations.auditEvents, {
      beforeState: null,
      afterState: null,
      classificationKeywordsVersion: dict.version,
    });
  }

  // Write atomically
  await Promise.all([saveMealsRaw(allMeals), saveSessionsRaw(allSessions)]);

  return newMeal;
}

async function _updateMealV2(
  id: string,
  changes: Partial<Pick<Meal, 'name' | 'photoUri' | 'insulinUnits' | 'loggedAt' | 'carbsEstimated'>>
): Promise<void> {
  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);
  const meal = meals.find(m => m.id === id);
  if (!meal) return;

  const nameChanged = 'name' in changes && changes.name !== meal.name;
  const timeChanged = 'loggedAt' in changes && changes.loggedAt !== meal.loggedAt;
  const carbsChanged = 'carbsEstimated' in changes && changes.carbsEstimated !== meal.carbsEstimated;

  // Apply basic changes
  const patch: Partial<Meal> = { ...changes };
  if (timeChanged) patch.glucoseResponse = null;

  // Re-classify if name or carbs changed (Section 4.4)
  if (nameChanged || carbsChanged) {
    const newName = (changes.name ?? meal.name);
    const newCarbs = ('carbsEstimated' in changes ? changes.carbsEstimated : meal.carbsEstimated) ?? null;
    const classification = classifyMeal(newName, newCarbs);
    patch.classificationBucket = classification.bucket;
    patch.classificationMethod = classification.method;
    patch.classificationMatchedKeyword = classification.matchedKeyword;
    patch.classificationKeywordsVersion = classification.keywordsVersion;
    patch.digestionWindowMinutes = classification.digestionWindowMinutes;
    patch.matchingKey = computeMatchingKey(newName);
  }

  // Apply patch to meal
  const updatedMeal = { ...meal, ...patch };
  const updatedMeals = meals.map(m => m.id === id ? updatedMeal : m);

  // Re-evaluate sessions if name/time/carbs changed (Section 4.4)
  if (nameChanged || timeChanged || carbsChanged) {
    const overlapMeals = updatedMeals.filter(m =>
      m.digestionWindowMinutes && m.digestionWindowMinutes > 0 && m.classificationBucket !== 'non_carb'
    ).map(toOverlapMeal);
    const mutations = reEvaluateOnEdit(id, overlapMeals, sessions);

    const allSessions = [...sessions];
    applySessionMutations(updatedMeals, allSessions, mutations);

    if (mutations.auditEvents.length > 0) {
      const dict = loadKeywordDictionary();
      await logSessionEvents(mutations.auditEvents, {
        beforeState: null,
        afterState: null,
        classificationKeywordsVersion: dict.version,
      });
    }

    await Promise.all([saveMealsRaw(updatedMeals), saveSessionsRaw(allSessions)]);
  } else {
    await saveMealsRaw(updatedMeals);
  }
}

async function _deleteMealV2(id: string): Promise<void> {
  const [meals, sessions] = await Promise.all([loadMealsRaw(), loadSessionsRaw()]);
  const meal = meals.find(m => m.id === id);
  const remainingMeals = meals.filter(m => m.id !== id);

  if (meal?.sessionId) {
    // Re-evaluate sessions after deletion (Section 4.4)
    const overlapMeals = remainingMeals.filter(m =>
      m.digestionWindowMinutes && m.digestionWindowMinutes > 0 && m.classificationBucket !== 'non_carb'
    ).map(toOverlapMeal);
    const mutations = reEvaluateOnDelete(id, overlapMeals, sessions);

    const allSessions = [...sessions];
    applySessionMutations(remainingMeals, allSessions, mutations);

    if (mutations.auditEvents.length > 0) {
      const dict = loadKeywordDictionary();
      await logSessionEvents(mutations.auditEvents, {
        beforeState: null,
        afterState: null,
        classificationKeywordsVersion: dict.version,
      });
    }

    await Promise.all([saveMealsRaw(remainingMeals), saveSessionsRaw(allSessions)]);
  } else {
    await saveMealsRaw(remainingMeals);
  }
}

// ---------------------------------------------------------------------------
// Public API — delegates to V1 or V2 based on feature flag
// ---------------------------------------------------------------------------

export async function updateMeal(
  id: string,
  changes: Partial<Pick<Meal, 'name' | 'photoUri' | 'insulinUnits' | 'loggedAt' | 'carbsEstimated'>>
): Promise<void> {
  if (!USE_V2_SESSION_GROUPING) return _updateMealV1(id, changes);
  try {
    return await _updateMealV2(id, changes);
  } catch (err) {
    console.warn('[storage] updateMealV2 failed, falling back to V1', err);
    return _updateMealV1(id, changes);
  }
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
  if (!USE_V2_SESSION_GROUPING) return _deleteMealV1(id);
  try {
    return await _deleteMealV2(id);
  } catch (err) {
    console.warn('[storage] deleteMealV2 failed, falling back to V1', err);
    return _deleteMealV1(id);
  }
}

export async function deleteInsulinLog(id: string): Promise<void> {
  const logs = await loadInsulinLogs();
  await AsyncStorage.setItem(INSULIN_LOGS_KEY, JSON.stringify(logs.filter(l => l.id !== id)));
}

export async function saveMeal(
  meal: Omit<Meal, 'id' | 'loggedAt' | 'glucoseResponse' | 'sessionId'>,
  loggedAt?: Date
): Promise<Meal> {
  // Section 4.6: reject future timestamps >10min BEFORE try-catch
  // so validation errors propagate to the caller instead of falling back to V1
  const now = loggedAt ?? new Date();
  const validation = validateMealTimestamp(now);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid meal timestamp');
  }

  if (!USE_V2_SESSION_GROUPING) return _saveMealV1(meal, loggedAt);
  try {
    return await _saveMealV2(meal, loggedAt);
  } catch (err) {
    // Layer 3 safety: if V2 fails, fall back to V1 so meal is never lost
    console.warn('[storage] saveMealV2 failed, falling back to V1', err);
    return _saveMealV1(meal, loggedAt);
  }
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
  nowMs: number,
  windowMs: number = THREE_HOURS_MS
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
    isPartial: nowMs < (fromMs + windowMs),
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
  const windowMs = (meal.digestionWindowMinutes ?? 180) * 60 * 1000;
  const toMs = fromMs + windowMs;
  const nowMs = Date.now();

  const readings = await fetchGlucoseRange(fromMs, Math.min(toMs, nowMs));
  if (readings.length === 0) return;

  const glucoseResponse = buildGlucoseResponse(fromMs, readings, nowMs, windowMs);

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

// --- onboarding & consent helpers (Plan 11-01) ---

const DATA_SHARING_ONBOARDING_KEY = 'data_sharing_onboarding_completed';
const ABOUT_ME_COMPLETED_KEY = 'about_me_completed';
const EQUIPMENT_CHANGELOG_KEY = 'equipment_changelog';

export async function loadOnboardingFlag(key: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(key);
    return val === 'true';
  } catch {
    console.warn('[storage] loadOnboardingFlag: getItem failed', key);
    return false;
  }
}

export async function loadEquipmentChangelog(): Promise<EquipmentChangeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(EQUIPMENT_CHANGELOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EquipmentChangeEntry[];
  } catch {
    console.warn('[storage] loadEquipmentChangelog: getItem/parse failed', EQUIPMENT_CHANGELOG_KEY);
    return [];
  }
}

const DATA_CONSENT_KEY_STORAGE = 'data_consent';

export async function loadDataConsentRaw(): Promise<DataConsent | null> {
  try {
    const raw = await AsyncStorage.getItem(DATA_CONSENT_KEY_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as DataConsent;
  } catch {
    console.warn('[storage] loadDataConsentRaw: getItem/parse failed', DATA_CONSENT_KEY_STORAGE);
    return null;
  }
}

export async function saveDataConsent(consent: DataConsent): Promise<void> {
  await AsyncStorage.setItem(DATA_CONSENT_KEY_STORAGE, JSON.stringify(consent));
}

export async function saveHypoTreatment(treatment: HypoTreatment): Promise<void> {
  const existing = await loadHypoTreatments();
  await AsyncStorage.setItem(HYPO_TREATMENTS_KEY, JSON.stringify([...existing, treatment]));
}

export const STORAGE_KEYS = {
  MEALS: MEALS_KEY,
  SESSIONS: SESSIONS_KEY,
  INSULIN_LOGS: INSULIN_LOGS_KEY,
  GLUCOSE_STORE: GLUCOSE_STORE_KEY,
  HBA1C_CACHE: HBA1C_CACHE_KEY,
  HYPO_TREATMENTS: HYPO_TREATMENTS_KEY,
  USER_PROFILE: USER_PROFILE_KEY,
  TABLET_DOSING: TABLET_DOSING_KEY,
  EQUIPMENT_CHANGELOG: EQUIPMENT_CHANGELOG_KEY,
  DATA_CONSENT: DATA_CONSENT_KEY_STORAGE,
  DATA_SHARING_ONBOARDING: DATA_SHARING_ONBOARDING_KEY,
  ABOUT_ME_COMPLETED: ABOUT_ME_COMPLETED_KEY,
} as const;
