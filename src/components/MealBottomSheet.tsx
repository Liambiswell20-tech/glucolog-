import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SessionWithMeals } from '../services/storage';
import { classifyOutcome } from '../utils/outcomeClassifier';
import { glucoseColor } from '../utils/glucoseColor';
import { formatDate } from '../utils/formatDate';
import { GlucoseChart } from './GlucoseChart';
import { OutcomeBadge } from './OutcomeBadge';
import { SafetyDisclaimer } from './SafetyDisclaimer';
import type { MealBottomSheetProps } from './types';

export function MealBottomSheet({ sessions, visible, onClose }: MealBottomSheetProps) {
  const [activeTab, setActiveTab] = useState(0);

  // Reset to first tab whenever sheet opens with a new set of sessions
  const safeActiveTab = activeTab < sessions.length ? activeTab : 0;
  const activeSession = sessions[safeActiveTab] ?? null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Content area — scrollable per session */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {activeSession && (
            <SessionDetail session={activeSession} />
          )}
        </ScrollView>

        {/* Tab strip — at BOTTOM, above SafetyDisclaimer (per CONTEXT.md Decision 6) */}
        {sessions.length > 1 && (
          <View style={styles.tabStrip}>
            {sessions.map((s, i) => (
              <Pressable
                key={s.id}
                style={[styles.tab, safeActiveTab === i && styles.tabActive]}
                onPress={() => setActiveTab(i)}
              >
                <Text style={[styles.tabText, safeActiveTab === i && styles.tabTextActive]}>
                  {new Date(s.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* SafetyDisclaimer always at bottom */}
        <SafetyDisclaimer />
      </View>
    </Modal>
  );
}

function SessionDetail({ session }: { session: SessionWithMeals }) {
  const badge = classifyOutcome(session.glucoseResponse);
  const totalInsulin = session.meals.reduce((sum, m) => sum + m.insulinUnits, 0);

  return (
    <View style={styles.sessionDetail}>
      {/* Session name + date */}
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionName} numberOfLines={2}>
          {session.meals.map(m => m.name).join(' + ')}
        </Text>
        <Text style={styles.sessionDate}>{formatDate(session.startedAt)}</Text>
      </View>

      {/* Insulin total */}
      {totalInsulin > 0 && (
        <Text style={styles.insulinText}>{totalInsulin}u insulin</Text>
      )}

      {/* Outcome badge */}
      <View style={styles.badgeRow}>
        <OutcomeBadge badge={badge} size="default" />
      </View>

      {/* Glucose stats + chart — only if response exists */}
      {session.glucoseResponse && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>START</Text>
              <Text style={[styles.statValue, { color: glucoseColor(session.glucoseResponse.startGlucose) }]}>
                {session.glucoseResponse.startGlucose.toFixed(1)}
              </Text>
              <Text style={styles.statUnit}>mmol/L</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>PEAK</Text>
              <Text style={[styles.statValue, { color: glucoseColor(session.glucoseResponse.peakGlucose) }]}>
                {session.glucoseResponse.peakGlucose.toFixed(1)}
              </Text>
              <Text style={styles.statUnit}>mmol/L</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>{session.glucoseResponse.isPartial ? 'NOW' : '3HR'}</Text>
              <Text style={[styles.statValue, { color: glucoseColor(session.glucoseResponse.endGlucose) }]}>
                {session.glucoseResponse.endGlucose.toFixed(1)}
              </Text>
              <Text style={styles.statUnit}>mmol/L</Text>
            </View>
          </View>

          {/* Lazy render: only active tab mounts GlucoseChart (per CONTEXT.md Decision 6) */}
          {session.glucoseResponse.readings.length >= 2 && (
            <GlucoseChart response={session.glucoseResponse} height={140} />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: 200,
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
  },
  tabActive: {
    backgroundColor: '#0A84FF',
  },
  tabText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sessionDetail: {
    gap: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  sessionHeader: {
    gap: 4,
  },
  sessionName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sessionDate: {
    fontSize: 12,
    color: '#636366',
  },
  insulinText: {
    fontSize: 14,
    color: '#0A84FF',
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    paddingVertical: 10,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  statUnit: {
    fontSize: 10,
    color: '#636366',
  },
});
