import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyTIR } from '../types/equipment';

const DAILY_TIR_KEY = 'daily_tir';
const TIR_LOW = 3.9;   // mmol/L — inclusive lower bound
const TIR_HIGH = 10.0; // mmol/L — inclusive upper bound
const MAX_TIR_RECORDS = 90;

export function calculateDailyTIR(readings: number[], date?: string): DailyTIR {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  if (readings.length === 0) {
    return {
      date: targetDate,
      readings_count: 0,
      in_range_count: 0,
      tir_percentage: 0,
      below_range_pct: 0,
      above_range_pct: 0,
    };
  }
  const inRange = readings.filter(r => r >= TIR_LOW && r <= TIR_HIGH).length;
  const below = readings.filter(r => r < TIR_LOW).length;
  const above = readings.filter(r => r > TIR_HIGH).length;
  const total = readings.length;
  return {
    date: targetDate,
    readings_count: total,
    in_range_count: inRange,
    tir_percentage: Math.round((inRange / total) * 100),
    below_range_pct: Math.round((below / total) * 100),
    above_range_pct: Math.round((above / total) * 100),
  };
}

export async function getDailyTIRHistory(): Promise<DailyTIR[]> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_TIR_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw) as DailyTIR[];
    return records.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    console.warn('[timeInRange] getDailyTIRHistory: getItem/parse failed');
    return [];
  }
}

export async function storeDailyTIR(record: DailyTIR): Promise<void> {
  const existing = await getDailyTIRHistory();
  // Never overwrite an existing record for the same date
  if (existing.some(r => r.date === record.date)) return;
  // Prune to MAX_TIR_RECORDS (90), keeping most recent
  const updated = [...existing, record]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_TIR_RECORDS);
  await AsyncStorage.setItem(DAILY_TIR_KEY, JSON.stringify(updated));
}
