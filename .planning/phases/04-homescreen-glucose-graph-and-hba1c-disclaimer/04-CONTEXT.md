# Phase 4: Session Grouping, Pattern Recall & HomeScreen Redesign - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** PRD Express Path (user-provided spec)

<domain>
## Phase Boundary

This phase delivers:
1. **Utility extractions** — `formatDate()` pulled from inline usage, `glucoseToArcAngle()` pure function
2. **Theme system** — `src/theme.ts` with canonical colors and fonts
3. **New reusable components** — `SafetyDisclaimer`, `AveragedStatsPanel`, `MealBottomSheet`
4. **Renamed component** — `ExpandableCard` → `MealHistoryCard` (tap-to-open-sheet, no expand/collapse)
5. **Storage hardening** — try/catch wrapping ALL `AsyncStorage.getItem` calls
6. **Screen updates** — `MealHistoryScreen`, `MealLogScreen`, `HomeScreen` wired to new components
7. **Font loading** — `expo-font` with Outfit + JetBrains Mono, splash screen gating
8. **Unit tests** for all new utilities and components

</domain>

<decisions>
## Implementation Decisions

### 1. formatDate Utility
- Extract `formatDate()` from `src/components/ExpandableCard.tsx` ~line 30
- Same signature, same locale as existing inline copy
- Write to `src/utils/formatDate.ts`
- Delete inline copy from ExpandableCard after extraction

### 2. glucoseToArcAngle Utility
- File: `src/utils/glucoseToArcAngle.ts`
- Signature: `glucoseToArcAngle(mmol: number | null): number | null`
- Clamp input to [2.0, 20.0] mmol/L
- Map to 270-degree arc: -135° to +135°
- Return null on null/NaN input

### 3. Theme System
- File: `src/theme.ts`
- Export `COLORS`: background `#050706`, surface, text, green, amber, red
- Export `FONTS`: Outfit family weights, JetBrains Mono
- HomeScreen adopts immediately; other screens adopt incrementally

### 4. SafetyDisclaimer Component
- File: `src/components/SafetyDisclaimer.tsx`
- No props
- Disclaimer text is a **hardcoded module-level constant** (never a prop)
- Renders disclaimer at small size in muted color

### 5. AveragedStatsPanel Component
- File: `src/components/AveragedStatsPanel.tsx`
- Accepts `summary: MatchSummary | null`
- **Hidden if `!summary || summary.matches.length < 2`** (not 1, not 0 — must be ≥ 2)
- Shows `avgRise`, `avgPeak`, `avgTimeToPeak` in stat row matching ExpandableCard style

### 6. MealBottomSheet Component
- File: `src/components/MealBottomSheet.tsx`
- Implementation: React Native `Modal` (animationType="slide", transparent, backdrop dismiss)
- **No** `@gorhom/bottom-sheet` — use built-in Modal
- Props: `sessions: SessionWithMeals[]` (already capped to 10 by caller), `visible`, `onClose`
- Tab strip at **BOTTOM** of sheet, above SafetyDisclaimer (not top)
- **Lazy render**: only active tab mounts its GlucoseChart
- Error state if sessions fails to load
- Drag handle at top
- **Silent (no sheet)** if 0 past instances found on tap

### 7. MealHistoryCard (renamed from ExpandableCard)
- Rename `src/components/ExpandableCard.tsx` → `src/components/MealHistoryCard.tsx`
- **Remove** expand/collapse state and expanded content block
- Tap card → call `onPress` prop (caller opens bottom sheet)
- Keep all existing card UI: thumbnail, name, badge, date, carbs, glucose

### 8. Storage Hardening
- File: `src/services/storage.ts`
- Wrap ALL `AsyncStorage.getItem` calls in try/catch (not just JSON.parse)
- Pattern:
  ```ts
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    console.warn('[storage] getItem failed', KEY);
    return [];
  }
  ```

### 9. MealHistoryScreen Updates
- Update import: `ExpandableCard` → `MealHistoryCard`
- Pass `onPress` to open `MealBottomSheet` with matching sessions
- Call `findSimilarSessions` on card tap, pass result sessions capped at 10

### 10. MealLogScreen Updates
- Add `AveragedStatsPanel` above existing live match rows
- Pass `MatchSummary` from the live match result (already has avgRise/avgPeak/avgTimeToPeak)

### 11. HomeScreen Full Redesign
- Background: `#050706` (from theme.ts)
- Fonts: Outfit for text, JetBrains Mono for glucose numbers
- Arc gauge via `react-native-svg` + `glucoseToArcAngle()`
- Pulsing LIVE indicator: `Animated.loop`
- Staggered entrance animations for cards: `Animated.stagger`
- SVG icons replacing emoji
- Null/loading state: render "– –" in arc gauge center

### 12. Font Loading (App.tsx)
- Add `expo-font` font loading via `useFonts`:
  - `Outfit_400Regular`
  - `Outfit_600SemiBold`
  - `JetBrainsMono_400Regular`
- Call `SplashScreen.preventAutoHideAsync()` on app init
- Release splash after fonts ready OR 5s timeout (whichever comes first)

### 13. Unit Tests
- `glucoseToArcAngle`: clamp low, clamp high, null, in-range
- `AveragedStatsPanel`: hidden < 2 matches, shown ≥ 2
- `MealBottomSheet`: not shown if 0 instances, max 10 tabs
- `SafetyDisclaimer`: text matches constant
- `formatDate`: output format
- `storage.ts` getItem catch: returns safe default

### Claude's Discretion
- File organization within `src/utils/` and `src/components/`
- SVG icon choices for HomeScreen
- Specific color values for surface, text, green, amber, red in theme.ts (background is locked: #050706)
- Tab strip visual style in MealBottomSheet
- Drag handle visual implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Dependencies
- `.planning/phases/02-history-refactor-and-core-ux-components/` — GlucoseChart, ExpandableCard, OutcomeBadge, DayGroupHeader implementations
- `.planning/phases/03-intelligence-layer-matching-and-outcome-surfacing/` — MatchSummary type, findSimilarSessions, SessionWithMeals

### Source Files to Read Before Modifying
- `src/components/ExpandableCard.tsx` — source for formatDate extraction and rename
- `src/services/storage.ts` — all getItem patterns to harden
- `src/screens/HomeScreen.tsx` — current state before redesign
- `src/screens/MealHistoryScreen.tsx` — current ExpandableCard usage
- `src/screens/MealLogScreen.tsx` — live match result shape
- `src/types/index.ts` or equivalent — SessionWithMeals, MatchSummary types
- `App.tsx` — current font/splash setup

### Project Planning
- `.planning/REQUIREMENTS.md` — HOME-01, HOME-02, HOME-03, HIST-04
- `.planning/ROADMAP.md` — Phase 4 success criteria

</canonical_refs>

<specifics>
## Specific Ideas

- Arc gauge sweep: exactly 270 degrees (-135° to +135°)
- Glucose range for arc: 2.0–20.0 mmol/L (clamped)
- Tab strip placement: BOTTOM of sheet, above SafetyDisclaimer
- Bottom sheet: lazy render (only active tab mounts GlucoseChart)
- AveragedStatsPanel threshold: ≥ 2 matches (strict greater-than-1)
- Bottom sheet session cap: 10 (capped by caller before passing)
- Font timeout: 5 seconds max before splash releases regardless
- No new dependencies beyond expo-font (Modal replaces @gorhom/bottom-sheet if applicable)

</specifics>

<deferred>
## Deferred Ideas

- Other screens adopting theme.ts (incremental — not in this phase)
- HbA1c disclaimer modal (from original Phase 4 roadmap goal — superseded by this expanded scope)
- Full glucose graph on HomeScreen tap (from original Phase 4 roadmap goal — replaced by arc gauge)

</deferred>

---

*Phase: 04-homescreen-glucose-graph-and-hba1c-disclaimer*
*Context gathered: 2026-03-24 via PRD Express Path*
