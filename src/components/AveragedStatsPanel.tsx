import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MatchSummary } from '../services/matching';

interface AveragedStatsPanelProps {
  summary: MatchSummary | null;
}

export function AveragedStatsPanel({ summary }: AveragedStatsPanelProps) {
  // Hidden if no summary or fewer than 2 matches (per CONTEXT.md Decision 5: >= 2 strict)
  if (!summary || summary.matches.length < 2) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>AVERAGED FROM {summary.matches.length} PAST SESSIONS</Text>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>AVG RISE</Text>
          <Text style={styles.statValue}>+{summary.avgRise.toFixed(1)}</Text>
          <Text style={styles.statUnit}>mmol/L</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>AVG PEAK</Text>
          <Text style={styles.statValue}>{summary.avgPeak.toFixed(1)}</Text>
          <Text style={styles.statUnit}>mmol/L</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>TIME TO PEAK</Text>
          <Text style={styles.statValue}>{summary.avgTimeToPeak}</Text>
          <Text style={styles.statUnit}>mins</Text>
        </View>
      </View>
      <Text style={styles.disclaimer}>Results may vary if multiple meals were eaten within the same 3-hour window.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  header: {
    fontSize: 10,
    color: '#636366',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: {
    fontSize: 9,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  statUnit: { fontSize: 9, color: '#636366' },
  disclaimer: {
    fontSize: 10,
    color: '#636366',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 14,
  },
});
