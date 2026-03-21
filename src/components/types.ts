// src/components/types.ts
// Phase 2 component prop contracts.
// Phase 3 wire-in: MatchingSlotProps.matchData widened to null | MatchSummary.

import type { GlucoseResponse, Meal, SessionWithMeals } from '../services/storage';
import type { OutcomeBadge } from '../utils/outcomeClassifier';
import type { MatchSummary } from '../services/matching';

// ---- GlucoseChart ----
// Renders a static 3-hour glucose curve line chart with reference lines at 3.9 and 10.0 mmol/L.
// Per D-01: uses react-native-gifted-charts. Per D-02: shows reference lines. Per D-03: no tap interaction.
export interface GlucoseChartProps {
  response: GlucoseResponse;  // provides readings[], isPartial
  height?: number;            // defaults to 120
}

// ---- OutcomeBadge ----
// Renders a coloured pill badge based on outcome classification.
// Per D-08: badge is per meal card, not session-level.
export interface OutcomeBadgeProps {
  badge: OutcomeBadge;       // pre-classified by caller using classifyOutcome()
  size?: 'small' | 'default'; // 'default' used in expanded cards, 'small' on collapsed cards
}

// ---- MatchingSlotProps ----
// Phase 3 wire-in: matchData carries real match data from findSimilarSessions.
// null = no matches computed yet (legacy meals without sessionId, or session not found).
export interface MatchingSlotProps {
  matchData: null | MatchSummary;
}

// ---- ExpandableCard ----
// A meal card that can be tapped to expand/collapse.
// Expanded state shows: stats row (start/peak/end mmol/L) + GlucoseChart + MatchingSlot.
// Per D-04: uses LayoutAnimation.easeInEaseOut. Per D-05: shows stats row + chart.
// Phase 3: matching slot computes real match data on first expand via allSessions.
export interface ExpandableCardProps {
  meal: Meal;
  onRefresh: () => void;         // called after curve fetch to trigger list reload
  matchingSlot: MatchingSlotProps;
  allSessions: SessionWithMeals[]; // passed from MealHistoryScreen for matching computation
}

// ---- DayGroupHeader ----
// Tappable header that collapses/expands a day's entries.
// Count reflects total entries (meals + insulin logs) for that day.
export interface DayGroupHeaderProps {
  label: string;    // e.g. "Wednesday 18 March"
  count: number;    // total entries in this day group
  expanded: boolean;
  onToggle: () => void;
}

// ---- SessionSubHeader ----
// Sub-header shown inside a day group when a session contains 2+ meals (per D-07).
// Format: "Session — X meals, H:MM PM"
// Only rendered when mealCount >= 2 (per D-07); solo meals show no sub-header (per D-07).
export interface SessionSubHeaderProps {
  mealCount: number;     // shown as "X meals"
  startedAt: string;     // ISO — formatted as H:MM PM
}
