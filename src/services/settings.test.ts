import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, saveSettings } from './settings';

afterEach(async () => {
  await AsyncStorage.clear();
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const settings = await loadSettings();
    expect(settings.displayName).toBe('');
    expect(settings.email).toBe('');
    expect(settings.carbInsulinRatio).toBeNull();
    expect(settings.tabletName).toBe('');
    expect(settings.tabletDose).toBe('');
  });

  it('round-trips displayName and email', async () => {
    await saveSettings({ displayName: 'Liam', email: 'liam@example.com' });
    const loaded = await loadSettings();
    expect(loaded.displayName).toBe('Liam');
    expect(loaded.email).toBe('liam@example.com');
  });

  it('round-trips carbInsulinRatio', async () => {
    await saveSettings({ carbInsulinRatio: 10 });
    const loaded = await loadSettings();
    expect(loaded.carbInsulinRatio).toBe(10);
  });

  it('round-trips tabletName and tabletDose', async () => {
    await saveSettings({ tabletName: 'Metformin', tabletDose: '500mg twice daily' });
    const loaded = await loadSettings();
    expect(loaded.tabletName).toBe('Metformin');
    expect(loaded.tabletDose).toBe('500mg twice daily');
  });

  it('merges partial updates without overwriting other fields', async () => {
    await saveSettings({ displayName: 'Liam', carbInsulinRatio: 8 });
    await saveSettings({ email: 'liam@test.com' });
    const loaded = await loadSettings();
    expect(loaded.displayName).toBe('Liam');
    expect(loaded.carbInsulinRatio).toBe(8);
    expect(loaded.email).toBe('liam@test.com');
  });
});
