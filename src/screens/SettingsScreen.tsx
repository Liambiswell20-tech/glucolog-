import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, saveSettings, AppSettings } from '../services/settings';
import { loadTabletDosing, saveTabletDosing } from '../services/storage';
import { getCurrentEquipmentProfile, changeEquipment } from '../utils/equipmentProfile';
import EquipmentChangeConfirmation from '../components/EquipmentChangeConfirmation';
import { COLORS, FONTS } from '../theme';
import type { DataConsent, TabletDosing } from '../types/equipment';
import type { RootStackParamList } from '../../App';

const CURRENT_CONSENT_VERSION = '1.0';
const DATA_CONSENT_KEY = 'data_consent';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <Text style={styles.navRowLabel}>{label}</Text>
      <Text style={styles.navRowChevron}>›</Text>
    </Pressable>
  );
}

function SettingRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  hint?: string;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <TextInput
        style={styles.settingInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#48484A"
        keyboardType={keyboardType}
      />
      {hint && <Text style={styles.settingHint}>{hint}</Text>}
    </View>
  );
}

// ─── Equipment picker options (verbatim from CONTEXT.md) ─────────────────────

function getPickerOptions(field: string): string[] {
  switch (field) {
    case 'rapid_insulin_brand':
      return ['NovoRapid', 'Humalog', 'Fiasp', 'Apidra', 'Lyumjev', 'Other'];
    case 'long_acting_insulin_brand':
      return ['Lantus', 'Levemir', 'Tresiba', 'Toujeo', 'Abasaglar', 'Other', "I don't take long-acting insulin"];
    case 'delivery_method':
      return ['Disposable pen', 'Reusable pen', 'Insulin pump', 'Syringe & vial'];
    case 'cgm_device':
      return ['FreeStyle Libre 2', 'FreeStyle Libre 3', 'Dexcom G7', 'Dexcom ONE', 'Medtronic Guardian', 'Other'];
    case 'pen_needle_brand':
      return ['BD Micro-Fine', 'Unifine Pentips', 'NovoFine', 'GlucoRx', 'Other', 'Skip'];
    default:
      return [];
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [tablets, setTablets] = useState<TabletDosing[]>([]);
  const [consent, setConsent] = useState<DataConsent>({ consented: false, version: CURRENT_CONSENT_VERSION });
  const [reConsentModalVisible, setReConsentModalVisible] = useState(false);

  // ─── Equipment profile state ────────────────────────────────────────────────
  const [activeProfile, setActiveProfile] = useState<{
    rapidInsulinBrand: string;
    longActingInsulinBrand: string | null;
    deliveryMethod: string;
    cgmDevice: string;
    penNeedleBrand?: string;
  } | null>(null);

  // Picker state
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [pickerOptions, setPickerOptions] = useState<string[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmOldValue, setConfirmOldValue] = useState('');
  const [confirmNewValue, setConfirmNewValue] = useState('');
  const [confirmFieldLabel, setConfirmFieldLabel] = useState('');
  const [savingEquipment, setSavingEquipment] = useState(false);

  // ─── Consent helpers ────────────────────────────────────────────────────────

  async function loadConsent(): Promise<DataConsent> {
    try {
      const raw = await AsyncStorage.getItem(DATA_CONSENT_KEY);
      if (!raw) return { consented: false, version: CURRENT_CONSENT_VERSION };
      return JSON.parse(raw) as DataConsent;
    } catch {
      return { consented: false, version: CURRENT_CONSENT_VERSION };
    }
  }

  async function saveConsent(updated: DataConsent): Promise<void> {
    await AsyncStorage.setItem(DATA_CONSENT_KEY, JSON.stringify(updated));
  }

  async function handleConsentToggle(value: boolean) {
    const updated: DataConsent = value
      ? { consented: true, consented_at: new Date().toISOString(), version: CURRENT_CONSENT_VERSION }
      : { consented: false, version: CURRENT_CONSENT_VERSION };
    setConsent(updated);
    await saveConsent(updated);
  }

  // ─── Equipment load ─────────────────────────────────────────────────────────

  const loadEquipment = useCallback(async () => {
    const profile = await getCurrentEquipmentProfile();
    setActiveProfile(profile);
  }, []);

  // ─── Main load ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const s = await loadSettings();
    setSettings(s);
    const loadedConsent = await loadConsent();
    if (loadedConsent.version !== CURRENT_CONSENT_VERSION) {
      const reset: DataConsent = { consented: false, version: CURRENT_CONSENT_VERSION };
      await saveConsent(reset);
      setConsent(reset);
      setReConsentModalVisible(true);
    } else {
      setConsent(loadedConsent);
    }
    await loadEquipment();
    const loadedTablets = await loadTabletDosing();
    setTablets(loadedTablets);
  }, [loadEquipment]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ─── Settings save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await saveSettings(settings);
      Alert.alert('Saved', 'Your settings have been updated.');
    } catch {
      Alert.alert('Error', 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  function update(key: keyof AppSettings, value: string | number | null) {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
  }

  // ─── Tablet dosing handlers ─────────────────────────────────────────────────

  function handleAddTablet() {
    const newTablet: TabletDosing = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: '',
      mg: '',
      amount_per_day: '',
    };
    const updated = [...tablets, newTablet];
    setTablets(updated);
    saveTabletDosing(updated).catch(() => {});
  }

  function handleUpdateTablet(id: string, changes: Partial<TabletDosing>) {
    const updated = tablets.map(t => t.id === id ? { ...t, ...changes } : t);
    setTablets(updated);
    saveTabletDosing(updated).catch(() => {});
  }

  function handleDeleteTablet(id: string) {
    const updated = tablets.filter(t => t.id !== id);
    setTablets(updated);
    saveTabletDosing(updated).catch(() => {});
  }

  // ─── Equipment picker handlers ───────────────────────────────────────────────

  function openEquipmentPicker(field: string, currentValue: string) {
    setPickerField(field);
    setPickerOptions(getPickerOptions(field));
    setPickerVisible(true);
  }

  function getFieldLabel(field: string): string {
    switch (field) {
      case 'rapid_insulin_brand': return 'Rapid-acting insulin';
      case 'long_acting_insulin_brand': return 'Long-acting insulin';
      case 'delivery_method': return 'Delivery method';
      case 'cgm_device': return 'CGM device';
      case 'pen_needle_brand': return 'Pen needle';
      default: return field;
    }
  }

  function getCurrentDisplayValue(field: string): string {
    if (!activeProfile) return '';
    switch (field) {
      case 'rapid_insulin_brand': return activeProfile.rapidInsulinBrand;
      case 'long_acting_insulin_brand':
        return activeProfile.longActingInsulinBrand ?? "I don't take long-acting insulin";
      case 'delivery_method': return activeProfile.deliveryMethod;
      case 'cgm_device': return activeProfile.cgmDevice;
      case 'pen_needle_brand': return activeProfile.penNeedleBrand ?? '';
      default: return '';
    }
  }

  function handlePickerSelect(selectedValue: string) {
    if (!pickerField) return;
    setPickerVisible(false);
    setPendingValue(selectedValue);
    setConfirmFieldLabel(getFieldLabel(pickerField));
    setConfirmOldValue(getCurrentDisplayValue(pickerField));
    setConfirmNewValue(selectedValue);
    setConfirmVisible(true);
  }

  async function handleEquipmentConfirm() {
    if (!pickerField || !pendingValue) return;
    setSavingEquipment(true);
    try {
      const storageValue = pendingValue === "I don't take long-acting insulin" ? 'NO_LONG_ACTING' : pendingValue;
      await changeEquipment(pickerField, storageValue);
      await loadEquipment();
    } catch (err) {
      console.warn('[SettingsScreen] equipment change failed', err);
    } finally {
      setSavingEquipment(false);
      setConfirmVisible(false);
      setPendingValue(null);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#30D158" />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* My Equipment */}
          <SectionHeader title="My Equipment" />
          <View style={styles.card}>
            <NavRow
              label={`Rapid insulin: ${activeProfile?.rapidInsulinBrand ?? '...'}`}
              onPress={() => openEquipmentPicker('rapid_insulin_brand', activeProfile?.rapidInsulinBrand ?? '')}
            />
            <View style={styles.divider} />
            <NavRow
              label={`Long-acting: ${activeProfile?.longActingInsulinBrand ?? "I don't take long-acting insulin"}`}
              onPress={() => openEquipmentPicker('long_acting_insulin_brand', activeProfile?.longActingInsulinBrand ?? 'NO_LONG_ACTING')}
            />
            <View style={styles.divider} />
            <NavRow
              label={`Delivery: ${activeProfile?.deliveryMethod ?? '...'}`}
              onPress={() => openEquipmentPicker('delivery_method', activeProfile?.deliveryMethod ?? '')}
            />
            <View style={styles.divider} />
            <NavRow
              label={`CGM: ${activeProfile?.cgmDevice ?? '...'}`}
              onPress={() => openEquipmentPicker('cgm_device', activeProfile?.cgmDevice ?? '')}
            />
            {/* Pen needle — only shown when delivery method is a pen type */}
            {(activeProfile?.deliveryMethod === 'Disposable pen' || activeProfile?.deliveryMethod === 'Reusable pen') && (
              <>
                <View style={styles.divider} />
                <NavRow
                  label={`Pen needle: ${activeProfile?.penNeedleBrand ?? 'Not set'}`}
                  onPress={() => openEquipmentPicker('pen_needle_brand', activeProfile?.penNeedleBrand ?? '')}
                />
              </>
            )}
          </View>

          {/* Dosing */}
          <SectionHeader title="Dosing" />
          <View style={styles.card}>
            <SettingRow
              label="Carb : insulin ratio"
              value={settings.carbInsulinRatio?.toString() ?? ''}
              onChangeText={v => update('carbInsulinRatio', v === '' ? null : parseFloat(v))}
              placeholder="e.g. 10"
              keyboardType="decimal-pad"
              hint="1 unit of insulin covers this many grams of carbs. Used for reference — not medical advice."
            />
            <View style={styles.divider} />
            <Text style={[styles.settingLabel, { paddingHorizontal: 16, paddingTop: 12 }]}>Tablets</Text>
            {tablets.map((tablet) => (
              <View key={tablet.id}>
                <View style={styles.divider} />
                <View style={styles.tabletRow}>
                  <TextInput
                    style={[styles.tabletInput, { flex: 2 }]}
                    value={tablet.name}
                    onChangeText={v => handleUpdateTablet(tablet.id, { name: v })}
                    placeholder="Tablet name"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TextInput
                    style={[styles.tabletInput, { flex: 1 }]}
                    value={tablet.mg}
                    onChangeText={v => handleUpdateTablet(tablet.id, { mg: v })}
                    placeholder="mg"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.tabletInput, { flex: 1 }]}
                    value={tablet.amount_per_day}
                    onChangeText={v => handleUpdateTablet(tablet.id, { amount_per_day: v })}
                    placeholder="x/day"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Pressable onPress={() => handleDeleteTablet(tablet.id)} hitSlop={8}>
                    <Text style={{ color: COLORS.red, fontSize: 18, fontFamily: FONTS.semiBold }}>X</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={styles.divider} />
            <Pressable style={styles.addTabletBtn} onPress={handleAddTablet}>
              <Text style={styles.addTabletBtnText}>+ Add tablet</Text>
            </Pressable>
          </View>

          {/* Account */}
          <SectionHeader title="Account" />
          <View style={styles.card}>
            <NavRow label="Account details" onPress={() => navigation.navigate('Account')} />
          </View>

          {/* Help */}
          <SectionHeader title="Support" />
          <View style={styles.card}>
            <NavRow label="Help & FAQ" onPress={() => navigation.navigate('Help')} />
          </View>

          {/* Data & Research */}
          <SectionHeader title="Data & Research" />
          <View style={styles.card}>
            <View style={styles.consentRow}>
              <View style={styles.consentLabelGroup}>
                <Text style={styles.consentLabel}>Help improve T1D research</Text>
                <Text style={styles.consentHint}>
                  Your anonymised usage data may be used to improve diabetes management tools.
                  Copy subject to legal review.
                </Text>
              </View>
              <Switch
                value={consent.consented}
                onValueChange={handleConsentToggle}
                trackColor={{ false: '#3A3A3C', true: COLORS.green }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Save */}
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.saveBtnText}>Save settings</Text>
            }
          </Pressable>

          <Text style={styles.disclaimer}>
            Carb:insulin ratio is shown for personal reference only. BolusBrain does not give medical advice.
            Always consult your diabetes care team before adjusting doses.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Equipment picker modal */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)} />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>{pickerField ? getFieldLabel(pickerField) : ''}</Text>
          <FlatList
            data={pickerOptions}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <Pressable
                style={styles.pickerOption}
                onPress={() => handlePickerSelect(item)}
              >
                <Text style={styles.pickerOptionText}>{item}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
          />
        </View>
      </Modal>

      {/* Equipment change confirmation modal */}
      <EquipmentChangeConfirmation
        visible={confirmVisible}
        field={confirmFieldLabel}
        oldValue={confirmOldValue}
        newValue={confirmNewValue}
        onConfirm={handleEquipmentConfirm}
        onCancel={() => {
          setConfirmVisible(false);
          setPendingValue(null);
        }}
      />

      {/* Re-consent modal (consent version changed) */}
      <Modal
        visible={reConsentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReConsentModalVisible(false)}
      >
        <View style={styles.reConsentBackdrop}>
          <View style={styles.reConsentCard}>
            <Text style={styles.reConsentTitle}>Research consent updated</Text>
            <Text style={styles.reConsentBody}>
              Our data research terms have been updated. Your consent has been reset.
              You can opt back in below.
            </Text>
            <Pressable style={styles.reConsentButton} onPress={() => setReConsentModalVisible(false)}>
              <Text style={styles.reConsentButtonText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 48 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#2C2C2E', marginLeft: 16 },
  settingRow: { padding: 16, gap: 6 },
  settingLabel: { fontSize: 13, color: '#8E8E93', fontWeight: '500' },
  settingInput: {
    fontSize: 17,
    color: '#FFFFFF',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
  },
  settingHint: { fontSize: 12, color: '#636366', lineHeight: 17 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  navRowLabel: { fontSize: 17, color: '#FFFFFF' },
  navRowChevron: { fontSize: 20, color: '#636366' },
  saveBtn: {
    backgroundColor: '#30D158',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 32,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
  disclaimer: {
    fontSize: 12,
    color: '#636366',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  consentRow: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  consentLabelGroup: { flex: 1, marginRight: 12 },
  consentLabel: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.regular },
  consentHint: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontFamily: FONTS.regular },
  reConsentBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  reConsentCard: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 24, width: '100%' },
  reConsentTitle: { color: COLORS.text, fontSize: 17, fontFamily: FONTS.semiBold, marginBottom: 12 },
  reConsentBody: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.regular, marginBottom: 20 },
  reConsentButton: { backgroundColor: COLORS.green, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  reConsentButtonText: { color: '#000', fontFamily: FONTS.semiBold, fontSize: 15 },
  // Picker modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#636366',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  pickerOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  pickerOptionText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  tabletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  tabletInput: {
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    padding: 10,
    fontFamily: FONTS.regular,
  },
  addTabletBtn: {
    padding: 16,
    alignItems: 'center',
  },
  addTabletBtnText: {
    color: COLORS.green,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
});
