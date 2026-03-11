import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
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

export default function MealLogScreen() {
  const navigation = useNavigation();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [insulinUnits, setInsulinUnits] = useState('');
  const [saving, setSaving] = useState(false);

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
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
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
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
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
      // Grab current glucose as the meal's start reading
      let startGlucose: number | null = null;
      try {
        const reading = await fetchLatestGlucose();
        startGlucose = reading.mmol;
      } catch {
        // Non-fatal — save without start glucose if API is unavailable
      }

      const meal = await saveMeal({
        name: mealName.trim(),
        photoUri,
        insulinUnits: isNaN(units) ? 0 : units,
        startGlucose,
      });

      // Kick off curve fetch in background — don't block navigation
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

        {/* Photo section */}
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
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  photoArea: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#1C1C1E',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraIcon: {
    fontSize: 40,
  },
  photoHint: {
    color: '#8E8E93',
    fontSize: 15,
  },
  retakeBtn: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  retakeBtnText: {
    color: '#0A84FF',
    fontSize: 15,
  },
  libraryBtn: {
    alignSelf: 'center',
    marginBottom: 32,
  },
  libraryBtnText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  label: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    fontSize: 17,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: '#30D158',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
});
