---
phase: 08-b2b-data-capture-layer
plan: "06"
subsystem: hypo-treatment-logging
tags: [hypo-treatment, foreground-hook, tir-calculation, b2b-data]
dependency_graph:
  requires: [08-02, 08-03]
  provides: [hypo-treatment-log, app-foreground-hook, tir-silent-calculation]
  affects: [HomeScreen, App.tsx]
tech_stack:
  added: []
  patterns:
    - AppState foreground listener via custom useAppForeground hook (reusable)
    - Modal bottom sheet with inline picker chips (treatment type + unit selection)
    - Silent background TIR calculation on foreground with once-per-day guard
    - Hypo recovery curve fetch after 60-min elapsed window
key_files:
  created:
    - src/hooks/useAppForeground.ts
    - src/components/HypoTreatmentSheet.tsx
  modified:
    - src/components/types.ts
    - src/screens/HomeScreen.tsx
    - App.tsx
decisions:
  - "cardAnims extended from 4 to 5 entries to animate hypo button with cardAnims[4]"
  - "handleForeground wrapped in useCallback to satisfy useAppForeground dependency stability"
  - "hypoSheetVisible state resets on close via handleClose in HypoTreatmentSheet itself"
  - "Hypo button uses cardAnims[4] (not cardAnims[1]) to preserve original action row animation index"
metrics:
  duration_seconds: 302
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase 08 Plan 06: HypoTreatmentSheet + App Foreground Hook Summary

**One-liner:** AppState foreground hook with silent TIR calculation and hypo recovery fetch; HypoTreatmentSheet bottom sheet with 4-field form and COLORS.red button on HomeScreen.

## What Was Built

### Task 1: useAppForeground hook + HypoTreatmentSheet component

Created `src/hooks/useAppForeground.ts` — a reusable AppState foreground listener hook that fires a callback only when the app transitions from background to active. Uses `useRef` to track previous state and prevents duplicate fires.

Added `HypoTreatmentSheetProps` to `src/components/types.ts` with a typed import of `HypoTreatment` from `../types/equipment`.

Created `src/components/HypoTreatmentSheet.tsx` — a Modal bottom sheet with:
1. Current glucose read-only display (mmol/L, or 'No reading' if null)
2. Treatment type picker chips: Glucose tablets, Juice, Sweets, Gel, Other
3. Amount row: TextInput (decimal-pad) + inline unit chips (tablets / ml / g)
4. Save / Cancel buttons — Save disabled if amount is empty or non-numeric

### Task 2: HomeScreen hypo button + App.tsx foreground handler

Modified `src/screens/HomeScreen.tsx`:
- Added `AsyncStorage`, `HypoTreatment` type, `HypoTreatmentSheet` imports
- Extended `cardAnims` from 4 to 5 entries (cardAnims[4] animates hypo button)
- Added `hypoSheetVisible` state and `handleHypoSave` async function
- Inserted "Treating a low?" button between stats row and action row — red border + text (COLORS.red)
- Wired `HypoTreatmentSheet` at the end of JSX return

Modified `App.tsx`:
- Added `useCallback` import, `useAppForeground`, TIR utilities, `fetchGlucoseRange` imports
- Added `handleForeground` (useCallback) with two non-fatal blocks:
  - TIR block: calculates yesterday's DailyTIR if no record exists for that date
  - Hypo recovery block: fetches 60-min glucose readings for any treatment past the 60-min window
- Wired `useAppForeground(handleForeground)` in App() body

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a53bb95 | feat(08-06): create useAppForeground hook and HypoTreatmentSheet component |
| 2 | 0010914 | feat(08-06): wire hypo button into HomeScreen and foreground handler into App.tsx |

## Verification

- TypeScript: clean (0 errors)
- Tests: 123 passed, 0 failed (12 test suites)
- No new test regressions

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data flows are wired end-to-end:
- HypoTreatmentSheet.onSave → handleHypoSave → AsyncStorage `hypo_treatments` key
- App foreground → storeDailyTIR → AsyncStorage `daily_tir` key
- Recovery fetch → updates `glucose_readings_after` in `hypo_treatments` key

## Self-Check: PASSED
