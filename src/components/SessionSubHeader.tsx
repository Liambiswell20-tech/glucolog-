/**
 * SessionSubHeader — Phase J (Session Grouping Spec Section 8.1)
 *
 * Updated from simple "Session — X meals" to spec-compliant session row:
 * "Eaten alongside other food · total [X]g carbs · peak [Y] at [HH:MM]"
 *
 * Supports both V1 props (mealCount + startedAt) and V2 props (with totals).
 * Falls back to V1 format when V2 data is absent (rollback safe).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SessionSubHeaderProps } from './types';
import { formatSessionRowText } from './MealChips';
import { COLORS, FONTS } from '../theme';

export function SessionSubHeader({
  mealCount,
  startedAt,
  totalCarbs,
  peakGlucose,
  peakTime,
}: SessionSubHeaderProps) {
  // V2: spec-compliant session row
  const hasV2Data = totalCarbs != null || peakGlucose != null;
  const text = hasV2Data
    ? formatSessionRowText({ totalCarbs: totalCarbs ?? null, peakGlucose: peakGlucose ?? null, peakTime: peakTime ?? null })
    : `Eaten alongside other food \u00B7 ${mealCount} meals`;

  return (
    <View style={styles.container}>
      <View style={styles.accentBar} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: -8,
    gap: 8,
  },
  accentBar: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: COLORS.blue,
  },
  text: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
    fontFamily: FONTS.regular,
    letterSpacing: 0.3,
    flex: 1,
  },
});
