---
phase: 01-tech-debt-and-foundation-fixes
plan: 03
subsystem: services
tags: [expo-file-system, nightscout, error-logging, documentation, tech-debt]
dependency_graph:
  requires: [01-01]
  provides: [DEBT-04, DEBT-05, DEBT-06]
  affects: [src/services/carbEstimate.ts, src/services/nightscout.ts, src/services/storage.ts, CLAUDE.md]
tech_stack:
  added: []
  patterns:
    - expo-file-system File class API (SDK 54) replacing legacy readAsStringAsync
    - console.warn on non-OK HTTP response before returning empty fallback
    - inline deprecation comment for deprecated write paths
key_files:
  created: []
  modified:
    - src/services/carbEstimate.ts
    - src/services/nightscout.ts
    - src/services/storage.ts
    - CLAUDE.md
decisions:
  - "Used File class from expo-file-system (not legacy) — readAsStringAsync is a stub that throws at runtime in SDK 54"
  - "fetchGlucosesSince warns but does not throw on non-OK — app must keep working even if glucose store refresh fails"
  - "Deprecation comment added as inline code comment rather than JSDoc — matches existing style in storage.ts"
metrics:
  duration: 8 minutes
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_modified: 4
---

# Phase 01 Plan 03: Service Layer Fixes and Canonical Curve Documentation Summary

DEBT-04/05/06 resolved: carbEstimate.ts uses SDK 54 File class API, fetchGlucosesSince warns on non-OK, and Meal.glucoseResponse is fully documented as the canonical curve location.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migrate carbEstimate.ts to expo-file-system File class API (DEBT-04) | `1a9eb74` | src/services/carbEstimate.ts |
| 2 | Add fetchGlucosesSince error logging (DEBT-05) and canonical curve docs (DEBT-06) | `45d0618` | src/services/nightscout.ts, src/services/storage.ts, CLAUDE.md |

## What Was Built

**DEBT-04 — carbEstimate.ts legacy API migration**

The `expo-file-system/legacy` import was replaced with the SDK 54 `File` class API. The `readAsStringAsync` call (which is a stub that throws at runtime in SDK 54) was replaced with `new File(photoUri).base64()`. The `photoUri` from `expo-image-picker` is already in `file://` format so no path manipulation was needed.

**DEBT-05 — fetchGlucosesSince error logging**

The silent `if (!response.ok) return []` was expanded to log a `console.warn` with the HTTP status code before returning the empty array. This preserves the non-throwing behaviour (the app must keep working even if the glucose store refresh fails) while making failures visible in logs.

**DEBT-06 — Canonical curve location documentation**

Two-part change:
1. Added a 3-line deprecation comment above `_fetchCurveForSession` in storage.ts, explaining that `Meal.glucoseResponse` is canonical and `fetchAndStoreCurveForMeal()` is the correct path for new features.
2. Expanded the CLAUDE.md "Key Architecture Decisions" bullet for curve storage to explicitly name the deprecated path and explain why it still exists.

## Verification

- TypeScript (`npx tsc --noEmit`): clean, no errors
- Tests (`npm test -- --watchAll=false`): 8/8 pass, no regressions

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/services/carbEstimate.ts` — exists, contains `import { File } from 'expo-file-system'` and `new File(photoUri).base64()`
- `src/services/nightscout.ts` — exists, contains `console.warn` in `fetchGlucosesSince`
- `src/services/storage.ts` — exists, contains `// DEPRECATED write path` above `_fetchCurveForSession`
- `CLAUDE.md` — exists, contains `Canonical curve location` and `deprecated`
- Commits `1a9eb74` and `45d0618` verified in git log
