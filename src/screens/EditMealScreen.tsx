import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { loadMeals, updateMeal, deleteMeal, fetchAndStoreCurveForMeal } from '../services/storage';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme';

export default function EditMealScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'EditMeal'>>();
  const { mealId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [insulinUnits, setInsulinUnits] = useState('');
  const [loggedAt, setLoggedAt] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Load existing meal data
  useEffect(() => {
    loadMeals().then(meals => {
      const meal = meals.find(m => m.id === mealId);
      if (!meal) {
        Alert.alert('Not found', 'Could not load meal.');
        navigation.goBack();
        return;
      }
      setPhotoUri(meal.photoUri);
      setMealName(meal.name);
      setInsulinUnits(meal.insulinUnits > 0 ? String(meal.insulinUnits) : '');
      setLoggedAt(new Date(meal.loggedAt));
      setLoading(false);
    });
  }, [mealId, navigation]);

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Enable camera access in your device settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
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
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
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
      await updateMeal(mealId, {
        name: mealName.trim(),
        photoUri,
        insulinUnits: isNaN(units) ? 0 : units,
        loggedAt: loggedAt.toISOString(),
      });
      // Re-fetch curve from the (possibly new) loggedAt time
      await fetchAndStoreCurveForMeal(mealId).catch(() => {});
      navigation.goBack();
    } catch {
      Alert.alert('Save failed', 'Could not save changes. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete meal',
      'This will permanently remove this meal and its glucose curve. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMeal(mealId);
              navigation.goBack();
            } catch {
              Alert.alert('Delete failed', 'Could not delete meal. Try again.');
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#30D158" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Photo */}
        <Pressable style={styles.photoArea} onPress={handleCamera}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.photoHint}>Tap to take a new photo</Text>
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

        {/* Logged at */}
        <Text style={styles.label}>Logged at</Text>
        <Pressable style={styles.timeRow} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.timeText}>
            {loggedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
            {'  '}
            <Text style={styles.timeDateText}>
              {loggedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
          </Text>
          <Text style={styles.timeChange}>Change</Text>
        </Pressable>

        {showTimePicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={loggedAt}
              mode="datetime"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant="dark"
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (Platform.OS !== 'ios') setShowTimePicker(false);
                if (date) setLoggedAt(date);
              }}
            />
            {Platform.OS === 'ios' && (
              <Pressable onPress={() => setShowTimePicker(false)} style={styles.pickerDone}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}
          </View>
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
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>

        {/* Delete */}
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete meal</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, paddingBottom: 48 },

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
  libraryBtn: { alignSelf: 'center', marginBottom: 24 },
  libraryBtnText: { color: '#8E8E93', fontSize: 14 },

  label: {
    color: '#8E8E93', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  input: {
    backgroundColor: '#1C1C1E', color: '#FFFFFF',
    fontSize: 17, padding: 16, borderRadius: 12, marginBottom: 24,
  },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 24,
  },
  timeText: { color: '#FFFFFF', fontSize: 17 },
  timeDateText: { color: '#8E8E93', fontSize: 15 },
  timeChange: { color: '#0A84FF', fontSize: 15 },
  pickerContainer: { backgroundColor: '#1C1C1E', borderRadius: 12, marginBottom: 24, overflow: 'hidden' },
  pickerDone: { alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  pickerDoneText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },

  saveBtn: {
    backgroundColor: '#30D158', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },

  deleteBtn: { alignItems: 'center', padding: 16, marginTop: 8 },
  deleteBtnText: { color: '#FF3B30', fontSize: 15 },
});
