import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'glucolog_settings';

export interface AppSettings {
  // Dosing
  carbInsulinRatio: number | null;  // grams of carbs per 1 unit of insulin (e.g. 10 = 1u per 10g)
  tabletName: string;               // e.g. "Metformin"
  tabletDose: string;               // e.g. "500mg twice daily"

  // Account
  displayName: string;
  email: string;
}

const DEFAULTS: AppSettings = {
  carbInsulinRatio: null,
  tabletName: '',
  tabletDose: '',
  displayName: '',
  email: '',
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULTS };
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

export async function saveSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const updated = { ...current, ...updates };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}
