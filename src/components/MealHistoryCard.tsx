import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { classifyOutcome } from '../utils/outcomeClassifier';
import { glucoseColor } from '../utils/glucoseColor';
import { formatDate } from '../utils/formatDate';
import { OutcomeBadge } from './OutcomeBadge';
import type { MealHistoryCardProps } from './types';

export function MealHistoryCard({ meal, onPress }: MealHistoryCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const badge = classifyOutcome(meal.glucoseResponse);

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

      {/* Tappable header — calls onPress to open MealBottomSheet */}
      <Pressable onPress={onPress} style={styles.mealHeader}>
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
});
