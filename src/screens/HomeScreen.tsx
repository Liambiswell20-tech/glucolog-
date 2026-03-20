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
import { fetchLatestGlucose, fetchGlucosesSince, GlucoseReading } from '../services/nightscout';
import { fetchAndStoreCurve, saveMeal, loadGlucoseStore, updateGlucoseStore, loadCachedHba1c, computeAndCacheHba1c, Hba1cEstimate } from '../services/storage';
import type { RootStackParamList } from '../../App';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reading, setReading] = useState<GlucoseReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avg12h, setAvg12h] = useState<number | null>(null);
  const [hba1c, setHba1c] = useState<Hba1cEstimate | null>(null);

  // Quick log modal
  const [quickLogVisible, setQuickLogVisible] = useState(false);
  const [snackName, setSnackName] = useState('');
  const [snackUnits, setSnackUnits] = useState('');
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      // Find lastFetchedAt from local store (or go back 30 days on first load)
      const store = await loadGlucoseStore();
      const fromMs = store?.lastFetchedAt ?? (Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Fetch live reading + only new entries since last fetch — parallel
      const [data, newEntries] = await Promise.all([
        fetchLatestGlucose(),
        fetchGlucosesSince(fromMs),
      ]);
      setReading(data);

      // Update rolling store, derive both averages locally
      const { avg12h, avg30d, daysOfData } = await updateGlucoseStore(newEntries);
      setAvg12h(avg12h);

      // Recompute HbA1c once per day from avg30d
      if (avg30d !== null) {
        const cached = await loadCachedHba1c();
        const estimate = cached ?? await computeAndCacheHba1c(avg30d, daysOfData);
        setHba1c(estimate);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load glucose');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  function openQuickLog() {
    setSnackName('');
    setSnackUnits('');
    setQuickLogVisible(true);
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
      try { const r = await fetchLatestGlucose(); startGlucose = r.mmol; } catch {}
      const meal = await saveMeal({
        name: snackName.trim(),
        photoUri: null,
        insulinUnits: isNaN(units) ? 0 : units,
        startGlucose,
        carbsEstimated: null,
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
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#8E8E93" />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>BolusBrain</Text>
            <Text style={styles.headerSub}>Your glucose memory</Text>
          </View>
          <Pressable style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')} hitSlop={12}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>

        {/* Glucose card */}
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

        {/* 12hr average + est. HbA1c */}
        <View style={styles.avgBox}>
          <View style={styles.avgSection}>
            <Text style={styles.avgLabel}>12hr average</Text>
            {avg12h !== null ? (
              <Text style={[styles.avgValue, { color: avg12h < 3.9 ? '#FF3B30' : avg12h > 10 ? '#FF9500' : '#30D158' }]}>
                {avg12h.toFixed(1)}
              </Text>
            ) : (
              <Text style={styles.avgValue}>—</Text>
            )}
            <Text style={styles.avgUnit}>mmol/L</Text>
          </View>

          <View style={styles.avgDivider} />

          <View style={styles.avgSection}>
            <Text style={styles.avgLabel}>
              est. HbA1c{hba1c ? ` (${hba1c.daysOfData}d)` : ''}
            </Text>
            {hba1c ? (
              <>
                <Text style={styles.avgValue}>{hba1c.percent}%</Text>
                <Text style={styles.avgUnit}>{hba1c.mmolMol} mmol/mol</Text>
              </>
            ) : (
              <Text style={styles.avgValue}>—</Text>
            )}
          </View>
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

        {/* Quick log snack */}
        <Pressable style={styles.quickLogBtn} onPress={openQuickLog}>
          <Text style={styles.quickLogBtnText}>⚡ Quick log snack</Text>
        </Pressable>

        {/* Insulin / tablet row — 3 buttons */}
        <View style={styles.insulinRow}>
          <Pressable
            style={styles.insulinBtn}
            onPress={() => navigation.navigate('InsulinLog', { type: 'long-acting' })}
          >
            <Text style={styles.insulinBtnEmoji}>❤️</Text>
            <Text style={styles.insulinBtnText}>Long-acting</Text>
          </Pressable>
          <Pressable
            style={styles.insulinBtn}
            onPress={() => navigation.navigate('InsulinLog', { type: 'correction' })}
          >
            <Text style={styles.insulinBtnEmoji}>💉</Text>
            <Text style={styles.insulinBtnText}>Correction</Text>
          </Pressable>
          <Pressable
            style={styles.insulinBtn}
            onPress={() => navigation.navigate('InsulinLog', { type: 'tablets' })}
          >
            <Text style={styles.insulinBtnEmoji}>💊</Text>
            <Text style={styles.insulinBtnText}>Tablets</Text>
          </Pressable>
        </View>

        {/* Compact range guide */}
        <View style={styles.rangeKey}>
          <Text style={styles.rangeKeyTitle}>Range guide</Text>
          <View style={styles.rangeCompactRow}>
            <View style={styles.rangeCompactItem}>
              <View style={[styles.dot, { backgroundColor: '#FF3B30' }]} />
              <Text style={styles.rangeLabel}>Low &lt;3.9</Text>
            </View>
            <View style={styles.rangeCompactItem}>
              <View style={[styles.dot, { backgroundColor: '#30D158' }]} />
              <Text style={styles.rangeLabel}>In range 3.9–10</Text>
            </View>
            <View style={styles.rangeCompactItem}>
              <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
              <Text style={styles.rangeLabel}>High &gt;10</Text>
            </View>
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrapper}>
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
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save snack</Text>}
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
    paddingTop: 56,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },

  // Header
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 12,
    color: '#636366',
    marginTop: 1,
  },
  settingsBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18 },

  // Glucose card
  card: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    marginBottom: 12,
  },
  errorContainer: { alignItems: 'center', gap: 8 },
  errorIcon: { fontSize: 36, color: '#FF3B30' },
  errorText: { fontSize: 16, color: '#FF3B30', textAlign: 'center' },
  errorHint: { fontSize: 13, color: '#8E8E93' },

  // 12hr average + HbA1c
  avgBox: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 0,
  },
  avgSection: { flex: 1, gap: 2 },
  avgDivider: { width: 1, backgroundColor: '#2C2C2E', alignSelf: 'stretch', marginHorizontal: 16 },
  avgLabel: { fontSize: 11, color: '#636366', textTransform: 'uppercase', letterSpacing: 0.8 },
  avgValue: { fontSize: 26, fontWeight: '700', color: '#8E8E93' },
  avgUnit: { fontSize: 13, color: '#636366' },

  // Actions
  actionRow: { width: '100%', flexDirection: 'row', gap: 10, marginBottom: 10 },
  logMealBtn: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30D158',
  },
  logMealBtnText: { color: '#30D158', fontSize: 16, fontWeight: '600' },
  historyBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 18,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtnText: { color: '#8E8E93', fontSize: 16, fontWeight: '600' },

  // Quick log
  quickLogBtn: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  quickLogBtnText: { color: '#FF9F0A', fontSize: 15, fontWeight: '600' },

  // Insulin row — 3 buttons
  insulinRow: { width: '100%', flexDirection: 'row', gap: 10, marginBottom: 16 },
  insulinBtn: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 5,
  },
  insulinBtnEmoji: { fontSize: 20 },
  insulinBtnText: { color: '#8E8E93', fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // Compact range guide
  rangeKey: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  rangeKeyTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#636366',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rangeCompactRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeCompactItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rangeLabel: { fontSize: 12, color: '#8E8E93' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalWrapper: { justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: '#48484A',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 24 },
  label: {
    color: '#8E8E93', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  input: {
    backgroundColor: '#2C2C2E', color: '#FFFFFF',
    fontSize: 17, padding: 16, borderRadius: 12, marginBottom: 20,
  },
  saveBtn: {
    backgroundColor: '#FF9F0A', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
