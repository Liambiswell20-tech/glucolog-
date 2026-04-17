import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import {
  loadMeals, loadInsulinLogs, loadHypoTreatments,
  loadUserProfile, loadEquipmentChangelog,
  loadDataConsentRaw,
} from './storage';
import type { Meal, InsulinLog } from './storage';
import { getDailyTIRHistory } from '../utils/timeInRange';
import type { HypoTreatment, EquipmentChangeEntry, DailyTIR, DataConsent, UserProfile } from '../types/equipment';

const MIGRATION_COMPLETED_KEY = 'supabase_migration_v1_completed_at';

export type MigrationStage = 'idle' | 'running' | 'succeeded' | 'partial' | 'failed';

export interface MigrationProgress {
  stage: MigrationStage;
  totalRecords: number;
  migratedRecords: number;
  currentCollection: string;
  failedCollections: string[];
  error?: string;
}

export async function getMigrationStatus(): Promise<{ completed: boolean; completedAt: string | null }> {
  const val = await AsyncStorage.getItem(MIGRATION_COMPLETED_KEY);
  return { completed: !!val, completedAt: val };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function migrateToSupabase(
  onProgress: (p: MigrationProgress) => void
): Promise<MigrationProgress> {
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      stage: 'failed', totalRecords: 0, migratedRecords: 0,
      currentCollection: '', failedCollections: [], error: 'Not signed in',
    };
  }
  const userId = user.id;

  // Load all local data
  const [meals, insulin, hypos, profile, equipment, tir, consent] = await Promise.all([
    loadMeals(),
    loadInsulinLogs(),
    loadHypoTreatments(),
    loadUserProfile(),
    loadEquipmentChangelog(),
    getDailyTIRHistory(),
    loadDataConsentRaw(),
  ]);

  // Tablets go to tablet_doses, insulin goes to insulin_doses
  const total = meals.length + insulin.length + hypos.length + equipment.length +
    tir.length + (profile ? 1 : 0) + (consent ? 1 : 0);

  if (total === 0) {
    await AsyncStorage.setItem(MIGRATION_COMPLETED_KEY, new Date().toISOString());
    return { stage: 'succeeded', totalRecords: 0, migratedRecords: 0, currentCollection: '', failedCollections: [] };
  }

  let migrated = 0;
  const failed: string[] = [];
  const progress = (collection: string): MigrationProgress => ({
    stage: 'running',
    totalRecords: total,
    migratedRecords: migrated,
    currentCollection: collection,
    failedCollections: [...failed],
  });

  // --- Meals ---
  if (meals.length > 0) {
    onProgress(progress('meals'));
    let mealsFailed = false;
    for (const chunk of chunkArray(meals, 50)) {
      const { error } = await supabase.from('meals').upsert(
        chunk.map((m: Meal) => ({
          user_id: userId,
          client_id: m.id,
          name: m.name,
          photo_uri: m.photoUri,
          insulin_units: m.insulinUnits,
          start_glucose: m.startGlucose,
          carbs_estimated: m.carbsEstimated,
          logged_at: m.loggedAt,
          session_id: m.sessionId,
          glucose_response: m.glucoseResponse,
          insulin_brand: m.insulin_brand ?? null,
          delivery_method: m.delivery_method ?? null,
        })),
        { onConflict: 'user_id,client_id' }
      );
      if (error) {
        failed.push('meals');
        console.warn('[migration] meals chunk failed', error);
        mealsFailed = true;
        break;
      }
      migrated += chunk.length;
      onProgress(progress('meals'));
    }
    if (mealsFailed) {
      // Skip to next collection
    }
  }

  // --- Insulin doses (exclude tablets — they're not insulin) ---
  const insulinOnly = insulin.filter((l: InsulinLog) => l.type !== 'tablets');
  if (insulinOnly.length > 0) {
    onProgress(progress('insulin_doses'));
    let insulinFailed = false;
    for (const chunk of chunkArray(insulinOnly, 50)) {
      const { error } = await supabase.from('insulin_doses').upsert(
        chunk.map((l: InsulinLog) => ({
          user_id: userId,
          client_id: l.id,
          type: l.type,
          units: l.units,
          start_glucose: l.startGlucose,
          logged_at: l.loggedAt,
          basal_curve: l.basalCurve,
        })),
        { onConflict: 'user_id,client_id' }
      );
      if (error) {
        failed.push('insulin_doses');
        console.warn('[migration] insulin chunk failed', error);
        insulinFailed = true;
        break;
      }
      migrated += chunk.length;
      onProgress(progress('insulin_doses'));
    }
    if (insulinFailed) {
      // Skip to next collection
    }
  }

  // --- Tablet doses (separate from insulin) ---
  const tablets = insulin.filter((l: InsulinLog) => l.type === 'tablets');
  if (tablets.length > 0) {
    onProgress(progress('tablet_doses'));
    let tabletsFailed = false;
    for (const chunk of chunkArray(tablets, 50)) {
      const { error } = await supabase.from('tablet_doses').upsert(
        chunk.map((l: InsulinLog) => ({
          user_id: userId,
          client_id: l.id,
          units: l.units,
          start_glucose: l.startGlucose,
          logged_at: l.loggedAt,
        })),
        { onConflict: 'user_id,client_id' }
      );
      if (error) {
        failed.push('tablet_doses');
        console.warn('[migration] tablet chunk failed', error);
        tabletsFailed = true;
        break;
      }
      migrated += chunk.length;
      onProgress(progress('tablet_doses'));
    }
    if (tabletsFailed) {
      // Skip to next collection
    }
  }

  // --- Hypo treatments ---
  if (hypos.length > 0) {
    onProgress(progress('hypo_treatments'));
    let hyposFailed = false;
    for (const chunk of chunkArray(hypos, 50)) {
      const { error } = await supabase.from('hypo_treatments').upsert(
        chunk.map((h: HypoTreatment) => ({
          user_id: userId,
          client_id: h.id,
          logged_at: h.logged_at,
          glucose_at_event: h.glucose_at_event,
          treatment_type: h.treatment_type,
          brand: h.brand ?? null,
          amount_value: h.amount_value ?? null,
          amount_unit: h.amount_unit ?? null,
          notes: h.notes ?? null,
          insulin_brand: h.insulin_brand ?? null,
          glucose_readings_after: h.glucose_readings_after ?? null,
        })),
        { onConflict: 'user_id,client_id' }
      );
      if (error) {
        failed.push('hypo_treatments');
        console.warn('[migration] hypo chunk failed', error);
        hyposFailed = true;
        break;
      }
      migrated += chunk.length;
      onProgress(progress('hypo_treatments'));
    }
    if (hyposFailed) {
      // Skip to next collection
    }
  }

  // --- Equipment changelog ---
  if (equipment.length > 0) {
    onProgress(progress('equipment_changelog'));
    let equipmentFailed = false;
    for (const chunk of chunkArray(equipment, 50)) {
      const { error } = await supabase.from('equipment_changelog').upsert(
        chunk.map((e: EquipmentChangeEntry) => ({
          user_id: userId,
          client_id: e.id,
          field: e.field,
          value: e.value,
          started_at: e.started_at,
          ended_at: e.ended_at ?? null,
          reason_for_change: e.reason_for_change ?? null,
          previous_value: e.previous_value ?? null,
        })),
        { onConflict: 'user_id,client_id' }
      );
      if (error) {
        failed.push('equipment_changelog');
        console.warn('[migration] equipment chunk failed', error);
        equipmentFailed = true;
        break;
      }
      migrated += chunk.length;
      onProgress(progress('equipment_changelog'));
    }
    if (equipmentFailed) {
      // Skip to next collection
    }
  }

  // --- Daily TIR ---
  if (tir.length > 0) {
    onProgress(progress('daily_tir'));
    let tirFailed = false;
    for (const chunk of chunkArray(tir, 50)) {
      const { error } = await supabase.from('daily_tir').upsert(
        chunk.map((t: DailyTIR) => ({
          user_id: userId,
          client_id: t.date, // date string as idempotency key
          date: t.date,
          readings_count: t.readings_count,
          in_range_count: t.in_range_count,
          tir_percentage: t.tir_percentage,
          below_range_pct: t.below_range_pct,
          above_range_pct: t.above_range_pct,
        })),
        { onConflict: 'user_id,client_id' }
      );
      if (error) {
        failed.push('daily_tir');
        console.warn('[migration] TIR chunk failed', error);
        tirFailed = true;
        break;
      }
      migrated += chunk.length;
      onProgress(progress('daily_tir'));
    }
    if (tirFailed) {
      // Skip to next collection
    }
  }

  // --- User profile (single record) ---
  if (profile) {
    onProgress(progress('user_profiles'));
    const { error } = await supabase.from('user_profiles').upsert({
      user_id: userId,
      age_range: profile.age_range,
      gender: profile.gender,
      t1d_duration: profile.t1d_duration ?? null,
      hba1c_mmol_mol: profile.hba1c_mmol_mol ?? null,
      completed_at: profile.completed_at,
    }, { onConflict: 'user_id' });
    if (error) {
      failed.push('user_profiles');
      console.warn('[migration] profile failed', error);
    } else {
      migrated += 1;
    }
    onProgress(progress('user_profiles'));
  }

  // --- Data consent (single record) ---
  if (consent) {
    onProgress(progress('data_consent_records'));
    const { error } = await supabase.from('data_consent_records').upsert({
      user_id: userId,
      consented: consent.consented,
      consented_at: consent.consented_at ?? null,
      version: consent.version,
    }, { onConflict: 'user_id,version' });
    if (error) {
      failed.push('data_consent_records');
      console.warn('[migration] consent failed', error);
    } else {
      migrated += 1;
    }
    onProgress(progress('data_consent_records'));
  }

  // --- IMPORTANT: NEVER wipe AsyncStorage ---
  // AsyncStorage stays as canonical data source indefinitely.

  if (failed.length === 0) {
    await AsyncStorage.setItem(MIGRATION_COMPLETED_KEY, new Date().toISOString());
    return {
      stage: 'succeeded', totalRecords: total, migratedRecords: migrated,
      currentCollection: '', failedCollections: [],
    };
  }

  return {
    stage: 'partial',
    totalRecords: total,
    migratedRecords: migrated,
    currentCollection: '',
    failedCollections: failed,
    error: `Failed collections: ${failed.join(', ')}. Tap "Retry" to try again.`,
  };
}

/**
 * Server-side data sharing enforcement helper.
 * Any future aggregation query MUST use this filter.
 * Currently no aggregation queries exist, but this ensures the pattern is established.
 */
export function dataSharingFilter(): string {
  return `user_id IN (SELECT user_id FROM data_consent_records WHERE consented = true AND version = '1.0')`;
}
