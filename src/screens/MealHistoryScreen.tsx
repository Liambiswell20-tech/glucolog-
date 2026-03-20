import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import {
  fetchAndStoreCurveForMeal,
  fetchAndStoreBasalCurve,
  GlucoseResponse,
  BasalCurve,
  InsulinLog,
  Meal,
  loadMeals,
  loadInsulinLogs,
} from '../services/storage';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

// --- date helpers ---

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return localDateKey(new Date().toISOString());
}

function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mealWindowComplete(loggedAt: string): boolean {
  return Date.now() - new Date(loggedAt).getTime() >= THREE_HOURS_MS;
}

function minsUntilReady(loggedAt: string): number {
  const elapsed = Date.now() - new Date(loggedAt).getTime();
  return Math.ceil((THREE_HOURS_MS - elapsed) / 60000);
}

function basalWindowComplete(loggedAt: string): boolean {
  return Date.now() - new Date(loggedAt).getTime() >= TWELVE_HOURS_MS;
}

function minsUntilBasalReady(loggedAt: string): number {
  const elapsed = Date.now() - new Date(loggedAt).getTime();
  return Math.ceil((TWELVE_HOURS_MS - elapsed) / 60000);
}

function glucoseColor(mmol: number): string {
  if (mmol < 3.9) return '#FF3B30';
  if (mmol > 10.0) return '#FF9500';
  return '#30D158';
}

// --- shared stat component ---

function Stat({
  label,
  value,
  unit,
  color = '#FFFFFF',
  delta,
  deltaColor,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
  delta?: string;
  deltaColor?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      {delta !== undefined && (
        <Text style={[styles.statDelta, { color: deltaColor ?? '#8E8E93' }]}>{delta}</Text>
      )}
    </View>
  );
}

// --- glucose response card ---

function GlucoseResponseCard({ response }: { response: GlucoseResponse }) {
  const endLabel = response.isPartial ? 'Now' : '3hr';
  const endGlucose = response.endGlucose ?? 0;
  const startGlucose = response.startGlucose ?? 0;
  const net = endGlucose - startGlucose;
  const netStr = `${net >= 0 ? '▲ +' : '▼ '}${net.toFixed(1)}`;
  const endRangeColor = glucoseColor(endGlucose);

  return (
    <View style={styles.responseCard}>
      <View style={styles.responseRow}>
        <Stat label="Start" value={startGlucose.toFixed(1)} unit="mmol/L" />
        <Stat
          label="Peak"
          value={(response.peakGlucose ?? 0).toFixed(1)}
          unit="mmol/L"
          color={(response.peakGlucose ?? 0) > 10 ? '#FF9500' : '#30D158'}
        />
        <Stat
          label={endLabel}
          value={endGlucose.toFixed(1)}
          unit="mmol/L"
          color={endRangeColor}
          delta={netStr}
          deltaColor={endRangeColor}
        />
      </View>
      {response.isPartial && (
        <Text style={styles.partialNote}>Curve still building</Text>
      )}
    </View>
  );
}

// --- meal card ---

function MealCard({ meal, onRefresh }: { meal: Meal; onRefresh: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fetching, setFetching] = useState(false);
  const complete = mealWindowComplete(meal.loggedAt);
  const minsLeft = minsUntilReady(meal.loggedAt);

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
      <View style={styles.cardEditRow}>
        <View style={{ flex: 1 }} />
        <Pressable
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditMeal', { mealId: meal.id })}
          hitSlop={8}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>
      <View style={styles.mealHeader}>
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
      </View>

      {meal.glucoseResponse ? (
        <>
          <GlucoseResponseCard response={meal.glucoseResponse} />
          {meal.glucoseResponse.isPartial && complete && (
            <Pressable style={styles.refreshBtn} onPress={handleFetchCurve} disabled={fetching}>
              {fetching
                ? <ActivityIndicator size="small" color="#0A84FF" />
                : <Text style={styles.refreshBtnText}>Refresh curve</Text>
              }
            </Pressable>
          )}
        </>
      ) : complete ? (
        <Pressable style={styles.fetchBtn} onPress={handleFetchCurve} disabled={fetching}>
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

// --- basal curve card ---

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
        <Text style={styles.cardDate}>{formatDate(log.loggedAt)}</Text>
        <View style={[styles.badge, {
          backgroundColor: isLongActing ? '#3A0A0A' : log.type === 'tablets' ? '#0A3A1A' : '#0A1A3A'
        }]}>
          <Text style={[styles.badgeText, {
            color: isLongActing ? '#FF3B30' : log.type === 'tablets' ? '#30D158' : '#0A84FF'
          }]}>
            {isLongActing ? '❤️ Long-acting' : log.type === 'tablets' ? '💊 Tablets' : '💉 Correction'}
          </Text>
        </View>
        <Pressable
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditInsulin', { logId: log.id })}
          hitSlop={8}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
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

// --- day header ---

function DayHeader({
  label,
  count,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotation]);

  const chevronStyle = {
    transform: [{
      rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }),
    }],
  };

  return (
    <Pressable style={styles.dayHeader} onPress={onToggle}>
      <Text style={styles.dayHeaderLabel}>{label}</Text>
      <Text style={styles.dayHeaderCount}>{count} {count === 1 ? 'entry' : 'entries'}</Text>
      <Animated.Text style={[styles.dayHeaderChevron, chevronStyle]}>›</Animated.Text>
    </Pressable>
  );
}

// --- screen ---

type HistoryItem =
  | { kind: 'meal'; data: Meal }
  | { kind: 'insulin'; data: InsulinLog };

type ListRow =
  | { type: 'today'; item: HistoryItem }
  | { type: 'day-header'; dateKey: string; label: string; count: number; expanded: boolean }
  | { type: 'day-item'; dateKey: string; item: HistoryItem };

export default function MealHistoryScreen() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const hasInitialized = useRef(false);

  const mergeItems = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    const [meals, insulinLogs] = await Promise.all([loadMeals(), loadInsulinLogs()]);

    const merged: HistoryItem[] = [
      ...meals.map(m => ({ kind: 'meal' as const, data: m })),
      ...insulinLogs.map(l => ({ kind: 'insulin' as const, data: l })),
    ].sort((a, b) =>
      new Date(b.data.loggedAt).getTime() - new Date(a.data.loggedAt).getTime()
    );

    // On first load, open the most recent past day
    if (!hasInitialized.current && merged.length > 0) {
      hasInitialized.current = true;
      const today = todayKey();
      const pastKeys = [...new Set(merged.map(i => localDateKey(i.data.loggedAt)))]
        .filter(k => k !== today)
        .sort((a, b) => b.localeCompare(a));
      if (pastKeys.length > 0) {
        setExpandedDays(new Set([pastKeys[0]]));
      }
    }

    setItems(merged);
    if (showSpinner) setLoading(false);
  }, []);

  const load = useCallback(() => mergeItems(true), [mergeItems]);
  const silentRefresh = useCallback(() => mergeItems(false), [mergeItems]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggleDay(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const listData = useMemo<ListRow[]>(() => {
    const today = todayKey();
    const dayMap = new Map<string, HistoryItem[]>();

    for (const item of items) {
      const key = localDateKey(item.data.loggedAt);
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key)!.push(item);
    }

    const sortedKeys = [...dayMap.keys()].sort((a, b) => b.localeCompare(a));
    const rows: ListRow[] = [];

    // Today's items — flat, no header
    for (const item of (dayMap.get(today) ?? [])) {
      rows.push({ type: 'today', item });
    }

    // Past days — collapsible
    for (const key of sortedKeys.filter(k => k !== today)) {
      const dayItems = dayMap.get(key)!;
      const expanded = expandedDays.has(key);
      rows.push({
        type: 'day-header',
        dateKey: key,
        label: formatDayLabel(key),
        count: dayItems.length,
        expanded,
      });
      if (expanded) {
        for (const item of dayItems) {
          rows.push({ type: 'day-item', dateKey: key, item });
        }
      }
    }

    return rows;
  }, [items, expandedDays]);

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
      data={listData}
      keyExtractor={row => {
        if (row.type === 'today') return `today_${row.item.kind}_${row.item.data.id}`;
        if (row.type === 'day-header') return `header_${row.dateKey}`;
        return `day_${row.dateKey}_${row.item.kind}_${row.item.data.id}`;
      }}
      contentContainerStyle={styles.list}
      renderItem={({ item: row }) => {
        if (row.type === 'day-header') {
          return (
            <DayHeader
              label={row.label}
              count={row.count}
              expanded={row.expanded}
              onToggle={() => toggleDay(row.dateKey)}
            />
          );
        }
        const item = row.item;
        return item.kind === 'meal'
          ? <MealCard meal={item.data} onRefresh={silentRefresh} />
          : <InsulinLogCard log={item.data} onRefresh={silentRefresh} />;
      }}
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
  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },

  // Day header
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 4,
  },
  dayHeaderLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayHeaderCount: {
    fontSize: 13,
    color: '#636366',
    marginRight: 10,
  },
  dayHeaderChevron: {
    fontSize: 20,
    color: '#636366',
    lineHeight: 22,
  },

  // Edit button (shared between meal + insulin cards)
  cardEditRow: {
    flexDirection: 'row',
    marginBottom: -4,
  },
  editBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  editBtnText: {
    fontSize: 13,
    color: '#636366',
  },

  // Meal card header
  mealHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  noPhoto: {
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoIcon: { fontSize: 24 },
  mealMeta: { flex: 1, gap: 3 },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  insulinBadge: {
    backgroundColor: '#0A1A3A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  insulinBadgeText: { fontSize: 12, fontWeight: '600', color: '#0A84FF' },
  mealDate: { fontSize: 12, color: '#636366' },
  carbEstimate: { fontSize: 12, color: '#636366' },
  startGlucoseRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  startGlucoseValue: { fontSize: 15, fontWeight: '700' },
  startGlucoseUnit: { fontSize: 12, color: '#8E8E93' },

  // Glucose stats
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
  statDelta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardDate: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  insulinSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insulinUnits: { fontSize: 16, color: '#8E8E93' },
  insulinUnitsValue: { fontSize: 28, fontWeight: '700' },
  insulinStartGlucose: { fontSize: 13, color: '#636366' },
});
