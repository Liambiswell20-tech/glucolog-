# Phase 1: Tech Debt and Foundation Fixes - Research

**Researched:** 2026-03-21
**Domain:** React Native / Expo service layer, Jest testing setup, AsyncStorage safety, expo-file-system migration
**Confidence:** HIGH

## Summary

Phase 1 is a pure service-layer fix phase — no UI changes, no new screens. All six debt items target two files (`storage.ts` and `nightscout.ts`) plus one import change (`carbEstimate.ts`) plus documentation. The test foundation (TEST-01) requires installing Jest from scratch as no test infrastructure exists in the project whatsoever.

The most important setup decision is that `jest-expo@54.x` uses Jest 29 internally, which means the project installs `jest@29.7.0` alongside `jest-expo`. The `@react-native-async-storage/async-storage` package ships an official mock at `@react-native-async-storage/async-storage/jest/async-storage-mock` — this is the correct approach for testing storage functions without a native runtime. All three code fixes (DEBT-02, DEBT-03, DEBT-07) are pure logic changes to functions that already exist; the `GlucoseResponse` interface is already defined at storage.ts:195 so DEBT-03 is extraction only, not redesign.

The `expo-file-system/legacy` import in `carbEstimate.ts` (DEBT-04) is valid and functional in expo-file-system@19.x — the `legacy` sub-path still exports the complete `readAsStringAsync` / `EncodingType` API unchanged. Migrating to the new `File` class API (which uses `new File(uri).base64()`) is correct for forward compatibility but the old import path does NOT break today; it is a future-proofing change.

**Primary recommendation:** Install `jest@29.7.0` + `jest-expo@54.0.17` + `@types/jest@29.4.6` as devDependencies. Configure via `jest` key in `package.json`. Mock AsyncStorage using the official mock. All storage.ts and nightscout.ts fixes are surgical — each targets a specific line range.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Jest + `jest-expo` preset — official Expo-supported testing approach
- **D-02:** Co-located test files — tests live next to source files (e.g. `src/services/storage.test.ts`), not in a separate `__tests__/` folder
- **D-03:** GitHub Actions CI — tests run automatically on every push to main; set up alongside the test files in this phase
- **D-04:** Exactly the 3 required tests from TEST-01 — no broader coverage beyond what's specified; can expand later
- **D-05:** `fetchGlucosesSince` on non-OK response: `console.warn` the status code then return `[]` — non-breaking, app keeps working, error is visible in logs. Do NOT throw.
- **D-06:** All `JSON.parse` calls in `storage.ts` wrapped in try/catch — on corrupt data, each logs a `console.warn` and returns a safe empty default:
  - `loadInsulinLogs()` → `[]`
  - `loadGlucoseStore()` → `null`
  - `computeAndCacheHba1c` cached read → `null` (triggers fresh recalculation)
  - `loadMeals()` (via `loadMealsRaw()`) → `[]`
  - `loadSessions()` (via `loadSessionsRaw()`) → `[]`
  - No function should throw on corrupt storage — app keeps running with empty state

### Claude's Discretion
- Exact CI workflow file structure (steps, Node version, cache config)
- `buildGlucoseResponse()` function signature and parameter shape (DEBT-03)
- Inline comment wording for deprecated `_fetchCurveForSession` write path (DEBT-06)
- CLAUDE.md section placement for canonical curve documentation (DEBT-06)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBT-02 | `GlucoseStore.sum` recomputed from `readings` array on every `updateGlucoseStore` call | Lines 125-148 of storage.ts — incremental sum/subtract logic replaced with `readings.reduce((acc, r) => acc + r.sgv, 0)` after the toKeep array is built |
| DEBT-03 | `buildGlucoseResponse()` extracted as shared pure function used by both `fetchAndStoreCurveForMeal` and `_fetchCurveForSession` | Duplicate blocks at storage.ts:432-443 and storage.ts:475-486 are identical — pure function extraction, no interface changes needed |
| DEBT-04 | `carbEstimate.ts` migrated from `expo-file-system/legacy` to current `expo-file-system` API | New API: `new File(photoUri).base64()` replaces `FileSystem.readAsStringAsync(photoUri, { encoding: FileSystem.EncodingType.Base64 })` |
| DEBT-05 | `fetchGlucosesSince` logs on non-OK HTTP response instead of silent `return []` | nightscout.ts:75 — replace `if (!response.ok) return []` with `if (!response.ok) { console.warn(...); return []; }` |
| DEBT-06 | `Meal.glucoseResponse` documented as canonical curve location in CLAUDE.md; `_fetchCurveForSession` write path deprecated with inline comment | Two-part change: CLAUDE.md addition + storage.ts comment at lines 460-490 |
| DEBT-07 | All `JSON.parse` calls in `storage.ts` wrapped in try/catch | 5 parse sites: `loadInsulinLogs` (line 59), `loadGlucoseStore` (line 111), `loadCachedHba1c` (line 174), `loadMealsRaw` (line 239), `loadSessionsRaw` (line 248) |
| TEST-01 | Unit tests for HbA1c formula, outcome badge classification (5 states), and `saveMeal` session grouping (3 scenarios) | Jest + jest-expo + AsyncStorage mock. No tests exist today — full setup required. `computeAndCacheHba1c` is a pure formula after AsyncStorage write, testable by mocking AsyncStorage. `saveMeal` session grouping requires AsyncStorage mock. Outcome badge is render-time logic that needs extracting into a pure function for testing. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jest | 29.7.0 | Test runner | jest-expo@54 ships Jest 29 internals — must match |
| jest-expo | 54.0.17 | Expo-aware Jest preset | Official Expo testing approach; handles RN module resolution, JSX transform, native module stubs |
| @types/jest | 29.4.6 | TypeScript types for Jest | Matches Jest 29 API surface |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-native-async-storage/async-storage (mock) | bundled at `jest/async-storage-mock` | In-memory AsyncStorage for tests | Required for all storage.ts tests — replaces native module |

**No additional libraries needed.** All other fixes are pure TypeScript edits.

**Installation:**
```bash
npm install --save-dev jest@29.7.0 jest-expo@54.0.17 @types/jest@29.4.6
```

**Version verification (confirmed 2026-03-21):**
- `jest`: latest stable is 30.x but jest-expo@54 depends on `@jest/globals@^29` — must pin to 29.7.0
- `jest-expo`: 54.0.17 is latest in the 54.x line (matching expo ~54.0.0 in package.json)
- `@types/jest`: 29.4.6 is latest stable for Jest 29

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jest-expo preset | vitest | vitest has no official Expo support; jest-expo resolves React Native modules, mocks native dependencies — skip entirely |
| jest@29.7.0 | jest@30.x | jest-expo@54 depends on `@jest/globals@^29` and `babel-jest@^29` — using 30 causes peer conflict |

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── storage.ts           # primary target
│   ├── storage.test.ts      # co-located test (D-02)
│   ├── nightscout.ts        # DEBT-05 target
│   └── carbEstimate.ts      # DEBT-04 target
├── utils/
│   └── outcomeClassifier.ts # extracted from render logic — needed for TEST-01
.github/
└── workflows/
    └── test.yml             # new — CI (D-03)
```

### Pattern 1: jest-expo Configuration in package.json
**What:** Add a `jest` key to package.json pointing at the jest-expo preset. No separate `jest.config.js` file needed.
**When to use:** Standard for all Expo projects — keeps config co-located with dependencies.
**Example:**
```json
// Source: https://docs.expo.dev/develop/unit-testing/
{
  "jest": {
    "preset": "jest-expo",
    "moduleNameMapper": {
      "@react-native-async-storage/async-storage": "@react-native-async-storage/async-storage/jest/async-storage-mock"
    }
  }
}
```
Add `"test": "jest"` to the `scripts` key in package.json.

### Pattern 2: Mocking AsyncStorage
**What:** Map AsyncStorage to the official in-memory mock via `moduleNameMapper`.
**When to use:** Any test that calls a function importing AsyncStorage.
**Example:**
```typescript
// The mock provides getItem/setItem/removeItem/clear returning Promises
// No manual jest.mock() needed — the moduleNameMapper handles it automatically
import { loadMeals } from './storage';

test('returns empty array when storage empty', async () => {
  const result = await loadMeals();
  expect(result).toEqual([]);
});
```

### Pattern 3: buildGlucoseResponse() Pure Function Extraction (DEBT-03)
**What:** Extract the duplicate GlucoseResponse-building block into a single pure function.
**When to use:** Called by both `fetchAndStoreCurveForMeal` and `_fetchCurveForSession`.
**Recommended signature:**
```typescript
// Source: inspection of storage.ts:432-443 and storage.ts:475-486
function buildGlucoseResponse(
  fromMs: number,
  readings: CurvePoint[],
  nowMs: number
): GlucoseResponse {
  const startGlucose = readings[0].mmol;
  const peak = readings.reduce((best, r) => (r.mmol > best.mmol ? r : best), readings[0]);
  const endReading = readings[readings.length - 1];
  return {
    startGlucose,
    peakGlucose: peak.mmol,
    timeToPeakMins: Math.round((peak.date - fromMs) / 60000),
    totalRise: Math.round((peak.mmol - startGlucose) * 10) / 10,
    endGlucose: endReading.mmol,
    fallFromPeak: Math.round((peak.mmol - endReading.mmol) * 10) / 10,
    timeFromPeakToEndMins: Math.round((endReading.date - peak.date) / 60000),
    readings,
    isPartial: nowMs < (fromMs + THREE_HOURS_MS),
    fetchedAt: new Date().toISOString(),
  };
}
```
Note: `isPartial` currently uses `toMs` as a local variable in each caller. The pure function must derive `toMs` from `fromMs + THREE_HOURS_MS` or accept it as a parameter. Using `fromMs + THREE_HOURS_MS` inline is cleanest — avoids a third parameter.

### Pattern 4: expo-file-system New API (DEBT-04)
**What:** Replace legacy `readAsStringAsync` with the new `File` class `base64()` method.
**When to use:** carbEstimate.ts line 2 import + line 49-51 usage.
**Example:**
```typescript
// OLD (expo-file-system/legacy):
import * as FileSystem from 'expo-file-system/legacy';
const base64 = await FileSystem.readAsStringAsync(photoUri, {
  encoding: FileSystem.EncodingType.Base64,
});

// NEW (expo-file-system — current API, SDK 54):
import { File } from 'expo-file-system';
const base64 = await new File(photoUri).base64();
```
Source: `node_modules/expo-file-system/src/ExpoFileSystem.types.ts` line 210 — `base64(): Promise<string>` confirmed present in installed 19.0.21.

### Pattern 5: try/catch JSON.parse Wrapping (DEBT-07)
**What:** Wrap AsyncStorage reads that call `JSON.parse` in try/catch, logging a warning on corrupt data and returning safe defaults.
**Example:**
```typescript
// BEFORE:
export async function loadMealsRaw(): Promise<Meal[]> {
  const raw = await AsyncStorage.getItem(MEALS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Meal[];
}

// AFTER:
async function loadMealsRaw(): Promise<Meal[]> {
  const raw = await AsyncStorage.getItem(MEALS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Meal[];
  } catch {
    console.warn('[storage] loadMealsRaw: corrupt data in AsyncStorage, returning []');
    return [];
  }
}
```
Apply the same pattern to: `loadInsulinLogs`, `loadGlucoseStore`, `loadCachedHba1c`, `loadSessionsRaw`.

### Pattern 6: GitHub Actions CI (D-03)
**What:** Minimal workflow — checkout, setup node, install, test.
**When to use:** Runs on every push to main and on pull_request.
**Example:**
```yaml
# .github/workflows/test.yml
name: Test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --watchAll=false
```
Note: `--watchAll=false` is required in CI — Jest defaults to watch mode in non-TTY environments with some configurations; jest-expo's `testEnvironment` is `node` by default so this is a safety flag.

### Anti-Patterns to Avoid
- **Using `jest@30` with `jest-expo@54`:** Peer conflict — jest-expo@54 requires `@jest/globals@^29`. Pin to 29.7.0.
- **Importing AsyncStorage directly in tests without mock:** Native module will fail to load in Jest environment. Always use `moduleNameMapper`.
- **Testing `computeAndCacheHba1c` with a real AsyncStorage write:** The async write is a side effect; test the pure formula separately or verify the returned value (not the stored one).
- **Leaving `isPartial` calculation dependent on caller's local `toMs`:** The extracted `buildGlucoseResponse` must compute `isPartial` self-contained to be truly pure.
- **Throwing in `loadCachedHba1c` corrupt case:** The caller in `HomeScreen` does not handle throw — must return `null` like the `!raw` path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AsyncStorage in-memory test double | Custom mock object | `@react-native-async-storage/async-storage/jest/async-storage-mock` | Official mock with full API surface including `clear()`, persistence between calls in a test, and correct Promise return types |
| React Native module stubs for Jest | Manual `jest.mock()` for RN core | `jest-expo` preset | jest-expo pre-configures all RN native module stubs, transformer, and `haste` resolver — replicating this manually is 200+ lines |
| TypeScript compilation in tests | `ts-jest` | `jest-expo` preset with `babel-jest` | jest-expo already handles TypeScript via `babel-preset-expo` — `ts-jest` is redundant and creates a second compile chain |

**Key insight:** The `jest-expo` preset exists precisely to eliminate the native module stub problem. Every manual approach to mocking RN modules in Jest is a partial implementation that breaks when Expo updates.

---

## Common Pitfalls

### Pitfall 1: GlucoseStore.sum Drift After 30-day Eviction
**What goes wrong:** The current code uses `sum -= r.sgv` when evicting old readings (lines 137-144). If a reading was added to `sum` in a previous run but the store was loaded with a pre-existing `sum` that had already evicted it (double-eviction via crash/reload), the subtraction goes negative.
**Why it happens:** Incremental accounting assumes perfect session continuity — any interrupted write leaves `sum` inconsistent with `readings`.
**How to avoid:** DEBT-02 fix — always recompute sum from the final `readings` array: `readings.reduce((acc, r) => acc + r.sgv, 0)`. This is always correct regardless of prior state.
**Warning signs:** HbA1c estimate shows implausibly low or negative values, or spikes wildly after app reinstall.

### Pitfall 2: jest-expo Requires --watchAll=false in CI
**What goes wrong:** In some CI environments jest-expo detects a non-TTY and hangs waiting for input, or exits with an ambiguous error.
**Why it happens:** Jest's interactive watch mode is not compatible with non-TTY pipes.
**How to avoid:** Always pass `--watchAll=false` in the CI `npm test` script, or set `"test": "jest --watchAll=false"` in package.json scripts.

### Pitfall 3: expo-file-system File Class Requires file:// URI
**What goes wrong:** `new File(photoUri)` where `photoUri` is a bare path string (not a `file://` URI) may fail on some platforms.
**Why it happens:** The new API validates paths on construction (`this.validatePath()` is called in the constructor).
**How to avoid:** `expo-image-picker` returns URIs in `file://` format on both iOS and Android — the `photoUri` in `carbEstimate.ts` already has this format. No special handling needed, but the test (if written) should mock this properly.

### Pitfall 4: Corrupt Storage try/catch Must Not Swallow AsyncStorage Errors
**What goes wrong:** A broad `try { const raw = await AsyncStorage.getItem(...); return JSON.parse(raw) } catch` will catch *both* AsyncStorage network/native errors AND JSON parse errors. On a genuine AsyncStorage failure the app silently returns `[]` with no signal.
**Why it happens:** Overly broad try/catch scope.
**How to avoid:** The try/catch must wrap only `JSON.parse(raw)`, not the `AsyncStorage.getItem` call. The `getItem` call stays outside the try block and can propagate AsyncStorage-level errors normally.
**Correct pattern:**
```typescript
const raw = await AsyncStorage.getItem(KEY);  // outside try
if (!raw) return defaultValue;
try {
  return JSON.parse(raw) as T;
} catch {
  console.warn('[storage] corrupt data, returning default');
  return defaultValue;
}
```

### Pitfall 5: DEBT-03 Extraction Must Not Change _fetchCurveForSession's Storage Target
**What goes wrong:** `fetchAndStoreCurveForMeal` saves to `meals` (via `saveMealsRaw`); `_fetchCurveForSession` saves to `sessions` (via `saveSessionsRaw`). The `buildGlucoseResponse()` extraction is purely the object-building step — each caller still handles its own storage write.
**Why it happens:** Conflating the computation with the persistence.
**How to avoid:** `buildGlucoseResponse()` returns a `GlucoseResponse` value only. Each caller keeps its own `meals.map(...)` / `sessions.map(...)` and `saveMealsRaw` / `saveSessionsRaw` calls unchanged.

---

## Code Examples

Verified patterns from codebase inspection:

### DEBT-02: Correct Sum Recomputation
```typescript
// Source: storage.ts updateGlucoseStore — replace lines 137-145
const toKeep = readings.filter(r => r.date >= cutoff30d);
readings = toKeep.sort((a, b) => a.date - b.date);
// Recompute sum from final array — eliminates drift from any prior state
const sum = readings.reduce((acc, r) => acc + r.sgv, 0);
const store: GlucoseStore = { readings, sum, lastFetchedAt: now };
```
Note: Remove the `let sum = existing?.sum ?? 0` declaration and the incremental `sum += e.sgv` / `sum -= r.sgv` lines entirely.

### DEBT-05: fetchGlucosesSince Error Logging
```typescript
// Source: nightscout.ts line 75 — replace silent return
if (!response.ok) {
  console.warn(`[nightscout] fetchGlucosesSince: non-OK response ${response.status} — returning []`);
  return [];
}
```

### TEST-01: HbA1c Formula Test
```typescript
// Source: storage.ts:183-184 — formula is (avgMmol + 2.59) / 1.59 for percent
test('computeAndCacheHba1c returns correct percent for known glucose', async () => {
  // avgMmol 7.0 → percent = round(((7.0 + 2.59) / 1.59) * 10) / 10 = round(60.315...) / 10 = 6.0
  const result = await computeAndCacheHba1c(7.0, 30);
  expect(result.percent).toBe(6.0);
  expect(result.daysOfData).toBe(30);
});
```

### TEST-01: Outcome Badge Classification — Extract First
The outcome badge logic is currently computed at render time in JSX (not in a standalone function). To make TEST-01's "5 state" test possible without rendering, extract it to a pure function before writing the test:
```typescript
// New file: src/utils/outcomeClassifier.ts
import type { GlucoseResponse } from '../services/storage';

export type OutcomeBadge = 'GREEN' | 'ORANGE' | 'DARK_AMBER' | 'RED' | 'PENDING' | 'NONE';

export function classifyOutcome(glucoseResponse: GlucoseResponse | null): OutcomeBadge {
  if (!glucoseResponse) return 'NONE';
  if (glucoseResponse.isPartial) return 'PENDING';
  const { peakGlucose, endGlucose } = glucoseResponse;
  if (endGlucose < 3.9 || endGlucose >= 14.0 || peakGlucose >= 14.0) return 'RED';
  if (endGlucose > 10.0 && endGlucose < 14.0) return 'DARK_AMBER';
  if (peakGlucose > 10.0 && endGlucose >= 3.9 && endGlucose <= 10.0) return 'ORANGE';
  return 'GREEN';
}
```
Source: REQUIREMENTS.md HIST-03 — all 5 states specified verbatim.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import * as FileSystem from 'expo-file-system'` with `readAsStringAsync` | `import { File } from 'expo-file-system'` with `new File(uri).base64()` | expo-file-system ~18 / SDK 51 | The main import now throws at runtime if you call legacy methods — legacy methods on the main export are STUBS that throw |
| `expo-file-system/legacy` (current workaround) | `expo-file-system` File class (DEBT-04 target) | SDK 51-54 transition | `expo-file-system/legacy` still works in SDK 54 but is a dead-end path for future SDK upgrades |
| Separate `jest.config.js` | `jest` key in `package.json` | jest-expo v50+ | No functional difference — Expo docs use package.json key; simpler |

**Deprecated/outdated:**
- `readAsStringAsync` from main `expo-file-system` export: throws at runtime in SDK 54 (throws `Error: Method readAsStringAsync imported from "expo-file-system" is deprecated`) — do not use
- Jest `testEnvironment: 'jsdom'` for RN tests: jest-expo uses a custom React Native environment — do not override

---

## Open Questions

1. **Outcome badge extraction — where does the current classification logic live?**
   - What we know: REQUIREMENTS.md defines the 5 states; the history screen renders badges; no standalone classifier function exists in the codebase.
   - What's unclear: Exact current location of the classification logic in the render tree (not inspected — MealHistoryScreen was not read).
   - Recommendation: The plan should include a task to grep for existing badge logic before extraction to avoid duplicating or conflicting with current render code. Extraction to `src/utils/outcomeClassifier.ts` is safe regardless.

2. **`saveMeal` session grouping test — boundary precision**
   - What we know: TEST-01 requires testing the "3hr+1min boundary creates new session" case. `THREE_HOURS_MS = 3 * 60 * 60 * 1000`. The boundary condition is `now.getTime() - new Date(s.startedAt).getTime() <= THREE_HOURS_MS` (line 316).
   - What's unclear: Whether jest's fake timers are needed or whether passing an explicit `loggedAt?: Date` parameter to `saveMeal` is sufficient for controlling time.
   - Recommendation: Use the existing `loggedAt` parameter to `saveMeal` — it already accepts `Date` and uses it as `now`. No fake timers needed. Pass `new Date(baseTime)` and `new Date(baseTime + THREE_HOURS_MS + 60000)` explicitly.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + jest-expo 54.0.17 |
| Config file | `package.json` `jest` key (no separate config file) |
| Quick run command | `npm test -- --watchAll=false` |
| Full suite command | `npm test -- --watchAll=false --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 (HbA1c) | `computeAndCacheHba1c` formula computes correct percent and mmol/mol | unit | `npm test -- --watchAll=false --testPathPattern=storage.test` | ❌ Wave 0 |
| TEST-01 (badge) | `classifyOutcome` returns correct badge for all 5 states | unit | `npm test -- --watchAll=false --testPathPattern=outcomeClassifier.test` | ❌ Wave 0 |
| TEST-01 (session) | `saveMeal` session grouping: solo, join existing, 3hr+1min boundary | unit | `npm test -- --watchAll=false --testPathPattern=storage.test` | ❌ Wave 0 |
| DEBT-02 | Sum recomputed correctly (no regression test required — logic is synchronous) | manual-only | n/a — verified by HbA1c unit test stability | n/a |
| DEBT-03 | `buildGlucoseResponse` pure extraction (both callers produce identical output) | manual-only | n/a — pure refactor, same inputs → same outputs | n/a |
| DEBT-04 | `carbEstimate.ts` uses new FileSystem API | manual-only | n/a — verified by TypeScript compile | n/a |
| DEBT-05 | `fetchGlucosesSince` logs non-OK response | unit | Could test with jest `global.fetch` mock, but not required by TEST-01 | n/a |
| DEBT-06 | CLAUDE.md documents canonical curve path | manual-only | n/a — documentation change | n/a |
| DEBT-07 | Corrupt JSON returns safe defaults | unit | `npm test -- --watchAll=false --testPathPattern=storage.test` | ❌ Wave 0 (optional extension beyond TEST-01 spec) |

### Sampling Rate
- **Per task commit:** `npm test -- --watchAll=false`
- **Per wave merge:** `npm test -- --watchAll=false --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/services/storage.test.ts` — covers TEST-01 (HbA1c + session grouping)
- [ ] `src/utils/outcomeClassifier.ts` — extracted classifier function
- [ ] `src/utils/outcomeClassifier.test.ts` — covers TEST-01 (badge 5 states)
- [ ] `package.json` — add `jest` config key + `test` script
- [ ] `.github/workflows/test.yml` — CI workflow
- [ ] Framework install: `npm install --save-dev jest@29.7.0 jest-expo@54.0.17 @types/jest@29.4.6`

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `node_modules/expo-file-system/src/legacyWarnings.ts` — confirms `readAsStringAsync` throws at runtime from main import in SDK 54
- Direct inspection of `node_modules/expo-file-system/src/ExpoFileSystem.types.ts` — confirms `base64(): Promise<string>` exists on new File class in 19.0.21
- Direct inspection of `node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js` — official mock ships with the package
- `npm view jest-expo@54.0.17 dependencies` — confirms Jest 29 internal dependency
- Direct inspection of `src/services/storage.ts` — identified all 5 JSON.parse sites, confirmed duplicate buildGlucoseResponse blocks, confirmed incremental sum logic
- Direct inspection of `src/services/nightscout.ts` — confirmed silent `return []` at line 75
- Direct inspection of `src/services/carbEstimate.ts` — confirmed `expo-file-system/legacy` import at line 2

### Secondary (MEDIUM confidence)
- `npm view jest-expo@54.0.17 peerDependencies` — expo version compatibility confirmed
- `npm view jest@29.7.0 version` — version availability confirmed

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry and installed node_modules
- Architecture: HIGH — all patterns based on direct code inspection and official package internals
- Pitfalls: HIGH — identified from direct code reading, not speculation

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable — expo-file-system API unlikely to change within SDK 54 lifecycle; Jest 29 pinned explicitly)
