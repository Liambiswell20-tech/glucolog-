import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { fetchLatestGlucose, fetchGlucosesSince, fetchGlucoseRange, GlucoseReading, CurvePoint } from '../services/nightscout';
import { fetchAndStoreCurve, saveMeal, loadGlucoseStore, updateGlucoseStore, loadCachedHba1c, computeAndCacheHba1c, Hba1cEstimate, GlucoseResponse, fetchAndStoreHypoRecoveryCurve } from '../services/storage';
import { GlucoseChart } from '../components/GlucoseChart';
import { glucoseToArcAngle } from '../utils/glucoseToArcAngle';
import { COLORS, FONTS } from '../theme';
import type { RootStackParamList } from '../../App';
import type { HypoTreatment } from '../types/equipment';
import HypoTreatmentSheet from '../components/HypoTreatmentSheet';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// ─── Arc gauge helpers ────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

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

  // HbA1c disclaimer modal
  const [hba1cModalVisible, setHba1cModalVisible] = useState(false);

  // 12hr glucose curve modal
  const [avg12hModalVisible, setAvg12hModalVisible] = useState(false);
  const [last12hResponse, setLast12hResponse] = useState<GlucoseResponse | null>(null);

  // Hypo treatment sheet
  const [hypoSheetVisible, setHypoSheetVisible] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cardAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;

  // LIVE dot pulse loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  // Staggered card entrance after data loads
  useEffect(() => {
    if (!loading) {
      Animated.stagger(80, cardAnims.map(anim =>
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 })
      )).start();
    }
  }, [loading]);

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

  // Poll only while app is in the foreground; re-fetch immediately on resume
  useEffect(() => {
    loadData();
    let interval: ReturnType<typeof setInterval> | null = setInterval(() => loadData(), POLL_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        loadData();
        if (!interval) interval = setInterval(() => loadData(), POLL_INTERVAL_MS);
      } else {
        if (interval) { clearInterval(interval); interval = null; }
      }
    });

    return () => {
      if (interval) clearInterval(interval);
      sub.remove();
    };
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

  async function handleHypoSave(treatment: Omit<HypoTreatment, 'id' | 'logged_at' | 'glucose_readings_after'>) {
    try {
      const HYPO_TREATMENTS_KEY = 'hypo_treatments';
      const raw = await AsyncStorage.getItem(HYPO_TREATMENTS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const record: HypoTreatment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        logged_at: new Date().toISOString(),
        ...treatment,
      };
      await AsyncStorage.setItem(HYPO_TREATMENTS_KEY, JSON.stringify([...existing, record]));
      setHypoSheetVisible(false);
      // Background fetch recovery curve — won't have many readings yet but stores what exists
      fetchAndStoreHypoRecoveryCurve(record.id).catch(() => {});
    } catch (err) {
      Alert.alert('Save failed', 'Could not save treatment. Try again.');
    }
  }

  async function handleAvg12hPress() {
    // Fetch last 12 hours trailing from current time
    const nowMs = Date.now();
    const twelveHoursAgoMs = nowMs - 12 * 60 * 60 * 1000;
    let curvePoints: CurvePoint[];
    try {
      curvePoints = await fetchGlucoseRange(twelveHoursAgoMs, nowMs, 150);
    } catch {
      // Fallback to local store if Nightscout fetch fails
      const store = await loadGlucoseStore();
      if (!store || store.readings.length === 0) return;
      const recent = store.readings
        .filter(r => r.date >= twelveHoursAgoMs)
        .sort((a, b) => a.date - b.date);
      if (recent.length === 0) return;
      curvePoints = recent.map(r => ({
        mmol: Math.round((r.sgv / 18) * 10) / 10,
        date: r.date,
      }));
    }
    if (curvePoints.length === 0) return;
    const start = curvePoints[0].mmol;
    const peak = Math.max(...curvePoints.map(p => p.mmol));
    const end = curvePoints[curvePoints.length - 1].mmol;
    setLast12hResponse({
      startGlucose: start,
      peakGlucose: peak,
      timeToPeakMins: 0,
      totalRise: 0,
      endGlucose: end,
      fallFromPeak: 0,
      timeFromPeakToEndMins: 0,
      readings: curvePoints,
      isPartial: false,
      fetchedAt: new Date().toISOString(),
    });
    setAvg12hModalVisible(true);
  }

  // Derive glucose arc angle and colour
  const arcAngle = reading ? (glucoseToArcAngle(reading.mmol) ?? -135) : -135;
  const glucoseColour = reading
    ? (reading.mmol < 3.9 ? COLORS.red : reading.mmol > 10 ? COLORS.amber : COLORS.green)
    : COLORS.textSecondary;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={COLORS.textSecondary} />
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

        {/* Arc gauge — 270° sweep, -135° to +135° */}
        <View style={styles.gaugeContainer}>
          <Svg width={260} height={200} viewBox="0 0 260 200">
            {/* Track arc (full 270°) */}
            <Path
              d={arcPath(130, 140, 100, -135, 135)}
              stroke={COLORS.surfaceRaised}
              strokeWidth={14}
              fill="none"
              strokeLinecap="round"
            />
            {/* Value arc — fills from -135° to current glucose angle */}
            {reading && (
              <Path
                d={arcPath(130, 140, 100, -135, arcAngle)}
                stroke={glucoseColour}
                strokeWidth={14}
                fill="none"
                strokeLinecap="round"
              />
            )}
          </Svg>

          {/* Glucose value overlay — positioned absolutely in centre */}
          <View style={styles.gaugeCenter}>
            {loading && !reading ? (
              <ActivityIndicator size="large" color={COLORS.green} />
            ) : error ? (
              <Text style={styles.gaugeError}>!</Text>
            ) : (
              <>
                <Text style={[styles.glucoseValue, { color: glucoseColour }]}>
                  {reading ? reading.mmol.toFixed(1) : '– –'}
                </Text>
                <Text style={styles.glucoseUnit}>mmol/L</Text>
                {reading && (
                  <View style={styles.liveRow}>
                    <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Stats row: 12HR AVG + EST. HBA1C */}
        <Animated.View
          style={[
            styles.statsRow,
            {
              opacity: cardAnims[0],
              transform: [{ scale: cardAnims[0].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
          <Pressable style={styles.statCard} onPress={avg12h !== null ? handleAvg12hPress : undefined}>
            <Text style={styles.statLabel}>12HR AVG</Text>
            {avg12h !== null ? (
              <Text style={[styles.statValue, { color: avg12h < 3.9 ? COLORS.red : avg12h > 10 ? COLORS.amber : COLORS.green }]}>
                {avg12h.toFixed(1)}
              </Text>
            ) : (
              <Text style={styles.statValue}>—</Text>
            )}
            <Text style={styles.statUnit}>mmol/L</Text>
            {avg12h !== null && <Text style={styles.tapHint}>Tap for chart</Text>}
          </Pressable>

          <Pressable style={styles.statCard} onPress={() => hba1c && setHba1cModalVisible(true)}>
            <Text style={styles.statLabel}>
              EST. HBA1C{hba1c ? ` (${hba1c.daysOfData}d)` : ''}
            </Text>
            {hba1c ? (
              <>
                <Text style={styles.statValue}>{hba1c.percent}%</Text>
                <Text style={styles.statUnit}>{hba1c.mmolMol} mmol/mol</Text>
              </>
            ) : (
              <Text style={styles.statValue}>—</Text>
            )}
            {hba1c && <Text style={styles.tapHint}>Tap for info</Text>}
          </Pressable>
        </Animated.View>

        {/* Hypo treatment button — B2B-06 */}
        <Animated.View
          style={[
            styles.hypoButtonRow,
            {
              opacity: cardAnims[4],
              transform: [{ scale: cardAnims[4].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
          <Pressable
            style={styles.hypoButton}
            onPress={() => setHypoSheetVisible(true)}
          >
            <Text style={styles.hypoButtonText}>Treating a low?</Text>
          </Pressable>
        </Animated.View>

        {/* Primary actions */}
        <Animated.View
          style={[
            styles.actionRow,
            {
              opacity: cardAnims[1],
              transform: [{ scale: cardAnims[1].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
          <Pressable style={styles.logMealBtn} onPress={() => navigation.navigate('MealLog')}>
            <Text style={styles.logMealBtnText}>+ Log meal</Text>
          </Pressable>
          <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('MealHistory')}>
            <Text style={styles.historyBtnText}>History</Text>
          </Pressable>
        </Animated.View>

        {/* Quick log snack */}
        <Animated.View
          style={[
            { width: '100%' },
            {
              opacity: cardAnims[2],
              transform: [{ scale: cardAnims[2].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
          <Pressable style={styles.quickLogBtn} onPress={openQuickLog}>
            <Text style={styles.quickLogBtnText}>⚡ Quick log snack</Text>
          </Pressable>
        </Animated.View>

        {/* Insulin / tablet row — 3 buttons */}
        <Animated.View
          style={[
            styles.insulinRow,
            {
              opacity: cardAnims[3],
              transform: [{ scale: cardAnims[3].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
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
        </Animated.View>

        {/* Compact range guide */}
        <View style={styles.rangeKey}>
          <Text style={styles.rangeKeyTitle}>Range guide</Text>
          <View style={styles.rangeCompactRow}>
            <View style={styles.rangeCompactItem}>
              <View style={[styles.dot, { backgroundColor: COLORS.red }]} />
              <Text style={styles.rangeLabel}>Low &lt;3.9</Text>
            </View>
            <View style={styles.rangeCompactItem}>
              <View style={[styles.dot, { backgroundColor: COLORS.green }]} />
              <Text style={styles.rangeLabel}>In range 3.9–10</Text>
            </View>
            <View style={styles.rangeCompactItem}>
              <View style={[styles.dot, { backgroundColor: COLORS.amber }]} />
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

      {/* HbA1c disclaimer modal (HOME-02) */}
      <Modal
        visible={hba1cModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setHba1cModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setHba1cModalVisible(false)} />
        <View style={styles.hba1cModalWrapper}>
          <View style={styles.hba1cModalSheet}>
            <Text style={styles.hba1cModalTitle}>About this estimate</Text>
            <Text style={styles.hba1cModalBody}>
              Please be aware HbA1c is usually calculated over 90 days. You should get accurate testing and take guidance from your diabetes team.
            </Text>
            <Pressable
              style={styles.hba1cModalClose}
              onPress={() => setHba1cModalVisible(false)}
            >
              <Text style={styles.hba1cModalCloseText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 12hr glucose curve modal */}
      <Modal
        visible={avg12hModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAvg12hModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAvg12hModalVisible(false)} />
        <View style={styles.hba1cModalWrapper}>
          <View style={styles.hba1cModalSheet}>
            <Text style={styles.hba1cModalTitle}>Last 12 hours</Text>
            {last12hResponse && last12hResponse.readings.length >= 2 ? (
              <GlucoseChart response={last12hResponse} height={180} showTimeLabels />
            ) : (
              <Text style={styles.hba1cModalBody}>Not enough readings to show a chart.</Text>
            )}
            <Pressable
              style={styles.hba1cModalClose}
              onPress={() => setAvg12hModalVisible(false)}
            >
              <Text style={styles.hba1cModalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Hypo treatment sheet — B2B-06 */}
      <HypoTreatmentSheet
        visible={hypoSheetVisible}
        currentGlucose={reading?.mmol ?? null}
        onClose={() => setHypoSheetVisible(false)}
        onSave={handleHypoSave}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.background,
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
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
    fontFamily: FONTS.semiBold,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
    fontFamily: FONTS.regular,
  },
  settingsBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18 },

  // Arc gauge
  gaugeContainer: {
    alignItems: 'center',
    position: 'relative',
    height: 200,
    width: '100%',
    marginBottom: 8,
  },
  gaugeCenter: {
    position: 'absolute',
    top: 60,
    alignItems: 'center',
    gap: 4,
  },
  gaugeError: {
    fontSize: 36,
    color: COLORS.red,
  },
  glucoseValue: {
    fontSize: 52,
    fontWeight: '700',
    fontFamily: FONTS.mono,
  },
  glucoseUnit: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.green,
  },
  liveText: {
    fontSize: 10,
    color: COLORS.green,
    fontWeight: '600',
    letterSpacing: 1.5,
    fontFamily: FONTS.semiBold,
  },

  // Stats row
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: FONTS.regular,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono,
  },
  statUnit: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
  },
  tapHint: {
    fontSize: 10,
    color: COLORS.blue,
    marginTop: 2,
    fontFamily: FONTS.regular,
  },

  // Hypo treatment button — B2B-06
  hypoButtonRow: {
    width: '100%',
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  hypoButton: {
    borderWidth: 1,
    borderColor: COLORS.red,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  hypoButtonText: {
    color: COLORS.red,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },

  // Actions
  actionRow: { width: '100%', flexDirection: 'row', gap: 10, marginBottom: 10 },
  logMealBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  logMealBtnText: { color: COLORS.green, fontSize: 16, fontWeight: '600', fontFamily: FONTS.semiBold },
  historyBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 18,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtnText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '600', fontFamily: FONTS.semiBold },

  // Quick log
  quickLogBtn: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  quickLogBtnText: { color: '#FF9F0A', fontSize: 15, fontWeight: '600', fontFamily: FONTS.semiBold },

  // Insulin row — 3 buttons
  insulinRow: { width: '100%', flexDirection: 'row', gap: 10, marginBottom: 16 },
  insulinBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 5,
  },
  insulinBtnEmoji: { fontSize: 20 },
  insulinBtnText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'center', fontFamily: FONTS.regular },

  // Compact range guide
  rangeKey: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  rangeKeyTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: FONTS.semiBold,
  },
  rangeCompactRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeCompactItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rangeLabel: { fontSize: 12, color: COLORS.textSecondary, fontFamily: FONTS.regular },

  // Modal (shared backdrop)
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },

  // Quick log modal
  modalWrapper: { justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: '#48484A',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 24, fontFamily: FONTS.semiBold },
  label: {
    color: COLORS.textSecondary, fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
    fontFamily: FONTS.semiBold,
  },
  input: {
    backgroundColor: COLORS.surfaceRaised, color: COLORS.text,
    fontSize: 17, padding: 16, borderRadius: 12, marginBottom: 20,
    fontFamily: FONTS.regular,
  },
  saveBtn: {
    backgroundColor: '#FF9F0A', borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontSize: 17, fontWeight: '700', fontFamily: FONTS.semiBold },

  // HbA1c disclaimer modal
  hba1cModalWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  hba1cModalSheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    width: '100%',
  },
  hba1cModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
  },
  hba1cModalBody: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    fontFamily: FONTS.regular,
  },
  hba1cModalClose: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  hba1cModalCloseText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: FONTS.semiBold,
  },
});
