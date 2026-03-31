import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateDailyTIR, getDailyTIRHistory, storeDailyTIR } from '../utils/timeInRange';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('timeInRange', () => {
  it('empty readings array returns 0 for all values', () => {
    const result = calculateDailyTIR([]);
    expect(result.readings_count).toBe(0);
    expect(result.in_range_count).toBe(0);
    expect(result.tir_percentage).toBe(0);
    expect(result.below_range_pct).toBe(0);
    expect(result.above_range_pct).toBe(0);
    expect(result.date).toBeTruthy();
  });

  it('all readings in range returns 100% TIR', () => {
    const result = calculateDailyTIR([5.0, 7.5, 9.9]);
    expect(result.tir_percentage).toBe(100);
    expect(result.in_range_count).toBe(3);
    expect(result.readings_count).toBe(3);
  });

  it('mixed readings calculate correctly', () => {
    // 3.0 = below, 5.0 = in range, 11.0 = above
    const result = calculateDailyTIR([3.0, 5.0, 11.0]);
    expect(result.in_range_count).toBe(1);
    expect(result.tir_percentage).toBe(Math.round(100 / 3));
    expect(result.below_range_pct).toBe(Math.round(100 / 3));
    expect(result.above_range_pct).toBe(Math.round(100 / 3));
    expect(result.readings_count).toBe(3);
  });

  it('boundary readings (3.9 and 10.0 mmol/L) count as in-range', () => {
    const result = calculateDailyTIR([3.9, 10.0]);
    expect(result.in_range_count).toBe(2);
    expect(result.tir_percentage).toBe(100);
  });

  it('getDailyTIRHistory trims store to 90 days when a new record pushes total beyond 90', async () => {
    // Store 91 records with ascending dates
    for (let i = 0; i < 91; i++) {
      const date = new Date(2025, 0, 1 + i); // Jan 1 + i days
      const dateStr = date.toISOString().slice(0, 10);
      const record = calculateDailyTIR([5.0], dateStr);
      await storeDailyTIR(record);
    }

    const history = await getDailyTIRHistory();
    expect(history.length).toBe(90);
  });

  it('getDailyTIRHistory returns records in ascending date order', async () => {
    // Store records out of order
    const dates = ['2026-03-15', '2026-01-01', '2026-02-10'];
    for (const date of dates) {
      const record = calculateDailyTIR([5.0], date);
      await storeDailyTIR(record);
    }

    const history = await getDailyTIRHistory();
    expect(history.length).toBe(3);
    expect(history[0].date).toBe('2026-01-01');
    expect(history[1].date).toBe('2026-02-10');
    expect(history[2].date).toBe('2026-03-15');
  });
});
