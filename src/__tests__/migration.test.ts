import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock supabase, storage, and timeInRange using jest.mock with auto-mock
// then configure behavior in beforeEach
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

jest.mock('../services/storage', () => ({
  loadMeals: jest.fn(),
  loadInsulinLogs: jest.fn(),
  loadHypoTreatments: jest.fn(),
  loadUserProfile: jest.fn(),
  loadEquipmentChangelog: jest.fn(),
  loadDataConsentRaw: jest.fn(),
}));

jest.mock('../utils/timeInRange', () => ({
  getDailyTIRHistory: jest.fn(),
}));

// Import after mocking
import { migrateToSupabase, getMigrationStatus } from '../services/migration';
import type { MigrationProgress } from '../services/migration';
import { supabase } from '../../lib/supabase';
import * as storage from '../services/storage';
import * as timeInRange from '../utils/timeInRange';

const mockAuth = supabase.auth as { getUser: jest.Mock };
const mockFrom = supabase.from as jest.Mock;

const FAKE_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

let mockUpsert: jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();

  // Setup auth mock
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: FAKE_USER_ID } } });

  // Setup from().upsert() chain
  mockUpsert = jest.fn().mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ upsert: mockUpsert });

  // Setup storage loaders to return empty data
  (storage.loadMeals as jest.Mock).mockResolvedValue([]);
  (storage.loadInsulinLogs as jest.Mock).mockResolvedValue([]);
  (storage.loadHypoTreatments as jest.Mock).mockResolvedValue([]);
  (storage.loadUserProfile as jest.Mock).mockResolvedValue(null);
  (storage.loadEquipmentChangelog as jest.Mock).mockResolvedValue([]);
  (storage.loadDataConsentRaw as jest.Mock).mockResolvedValue(null);
  (timeInRange.getDailyTIRHistory as jest.Mock).mockResolvedValue([]);
});

describe('migrateToSupabase', () => {
  it('calls supabase.from("meals").upsert with correct shape including onConflict', async () => {
    const meal = {
      id: 'meal-1',
      name: 'Test meal',
      photoUri: null,
      insulinUnits: 4,
      startGlucose: 6.5,
      carbsEstimated: 40,
      loggedAt: '2026-04-01T12:00:00.000Z',
      sessionId: 's_123',
      glucoseResponse: null,
      insulin_brand: 'NovoRapid',
      delivery_method: 'Disposable pen',
    };
    (storage.loadMeals as jest.Mock).mockResolvedValue([meal]);

    const onProgress = jest.fn();
    await migrateToSupabase(onProgress);

    expect(mockFrom).toHaveBeenCalledWith('meals');
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: FAKE_USER_ID,
          client_id: 'meal-1',
          name: 'Test meal',
          photo_uri: null,
          insulin_units: 4,
          start_glucose: 6.5,
          carbs_estimated: 40,
          logged_at: '2026-04-01T12:00:00.000Z',
          session_id: 's_123',
          glucose_response: null,
          insulin_brand: 'NovoRapid',
          delivery_method: 'Disposable pen',
        }),
      ],
      { onConflict: 'user_id,client_id' }
    );
  });

  it('returns succeeded with 0 records for empty data', async () => {
    const onProgress = jest.fn();
    const result = await migrateToSupabase(onProgress);

    expect(result.stage).toBe('succeeded');
    expect(result.migratedRecords).toBe(0);
    expect(result.totalRecords).toBe(0);
    expect(result.failedCollections).toEqual([]);
  });

  it('returns failed when user is not signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });

    const onProgress = jest.fn();
    const result = await migrateToSupabase(onProgress);

    expect(result.stage).toBe('failed');
    expect(result.error).toBe('Not signed in');
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('returns partial with failedCollections when meals upsert returns error', async () => {
    (storage.loadMeals as jest.Mock).mockResolvedValue([{
      id: 'meal-1', name: 'Fail meal', photoUri: null, insulinUnits: 2,
      startGlucose: 5.0, carbsEstimated: 20, loggedAt: '2026-04-01T12:00:00.000Z',
      sessionId: null, glucoseResponse: null,
    }]);
    // Meals upsert errors
    mockUpsert.mockResolvedValueOnce({ error: { message: 'DB error', code: '500' } });

    const onProgress = jest.fn();
    const result = await migrateToSupabase(onProgress);

    expect(result.stage).toBe('partial');
    expect(result.failedCollections).toContain('meals');
  });

  it('reports progress via onProgress callback', async () => {
    (storage.loadMeals as jest.Mock).mockResolvedValue([{
      id: 'meal-1', name: 'Progress meal', photoUri: null, insulinUnits: 3,
      startGlucose: 7.0, carbsEstimated: 30, loggedAt: '2026-04-01T12:00:00.000Z',
      sessionId: null, glucoseResponse: null,
    }]);

    const onProgress = jest.fn();
    await migrateToSupabase(onProgress);

    // Should have been called at least once with 'meals' as currentCollection
    const mealsCalls = onProgress.mock.calls.filter(
      ([p]: [MigrationProgress]) => p.currentCollection === 'meals'
    );
    expect(mealsCalls.length).toBeGreaterThanOrEqual(1);
    expect(mealsCalls[0][0].stage).toBe('running');
  });

  it('migrates multiple collections and returns succeeded when all pass', async () => {
    (storage.loadMeals as jest.Mock).mockResolvedValue([{
      id: 'meal-1', name: 'Meal', photoUri: null, insulinUnits: 4,
      startGlucose: 6.0, carbsEstimated: 35, loggedAt: '2026-04-01T12:00:00.000Z',
      sessionId: null, glucoseResponse: null,
    }]);
    (storage.loadInsulinLogs as jest.Mock).mockResolvedValue([{
      id: 'ins-1', type: 'long-acting', units: 20, startGlucose: 6.5,
      loggedAt: '2026-04-01T22:00:00.000Z', basalCurve: null,
    }]);

    const onProgress = jest.fn();
    const result = await migrateToSupabase(onProgress);

    expect(result.stage).toBe('succeeded');
    expect(result.migratedRecords).toBe(2);
    expect(result.totalRecords).toBe(2);
    expect(result.failedCollections).toEqual([]);
  });
});

describe('getMigrationStatus', () => {
  it('returns completed: false initially', async () => {
    const status = await getMigrationStatus();
    expect(status.completed).toBe(false);
    expect(status.completedAt).toBeNull();
  });

  it('returns completed: true after successful migration', async () => {
    // Run a successful empty-data migration (which sets the key)
    const onProgress = jest.fn();
    await migrateToSupabase(onProgress);

    const status = await getMigrationStatus();
    expect(status.completed).toBe(true);
    expect(status.completedAt).toBeTruthy();
  });
});
