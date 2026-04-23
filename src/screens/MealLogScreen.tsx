import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '~/components/ui/button';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { fetchAndStoreCurve, loadMeals, loadSessionsWithMeals, saveMeal } from '../services/storage';
import type { SessionWithMeals } from '../services/storage';
import { fetchGlucoseRange, fetchLatestGlucose } from '../services/nightscout';
import {
  estimateCarbsFromPhoto,
  getRemainingEstimates,
  RateLimitError,
  ConsentRequiredError,
} from '../services/carbEstimate';
import AIConsentModal from './AIConsentModal';
import { getCurrentEquipmentProfile } from '../utils/equipmentProfile';
import { computeMatchingKey } from '../services/classification';
import { findPatterns, PatternCache } from '../services/patternMatching';
import type { PatternResult } from '../services/patternMatching';
import { PatternView } from '../components/PatternView';
import { MealBottomSheet } from '../components/MealBottomSheet';
import { applyLateEntryTime } from '../utils/lateEntry';
import { parseCarbsGrams } from '../utils/parseCarbsGrams';
import { COLORS } from '../theme';

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

  // AI consent modal state
  const [showAIConsent, setShowAIConsent] = useState(false);

  // Pattern matching state (Phase K — Section 8.4)
  const [patternResult, setPatternResult] = useState<PatternResult | null>(null);
  const [patternCache] = useState(() => new PatternCache());

  // Equipment stamp chip state (Phase 8 — B2B-05)
  const [activeInsulinBrand, setActiveInsulinBrand] = useState<string | null>(null);

  // Previous meal sheet state
  const [sheetSessions, setSheetSessions] = useState<SessionWithMeals[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Auto-scroll refs
  const scrollRef = useRef<ScrollView>(null);
  const patternViewRef = useRef<View>(null);
  const patternViewY = useRef<number>(0);

  useEffect(() => {
    getRemainingEstimates().then(n => {
      setEstimatesLeft(n);
      if (n <= 0) setRateLimitHit(true);
    });
  }, []);

  // Load active insulin brand on mount for chip display (Phase 8 — B2B-05)
  useEffect(() => {
    getCurrentEquipmentProfile()
      .then(profile => setActiveInsulinBrand(profile?.rapidInsulinBrand ?? null))
      .catch(() => {});
  }, []);

  // Debounced pattern matching — fires 400ms after mealName changes (Phase K, Section 8.4)
  useEffect(() => {
    const trimmed = mealName.trim();

    if (trimmed.length < 3) {
      setPatternResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const matchingKey = computeMatchingKey(trimmed);
        if (!matchingKey) {
          setPatternResult(null);
          return;
        }
        const [allMeals, allSessions] = await Promise.all([
          loadMeals(),
          loadSessionsWithMeals(),
        ]);
        const result = findPatterns(matchingKey, allMeals, allSessions, {
          cache: patternCache,
        });
        setPatternResult(result);
        // Auto-scroll to show pattern results while keyboard stays open
        if (result && result.solo.displayMode !== 'empty') {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: Math.max(0, patternViewY.current - 80), animated: true });
          }, 100);
        }
      } catch {
        setPatternResult(null);
      }
    }, 400);
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
      const result = await estimateCarbsFromPhoto(photoUri);
      setCarbEstimate(result.text);
      // Auto-fill meal name from AI description if user hasn't typed one yet
      if (result.mealDescription && !mealName.trim()) {
        setMealName(result.mealDescription);
      }
      const remaining = await getRemainingEstimates();
      setEstimatesLeft(remaining);
      if (remaining <= 0) setRateLimitHit(true);
    } catch (err) {
      if (err instanceof ConsentRequiredError) {
        setShowAIConsent(true);
        return;
      }
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

  function handleConsentAccepted() {
    setShowAIConsent(false);
    // Retry the carb estimate now that consent is granted
    handleEstimateCarbs();
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

      // B2B-05: stamp equipment fields at save time — called once, never per field
      let equipmentStamp: { insulin_brand?: string; delivery_method?: string } = {};
      try {
        const profile = await getCurrentEquipmentProfile();
        if (profile) {
          equipmentStamp = {
            insulin_brand: profile.rapidInsulinBrand,
            delivery_method: profile.deliveryMethod,
          };
        }
      } catch (err) {
        console.warn('[MealLogScreen] could not fetch equipment profile for stamping', err);
      }

      const meal = await saveMeal({
        name: mealName.trim(),
        photoUri,
        insulinUnits: isNaN(units) ? 0 : units,
        startGlucose,
        carbsEstimated: parseCarbsGrams(carbEstimate),
        ...equipmentStamp,
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
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

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

        {/* Pattern view — Phase K (Section 8.4) */}
        <View
          ref={patternViewRef}
          onLayout={(e) => { patternViewY.current = e.nativeEvent.layout.y; }}
        >
          <PatternView result={patternResult} />
        </View>

        {/* Insulin units */}
        <View style={styles.insulinLabelRow}>
          <Text style={styles.label}>Insulin units</Text>
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

        {/* Active insulin brand chip — read-only, shows stamped brand (B2B-05) */}
        {activeInsulinBrand && (
          <View style={styles.insulinBrandChip}>
            <Text style={styles.insulinBrandChipText}>{activeInsulinBrand}</Text>
          </View>
        )}

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
        <Button
          className="border-0"
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save meal</Text>
          )}
        </Button>

      </ScrollView>
      <MealBottomSheet
        sessions={sheetSessions}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
      <AIConsentModal
        visible={showAIConsent}
        onAccept={handleConsentAccepted}
        onDecline={() => setShowAIConsent(false)}
      />
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

  insulinLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  // Equipment stamp chip (B2B-05) — read-only, shown below insulin units input
  insulinBrandChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#2C2C2E', // COLORS.surfaceRaised
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 16,
  },
  insulinBrandChipText: {
    color: '#8E8E93', // COLORS.textSecondary
    fontSize: 12,
  },

  saveBtn: {
    backgroundColor: '#30D158', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
