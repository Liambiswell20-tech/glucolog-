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
import { loadInsulinLogs, updateInsulinLog, deleteInsulinLog, InsulinLogType } from '../services/storage';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme';

const TYPE_CONFIG: Record<InsulinLogType, { label: string; color: string; emoji: string }> = {
  'long-acting': { label: 'Long-acting insulin', color: '#FF3B30', emoji: '❤️' },
  correction: { label: 'Correction dose', color: '#0A84FF', emoji: '💉' },
  tablets: { label: 'Tablets', color: '#30D158', emoji: '💊' },
};

export default function EditInsulinScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'EditInsulin'>>();
  const { logId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [units, setUnits] = useState('');
  const [loggedAt, setLoggedAt] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [type, setType] = useState<InsulinLogType>('correction');

  useEffect(() => {
    loadInsulinLogs().then(logs => {
      const log = logs.find(l => l.id === logId);
      if (!log) {
        Alert.alert('Not found', 'Could not load entry.');
        navigation.goBack();
        return;
      }
      setType(log.type);
      setUnits(String(log.units));
      setLoggedAt(new Date(log.loggedAt));
      setLoading(false);
    });
  }, [logId, navigation]);

  async function handleSave() {
    const parsed = parseFloat(units);
    if (!units.trim() || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Enter units', 'How many units?');
      return;
    }

    setSaving(true);
    try {
      await updateInsulinLog(logId, {
        units: parsed,
        loggedAt: loggedAt.toISOString(),
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
      'Delete entry',
      'This will permanently remove this insulin entry. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInsulinLog(logId);
              navigation.goBack();
            } catch {
              Alert.alert('Delete failed', 'Could not delete entry. Try again.');
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

  const cfg = TYPE_CONFIG[type];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Type indicator — read-only */}
        <View style={styles.typeRow}>
          <Text style={styles.typeEmoji}>{cfg.emoji}</Text>
          <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>

        {/* Units */}
        <Text style={styles.label}>Units</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 6"
          placeholderTextColor="#48484A"
          value={units}
          onChangeText={setUnits}
          keyboardType="decimal-pad"
          returnKeyType="done"
          autoFocus
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
          style={[styles.saveBtn, { backgroundColor: cfg.color }, saving && styles.saveBtnDisabled]}
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
          <Text style={styles.deleteBtnText}>Delete entry</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, paddingBottom: 48, gap: 0 },

  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  typeEmoji: { fontSize: 22 },
  typeLabel: { fontSize: 16, fontWeight: '600' },

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
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 32,
  },
  timeText: { color: '#FFFFFF', fontSize: 17 },
  timeDateText: { color: '#8E8E93', fontSize: 15 },
  timeChange: { color: '#0A84FF', fontSize: 15 },
  pickerContainer: { backgroundColor: '#1C1C1E', borderRadius: 12, marginBottom: 32, overflow: 'hidden' },
  pickerDone: { alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  pickerDoneText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },

  saveBtn: {
    borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  deleteBtn: { alignItems: 'center', padding: 16, marginTop: 8 },
  deleteBtnText: { color: '#FF3B30', fontSize: 15 },
});
