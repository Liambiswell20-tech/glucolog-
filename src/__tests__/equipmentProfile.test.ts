import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveEquipment, getCurrentEquipmentProfile, getEquipmentAtTime, changeEquipment } from '../utils/equipmentProfile';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('equipmentProfile', () => {
  it('initial onboarding creates one entry per field with started_at and no ended_at', async () => {
    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    const entry = await getActiveEquipment('rapid_insulin_brand');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('NovoRapid');
    expect(entry!.started_at).toBeTruthy();
    expect(entry!.ended_at).toBeUndefined();
  });

  it('changeEquipment closes the previous entry and opens a new one', async () => {
    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    await changeEquipment('rapid_insulin_brand', 'Humalog');

    // First entry should be closed (has ended_at)
    const allEntries = JSON.parse(await AsyncStorage.getItem('equipment_changelog') ?? '[]');
    const first = allEntries.find((e: any) => e.value === 'NovoRapid');
    const second = allEntries.find((e: any) => e.value === 'Humalog');

    expect(first.ended_at).toBeTruthy();
    expect(second.ended_at).toBeUndefined();
  });

  it('changeEquipment: ended_at on closing entry === started_at on new entry (same timestamp)', async () => {
    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    await changeEquipment('rapid_insulin_brand', 'Humalog');

    const allEntries = JSON.parse(await AsyncStorage.getItem('equipment_changelog') ?? '[]');
    const first = allEntries.find((e: any) => e.value === 'NovoRapid');
    const second = allEntries.find((e: any) => e.value === 'Humalog');

    expect(first.ended_at).toBe(second.started_at);
  });

  it('changeEquipment records previous_value correctly', async () => {
    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    await changeEquipment('rapid_insulin_brand', 'Humalog');

    const active = await getActiveEquipment('rapid_insulin_brand');
    expect(active!.previous_value).toBe('NovoRapid');
  });

  it('changeEquipment records reason_for_change when provided', async () => {
    await changeEquipment('delivery_method', 'Disposable pen');
    await changeEquipment('delivery_method', 'Insulin pump', 'Switched to pump');

    const active = await getActiveEquipment('delivery_method');
    expect(active!.reason_for_change).toBe('Switched to pump');
  });

  it('getActiveEquipment returns the entry with no ended_at', async () => {
    // Returns null when no entry exists
    const none = await getActiveEquipment('rapid_insulin_brand');
    expect(none).toBeNull();

    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    const active = await getActiveEquipment('rapid_insulin_brand');
    expect(active).not.toBeNull();
    expect(active!.value).toBe('NovoRapid');
    expect(active!.ended_at).toBeUndefined();
  });

  it('getEquipmentAtTime returns the correct entry for a timestamp mid-window', async () => {
    const t1 = new Date('2026-01-01T10:00:00Z').toISOString();
    const t2 = new Date('2026-01-15T12:00:00Z').toISOString();
    const midpoint = new Date('2026-01-08T10:00:00Z').toISOString();

    // Manually build changelog with known timestamps
    const entries = [
      { id: '1', field: 'rapid_insulin_brand', value: 'NovoRapid', started_at: t1, ended_at: t2 },
      { id: '2', field: 'rapid_insulin_brand', value: 'Humalog', started_at: t2 },
    ];
    await AsyncStorage.setItem('equipment_changelog', JSON.stringify(entries));

    const result = await getEquipmentAtTime('rapid_insulin_brand', midpoint);
    expect(result).not.toBeNull();
    expect(result!.value).toBe('NovoRapid');
  });

  it('getEquipmentAtTime returns null before any entries exist', async () => {
    const result = await getEquipmentAtTime('rapid_insulin_brand', new Date().toISOString());
    expect(result).toBeNull();
  });

  it('getEquipmentAtTime returns correct entry when multiple changes have occurred', async () => {
    const t1 = new Date('2026-01-01T00:00:00Z').toISOString();
    const t2 = new Date('2026-02-01T00:00:00Z').toISOString();
    const t3 = new Date('2026-03-01T00:00:00Z').toISOString();

    const entries = [
      { id: '1', field: 'rapid_insulin_brand', value: 'NovoRapid', started_at: t1, ended_at: t2 },
      { id: '2', field: 'rapid_insulin_brand', value: 'Humalog', started_at: t2, ended_at: t3 },
      { id: '3', field: 'rapid_insulin_brand', value: 'Fiasp', started_at: t3 },
    ];
    await AsyncStorage.setItem('equipment_changelog', JSON.stringify(entries));

    const mid1 = new Date('2026-01-15T00:00:00Z').toISOString();
    const mid2 = new Date('2026-02-15T00:00:00Z').toISOString();
    const mid3 = new Date('2026-03-15T00:00:00Z').toISOString();

    const r1 = await getEquipmentAtTime('rapid_insulin_brand', mid1);
    const r2 = await getEquipmentAtTime('rapid_insulin_brand', mid2);
    const r3 = await getEquipmentAtTime('rapid_insulin_brand', mid3);

    expect(r1!.value).toBe('NovoRapid');
    expect(r2!.value).toBe('Humalog');
    expect(r3!.value).toBe('Fiasp');
  });

  it('getCurrentEquipmentProfile returns all active fields as a flat object', async () => {
    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    await changeEquipment('long_acting_insulin_brand', 'Lantus');
    await changeEquipment('delivery_method', 'Disposable pen');
    await changeEquipment('cgm_device', 'FreeStyle Libre 2');

    const profile = await getCurrentEquipmentProfile();
    expect(profile).not.toBeNull();
    expect(profile!.rapidInsulinBrand).toBe('NovoRapid');
    expect(profile!.longActingInsulinBrand).toBe('Lantus');
    expect(profile!.deliveryMethod).toBe('Disposable pen');
    expect(profile!.cgmDevice).toBe('FreeStyle Libre 2');
  });

  it('getCurrentEquipmentProfile returns longActingInsulinBrand: null when user selected opt-out', async () => {
    await changeEquipment('rapid_insulin_brand', 'NovoRapid');
    await changeEquipment('long_acting_insulin_brand', 'NO_LONG_ACTING');
    await changeEquipment('delivery_method', 'Disposable pen');
    await changeEquipment('cgm_device', 'FreeStyle Libre 2');

    const profile = await getCurrentEquipmentProfile();
    expect(profile).not.toBeNull();
    expect(profile!.longActingInsulinBrand).toBeNull();
  });
});
