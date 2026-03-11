import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import GlucoseDisplay from '../components/GlucoseDisplay';
import { fetchLatestGlucose, GlucoseReading } from '../services/nightscout';
import { fetchAndStoreCurve, saveMeal } from '../services/storage';
import type { RootStackParamList } from '../../App';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reading, setReading] = useState<GlucoseReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick log modal state
  const [quickLogVisible, setQuickLogVisible] = useState(false);
  const [snackName, setSnackName] = useState('');
  const [snackUnits, setSnackUnits] = useState('');
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  const loadReading = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await fetchLatestGlucose();
      setReading(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load glucose');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReading();
    const interval = setInterval(() => loadReading(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadReading]);

  function openQuickLog() {
    setSnackName('');
    setSnackUnits('');
    setQuickLogVisible(true);
    // Focus name field after modal animates in
    setTimeout(() => nameInputRef.current?.focus(), 300);
  }

  async function handleQuickSave() {
    if (!snackName.trim()) {
      Alert.alert('Name required', 'What did you eat?');
      return;
    }
    const units = parseFloat(snackUnits);
    if (snackUnits && isNaN(units)) {
      Alert.alert('Invalid units', 'Enter a number or leave blank for 0');
      return;
    }

    setSaving(true);
    try {
      let startGlucose: number | null = null;
      try {
        const r = await fetchLatestGlucose();
        startGlucose = r.mmol;
      } catch {}

      const meal = await saveMeal({
        name: snackName.trim(),
        photoUri: null,
        insulinUnits: isNaN(units) ? 0 : units,
        startGlucose,
      });

      fetchAndStoreCurve(meal.id).catch(() => {});
      setQuickLogVisible(false);
    } catch {
      Alert.alert('Save failed', 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadReading(true)}
            tintColor="#8E8E93"
          />
        }
      >
        <Text style={styles.header}>GlucoLog</Text>

        <View style={styles.card}>
          {loading && !reading ? (
            <ActivityIndicator size="large" color="#30D158" />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>!</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorHint}>Pull down to retry</Text>
            </View>
          ) : reading ? (
            <GlucoseDisplay reading={reading} />
          ) : null}
        </View>

        {/* Primary actions */}
        <View style={styles.actionRow}>
          <Pressable style={styles.logMealBtn} onPress={() => navigation.navigate('MealLog')}>
            <Text style={styles.logMealBtnText}>+ Log meal</Text>
          </Pressable>
          <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('MealHistory')}>
            <Text style={styles.historyBtnText}>History</Text>
          </Pressable>
        </View>

        {/* Quick log */}
        <Pressable style={styles.quickLogBtn} onPress={openQuickLog}>
          <Text style={styles.quickLogBtnText}>⚡ Quick log snack</Text>
        </Pressable>

        <View style={styles.rangeKey}>
          <Text style={styles.rangeKeyTitle}>Range guide</Text>
          <View style={styles.rangeRow}>
            <View style={[styles.dot, { backgroundColor: '#FF3B30' }]} />
            <Text style={styles.rangeLabel}>Low  &lt; 3.9</Text>
          </View>
          <View style={styles.rangeRow}>
            <View style={[styles.dot, { backgroundColor: '#30D158' }]} />
            <Text style={styles.rangeLabel}>In range  3.9 – 10.0</Text>
          </View>
          <View style={styles.rangeRow}>
            <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
            <Text style={styles.rangeLabel}>High  &gt; 10.0</Text>
          </View>
        </View>
      </ScrollView>

      {/* Quick log modal */}
      <Modal
        visible={quickLogVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setQuickLogVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setQuickLogVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Quick log snack</Text>

            <Text style={styles.label}>What did you eat?</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.input}
              placeholder="e.g. Banana, biscuits, juice..."
              placeholderTextColor="#48484A"
              value={snackName}
              onChangeText={setSnackName}
              returnKeyType="next"
            />

            <Text style={styles.label}>Insulin units</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#48484A"
              value={snackUnits}
              onChangeText={setSnackUnits}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleQuickSave}
            />

            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleQuickSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.saveBtnText}>Save snack</Text>
              }
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  header: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 40,
  },
  card: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    marginBottom: 24,
  },
  errorContainer: { alignItems: 'center', gap: 8 },
  errorIcon: { fontSize: 36, color: '#FF3B30' },
  errorText: { fontSize: 16, color: '#FF3B30', textAlign: 'center' },
  errorHint: { fontSize: 13, color: '#8E8E93' },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  logMealBtn: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30D158',
  },
  logMealBtnText: { color: '#30D158', fontSize: 17, fontWeight: '600' },
  historyBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 20,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtnText: { color: '#8E8E93', fontSize: 17, fontWeight: '600' },
  quickLogBtn: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  quickLogBtnText: { color: '#FF9F0A', fontSize: 16, fontWeight: '600' },
  rangeKey: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  rangeKeyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rangeLabel: { fontSize: 15, color: '#EBEBF5' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalWrapper: {
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 0,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 24,
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
    backgroundColor: '#2C2C2E',
    color: '#FFFFFF',
    fontSize: 17,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  saveBtn: {
    backgroundColor: '#FF9F0A',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
