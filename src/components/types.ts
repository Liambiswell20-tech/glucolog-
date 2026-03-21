// src/components/types.ts
// Phase 2 component prop contracts.
// MatchingSlotProps is the Phase 3 wire-in point — do not change this interface in Phase 3,
// only provide real data instead of null.

import type { GlucoseResponse, Meal, SessionWithMeals } from '../services/storage';
import type { OutcomeBadge } from '../utils/outcomeClassifier';

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
// Phase 3 wire-in point. In Phase 2, matchData is always null — the component renders
// a greyed-out "Loading..." placeholder (per D-09). Phase 3 passes real match data here.
export interface MatchingSlotProps {
  matchData: null;  // Phase 3 will widen this type: null | MatchResult[]
}

// ---- ExpandableCard ----
// A meal card that can be tapped to expand/collapse.
// Expanded state shows: stats row (start/peak/end mmol/L) + GlucoseChart + MatchingSlot placeholder.
// Per D-04: uses LayoutAnimation.easeInEaseOut. Per D-05: shows stats row + chart.
// Per D-09: matching slot shows greyed-out "Loading..." in Phase 2.
export interface ExpandableCardProps {
  meal: Meal;
  onRefresh: () => void;     // called after curve fetch to trigger list reload
  matchingSlot: MatchingSlotProps;  // always { matchData: null } in Phase 2
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
