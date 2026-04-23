/**
 * PatternView — Phase K (Session Grouping Spec Section 8.4, 8.5)
 *
 * Clean, readable pattern history for a meal being logged.
 * Shows each past instance as its own row — no grouped averages.
 * Tap a row to expand inline showing glucose chart + full stats.
 *
 * Priority: solo meals first. Session meals shown only when
 * no solo matches exist ("Eaten with other foods").
 *
 * All copy is history-only. Zero predictive language.
 */

import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  PatternResult,
  PatternInstance,
  SessionPatternInstance,
  PatternSummary,
  PatternDisplayMode,
} from '../services/patternMatching';
import { OutcomeBadge } from './OutcomeBadge';
import { GlucoseChart } from './GlucoseChart';
import { glucoseColor } from '../utils/glucoseColor';
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

export function getPatternHeaderText(
  _matchingKey: string,
  displayMode: PatternDisplayMode,
  count: number,
): string | null {
  if (displayMode === 'empty') return null;
  if (count === 1) return 'Eaten 1 time before';
  return `Eaten ${count} times before`;
}

export function formatSummaryText(summary: PatternSummary): string {
  const parts: string[] = [];
  const [dMin, dMax] = summary.doseRange;
  parts.push(dMin === dMax ? `${dMin}u` : `${dMin}\u2013${dMax}u`);
  const [pMin, pMax] = summary.peakRange;
  if (pMin > 0 || pMax > 0) {
    const peakStr =
      pMin === pMax
        ? `peak ${pMin.toFixed(1)}`
        : `peak ${pMin.toFixed(1)}\u2013${pMax.toFixed(1)}`;
    parts.push(peakStr);
  }
  const outcomeText = formatOutcomeFrequency(
    summary.outcomeFrequency,
    summary.count,
  );
  parts.push(outcomeText);
  return parts.join(' \u00B7 ');
}

export function formatOutcomeFrequency(
  frequency: Record<string, number>,
  total: number,
): string {
  const inRange = frequency['GREEN'] ?? 0;
  return `${inRange} of ${total} ended in range`;
}

export function getSessionSectionHeader(sessionCount: number): string {
  return `Also eaten with other foods (${sessionCount} times)`;
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
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);

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
    solo.instances.length,
  );

  // Show session section only when there are no solo instances
  const showSession = session && solo.instances.length === 0;

  function handleRowTap(instance: PatternInstance) {
    // Toggle expand/collapse
    setExpandedMealId(prev =>
      prev === instance.mealId ? null : instance.mealId,
    );
    onInstanceTap?.(instance.mealId);
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      {header && <Text style={styles.header}>{header}</Text>}

      {/* Instance rows — one per past meal, newest first */}
      {solo.instances.map((instance, index) => (
        <View key={instance.mealId}>
          <Pressable
            style={[styles.instanceRow, index > 0 && styles.instanceDivider]}
            onPress={() => handleRowTap(instance)}
          >
            <InstanceRow
              instance={instance}
              isExpanded={expandedMealId === instance.mealId}
            />
          </Pressable>
          {expandedMealId === instance.mealId && (
            <InstanceDetail instance={instance} />
          )}
        </View>
      ))}

      {/* Session section — only when no solo matches */}
      {showSession && (
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

      {/* Info sheet — tap on header */}
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
// Instance row — clean, one meal per row
// ---------------------------------------------------------------------------

function InstanceRow({
  instance,
  isExpanded,
}: {
  instance: PatternInstance;
  isExpanded: boolean;
}) {
  const dateStr = new Date(instance.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <View style={styles.rowContent}>
      {/* Meal name — large and clear */}
      <View style={styles.rowNameLine}>
        <Text style={styles.rowName} numberOfLines={1}>
          {instance.mealName}
        </Text>
        <Text style={styles.chevron}>{isExpanded ? '\u25B2' : '\u25BC'}</Text>
      </View>

      {/* Stats line — date, dose, carbs, peak */}
      <View style={styles.rowStats}>
        <Text style={styles.rowDate}>{dateStr}</Text>
        <Text style={styles.rowDot}>{'\u00B7'}</Text>
        <Text style={styles.rowStat}>{instance.insulinUnits}u</Text>
        {instance.carbs != null && (
          <>
            <Text style={styles.rowDot}>{'\u00B7'}</Text>
            <Text style={styles.rowStat}>
              {instance.carbs}g
              {instance.isAiEstimate && (
                <Text style={styles.aiLabel}> AI est.</Text>
              )}
            </Text>
          </>
        )}
        {instance.peakGlucose != null && (
          <>
            <Text style={styles.rowDot}>{'\u00B7'}</Text>
            <Text style={styles.rowStat}>
              peak {instance.peakGlucose.toFixed(1)}
            </Text>
          </>
        )}
      </View>

      {/* Outcome badge + session tag */}
      <View style={styles.rowBadge}>
        <OutcomeBadge badge={instance.outcome} size="small" />
        {instance.isSessionMember && instance.sessionMealCount != null && (
          <View style={styles.sessionTag}>
            <Text style={styles.sessionTagText}>
              Session ({instance.sessionMealCount} meals)
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Instance detail — expanded view with glucose chart
// ---------------------------------------------------------------------------

function InstanceDetail({ instance }: { instance: PatternInstance }) {
  const gr = instance.glucoseResponse;

  if (!gr) {
    return (
      <View style={styles.detailContainer}>
        <Text style={styles.detailNoData}>No glucose curve available</Text>
      </View>
    );
  }

  return (
    <View style={styles.detailContainer}>
      {/* Stats row: start, peak, 3hr */}
      <View style={styles.detailStats}>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatLabel}>START</Text>
          <Text
            style={[
              styles.detailStatValue,
              { color: glucoseColor(gr.startGlucose) },
            ]}
          >
            {gr.startGlucose.toFixed(1)}
          </Text>
        </View>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatLabel}>PEAK</Text>
          <Text
            style={[
              styles.detailStatValue,
              { color: glucoseColor(gr.peakGlucose) },
            ]}
          >
            {gr.peakGlucose.toFixed(1)}
          </Text>
        </View>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatLabel}>3HR</Text>
          <Text
            style={[
              styles.detailStatValue,
              { color: glucoseColor(gr.endGlucose) },
            ]}
          >
            {gr.endGlucose.toFixed(1)}
          </Text>
        </View>
        {gr.timeToPeakMins != null && (
          <View style={styles.detailStat}>
            <Text style={styles.detailStatLabel}>TIME TO PEAK</Text>
            <Text style={styles.detailStatValue}>{gr.timeToPeakMins}m</Text>
          </View>
        )}
      </View>

      {/* Glucose chart */}
      {gr.readings.length >= 2 && (
        <GlucoseChart response={gr} height={120} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session instance row
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
      <View style={styles.rowStats}>
        <Text style={styles.rowDate}>{dateStr}</Text>
        <Text style={styles.rowDot}>{'\u00B7'}</Text>
        <Text style={styles.rowStat}>{instance.mealCount} meals</Text>
        <Text style={styles.rowDot}>{'\u00B7'}</Text>
        <Text style={styles.rowStat}>{instance.totalInsulin}u</Text>
        {instance.peakGlucose != null && (
          <>
            <Text style={styles.rowDot}>{'\u00B7'}</Text>
            <Text style={styles.rowStat}>
              peak {instance.peakGlucose.toFixed(1)}
            </Text>
          </>
        )}
      </View>
      <View style={styles.rowBadge}>
        <OutcomeBadge badge={instance.outcome} size="small" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — clean, bold, readable
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: FONTS.semiBold,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  instanceRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  instanceDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  rowContent: {
    gap: 4,
  },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: FONTS.semiBold,
    fontWeight: '600',
    flex: 1,
  },
  chevron: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginLeft: 8,
  },
  rowStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  rowDate: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  rowDot: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  rowStat: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  aiLabel: {
    fontSize: 11,
    color: '#0A84FF',
    fontFamily: FONTS.regular,
  },
  rowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  sessionTag: {
    backgroundColor: '#2C2C2E',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sessionTagText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  // Detail expanded view
  detailContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  detailNoData: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingVertical: 8,
  },
  detailStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    paddingVertical: 10,
  },
  detailStat: {
    alignItems: 'center',
    flex: 1,
  },
  detailStatLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Session section
  sessionSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  sessionHeader: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  // Info modal
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
