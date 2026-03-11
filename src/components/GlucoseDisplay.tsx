import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlucoseReading, trendArrow } from '../services/nightscout';

interface Props {
  reading: GlucoseReading;
}

function getGlucoseColor(mmol: number): string {
  if (mmol < 3.9) return '#FF3B30'; // low — red
  if (mmol > 10.0) return '#FF9500'; // high — orange
  return '#30D158';                  // in range — green
}

function formatAge(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

export default function GlucoseDisplay({ reading }: Props) {
  const color = getGlucoseColor(reading.mmol);

  return (
    <View style={styles.container}>
      <View style={styles.readingRow}>
        <Text style={[styles.value, { color }]}>
          {reading.mmol.toFixed(1)}
        </Text>
        <Text style={[styles.arrow, { color }]}>
          {trendArrow(reading.direction)}
        </Text>
      </View>
      <Text style={styles.unit}>mmol/L</Text>
      <Text style={[styles.age, reading.isStale && styles.stale]}>
        {reading.isStale ? '⚠ Stale — ' : ''}{formatAge(reading.date)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  value: {
    fontSize: 80,
    fontWeight: '700',
    lineHeight: 88,
  },
  arrow: {
    fontSize: 40,
    fontWeight: '600',
    marginBottom: 8,
  },
  unit: {
    fontSize: 18,
    color: '#8E8E93',
    marginTop: 4,
  },
  age: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  stale: {
    color: '#FF9500',
  },
});
