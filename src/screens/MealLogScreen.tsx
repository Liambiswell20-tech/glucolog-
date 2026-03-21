import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
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
import { fetchAndStoreCurve, loadSessionsWithMeals, saveMeal } from '../services/storage';
import type { SessionWithMeals } from '../services/storage';
import { fetchGlucoseRange, fetchLatestGlucose } from '../services/nightscout';
import {
  estimateCarbsFromPhoto,
  getRemainingEstimates,
  RateLimitError,
} from '../services/carbEstimate';
import { findSimilarSessions } from '../services/matching';
import type { SessionMatch } from '../services/matching';
import { classifyOutcome } from '../utils/outcomeClassifier';
import { glucoseColor } from '../utils/glucoseColor';
import { OutcomeBadge } from '../components/OutcomeBadge';

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

function parseCarbsGrams(estimate: string | null): number | null {
  if (!estimate) return null;
  // Range like "40–50g" or "40-50g" → midpoint
  const rangeMatch = estimate.match(/(\d+)[–\-](\d+)\s*g/);
  if (rangeMatch) return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  // Single value like "45g"
  const singleMatch = estimate.match(/(\d+)\s*g/);
  if (singleMatch) return parseInt(singleMatch[1], 10);
  return null;
}

const DISCLAIMER =
  'Carb estimate only — always calculate your dose using your personal carb:insulin ratio. Do not administer insulin based on this figure alone. Estimates are based on UK nutritional standards (available carbohydrate, excluding fibre). Always refer to product packaging if available.';

export default function MealLogScreen() {
  const navigation = useNavigation();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [insulinUnits, setInsulinUnits] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggedAt, setLoggedAt] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [lateEntry, setLateEntry] = useState(false);

  // Carb estimate state
  const [estimating, setEstimating] = useState(false);
  const [carbEstimate, setCarbEstimate] = useState<string | null>(null);
  const [estimatesLeft, setEstimatesLeft] = useState<number>(10);
  const [rateLimitHit, setRateLimitHit] = useState(false);

  // Live matching state (Phase 3)
  const [liveMatches, setLiveMatches] = useState<SessionMatch[]>([]);
  const [insulinHint, setInsulinHint] = useState<number | null>(null);

  useEffect(() => {
    getRemainingEstimates().then(n => {
      setEstimatesLeft(n);
      if (n <= 0) setRateLimitHit(true);
    });
  }, []);

  // Debounced live matching — fires 300ms after mealName changes
  useEffect(() => {
    // Clear stale hint whenever meal name changes
    setInsulinHint(null);

    if (mealName.trim().length < 2) {
      setLiveMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const allSessions = await loadSessionsWithMeals();
        const syntheticSession: SessionWithMeals = {
          id: '__live_search__',
          mealIds: [],
          startedAt: new Date().toISOString(),
          confidence: 'high',
          glucoseResponse: null,
          meals: [{
            id: '__live_search_meal__',
            name: mealName.trim(),
            photoUri: null,
            insulinUnits: 0,
            startGlucose: null,
            carbsEstimated: null,
            loggedAt: new Date().toISOString(),
            sessionId: '__live_search__',
            glucoseResponse: null,
          }],
        };
        const summary = findSimilarSessions(syntheticSession, allSessions);
        setLiveMatches(summary?.matches ?? []);
      } catch {
        // Silent failure — hide list, do not show error (per 03-UI-SPEC.md error state)
        setLiveMatches([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mealName]);

  // Clear estimate when photo changes
  function setPhoto(uri: string | null) {
    setPhotoUri(uri);
    setCarbEstimate(null);
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Enable camera access in your device settings to photo log meals.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function handlePickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library access needed', 'Enable photo library access in settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function handleEstimateCarbs() {
    if (!photoUri) return;
    setEstimating(true);
    setCarbEstimate(null);
    try {
      const estimate = await estimateCarbsFromPhoto(photoUri);
      setCarbEstimate(estimate);
      const remaining = await getRemainingEstimates();
      setEstimatesLeft(remaining);
      if (remaining <= 0) setRateLimitHit(true);
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRateLimitHit(true);
      } else {
        Alert.alert(
          'Estimate failed',
          err instanceof Error ? err.message : 'Could not estimate carbs. Try again.',
        );
      }
    } finally {
      setEstimating(false);
    }
  }

  async function handleSave() {
    if (!mealName.trim()) {
      Alert.alert('Meal name required', 'Add a name so you can identify this meal later.');
      return;
    }
    const units = parseFloat(insulinUnits);
    if (insulinUnits && isNaN(units)) {
      Alert.alert('Invalid insulin units', 'Enter a number, e.g. 6 or 6.5');
      return;
    }

    setSaving(true);
    try {
      let startGlucose: number | null = null;
      const isBackdated = Date.now() - loggedAt.getTime() > 2 * 60 * 1000;
      try {
        if (isBackdated) {
          const readings = await fetchGlucoseRange(
            loggedAt.getTime() - 5 * 60 * 1000,
            loggedAt.getTime() + 5 * 60 * 1000
          );
          if (readings.length > 0) {
            startGlucose = readings.reduce((closest, r) =>
              Math.abs(r.date - loggedAt.getTime()) < Math.abs(closest.date - loggedAt.getTime()) ? r : closest
            ).mmol;
          }
        } else {
          const reading = await fetchLatestGlucose();
          startGlucose = reading.mmol;
        }
      } catch {}

      const meal = await saveMeal({
        name: mealName.trim(),
        photoUri,
        insulinUnits: isNaN(units) ? 0 : units,
        startGlucose,
        carbsEstimated: parseCarbsGrams(carbEstimate),
      }, loggedAt);

      fetchAndStoreCurve(meal.id).catch(() => {});
      navigation.goBack();
    } catch {
      Alert.alert('Save failed', 'Could not save meal. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Photo section — unchanged */}
        <Pressable style={styles.photoArea} onPress={handleCamera}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.photoHint}>Tap to take a photo</Text>
            </View>
          )}
        </Pressable>

        {photoUri && (
          <Pressable onPress={handleCamera} style={styles.retakeBtn}>
            <Text style={styles.retakeBtnText}>Retake photo</Text>
          </Pressable>
        )}

        <Pressable onPress={handlePickFromLibrary} style={styles.libraryBtn}>
          <Text style={styles.libraryBtnText}>Choose from library</Text>
        </Pressable>

        {/* Carb estimate section — only shown when photo is set */}
        {photoUri && (
          <View style={styles.estimateSection}>
            {rateLimitHit ? (
              <View style={styles.rateLimitBox}>
                <Text style={styles.rateLimitText}>
                  Daily carb estimate limit reached — resets at midnight
                </Text>
              </View>
            ) : carbEstimate ? (
              <View style={styles.estimateBox}>
                <Text style={styles.estimateLabel}>Carb estimate</Text>
                <Text style={styles.estimateValue}>{carbEstimate}</Text>
                <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
                <Pressable onPress={handleEstimateCarbs} disabled={estimating} style={styles.reEstimateBtn}>
                  <Text style={styles.reEstimateBtnText}>Re-estimate</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.estimateBtn, estimating && styles.estimateBtnDisabled]}
                onPress={handleEstimateCarbs}
                disabled={estimating}
              >
                {estimating ? (
                  <View style={styles.estimatingRow}>
                    <ActivityIndicator size="small" color="#FF9F0A" />
                    <Text style={styles.estimatingText}>Estimating carbs…</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.estimateBtnText}>✦ Estimate carbs with AI</Text>
                    <Text style={styles.estimateBtnSub}>{estimatesLeft} of 10 remaining today</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}

        {/* Meal name */}
        <Text style={styles.label}>Meal name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Chicken pasta"
          placeholderTextColor="#48484A"
          value={mealName}
          onChangeText={setMealName}
          returnKeyType="next"
        />

        {/* Live match list — appears below meal name input when matches exist */}
        {liveMatches.length > 0 && (
          <View style={styles.liveMatchContainer}>
            {liveMatches.map((match, index) => {
              const sessionInsulin = match.session.meals.reduce(
                (sum, m) => sum + (m.insulinUnits ?? 0), 0
              );
              const firstName = match.session.meals[0]?.name ?? '';
              const dateStr = new Date(match.session.startedAt).toLocaleDateString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'short',
              });
              const peak = match.session.glucoseResponse!.peakGlucose;
              const badge = classifyOutcome(match.session.glucoseResponse);
              const rowConfidenceLow = match.session.confidence !== 'high';

              return (
                <Pressable
                  key={match.session.id}
                  style={[styles.liveMatchRow, index > 0 && styles.liveMatchRowDivider]}
                  onPress={() => {
                    setMealName(firstName);
                    setInsulinHint(sessionInsulin);
                    setLiveMatches([]);
                    Keyboard.dismiss();
                  }}
                  hitSlop={8}
                >
                  {/* Row primary: name + units + date + peak */}
                  <View style={styles.liveMatchRowPrimary}>
                    <Text style={styles.liveMatchRowName} numberOfLines={1}>
                      {firstName} — {sessionInsulin}u
                    </Text>
                    <Text style={styles.liveMatchRowDate}>{dateStr}</Text>
                    <Text style={[styles.liveMatchRowPeak, { color: glucoseColor(peak) }]}>
                      peak {peak.toFixed(1)} mmol/L
                    </Text>
                  </View>
                  {/* Row secondary: badge + Went well */}
                  <View style={styles.liveMatchBadgeRow}>
                    <OutcomeBadge badge={badge} size="small" />
                    {badge === 'GREEN' && (
                      <View style={styles.wentWellIndicator}>
                        <View style={styles.wentWellDot} />
                        <Text style={styles.wentWellText}>Went well</Text>
                      </View>
                    )}
                  </View>
                  {rowConfidenceLow && (
                    <Text style={styles.liveMatchConfidenceWarning}>
                      Other meals may have affected these results
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Insulin units */}
        <View style={styles.insulinLabelRow}>
          <Text style={styles.label}>Insulin units</Text>
          {insulinHint !== null && (
            <Text style={styles.insulinHintText}>({insulinHint}u last time)</Text>
          )}
        </View>
        <TextInput
          style={styles.input}
          placeholder="e.g. 6"
          placeholderTextColor="#48484A"
          value={insulinUnits}
          onChangeText={setInsulinUnits}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />

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

        {/* Save */}
        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save meal</Text>
          )}
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },

  // Photo — unchanged
  photoArea: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#1C1C1E',
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  cameraIcon: { fontSize: 40 },
  photoHint: { color: '#8E8E93', fontSize: 15 },
  retakeBtn: { alignSelf: 'center', marginBottom: 8 },
  retakeBtnText: { color: '#0A84FF', fontSize: 15 },
  libraryBtn: { alignSelf: 'center', marginBottom: 16 },
  libraryBtnText: { color: '#8E8E93', fontSize: 14 },

  // Carb estimate
  estimateSection: { marginBottom: 28 },
  estimateBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF9F0A',
    gap: 4,
  },
  estimateBtnDisabled: { opacity: 0.5 },
  estimateBtnText: { color: '#FF9F0A', fontSize: 15, fontWeight: '600' },
  estimateBtnSub: { color: '#636366', fontSize: 12 },
  estimatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  estimatingText: { color: '#FF9F0A', fontSize: 15 },
  estimateBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF9F0A',
  },
  estimateLabel: {
    fontSize: 11,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  estimateValue: { fontSize: 17, color: '#FFFFFF', fontWeight: '500', lineHeight: 24 },
  disclaimer: {
    fontSize: 12,
    color: '#FF9500',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  reEstimateBtn: { alignSelf: 'flex-start', marginTop: 4 },
  reEstimateBtnText: { color: '#636366', fontSize: 13 },
  rateLimitBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  rateLimitText: { color: '#636366', fontSize: 14, textAlign: 'center' },

  // Form
  label: {
    color: '#8E8E93', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  lateEntryToggle: {
    borderWidth: 1, borderColor: '#3A3A3C', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
    marginBottom: 16,
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
  input: {
    backgroundColor: '#1C1C1E', color: '#FFFFFF',
    fontSize: 17, padding: 16, borderRadius: 12, marginBottom: 24,
  },

  // Live matching styles (Phase 3)
  liveMatchContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  liveMatchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  liveMatchRowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  liveMatchRowPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  liveMatchRowName: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
    minWidth: 0,
  },
  liveMatchRowDate: {
    fontSize: 12,
    color: '#636366',
  },
  liveMatchRowPeak: {
    fontSize: 12,
    // color applied inline via glucoseColor()
  },
  liveMatchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  wentWellIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wentWellDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#30D158',
  },
  wentWellText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#30D158',
  },
  liveMatchConfidenceWarning: {
    fontSize: 11,
    color: '#636366',
    fontStyle: 'italic',
  },
  insulinLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  insulinHintText: {
    fontSize: 12,
    color: '#636366',
    fontStyle: 'italic',
  },

  saveBtn: {
    backgroundColor: '#30D158', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
