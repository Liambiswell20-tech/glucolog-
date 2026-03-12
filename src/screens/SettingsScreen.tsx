import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { loadSettings, saveSettings, AppSettings } from '../services/settings';
import type { RootStackParamList } from '../../App';

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

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await loadSettings();
    setSettings(s);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  if (!settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#30D158" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>

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
          <SettingRow
            label="Tablet name"
            value={settings.tabletName}
            onChangeText={v => update('tabletName', v)}
            placeholder="e.g. Metformin"
          />
          <View style={styles.divider} />
          <SettingRow
            label="Tablet dose"
            value={settings.tabletDose}
            onChangeText={v => update('tabletDose', v)}
            placeholder="e.g. 500mg twice daily"
          />
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
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
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
});
