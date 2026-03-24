import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeAndCacheHba1c,
  saveMeal,
  loadInsulinLogs,
  loadGlucoseStore,
  loadCachedHba1c,
  loadMeals,
  loadSessionsWithMeals,
} from './storage';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const baseTime = new Date('2024-01-01T12:00:00Z').getTime();

const minimalMeal = {
  name: 'Test meal',
  photoUri: null,
  insulinUnits: 2,
  startGlucose: 7.0,
  carbsEstimated: null,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

// --- HbA1c formula ---

describe('computeAndCacheHba1c', () => {
  it('returns correct percent and mmolMol for avgMmol=7.0 over 30 days', async () => {
    const result = await computeAndCacheHba1c(7.0, 30);
    // percent = Math.round(((7.0 + 2.59) / 1.59) * 10) / 10 = 6.0
    // mmolMol = Math.round(10.929 * (7.0 - 2.15)) = Math.round(53.00565) = 53
    expect(result.percent).toBe(6.0);
    expect(result.mmolMol).toBe(53);
    expect(result.daysOfData).toBe(30);
  });
});

// --- saveMeal session grouping ---

describe('saveMeal session grouping', () => {
  it('creates a new solo session when no prior meals exist', async () => {
    const meal = await saveMeal(minimalMeal, new Date(baseTime));
    expect(meal.sessionId).toBeTruthy();
  });

  it('joins an existing open session when meal is logged 30 minutes after first', async () => {
    const first = await saveMeal(minimalMeal, new Date(baseTime));
    const second = await saveMeal(
      { ...minimalMeal, name: 'Test meal 2' },
      new Date(baseTime + 30 * 60 * 1000)
    );
    expect(second.sessionId).toBe(first.sessionId);
  });

  it('creates a new independent session when meal is logged exactly 3hr+1min after first', async () => {
    const first = await saveMeal(minimalMeal, new Date(baseTime));
    const second = await saveMeal(
      { ...minimalMeal, name: 'Test meal 2' },
      new Date(baseTime + THREE_HOURS_MS + 60000)
    );
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.sessionId).toBeTruthy();
  });
});

// --- Storage hardening: getItem failure returns safe defaults ---
// Per plan 04-02 and CONTEXT.md decision 8.
// These tests verify that every load function wraps AsyncStorage.getItem in
// an outer try/catch so a storage-level failure never crashes the app.

describe('loadInsulinLogs — safe default on getItem failure', () => {
  it('returns [] when AsyncStorage.getItem throws', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    const result = await loadInsulinLogs();
    expect(result).toEqual([]);
  });

  it('emits a [storage] warning when AsyncStorage.getItem throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    await loadInsulinLogs();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storage]'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });
});

describe('loadGlucoseStore — safe default on getItem failure', () => {
  it('returns null when AsyncStorage.getItem throws', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    const result = await loadGlucoseStore();
    expect(result).toBeNull();
  });

  it('emits a [storage] warning when AsyncStorage.getItem throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    await loadGlucoseStore();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storage]'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });
});

describe('loadCachedHba1c — safe default on getItem failure', () => {
  it('returns null when AsyncStorage.getItem throws', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    const result = await loadCachedHba1c();
    expect(result).toBeNull();
  });

  it('emits a [storage] warning when AsyncStorage.getItem throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    await loadCachedHba1c();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storage]'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });
});

describe('loadMeals (via loadMealsRaw) — safe default on getItem failure', () => {
  it('returns [] when AsyncStorage.getItem throws', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    const result = await loadMeals();
    expect(result).toEqual([]);
  });

  it('emits a [storage] warning when AsyncStorage.getItem throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage fail'));

    await loadMeals();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storage]'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });
});

describe('loadSessionsWithMeals (via loadSessionsRaw + loadMealsRaw) — safe default on getItem failure', () => {
  it('returns [] when all AsyncStorage.getItem calls throw', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValue(new Error('storage fail'));

    const result = await loadSessionsWithMeals();
    expect(result).toEqual([]);
  });

  it('emits [storage] warnings when AsyncStorage.getItem throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValue(new Error('storage fail'));

    await loadSessionsWithMeals();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storage]'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });
});
