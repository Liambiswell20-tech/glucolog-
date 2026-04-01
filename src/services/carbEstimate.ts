import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

const PROXY_URL = 'https://www.bolusbrain.app/api/carb-estimate';

const RATE_LIMIT_KEY = 'glucolog_carb_estimate_usage';
const DAILY_LIMIT = 10;

interface UsageRecord {
  date: string; // YYYY-MM-DD
  count: number;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getRemainingEstimates(): Promise<number> {
  const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
  if (!raw) return DAILY_LIMIT;
  const record: UsageRecord = JSON.parse(raw);
  if (record.date !== todayString()) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - record.count);
}

async function incrementUsage(): Promise<void> {
  const today = todayString();
  const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
  let record: UsageRecord = { date: today, count: 0 };
  if (raw) {
    const parsed: UsageRecord = JSON.parse(raw);
    record = parsed.date === today ? parsed : { date: today, count: 0 };
  }
  record.count += 1;
  await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(record));
}

export class RateLimitError extends Error {
  constructor() {
    super('Daily limit reached');
  }
}

export async function estimateCarbsFromPhoto(photoUri: string, signal?: AbortSignal): Promise<string> {
  const remaining = await getRemainingEstimates();
  if (remaining <= 0) throw new RateLimitError();

  // Read the photo as base64
  const base64 = await new File(photoUri).base64();

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error ?? `API error ${response.status}`);
  }

  const data = await response.json() as { result?: string };
  const text = (data.result ?? '').trim();

  // Only count successful estimates against the limit
  await incrementUsage();

  return text;
}
