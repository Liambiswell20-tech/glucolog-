import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { saveInsulinLog, fetchAndStoreBasalCurve, InsulinLogType } from '../services/storage';
import { loadSettings } from '../services/settings';
import { fetchLatestGlucose } from '../services/nightscout';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme';

function applyLateEntryTime(selectedTime: Date): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
  // If the resulting time is in the future, use yesterday at the same time
  if (candidate > now) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

const CONFIG: Record<InsulinLogType, { title: string; subtitle: string; color: string; emoji: string; unitsLabel: string }> = {
  'long-acting': {
    title: 'Long-acting insulin',
    subtitle: 'Basal / background dose',
    color: '#FF3B30',
    emoji: '❤️',
    unitsLabel: 'units',
  },
  correction: {
    title: 'Correction dose',
    subtitle: 'No meal attached',
    color: '#0A84FF',
    emoji: '💉',
    unitsLabel: 'units',
  },
  tablets: {
    title: 'Tablets',
    subtitle: 'Oral medication dose',
    color: '#30D158',
    emoji: '💊',
    unitsLabel: 'tablets',
  },
};

export default function InsulinLogScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'InsulinLog'>>();
  const { type } = route.params;
  const cfg = CONFIG[type];

  const [units, setUnits] = useState('');
  const [saving, setSaving] = useState(false);
  const [tabletInfo, setTabletInfo] = useState('');
  const [lateEntry, setLateEntry] = useState(false);
  const [loggedAt, setLoggedAt] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const inputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    if (type === 'long-acting') {
      loadSettings().then(s => {
        if (s.tabletName || s.tabletDose) {
          setTabletInfo([s.tabletName, s.tabletDose].filter(Boolean).join(' — '));
        }
      });
    }
  }, [type]);

  async function handleSave() {
    const parsed = parseFloat(units);
    if (!units.trim() || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Enter units', 'How many units did you take?');
      return;
    }

    setSaving(true);
    try {
      let startGlucose: number | null = null;
      try {
        const r = await fetchLatestGlucose();
        startGlucose = r.mmol;
      } catch {}

      const log = await saveInsulinLog(type, parsed, startGlucose, loggedAt);

      if (type === 'long-acting') {
        fetchAndStoreBasalCurve(log.id).catch(() => {});
      }

      navigation.goBack();
    } catch {
      Alert.alert('Save failed', 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.emoji}>{cfg.emoji}</Text>
        <Text style={[styles.title, { color: cfg.color }]}>{cfg.title}</Text>
        <Text style={styles.subtitle}>{cfg.subtitle}</Text>

        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.unitsInput}
            placeholder="0"
            placeholderTextColor="#48484A"
            value={units}
            onChangeText={setUnits}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            autoFocus
          />
          <Text style={styles.unitsLabel}>{cfg.unitsLabel}</Text>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: cfg.color }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </Pressable>

        {/* Late Entry toggle */}
        <Pressable
          style={[styles.lateEntryToggle, lateEntry && styles.lateEntryToggleActive]}
          onPress={() => {
            if (lateEntry) {
              // Deactivate — reset to now
              setLateEntry(false);
              setLoggedAt(new Date());
            } else {
              // Activate — open picker immediately
              setLateEntry(true);
              setShowTimePicker(true);
            }
          }}
        >
          <Text style={[styles.lateEntryToggleText, lateEntry && styles.lateEntryToggleTextActive]}>
            {lateEntry ? 'Late Entry: tap to change time' : 'Late Entry'}
          </Text>
        </Pressable>

        {lateEntry && (
          <>
            <Pressable style={styles.timeRow} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.timeText}>
                {loggedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                {loggedAt.toDateString() !== new Date().toDateString() && ' (yesterday)'}
              </Text>
              <Text style={styles.timeChange}>Change</Text>
            </Pressable>
            {showTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={loggedAt}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark"
                  onChange={(_event: DateTimePickerEvent, date?: Date) => {
                    if (Platform.OS !== 'ios') setShowTimePicker(false);
                    if (date) setLoggedAt(applyLateEntryTime(date));
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Pressable onPress={() => setShowTimePicker(false)} style={styles.pickerDone}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}

        {type === 'long-acting' && (
          <>
            {tabletInfo ? (
              <View style={styles.tabletReminder}>
                <Text style={styles.tabletReminderLabel}>Tablets</Text>
                <Text style={styles.tabletReminderValue}>{tabletInfo}</Text>
              </View>
            ) : null}
            <Text style={styles.notice}>
              Logged separately — never affects meal pattern data.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  unitsInput: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
    width: 140,
    paddingVertical: 20,
    borderRadius: 16,
  },
  unitsLabel: {
    fontSize: 22,
    color: '#8E8E93',
    fontWeight: '500',
  },
  saveBtn: {
    width: '100%',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  notice: {
    fontSize: 12,
    color: '#636366',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  lateEntryToggle: {
    borderWidth: 1, borderColor: '#3A3A3C', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
    marginTop: 8,
  },
  lateEntryToggleActive: { borderColor: '#0A84FF', backgroundColor: '#0A1A3A' },
  lateEntryToggleText: { fontSize: 14, color: '#8E8E93' },
  lateEntryToggleTextActive: { color: '#0A84FF', fontWeight: '600' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 12 },
  timeText: { color: '#FFFFFF', fontSize: 17 },
  timeChange: { color: '#0A84FF', fontSize: 15 },
  pickerContainer: { backgroundColor: '#1C1C1E', borderRadius: 12, marginBottom: 24, overflow: 'hidden' },
  pickerDone: { alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  pickerDoneText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },
  tabletReminder: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  tabletReminderLabel: { fontSize: 11, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 1 },
  tabletReminderValue: { fontSize: 15, color: '#FF3B30', fontWeight: '600' },
});
