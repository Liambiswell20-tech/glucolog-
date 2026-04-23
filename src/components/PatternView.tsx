/**
 * PatternView — Phase K (Session Grouping Spec Section 8.4, 8.5)
 *
 * Renders pattern data for a meal being logged. Three N-threshold states:
 *   - N=0: "No history for this meal yet."
 *   - N=1-2: Per-instance rows (date, dose, carbs, peak, time-to-peak, outcome)
 *   - N≥3: Summary row + last 10 instance rows
 *
 * Session pattern section shown when N≥3 sessions contain the same matching_key.
 * MEDIUM-confidence solo meals shown muted. LOW excluded (by patternMatching.ts).
 *
 * All copy is history-only. Zero predictive language.
 */

import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  PatternResult,
  SoloPatternResult,
  SessionPatternResult,
  PatternInstance,
  SessionPatternInstance,
  PatternSummary,
  PatternDisplayMode,
} from '../services/patternMatching';
import { OutcomeBadge } from './OutcomeBadge';
import { COLORS, FONTS } from '../theme';

// ---------------------------------------------------------------------------
// Copy constants — all history-only, zero predictive language (Section 7.3)
// ---------------------------------------------------------------------------

export const PATTERN_COPY = {
  emptyState: 'No history for this meal yet.',
  summaryInfoTitle: 'About this data',
  summaryInfoBody:
    'These numbers are from your past meals with this name. They show what happened, not what will happen. Every meal is different.',
} as const;

// ---------------------------------------------------------------------------
// Pure display logic functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Header text for the solo pattern section — Section 8.4.
 * Returns null for empty display mode (no header shown).
 */
export function getPatternHeaderText(
  _matchingKey: string,
  displayMode: PatternDisplayMode,
  count: number,
): string | null {
  if (displayMode === 'empty') return null;
  return `Past meals \u2014 ${count} logged`;
}

/**
 * Summary row text for N≥3 — Section 8.4.
 * Shows count, dose range, peak range, and outcome frequency.
 */
export function formatSummaryText(summary: PatternSummary): string {
  const parts: string[] = [];

  // Dose range
  const [dMin, dMax] = summary.doseRange;
  parts.push(dMin === dMax ? `${dMin}u` : `${dMin}\u2013${dMax}u`);

  // Peak range
  const [pMin, pMax] = summary.peakRange;
  if (pMin > 0 || pMax > 0) {
    const peakStr =
      pMin === pMax
        ? `peak ${pMin.toFixed(1)}`
        : `peak ${pMin.toFixed(1)}\u2013${pMax.toFixed(1)}`;
    parts.push(peakStr);
  }

  // Outcome frequency
  const outcomeText = formatOutcomeFrequency(
    summary.outcomeFrequency,
    summary.count,
  );
  parts.push(outcomeText);

  return parts.join(' \u00B7 ');
}

/**
 * Outcome frequency text — "X of N ended in range" (Section 8.4).
 */
export function formatOutcomeFrequency(
  frequency: Record<string, number>,
  total: number,
): string {
  const inRange = frequency['GREEN'] ?? 0;
  return `${inRange} of ${total} ended in range`;
}

/**
 * Session pattern section header — Section 8.4.
 */
export function getSessionSectionHeader(sessionCount: number): string {
  return `Eaten alongside other food (${sessionCount} sessions)`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PatternViewProps {
  result: PatternResult | null;
  onInstanceTap?: (mealId: string) => void;
}

export function PatternView({ result, onInstanceTap }: PatternViewProps) {
  const [showSummaryInfo, setShowSummaryInfo] = useState(false);

  if (!result) return null;

  const { solo, session } = result;

  // N=0 empty state
  if (solo.displayMode === 'empty') {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>{PATTERN_COPY.emptyState}</Text>
      </View>
    );
  }

  const header = getPatternHeaderText(
    solo.matchingKey,
    solo.displayMode,
    solo.highConfidenceCount,
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      {header && <Text style={styles.header}>{header}</Text>}

      {/* Summary row — N≥3 only (Section 8.4) */}
      {solo.displayMode === 'summary' && solo.summary && (
        <Pressable
          style={styles.summaryRow}
          onPress={() => setShowSummaryInfo(true)}
        >
          <Text style={styles.summaryText}>
            {formatSummaryText(solo.summary)}
          </Text>
        </Pressable>
      )}

      {/* Instance rows — recency order, newest first */}
      {solo.instances.map((instance, index) => (
        <Pressable
          key={instance.mealId}
          style={[styles.instanceRow, index > 0 && styles.instanceDivider]}
          onPress={() => onInstanceTap?.(instance.mealId)}
        >
          <InstanceRow instance={instance} />
        </Pressable>
      ))}

      {/* Session pattern section — N≥3 sessions (Section 8.4) */}
      {session && (
        <View style={styles.sessionSection}>
          <Text style={styles.sessionHeader}>
            {getSessionSectionHeader(session.sessionCount)}
          </Text>
          {session.instances.map((inst, index) => (
            <View
              key={inst.sessionId}
              style={[
                styles.instanceRow,
                index > 0 && styles.instanceDivider,
              ]}
            >
              <SessionInstanceRow instance={inst} />
            </View>
          ))}
        </View>
      )}

      {/* Summary info sheet — tap on summary row (Section 8.4) */}
      <Modal
        visible={showSummaryInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSummaryInfo(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowSummaryInfo(false)}
        >
          <View style={styles.infoSheet}>
            <Text style={styles.infoTitle}>
              {PATTERN_COPY.summaryInfoTitle}
            </Text>
            <Text style={styles.infoBody}>
              {PATTERN_COPY.summaryInfoBody}
            </Text>
            <Pressable
              style={styles.infoClose}
              onPress={() => setShowSummaryInfo(false)}
            >
              <Text style={styles.infoCloseText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Instance row — solo meal (Section 8.4)
// ---------------------------------------------------------------------------

function InstanceRow({ instance }: { instance: PatternInstance }) {
  const dateStr = new Date(instance.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <View style={[styles.rowContent, instance.isMuted && styles.rowMuted]}>
      <View style={styles.rowTop}>
        <Text
          style={[styles.rowDate, instance.isMuted && styles.textMuted]}
        >
          {dateStr}
        </Text>
        <Text
          style={[styles.rowStat, instance.isMuted && styles.textMuted]}
        >
          {instance.insulinUnits}u
        </Text>
        {instance.carbs != null && (
          <Text
            style={[styles.rowStat, instance.isMuted && styles.textMuted]}
          >
            {instance.carbs}g
          </Text>
        )}
        {instance.peakGlucose != null && (
          <Text
            style={[styles.rowStat, instance.isMuted && styles.textMuted]}
          >
            peak {instance.peakGlucose.toFixed(1)}
          </Text>
        )}
        {instance.timeToPeakMins != null && (
          <Text
            style={[styles.rowStatSmall, instance.isMuted && styles.textMuted]}
          >
            {instance.timeToPeakMins}min
          </Text>
        )}
      </View>
      <View style={styles.rowBottom}>
        <OutcomeBadge badge={instance.outcome} size="small" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session instance row — Section 8.4
// ---------------------------------------------------------------------------

function SessionInstanceRow({
  instance,
}: {
  instance: SessionPatternInstance;
}) {
  const dateStr = new Date(instance.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <View style={styles.rowContent}>
      <View style={styles.rowTop}>
        <Text style={styles.rowDate}>{dateStr}</Text>
        <Text style={styles.rowStat}>
          {instance.mealCount} meals
        </Text>
        <Text style={styles.rowStat}>{instance.totalInsulin}u</Text>
        {instance.totalCarbs != null && (
          <Text style={styles.rowStat}>{instance.totalCarbs}g</Text>
        )}
        {instance.peakGlucose != null && (
          <Text style={styles.rowStat}>
            peak {instance.peakGlucose.toFixed(1)}
          </Text>
        )}
      </View>
      <View style={styles.rowBottom}>
        <OutcomeBadge badge={instance.outcome} size="small" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  summaryRow: {
    backgroundColor: COLORS.surfaceRaised,
    marginHorizontal: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  instanceRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  instanceDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  rowContent: {
    gap: 4,
  },
  rowMuted: {
    opacity: 0.5,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  rowDate: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    flex: 1,
    minWidth: 80,
  },
  rowStat: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  rowStatSmall: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
  },
  textMuted: {
    color: COLORS.textMuted,
  },
  sessionSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  sessionHeader: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  infoSheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    gap: 12,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
  },
  infoBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  infoClose: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceRaised,
    marginTop: 4,
  },
  infoCloseText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    fontFamily: FONTS.semiBold,
  },
});
