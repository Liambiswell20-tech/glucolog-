---
phase: 08-b2b-data-capture-layer
plan: "02"
subsystem: data-utilities
tags: [equipment-profile, time-in-range, async-storage, tdd]
dependency_graph:
  requires: [08-01]
  provides: [equipmentProfile-utils, timeInRange-utils]
  affects: [08-03, 08-04, 08-05, 08-06, 08-07, 08-08]
tech_stack:
  added: []
  patterns: [AsyncStorage-CRUD, single-timestamp-invariant, TDD-red-green]
key_files:
  created:
    - src/utils/equipmentProfile.ts
    - src/utils/timeInRange.ts
  modified:
    - src/__tests__/equipmentProfile.test.ts
    - src/__tests__/timeInRange.test.ts
decisions:
  - "Single Date.now() call for changeEquipment: ended_at and started_at share the exact same timestamp — prevents timeline gaps or overlaps"
  - "NO_LONG_ACTING sentinel maps to null in getCurrentEquipmentProfile — caller receives null rather than a string sentinel, simplifying downstream UI logic"
  - "storeDailyTIR silently skips duplicate dates — never overwrites existing day record, idempotent on repeated calls"
  - "getDailyTIRHistory always returns ascending date order — callers can rely on sort order without re-sorting"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
requirements: [B2B-02, B2B-07]
---

# Phase 08 Plan 02: Equipment Profile and Time-In-Range Utilities Summary

Implemented `equipmentProfile.ts` (4 async functions) and `timeInRange.ts` (3 functions) as the data-layer foundation for all Phase 8 B2B features, with all 17 new TDD test cases passing green and no regressions in the wider 123-test suite.

## What Was Built

### src/utils/equipmentProfile.ts

Four exported async functions backed by `equipment_changelog` in AsyncStorage:

- `changeEquipment(field, value, reason?)` — closes the current active entry for the field and opens a new one using a **single** `Date.now()` call, guaranteeing `ended_at === started_at` on the transition (timeline-gap invariant)
- `getActiveEquipment(field)` — returns the entry with no `ended_at`, or null
- `getEquipmentAtTime(field, timestamp)` — returns the entry active at a given ISO timestamp
- `getCurrentEquipmentProfile()` — returns a flat profile object; maps the `NO_LONG_ACTING` sentinel to `null` for `longActingInsulinBrand`

### src/utils/timeInRange.ts

Three exported functions backed by `daily_tir` in AsyncStorage:

- `calculateDailyTIR(readings, date?)` — pure function; counts readings in range 3.9–10.0 mmol/L inclusive; returns `DailyTIR` with percentages rounded to nearest integer
- `getDailyTIRHistory()` — loads all stored TIR records, sorted ascending by date
- `storeDailyTIR(record)` — appends a record, skips if date already exists, prunes to 90 records on write (keeping most recent)

## Test Results

```
equipmentProfile: 11 passed
timeInRange: 6 passed
Full suite: 123 passed, 0 failed
```

## Deviations from Plan

None — plan executed exactly as written. Implementation code was provided verbatim in the plan's `<action>` blocks; test assertions followed the specified `<behavior>` contracts.

## Known Stubs

None. Both utility files are fully wired to AsyncStorage with complete implementations. No placeholder values, no hardcoded empty returns.

## Self-Check: PASSED

Files created:
- src/utils/equipmentProfile.ts: FOUND
- src/utils/timeInRange.ts: FOUND
- .planning/phases/08-b2b-data-capture-layer/08-02-SUMMARY.md: FOUND

Commits:
- 5cce963: feat(08-02): implement equipmentProfile utility and update tests
- 7cdbad7: feat(08-02): implement timeInRange utility and update tests
