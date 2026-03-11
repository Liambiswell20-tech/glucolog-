import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

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

export async function estimateCarbsFromPhoto(photoUri: string): Promise<string> {
  const remaining = await getRemainingEstimates();
  if (remaining <= 0) throw new RateLimitError();

  // Read the photo as base64
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Estimate the total carbohydrate content in grams of the food shown in this image. Give a single number or short range (e.g. "45g" or "40–50g") on the first line, then one sentence explaining your reasoning. If no food is visible, say so briefly.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message ?? `API error ${response.status}`);
  }

  const data = await response.json() as any;
  const text = (data.content?.[0]?.text ?? '').trim();

  // Only count successful estimates against the limit
  await incrementUsage();

  return text;
}
