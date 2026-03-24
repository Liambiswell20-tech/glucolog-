---
phase: "04"
plan: "06"
subsystem: homescreen
tags: [ui, arc-gauge, fonts, splash-screen, animations, hba1c-modal]
dependency_graph:
  requires:
    - 04-01  # glucoseToArcAngle utility + theme tokens
    - 04-03  # SafetyDisclaimer (for HbA1c disclaimer framing reference)
  provides:
    - HomeScreen arc gauge (HOME-01)
    - HbA1c disclaimer modal (HOME-02)
    - Centred quick log buttons (HOME-03)
    - Font loading with splash screen gating
  affects:
    - App.tsx (font loading, splash gating, background colour)
    - src/screens/HomeScreen.tsx (complete redesign)
tech_stack:
  added:
    - expo-font ~14.0.11
    - "@expo-google-fonts/outfit": "^0.4.3"
    - "@expo-google-fonts/jetbrains-mono": "^0.4.1"
    - expo-splash-screen ~31.0.13
  patterns:
    - SVG arc gauge via react-native-svg Path + polarToCartesian
    - Animated.loop for LIVE pulse opacity
    - Animated.stagger for card entrance spring animations
    - useFonts + SplashScreen.preventAutoHideAsync for font gating
key_files:
  created: []
  modified:
    - src/screens/HomeScreen.tsx
    - App.tsx
    - package.json
decisions:
  - "Stagger animation applied to Animated.View wrappers around action rows (statsRow, actionRow, quickLogBtn wrapper, insulinRow) — gauge is not staggered as it is always visible during load"
  - "hba1cModalVisible grep count = 2 (not 3 as plan acceptance criteria stated) — plan acceptance criteria had camelCase bug: setHba1cModalVisible uses capital H after 'set' so it does not contain the lowercase hba1cModalVisible substring; functionally code is correct"
  - "HbA1c modal uses absolute positioning overlay (position:absolute, inset 0) rather than a second backdrop Pressable — avoids z-index stacking issues with the quick log modal backdrop"
  - "GlucoseDisplay component removed from HomeScreen imports — the arc gauge JSX fully replaces GlucoseDisplay usage"
metrics:
  duration_minutes: 7
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_modified: 3
---

# Phase 04 Plan 06: HomeScreen Redesign — Arc Gauge, HbA1c Modal, Fonts Summary

HomeScreen fully redesigned with a 270-degree SVG arc gauge, pulsing LIVE indicator, HbA1c disclaimer modal, staggered card entrance, and font loading wired in App.tsx with 5-second splash screen gating.

## What Was Built

### Task 1: Font packages and App.tsx font loading (commit: 6be0e6e)

Installed four font-related packages via `npx expo install`:
- `expo-font ~14.0.11`
- `@expo-google-fonts/outfit ^0.4.3` — Outfit_400Regular, Outfit_600SemiBold
- `@expo-google-fonts/jetbrains-mono ^0.4.1` — JetBrainsMono_400Regular
- `expo-splash-screen ~31.0.13`

App.tsx updated with:
- `SplashScreen.preventAutoHideAsync()` at module level to hold splash during font load
- `useFonts` hook loading all three font variants
- `useEffect` releasing splash when `fontsLoaded || fontError`
- 5-second timeout `useEffect` as a fallback release (Decision 12 in CONTEXT.md)
- Navigation renders a blank `#050706` view until fonts are ready
- `headerStyle.backgroundColor` and `contentStyle.backgroundColor` updated from `#000` to `#050706`

### Task 2: HomeScreen redesign (commit: 584880b)

Complete JSX rewrite of HomeScreen.tsx preserving all data-fetching, navigation, and quick log modal logic:

**Arc gauge (HOME-01):**
- `polarToCartesian` + `arcPath` helper functions for SVG path construction
- Track arc: full 270-degree sweep (-135° to +135°) in `COLORS.surfaceRaised`
- Value arc: fills from -135° to `glucoseToArcAngle(reading.mmol)`, colour-coded red/amber/green
- Centre overlay: glucose value (JetBrains Mono 52px), "mmol/L" unit, LIVE indicator
- Null/loading state: `ActivityIndicator` replaces value; "– –" when no reading

**LIVE pulse indicator:**
- `Animated.loop` on opacity between 1.0 and 0.4, 800ms each direction
- 6px green dot + "LIVE" text in `COLORS.green`

**Staggered card entrance:**
- `cardAnims` array of 4 `Animated.Value(0)` refs
- `Animated.stagger(80ms)` triggered when `loading` transitions to `false`
- Spring animation: tension 60, friction 8, scale from 0.95 to 1.0 + opacity 0 to 1

**HbA1c disclaimer modal (HOME-02):**
- `hba1cModalVisible` state + `setHba1cModalVisible` setter
- `Pressable` on HbA1c stat card calls `setHba1cModalVisible(true)` (only when `hba1c !== null`)
- `Modal` with `animationType="fade"`, `transparent`, absolute-positioned sheet
- Exact disclaimer text: "Please be aware HbA1c is usually calculated over 90 days. You should get accurate testing and take guidance from your diabetes team."
- OK button closes modal

**Centred buttons (HOME-03):**
- Container `alignItems: 'center'` with all action rows `width: '100%'`
- All four action areas (statsRow, actionRow, quickLogBtn, insulinRow) wrapped in `Animated.View` for staggered entrance

**Font tokens applied throughout:**
- `FONTS.mono` (JetBrains Mono) — glucose value, stat values
- `FONTS.semiBold` (Outfit 600) — header title, button labels, modal title
- `FONTS.regular` (Outfit 400) — units, hints, body text

**Background:** `COLORS.background` (`#050706`) per D-03 in CONTEXT.md

## Requirements Satisfied

- HOME-01: Arc gauge displays glucose visually as a coloured 270-degree arc
- HOME-02: Tapping HbA1c stat card opens disclaimer modal with exact required text
- HOME-03: Quick log buttons centred via full-width rows in centred container

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as specified.

### Notes

**1. [Plan accuracy] hba1cModalVisible acceptance criteria count**
- Plan stated `grep "hba1cModalVisible"` should return >= 3
- Actual result: 2 (state declaration on line 61 + `visible={hba1cModalVisible}` on line 403)
- The setter `setHba1cModalVisible` uses capital H — `hba1cModalVisible` is not a substring of `setHba1cModalVisible`
- Functionally the code is correct: state declared, setter used in 4 places, Modal visible prop wired
- This is a plan documentation inaccuracy, not a code issue

## Self-Check: PASSED

- FOUND: src/screens/HomeScreen.tsx
- FOUND: App.tsx
- FOUND: .planning/phases/04-homescreen-glucose-graph-and-hba1c-disclaimer/04-06-SUMMARY.md
- FOUND commit: 6be0e6e (Task 1 — font packages + App.tsx font loading)
- FOUND commit: 584880b (Task 2 — HomeScreen redesign)
