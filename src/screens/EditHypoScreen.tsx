import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
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
import { loadHypoTreatments, updateHypoTreatment, deleteHypoTreatment } from '../services/storage';
import type { HypoTreatment } from '../types/equipment';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme';

const TREATMENT_TYPES = ['Glucose tablets', 'Juice', 'Sweets', 'Gel', 'Other'] as const;
const AMOUNT_UNITS: Array<HypoTreatment['amount_unit']> = ['tablets', 'ml', 'g', 'food'];

export default function EditHypoScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'EditHypo'>>();
  const { treatmentId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [treatmentType, setTreatmentType] = useState('Glucose tablets');
  const [amountValue, setAmountValue] = useState('');
  const [amountUnit, setAmountUnit] = useState<HypoTreatment['amount_unit']>('tablets');
  const [notes, setNotes] = useState('');
  const [loggedAt, setLoggedAt] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadHypoTreatments().then(treatments => {
      const t = treatments.find(h => h.id === treatmentId);
      if (!t) {
        Alert.alert('Not found', 'Could not load treatment.');
        navigation.goBack();
        return;
      }
      setTreatmentType(t.treatment_type);
      setAmountValue(String(t.amount_value));
      setAmountUnit(t.amount_unit);
      setNotes(t.notes ?? '');
      setLoggedAt(new Date(t.logged_at));
      setLoading(false);
    });
  }, [treatmentId, navigation]);

  async function handleSave() {
    const parsed = parseFloat(amountValue);
    if (!amountValue.trim() || isNaN(parsed)) {
      Alert.alert('Enter amount', 'How much did you have?');
      return;
    }
    setSaving(true);
    try {
      const trimmedNotes = notes.trim();
      await updateHypoTreatment(treatmentId, {
        treatment_type: treatmentType,
        amount_value: parsed,
        amount_unit: amountUnit,
        notes: trimmedNotes || undefined,
        logged_at: loggedAt.toISOString(),
      });
      navigation.goBack();
    } catch {
      Alert.alert('Save failed', 'Could not save changes. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete treatment',
      'This will permanently remove this hypo treatment. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHypoTreatment(treatmentId);
              navigation.goBack();
            } catch {
              Alert.alert('Delete failed', 'Could not delete treatment. Try again.');
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF3B30" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Treatment type */}
        <Text style={styles.label}>Treatment type</Text>
        <View style={styles.chipRow}>
          {TREATMENT_TYPES.map(type => (
            <Pressable
              key={type}
              style={[styles.chip, treatmentType === type && styles.chipActive]}
              onPress={() => setTreatmentType(type)}
            >
              <Text style={[styles.chipText, treatmentType === type && styles.chipTextActive]}>
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Notes */}
        <Text style={styles.label}>What did you have?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. banana, orange juice, Haribo..."
          placeholderTextColor="#48484A"
          value={notes}
          onChangeText={setNotes}
        />

        {/* Amount */}
        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="0"
            placeholderTextColor="#48484A"
            value={amountValue}
            onChangeText={setAmountValue}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <View style={styles.unitRow}>
            {AMOUNT_UNITS.map(unit => (
              <Pressable
                key={unit}
                style={[styles.chip, amountUnit === unit && styles.chipActive]}
                onPress={() => setAmountUnit(unit)}
              >
                <Text style={[styles.chipText, amountUnit === unit && styles.chipTextActive]}>
                  {unit}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Logged at */}
        <Text style={[styles.label, { marginTop: 24 }]}>Logged at</Text>
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>

        {/* Delete */}
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete treatment</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, paddingBottom: 48 },

  label: {
    color: '#8E8E93', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  input: {
    backgroundColor: '#1C1C1E', color: '#FFFFFF',
    fontSize: 17, padding: 16, borderRadius: 12, marginBottom: 24,
  },
  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#2C2C2E', borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { borderColor: '#FF3B30' },
  chipText: { fontSize: 14, color: '#8E8E93' },
  chipTextActive: { color: '#FF3B30', fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 0 },
  unitRow: { flexDirection: 'row', gap: 6 },

  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 32,
  },
  timeText: { color: '#FFFFFF', fontSize: 17 },
  timeDateText: { color: '#8E8E93', fontSize: 15 },
  timeChange: { color: '#0A84FF', fontSize: 15 },
  pickerContainer: { backgroundColor: '#1C1C1E', borderRadius: 12, marginBottom: 32, overflow: 'hidden' },
  pickerDone: { alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  pickerDoneText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },

  saveBtn: {
    backgroundColor: '#FF3B30', borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  deleteBtn: { alignItems: 'center', padding: 16, marginTop: 8 },
  deleteBtnText: { color: '#FF3B30', fontSize: 15 },
});
