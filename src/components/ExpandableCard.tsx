import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { fetchAndStoreCurveForMeal } from '../services/storage';
import { classifyOutcome } from '../utils/outcomeClassifier';
import { GlucoseChart } from './GlucoseChart';
import { OutcomeBadge } from './OutcomeBadge';
import type { ExpandableCardProps } from './types';

// Android LayoutAnimation guard — idempotent, safe to call multiple times
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

function glucoseColor(mmol: number): string {
  if (mmol < 3.9) return '#FF3B30';
  if (mmol > 10.0) return '#FF9500';
  return '#30D158';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function mealWindowComplete(loggedAt: string): boolean {
  return Date.now() - new Date(loggedAt).getTime() >= THREE_HOURS_MS;
}

function minsUntilReady(loggedAt: string): number {
  const elapsed = Date.now() - new Date(loggedAt).getTime();
  return Math.ceil((THREE_HOURS_MS - elapsed) / 60000);
}

export function ExpandableCard({ meal, onRefresh, matchingSlot }: ExpandableCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const [fetching, setFetching] = useState(false);

  const badge = classifyOutcome(meal.glucoseResponse);
  const complete = mealWindowComplete(meal.loggedAt);
  const minsLeft = minsUntilReady(meal.loggedAt);

  function handleToggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  }

  async function handleFetchCurve() {
    setFetching(true);
    try {
      await fetchAndStoreCurveForMeal(meal.id);
      onRefresh();
    } finally {
      setFetching(false);
    }
  }

  return (
    <View style={styles.card}>
      {/* Edit button row */}
      <View style={styles.editRow}>
        <View style={{ flex: 1 }} />
        <Pressable
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditMeal', { mealId: meal.id })}
          hitSlop={8}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>

      {/* Tappable header — always visible */}
      <Pressable onPress={handleToggle} style={styles.mealHeader}>
        {meal.photoUri ? (
          <Image source={{ uri: meal.photoUri }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.noPhoto]}>
            <Text style={styles.noPhotoIcon}>🍽</Text>
          </View>
        )}
        <View style={styles.mealMeta}>
          <View style={styles.mealTitleRow}>
            <Text style={styles.mealName} numberOfLines={1}>{meal.name}</Text>
            {meal.insulinUnits > 0 && (
              <View style={styles.insulinBadge}>
                <Text style={styles.insulinBadgeText}>{meal.insulinUnits}u</Text>
              </View>
            )}
            <OutcomeBadge badge={badge} size="small" />
          </View>
          <Text style={styles.mealDate}>{formatDate(meal.loggedAt)}</Text>
          {meal.carbsEstimated != null && (
            <Text style={styles.carbEstimate}>~{meal.carbsEstimated}g carbs (AI estimate)</Text>
          )}
          {meal.startGlucose !== null && (
            <View style={styles.startGlucoseRow}>
              <Text style={[styles.startGlucoseValue, { color: glucoseColor(meal.startGlucose) }]}>
                {meal.startGlucose.toFixed(1)}
              </Text>
              <Text style={styles.startGlucoseUnit}> mmol/L before</Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {meal.glucoseResponse ? (
            <>
              {/* Stats row: Start / Peak / End */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>START</Text>
                  <Text style={[styles.statValue, { color: glucoseColor(meal.glucoseResponse.startGlucose) }]}>
                    {meal.glucoseResponse.startGlucose.toFixed(1)}
                  </Text>
                  <Text style={styles.statUnit}>mmol/L</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>PEAK</Text>
                  <Text style={[styles.statValue, { color: glucoseColor(meal.glucoseResponse.peakGlucose) }]}>
                    {meal.glucoseResponse.peakGlucose.toFixed(1)}
                  </Text>
                  <Text style={styles.statUnit}>mmol/L</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>{meal.glucoseResponse.isPartial ? 'NOW' : '3HR'}</Text>
                  <Text style={[styles.statValue, { color: glucoseColor(meal.glucoseResponse.endGlucose) }]}>
                    {meal.glucoseResponse.endGlucose.toFixed(1)}
                  </Text>
                  <Text style={styles.statUnit}>mmol/L</Text>
                </View>
              </View>

              {/* Glucose curve chart */}
              {meal.glucoseResponse.readings.length >= 2 && (
                <GlucoseChart response={meal.glucoseResponse} height={120} />
              )}

              {/* Refresh button for partial curves */}
              {meal.glucoseResponse.isPartial && complete && (
                <Pressable style={styles.refreshBtn} onPress={handleFetchCurve} disabled={fetching}>
                  {fetching
                    ? <ActivityIndicator size="small" color="#0A84FF" />
                    : <Text style={styles.refreshBtnText}>Refresh curve</Text>}
                </Pressable>
              )}
            </>
          ) : complete ? (
            <Pressable style={styles.fetchBtn} onPress={handleFetchCurve} disabled={fetching}>
              {fetching
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.fetchBtnText}>Load glucose curve</Text>}
            </Pressable>
          ) : (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                Curve ready in ~{minsLeft} min{minsLeft !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {/* Matching slot — Phase 2: always greyed-out placeholder (per D-09) */}
          {/* Phase 3 replaces this with real matching data by passing matchingSlot.matchData */}
          <View style={styles.matchingSlot}>
            <Text style={styles.matchingPlaceholder}>Loading...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16, gap: 8 },
  editRow: { flexDirection: 'row', marginBottom: -4 },
  editBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  editBtnText: { fontSize: 13, color: '#636366' },

  mealHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumbnail: { width: 60, height: 60, borderRadius: 10 },
  noPhoto: { backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center' },
  noPhotoIcon: { fontSize: 24 },
  mealMeta: { flex: 1, gap: 3 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  insulinBadge: { backgroundColor: '#0A1A3A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  insulinBadgeText: { fontSize: 12, fontWeight: '600', color: '#0A84FF' },
  mealDate: { fontSize: 12, color: '#636366' },
  carbEstimate: { fontSize: 12, color: '#636366' },
  startGlucoseRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  startGlucoseValue: { fontSize: 15, fontWeight: '700' },
  startGlucoseUnit: { fontSize: 12, color: '#8E8E93' },

  expandedContent: { gap: 10, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#2C2C2E', borderRadius: 10, paddingVertical: 10 },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 10, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: 17, fontWeight: '700' },
  statUnit: { fontSize: 10, color: '#636366' },

  pendingRow: { alignItems: 'center', paddingVertical: 4 },
  pendingText: { fontSize: 13, color: '#636366', fontStyle: 'italic' },
  fetchBtn: { backgroundColor: '#30D158', borderRadius: 10, padding: 12, alignItems: 'center' },
  fetchBtnText: { color: '#000', fontWeight: '600', fontSize: 14 },
  refreshBtn: { alignItems: 'center', padding: 8 },
  refreshBtnText: { color: '#0A84FF', fontSize: 14 },

  matchingSlot: { borderTopWidth: 1, borderTopColor: '#2C2C2E', paddingTop: 8 },
  matchingPlaceholder: { fontSize: 13, color: '#3A3A3C', fontStyle: 'italic' },
});
