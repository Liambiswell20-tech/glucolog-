import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { supabase } from '../../lib/supabase';

const PROXY_URL = 'https://www.bolusbrain.app/api/carb-estimate';
const CURRENT_AI_CONSENT_VERSION = '1.0';

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

export class ConsentRequiredError extends Error {
  constructor() {
    super('AI consent required');
  }
}

export async function hasAIConsent(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('ai_consent_records')
      .select('version')
      .eq('user_id', user.id)
      .eq('version', CURRENT_AI_CONSENT_VERSION)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) { console.warn('[carbEstimate] consent check failed', error); return false; }
    return !!data;
  } catch {
    return false;
  }
}

export async function estimateCarbsFromPhoto(photoUri: string, signal?: AbortSignal): Promise<string> {
  // Check AI consent first
  const consented = await hasAIConsent();
  if (!consented) throw new ConsentRequiredError();

  const remaining = await getRemainingEstimates();
  if (remaining <= 0) throw new RateLimitError();

  // Read the photo as base64
  const base64 = await new File(photoUri).base64();

  // Get session for auth header
  const session = (await supabase.auth.getSession()).data.session;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
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
