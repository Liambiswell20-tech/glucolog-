import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchAndStoreCurve, GlucoseResponse, loadMeals, Meal } from '../services/storage';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function minsUntilCurveReady(loggedAt: string): number {
  const elapsed = Date.now() - new Date(loggedAt).getTime();
  return Math.ceil((THREE_HOURS_MS - elapsed) / 60000);
}

function curveIsComplete(loggedAt: string): boolean {
  return Date.now() - new Date(loggedAt).getTime() >= THREE_HOURS_MS;
}

function GlucoseResponseCard({ response }: { response: GlucoseResponse }) {
  const riseColor = response.totalRise > 0 ? '#FF9500' : '#30D158';
  return (
    <View style={styles.responseCard}>
      <View style={styles.responseRow}>
        <Stat label="Start" value={`${response.startGlucose.toFixed(1)}`} unit="mmol/L" />
        <Stat label="Peak" value={`${response.peakGlucose.toFixed(1)}`} unit="mmol/L" color={response.peakGlucose > 10 ? '#FF9500' : '#30D158'} />
        <Stat label="Rise" value={`${response.totalRise > 0 ? '+' : ''}${response.totalRise.toFixed(1)}`} unit="mmol/L" color={riseColor} />
        <Stat label="Time to peak" value={`${response.timeToPeakMins}`} unit="mins" />
      </View>
      {response.isPartial && (
        <Text style={styles.partialNote}>Curve still building — data up to now</Text>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  unit,
  color = '#FFFFFF',
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  );
}

function MealCard({ meal, onRefresh }: { meal: Meal; onRefresh: () => void }) {
  const [fetching, setFetching] = useState(false);
  const complete = curveIsComplete(meal.loggedAt);
  const minsLeft = minsUntilCurveReady(meal.loggedAt);

  async function handleRefreshCurve() {
    setFetching(true);
    try {
      await fetchAndStoreCurve(meal.id);
      onRefresh();
    } finally {
      setFetching(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {meal.photoUri ? (
          <Image source={{ uri: meal.photoUri }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.noPhoto]}>
            <Text style={styles.noPhotoIcon}>🍽</Text>
          </View>
        )}
        <View style={styles.cardMeta}>
          <Text style={styles.mealName}>{meal.name}</Text>
          <Text style={styles.mealDate}>{formatDate(meal.loggedAt)}</Text>
          {meal.insulinUnits > 0 && (
            <Text style={styles.insulin}>{meal.insulinUnits}u insulin</Text>
          )}
          {meal.startGlucose !== null && (
            <Text style={styles.startGlucose}>
              Glucose at meal: {meal.startGlucose.toFixed(1)} mmol/L
            </Text>
          )}
        </View>
      </View>

      {meal.glucoseResponse ? (
        <>
          <GlucoseResponseCard response={meal.glucoseResponse} />
          {meal.glucoseResponse.isPartial && complete && (
            <Pressable style={styles.refreshBtn} onPress={handleRefreshCurve} disabled={fetching}>
              {fetching
                ? <ActivityIndicator size="small" color="#0A84FF" />
                : <Text style={styles.refreshBtnText}>Refresh curve</Text>
              }
            </Pressable>
          )}
        </>
      ) : complete ? (
        <Pressable style={styles.fetchBtn} onPress={handleRefreshCurve} disabled={fetching}>
          {fetching
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.fetchBtnText}>Load glucose curve</Text>
          }
        </Pressable>
      ) : (
        <View style={styles.pendingRow}>
          <Text style={styles.pendingText}>
            Curve ready in ~{minsLeft} min{minsLeft !== 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function MealHistoryScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await loadMeals();
    setMeals(data);
    setLoading(false);
  }, []);

  // Reload whenever the screen comes into focus (e.g. after logging a meal)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#30D158" />
      </View>
    );
  }

  if (meals.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🍽</Text>
        <Text style={styles.emptyText}>No meals logged yet</Text>
        <Text style={styles.emptyHint}>Log a meal from the home screen</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={meals}
      keyExtractor={m => m.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <MealCard meal={item} onRefresh={load} />}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 18, color: '#FFFFFF', fontWeight: '600' },
  emptyHint: { fontSize: 14, color: '#8E8E93' },
  list: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  noPhoto: {
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoIcon: { fontSize: 28 },
  cardMeta: {
    flex: 1,
    gap: 2,
  },
  mealName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  mealDate: {
    fontSize: 13,
    color: '#8E8E93',
  },
  insulin: {
    fontSize: 13,
    color: '#0A84FF',
    marginTop: 2,
  },
  startGlucose: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  responseCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  responseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statUnit: {
    fontSize: 10,
    color: '#636366',
  },
  partialNote: {
    fontSize: 12,
    color: '#FF9500',
    textAlign: 'center',
  },
  pendingRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  pendingText: {
    fontSize: 13,
    color: '#636366',
    fontStyle: 'italic',
  },
  fetchBtn: {
    backgroundColor: '#30D158',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  fetchBtnText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
  refreshBtn: {
    alignItems: 'center',
    padding: 8,
  },
  refreshBtnText: {
    color: '#0A84FF',
    fontSize: 14,
  },
});
