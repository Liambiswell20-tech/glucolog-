import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EquipmentChangeEntry } from '../types/equipment';

const EQUIPMENT_CHANGELOG_KEY = 'equipment_changelog';

async function loadChangelog(): Promise<EquipmentChangeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(EQUIPMENT_CHANGELOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EquipmentChangeEntry[];
  } catch {
    console.warn('[equipmentProfile] loadChangelog: getItem/parse failed');
    return [];
  }
}

async function saveChangelog(entries: EquipmentChangeEntry[]): Promise<void> {
  await AsyncStorage.setItem(EQUIPMENT_CHANGELOG_KEY, JSON.stringify(entries));
}

export async function getActiveEquipment(field: string): Promise<EquipmentChangeEntry | null> {
  const entries = await loadChangelog();
  return entries.find(e => e.field === field && !e.ended_at) ?? null;
}

export async function getCurrentEquipmentProfile(): Promise<{
  rapidInsulinBrand: string;
  longActingInsulinBrand: string | null;
  deliveryMethod: string;
  cgmDevice: string;
  penNeedleBrand?: string;
} | null> {
  const [rapid, longActing, delivery, cgm, pen] = await Promise.all([
    getActiveEquipment('rapid_insulin_brand'),
    getActiveEquipment('long_acting_insulin_brand'),
    getActiveEquipment('delivery_method'),
    getActiveEquipment('cgm_device'),
    getActiveEquipment('pen_needle_brand'),
  ]);
  if (!rapid || !delivery || !cgm) return null;
  const longActingBrand = longActing
    ? (longActing.value === 'NO_LONG_ACTING' ? null : longActing.value)
    : null;
  return {
    rapidInsulinBrand: rapid.value,
    longActingInsulinBrand: longActingBrand,
    deliveryMethod: delivery.value,
    cgmDevice: cgm.value,
    ...(pen ? { penNeedleBrand: pen.value } : {}),
  };
}

export async function getEquipmentAtTime(field: string, timestamp: string): Promise<EquipmentChangeEntry | null> {
  const entries = await loadChangelog();
  const ts = timestamp;
  return entries.find(e => {
    if (e.field !== field) return false;
    if (e.started_at > ts) return false;
    if (e.ended_at && e.ended_at <= ts) return false;
    return true;
  }) ?? null;
}

export async function changeEquipment(field: string, newValue: string, reason?: string): Promise<void> {
  const entries = await loadChangelog();
  // Single timestamp — CRITICAL invariant: ended_at === started_at on the new entry
  const now = new Date(Date.now()).toISOString();
  const previousActive = entries.find(e => e.field === field && !e.ended_at);
  if (previousActive) {
    previousActive.ended_at = now;
  }
  const newEntry: EquipmentChangeEntry = {
    id: Date.now().toString(),
    field: field as EquipmentChangeEntry['field'],
    value: newValue,
    started_at: now,
    ...(previousActive ? { previous_value: previousActive.value } : {}),
    ...(reason ? { reason_for_change: reason } : {}),
  };
  await saveChangelog([...entries, newEntry]);
}
