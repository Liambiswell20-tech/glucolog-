---
status: partial
phase: 04-homescreen-glucose-graph-and-hba1c-disclaimer
source: [04-VERIFICATION.md]
started: 2026-03-24T00:00:00Z
updated: 2026-03-24T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Arc gauge renders at runtime on a device/simulator
expected: A visible 270-degree sweep arc appears on HomeScreen; the filled arc moves with glucose value; the LIVE dot pulses; '– –' appears when glucose is null/loading
result: [pending]

### 2. Tapping HbA1c card opens disclaimer modal
expected: A modal slides or fades in containing exactly: 'Please be aware HbA1c is usually calculated over 90 days. You should get accurate testing and take guidance from your diabetes team.' — dismisses on backdrop tap or OK button
result: [pending]

### 3. Tapping a history card opens MealBottomSheet with tabs
expected: Bottom sheet slides up with session detail and date tabs; tapping a tab switches content; SafetyDisclaimer is visible at the bottom; sheet does not open if no similar past sessions exist
result: [pending]

### 4. AveragedStatsPanel appears above live matches in MealLogScreen
expected: When typing a meal name that matches 2+ past sessions, 'AVERAGED FROM N PAST SESSIONS' panel appears above the match list — hidden when fewer than 2 matches
result: [pending]

### 5. Card entrance animations stagger on HomeScreen load
expected: Stats row, action row, quick log row, insulin row each fade/scale in with 80ms stagger after data loads
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
