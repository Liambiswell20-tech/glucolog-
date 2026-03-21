# Phase 1: Tech Debt and Foundation Fixes - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Stabilise the data layer and establish a test foundation before any intelligence UI is built on top of it. This phase fixes silent data corruption, eliminates duplicate logic, makes error handling explicit, and adds unit tests for safety-adjacent code. No new UI. No new features. Everything built in subsequent phases depends on this being correct.

</domain>

<decisions>
## Implementation Decisions

### Test Framework Setup
- **D-01:** Jest + `jest-expo` preset — official Expo-supported testing approach
- **D-02:** Co-located test files — tests live next to source files (e.g. `src/services/storage.test.ts`), not in a separate `__tests__/` folder
- **D-03:** GitHub Actions CI — tests run automatically on every push to main; set up alongside the test files in this phase
- **D-04:** Exactly the 3 required tests from TEST-01 — no broader coverage beyond what's specified; can expand later

### Error Handling (DEBT-05)
- **D-05:** `fetchGlucosesSince` on non-OK response: `console.warn` the status code then return `[]` — non-breaking, app keeps working, error is visible in logs. Do NOT throw.

### Corrupt Storage Safe Defaults (DEBT-07)
- **D-06:** All `JSON.parse` calls in `storage.ts` wrapped in try/catch — on corrupt data, each logs a `console.warn` and returns a safe empty default:
  - `loadInsulinLogs()` → `[]`
  - `loadGlucoseStore()` → `null`
  - `computeAndCacheHba1c` cached read → `null` (triggers fresh recalculation)
  - `loadMeals()` → `[]`
  - `loadSessions()` → `[]`
- No function should throw on corrupt storage — app keeps running with empty state

### Claude's Discretion
- Exact CI workflow file structure (steps, Node version, cache config)
- `buildGlucoseResponse()` function signature and parameter shape (DEBT-03)
- Inline comment wording for deprecated `_fetchCurveForSession` write path (DEBT-06)
- CLAUDE.md section placement for canonical curve documentation (DEBT-06)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — DEBT-02 through DEBT-07, TEST-01 — exact specs for every fix in this phase
- `.planning/ROADMAP.md` §Phase 1 — success criteria (7 items) that must all be TRUE for phase to be complete

### Codebase
- `src/services/storage.ts` — primary target file: GlucoseStore sum fix, JSON.parse wrapping, GlucoseResponse extraction, saveMeal session grouping
- `src/services/nightscout.ts` — DEBT-05 target: `fetchGlucosesSince` error handling (line ~75)
- `src/services/carbEstimate.ts` — DEBT-04 target: `expo-file-system/legacy` import (line 2)
- `CLAUDE.md` — DEBT-06 target: add canonical curve documentation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GlucoseResponse` interface already defined in `storage.ts:195` — extraction just moves the build logic, interface stays
- `fetchAndStoreCurveForMeal` (storage.ts:416) and `_fetchCurveForSession` (storage.ts:460) — both build identical `GlucoseResponse` objects; shared function replaces both build blocks

### Established Patterns
- No test files exist anywhere in the project — full Jest setup required from scratch
- `GlucoseStore.sum` is currently incremental (add/subtract per entry) at lines 125-142 — fix replaces with `readings.reduce((acc, r) => acc + r.sgv, 0)` after the array is updated
- `loadGlucoseStore()` already returns `null` when key is missing — corrupt case should match this existing null return

### Integration Points
- `computeAndCacheHba1c` reads `GlucoseStore.sum` and `count` — once sum is recomputed correctly, HbA1c value stabilises automatically
- GitHub Actions workflow file: `.github/workflows/test.yml` — new file, does not exist yet

</code_context>

<specifics>
## Specific Ideas

- No specific UI or interaction requirements — this phase is entirely backend/service layer
- CI should be as simple as possible: install deps, run `npm test`, fail on any test failure

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-tech-debt-and-foundation-fixes*
*Context gathered: 2026-03-21*
