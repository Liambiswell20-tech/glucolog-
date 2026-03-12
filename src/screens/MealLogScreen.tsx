import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
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
import { fetchAndStoreCurve, saveMeal } from '../services/storage';
import { fetchLatestGlucose } from '../services/nightscout';
import {
  estimateCarbsFromPhoto,
  getRemainingEstimates,
  RateLimitError,
} from '../services/carbEstimate';

const DISCLAIMER =
  'Carb estimate only — always calculate your dose using your personal carb:insulin ratio. Do not administer insulin based on this figure alone. Estimates are based on UK nutritional standards (available carbohydrate, excluding fibre). Always refer to product packaging if available.';

export default function MealLogScreen() {
  const navigation = useNavigation();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [insulinUnits, setInsulinUnits] = useState('');
  const [saving, setSaving] = useState(false);

  // Carb estimate state
  const [estimating, setEstimating] = useState(false);
  const [carbEstimate, setCarbEstimate] = useState<string | null>(null);
  const [estimatesLeft, setEstimatesLeft] = useState<number>(10);
  const [rateLimitHit, setRateLimitHit] = useState(false);

  useEffect(() => {
    getRemainingEstimates().then(n => {
      setEstimatesLeft(n);
      if (n <= 0) setRateLimitHit(true);
    });
  }, []);

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
      try {
        const reading = await fetchLatestGlucose();
        startGlucose = reading.mmol;
      } catch {}

      const meal = await saveMeal({
        name: mealName.trim(),
        photoUri,
        insulinUnits: isNaN(units) ? 0 : units,
        startGlucose,
      });

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

        {/* Insulin units */}
        <Text style={styles.label}>Insulin units</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 6"
          placeholderTextColor="#48484A"
          value={insulinUnits}
          onChangeText={setInsulinUnits}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />

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
  input: {
    backgroundColor: '#1C1C1E', color: '#FFFFFF',
    fontSize: 17, padding: 16, borderRadius: 12, marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: '#30D158', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
