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
import {
  fetchAndStoreCurveForSession,
  fetchAndStoreBasalCurve,
  GlucoseResponse,
  BasalCurve,
  InsulinLog,
  Meal,
  SessionConfidence,
  SessionWithMeals,
  loadSessionsWithMeals,
  loadInsulinLogs,
} from '../services/storage';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

// --- helpers ---

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sessionIsComplete(startedAt: string): boolean {
  return Date.now() - new Date(startedAt).getTime() >= THREE_HOURS_MS;
}

function minsUntilReady(startedAt: string): number {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return Math.ceil((THREE_HOURS_MS - elapsed) / 60000);
}

// --- sub-components ---

const CONFIDENCE_CONFIG: Record<
  SessionConfidence,
  { label: string; color: string; bg: string }
> = {
  high:   { label: '✓ Solo',    color: '#30D158', bg: '#0A3A1A' },
  medium: { label: '⚠ Mixed',   color: '#FF9F0A', bg: '#3A2A00' },
  low:    { label: '✕ Complex', color: '#FF3B30', bg: '#3A0A0A' },
};

function ConfidenceBadge({ confidence }: { confidence: SessionConfidence }) {
  const cfg = CONFIDENCE_CONFIG[confidence];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  return (
    <View style={styles.mealRow}>
      {meal.photoUri ? (
        <Image source={{ uri: meal.photoUri }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.noPhoto]}>
          <Text style={styles.noPhotoIcon}>🍽</Text>
        </View>
      )}
      <View style={styles.mealRowMeta}>
        <Text style={styles.mealName}>{meal.name}</Text>
        <View style={styles.mealRowDetails}>
          <Text style={styles.mealTime}>
            {new Date(meal.loggedAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {meal.insulinUnits > 0 && (
            <Text style={styles.insulinTag}>{meal.insulinUnits}u</Text>
          )}
          {meal.startGlucose !== null && (
            <Text style={styles.glucoseTag}>{meal.startGlucose.toFixed(1)} mmol/L</Text>
          )}
        </View>
      </View>
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

function GlucoseResponseCard({ response }: { response: GlucoseResponse }) {
  return (
    <View style={styles.responseCard}>
      <View style={styles.responseRow}>
        <Stat label="Start" value={response.startGlucose.toFixed(1)} unit="mmol/L" />
        <Stat
          label="Peak"
          value={response.peakGlucose.toFixed(1)}
          unit="mmol/L"
          color={response.peakGlucose > 10 ? '#FF9500' : '#30D158'}
        />
        <Stat
          label="Rise"
          value={`${response.totalRise > 0 ? '+' : ''}${response.totalRise.toFixed(1)}`}
          unit="mmol/L"
          color={response.totalRise > 0 ? '#FF9500' : '#30D158'}
        />
        <Stat label="To peak" value={`${response.timeToPeakMins}`} unit="mins" />
      </View>
      {response.isPartial && (
        <Text style={styles.partialNote}>Curve still building — data up to now</Text>
      )}
    </View>
  );
}

function SessionCard({
  session,
  onRefresh,
}: {
  session: SessionWithMeals;
  onRefresh: () => void;
}) {
  const [fetching, setFetching] = useState(false);
  const complete = sessionIsComplete(session.startedAt);
  const minsLeft = minsUntilReady(session.startedAt);
  const isLegacy = session.id.startsWith('legacy_');

  async function handleFetchCurve() {
    if (isLegacy) return; // legacy sessions can't be re-fetched via session API
    setFetching(true);
    try {
      await fetchAndStoreCurveForSession(session.id);
      onRefresh();
    } finally {
      setFetching(false);
    }
  }

  return (
    <View style={styles.card}>
      {/* Session header */}
      <View style={styles.cardHeader}>
        <Text style={styles.sessionDate}>{formatDate(session.startedAt)}</Text>
        <ConfidenceBadge confidence={session.confidence} />
      </View>

      {/* Confidence explanation for non-solo sessions */}
      {session.confidence !== 'high' && (
        <Text style={styles.confidenceNote}>
          {session.confidence === 'medium'
            ? 'Two entries within 3 hrs — curve reflects both'
            : '3+ entries — glucose response is a combined reading'}
        </Text>
      )}

      {/* Meal rows — show as list for multi, compact for solo */}
      <View style={styles.mealList}>
        {session.meals.map((meal, i) => (
          <View key={meal.id}>
            {i > 0 && <View style={styles.mealDivider} />}
            <MealRow meal={meal} />
          </View>
        ))}
      </View>

      {/* Glucose curve */}
      {session.glucoseResponse ? (
        <>
          <GlucoseResponseCard response={session.glucoseResponse} />
          {session.glucoseResponse.isPartial && complete && !isLegacy && (
            <Pressable style={styles.refreshBtn} onPress={handleFetchCurve} disabled={fetching}>
              {fetching
                ? <ActivityIndicator size="small" color="#0A84FF" />
                : <Text style={styles.refreshBtnText}>Refresh curve</Text>
              }
            </Pressable>
          )}
        </>
      ) : complete && !isLegacy ? (
        <Pressable style={styles.fetchBtn} onPress={handleFetchCurve} disabled={fetching}>
          {fetching
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.fetchBtnText}>Load glucose curve</Text>
          }
        </Pressable>
      ) : !complete ? (
        <View style={styles.pendingRow}>
          <Text style={styles.pendingText}>
            Curve ready in ~{minsLeft} min{minsLeft !== 1 ? 's' : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function basalWindowComplete(loggedAt: string): boolean {
  return Date.now() - new Date(loggedAt).getTime() >= TWELVE_HOURS_MS;
}

function minsUntilBasalReady(loggedAt: string): number {
  const elapsed = Date.now() - new Date(loggedAt).getTime();
  return Math.ceil((TWELVE_HOURS_MS - elapsed) / 60000);
}

function BasalCurveCard({ curve }: { curve: BasalCurve }) {
  const dropColor = curve.totalDrop > 0 ? '#30D158' : '#FF9500';
  return (
    <View style={styles.responseCard}>
      <View style={styles.responseRow}>
        <Stat label="At injection" value={curve.startGlucose.toFixed(1)} unit="mmol/L" />
        <Stat
          label="Trough"
          value={curve.lowestGlucose.toFixed(1)}
          unit="mmol/L"
          color={curve.lowestGlucose < 3.9 ? '#FF3B30' : '#30D158'}
        />
        <Stat
          label="Drop"
          value={`${curve.totalDrop > 0 ? '-' : '+'}${Math.abs(curve.totalDrop).toFixed(1)}`}
          unit="mmol/L"
          color={dropColor}
        />
        <Stat label="To trough" value={`${curve.timeToTroughMins}`} unit="mins" />
      </View>
      <View style={styles.responseRow}>
        <Stat label="After 12h" value={curve.endGlucose.toFixed(1)} unit="mmol/L" />
      </View>
      {curve.isPartial && (
        <Text style={styles.partialNote}>12hr window still in progress</Text>
      )}
    </View>
  );
}

// --- insulin log card ---

function InsulinLogCard({ log, onRefresh }: { log: InsulinLog; onRefresh: () => void }) {
  const [fetching, setFetching] = useState(false);
  const isLongActing = log.type === 'long-acting';
  const complete = basalWindowComplete(log.loggedAt);
  const minsLeft = minsUntilBasalReady(log.loggedAt);

  async function handleFetchCurve() {
    setFetching(true);
    try {
      await fetchAndStoreBasalCurve(log.id);
      onRefresh();
    } finally {
      setFetching(false);
    }
  }

  return (
    <View style={[styles.card, styles.insulinCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.sessionDate}>{formatDate(log.loggedAt)}</Text>
        <View style={[styles.badge, {
          backgroundColor: isLongActing ? '#3A0A0A' : log.type === 'tablets' ? '#0A3A1A' : '#0A1A3A'
        }]}>
          <Text style={[styles.badgeText, {
            color: isLongActing ? '#FF3B30' : log.type === 'tablets' ? '#30D158' : '#0A84FF'
          }]}>
            {isLongActing ? '❤️ Long-acting' : log.type === 'tablets' ? '💊 Tablets' : '💉 Correction'}
          </Text>
        </View>
      </View>

      <View style={styles.insulinSummaryRow}>
        <Text style={styles.insulinUnits}>
          <Text style={[styles.insulinUnitsValue, { color: isLongActing ? '#FF3B30' : '#0A84FF' }]}>
            {log.units}
          </Text>
          {' '}units
        </Text>
        {log.startGlucose !== null && (
          <Text style={styles.insulinStartGlucose}>
            Glucose: {log.startGlucose.toFixed(1)} mmol/L
          </Text>
        )}
      </View>

      {isLongActing && (
        <>
          {log.basalCurve ? (
            <>
              <BasalCurveCard curve={log.basalCurve} />
              {log.basalCurve.isPartial && complete && (
                <Pressable style={styles.refreshBtn} onPress={handleFetchCurve} disabled={fetching}>
                  {fetching
                    ? <ActivityIndicator size="small" color="#FF3B30" />
                    : <Text style={[styles.refreshBtnText, { color: '#FF3B30' }]}>Refresh 12hr curve</Text>
                  }
                </Pressable>
              )}
            </>
          ) : complete ? (
            <Pressable style={[styles.fetchBtn, { backgroundColor: '#FF3B30' }]} onPress={handleFetchCurve} disabled={fetching}>
              {fetching
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.fetchBtnText, { color: '#fff' }]}>Load overnight curve</Text>
              }
            </Pressable>
          ) : (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                12hr curve ready in ~{minsLeft > 60
                  ? `${Math.ceil(minsLeft / 60)}h`
                  : `${minsLeft}min`}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// --- merged history item ---

type HistoryItem =
  | { kind: 'session'; data: SessionWithMeals }
  | { kind: 'insulin'; data: InsulinLog };

// --- screen ---

export default function MealHistoryScreen() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [sessions, insulinLogs] = await Promise.all([
      loadSessionsWithMeals(),
      loadInsulinLogs(),
    ]);

    const merged: HistoryItem[] = [
      ...sessions.map(s => ({ kind: 'session' as const, data: s })),
      ...insulinLogs.map(l => ({ kind: 'insulin' as const, data: l })),
    ].sort((a, b) => {
      const dateA = a.kind === 'session' ? a.data.startedAt : a.data.loggedAt;
      const dateB = b.kind === 'session' ? b.data.startedAt : b.data.loggedAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    setItems(merged);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#30D158" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🍽</Text>
        <Text style={styles.emptyText}>Nothing logged yet</Text>
        <Text style={styles.emptyHint}>Log a meal or insulin from the home screen</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.kind === 'session' ? item.data.id : `ins_${item.data.id}`}
      contentContainerStyle={styles.list}
      renderItem={({ item }) =>
        item.kind === 'session'
          ? <SessionCard session={item.data} onRefresh={load} />
          : <InsulinLogCard log={item.data} onRefresh={load} />
      }
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
  list: { padding: 16, gap: 16 },

  // Session card
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionDate: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  confidenceNote: {
    fontSize: 12,
    color: '#636366',
    fontStyle: 'italic',
    marginTop: -4,
  },

  // Meal rows
  mealList: { gap: 0 },
  mealDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 10,
  },
  mealRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  noPhoto: {
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoIcon: { fontSize: 22 },
  mealRowMeta: { flex: 1, gap: 4 },
  mealName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  mealRowDetails: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  mealTime: { fontSize: 12, color: '#636366' },
  insulinTag: { fontSize: 12, color: '#0A84FF' },
  glucoseTag: { fontSize: 12, color: '#8E8E93' },

  // Glucose response
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
  stat: { alignItems: 'center', flex: 1 },
  statLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  statUnit: { fontSize: 10, color: '#636366' },
  partialNote: { fontSize: 12, color: '#FF9500', textAlign: 'center' },

  // States
  pendingRow: { alignItems: 'center', paddingVertical: 4 },
  pendingText: { fontSize: 13, color: '#636366', fontStyle: 'italic' },
  fetchBtn: {
    backgroundColor: '#30D158',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  fetchBtnText: { color: '#000', fontWeight: '600', fontSize: 14 },
  refreshBtn: { alignItems: 'center', padding: 8 },
  refreshBtnText: { color: '#0A84FF', fontSize: 14 },

  // Insulin log card
  insulinCard: { gap: 8 },
  insulinSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insulinUnits: { fontSize: 16, color: '#8E8E93' },
  insulinUnitsValue: { fontSize: 28, fontWeight: '700' },
  insulinStartGlucose: { fontSize: 13, color: '#636366' },
});
