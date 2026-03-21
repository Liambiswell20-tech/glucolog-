# Roadmap: BolusBrain — Milestone 2

## Overview

Milestone 2 transforms BolusBrain from a data-collection app into an intelligent personal companion. The matching engine is already built but has never been surfaced in any UI. This milestone exposes that intelligence incrementally: first fixing the data integrity bugs and fragile code that would silently corrupt what the user sees, then building the history screen components on a correct data model, then wiring the matching engine into those components, then completing the HomeScreen improvements, then extending the data model for longer-horizon features, and finally establishing the route to market. Every phase delivers a coherent, observable capability that works without the phases that follow it.

## Phases

- [x] **Phase 1: Tech Debt and Foundation Fixes** - Eliminate data bugs and fragile error handling that would corrupt new features built on top of them (completed 2026-03-21)
- [ ] **Phase 2: History Refactor and Core UX Components** - Migrate history screen to session model and build the reusable components all intelligence features depend on
- [ ] **Phase 3: Intelligence Layer — Matching and Outcome Surfacing** - Wire the existing matching engine into history cards and meal log screen
- [ ] **Phase 4: HomeScreen Glucose Graph and HbA1c Disclaimer** - Expose full-day glucose graph and surface HbA1c with appropriate disclaimer
- [ ] **Phase 5: Data Model Extensions and Editing** - Add AI confidence tracking, long-acting overnight window, and dose editing
- [ ] **Phase 6: Route to Market** - Complete landing page, email capture, and MHRA regulatory contact

## Phase Details

### Phase 1: Tech Debt and Foundation Fixes
**Goal**: The codebase is stable, error handling is explicit, data computations are correct, and the canonical data model is documented — so every feature built afterward stands on solid ground
**Depends on**: Nothing (first phase)
**Requirements**: DEBT-02, DEBT-03, DEBT-04, DEBT-05, DEBT-06, DEBT-07, TEST-01
**Note**: DEBT-01 (env vars) was completed in commit 76b6bc5 — already done.
**Success Criteria** (what must be TRUE):
  1. Estimated HbA1c value on HomeScreen is computed from a recomputed sum (not incremental accumulation) — the value is stable and does not drift over repeated app launches
  2. The `GlucoseResponse` build block exists in exactly one place in the codebase — both curve fetch functions call the shared function
  3. The `expo-file-system` import in `carbEstimate.ts` uses the current non-legacy API — no `/legacy` sub-path anywhere in the codebase
  4. `fetchGlucosesSince` throws/logs on non-OK HTTP response — silent swallowing eliminated
  5. `Meal.glucoseResponse` is documented as the canonical curve location in CLAUDE.md; the session write path is deprecated with a comment
  6. All `JSON.parse` calls in `storage.ts` are wrapped in try/catch — a corrupt AsyncStorage entry logs a warning and returns a safe default rather than crashing
  7. Unit tests exist for: HbA1c formula, outcome badge classification (all 5 states), and `saveMeal` session grouping (solo, join-existing, boundary)
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Install Jest + jest-expo, extract classifyOutcome pure function, badge classification tests (6 states)
- [x] 01-02-PLAN.md — Fix GlucoseStore.sum drift (DEBT-02), extract buildGlucoseResponse (DEBT-03), wrap JSON.parse in try/catch (DEBT-07), HbA1c + session grouping tests (TEST-01)
- [x] 01-03-PLAN.md — Migrate carbEstimate.ts to File class API (DEBT-04), fetchGlucosesSince error logging (DEBT-05), canonical curve docs in CLAUDE.md and storage.ts (DEBT-06)
- [x] 01-04-PLAN.md — GitHub Actions CI workflow, phase verification checkpoint

### Phase 2: History Refactor and Core UX Components
**Goal**: The history screen operates on the session data model, legacy meals are migrated to proper session records, new chart and animation libraries are correctly configured, and the reusable `GlucoseChart`, `ExpandableCard`, `OutcomeBadge`, and `DayGroupHeader` components exist — ready to be wired with data in Phase 3
**Depends on**: Phase 1
**Requirements**: HIST-01, HIST-02, HIST-03, HIST-05, HIST-06
**Success Criteria** (what must be TRUE):
  1. History screen loads and displays entries grouped under day headers (e.g. "Wednesday 18 Mar") that collapse and expand on tap
  2. Tapping any history card expands it to reveal full glucose stats and a curve graph — tapping again collapses it
  3. Every history card shows an outcome badge: Green (stayed 3.9–10.0), Orange (went above 10, returned to range), Dark Amber (stayed above 10 but below 14), Red (below 3.9 or ≥14.0), Pending (curve incomplete), or None (no curve)
  4. User can tap "Late Entry" when logging a meal and select an earlier time — the glucose curve is fetched from that earlier time rather than now
  5. All legacy meals (pre-session data) are migrated to proper session records on first launch after this phase ships — migration is idempotent and runs only once
**Plans**: 6 plans

Plans:
- [ ] 02-01-PLAN.md — Install react-native-gifted-charts, define component prop contracts in src/components/types.ts
- [ ] 02-02-PLAN.md — Build GlucoseChart (line chart with reference lines) and OutcomeBadge (coloured pill) components
- [ ] 02-03-PLAN.md — Build ExpandableCard, DayGroupHeader, SessionSubHeader components
- [ ] 02-04-PLAN.md — Add migrateLegacySessions to storage.ts, refactor MealHistoryScreen to session model, wire migration in App.tsx
- [ ] 02-05-PLAN.md — Add Late Entry time picker to MealLogScreen and InsulinLogScreen
- [ ] 02-06-PLAN.md — Automated checks + human verification checkpoint

### Phase 3: Intelligence Layer — Matching and Outcome Surfacing
**Goal**: The existing matching engine is wired into the UI — users see "You've eaten this before" with past outcomes on both expanded history cards and at meal log time, and successful past sessions are flagged
**Depends on**: Phase 2
**Requirements**: PATT-01, PATT-02
**Success Criteria** (what must be TRUE):
  1. When a history card is expanded, a "You've eaten this before" section appears if 2 or more past matching sessions exist — showing up to 5 matches as "Last time: [meal name], [units] units, [outcome badge]" with no advice or recommendation
  2. When typing a meal name in the meal log screen, matching past sessions appear after a short delay — each showing the same historical format with no suggestion language
  3. Any match where glucose stayed in range (Green outcome) shows a "This went well last time" indicator — the indicator appears only when the outcome badge is Green, never when data is incomplete
**Plans**: TBD

### Phase 4: HomeScreen Glucose Graph and HbA1c Disclaimer
**Goal**: The HomeScreen exposes full-day glucose context on tap and surfaces the HbA1c estimate with a clear disclaimer — completing the user's ability to see their glucose story at a glance
**Depends on**: Phase 1 (sum fix must be verified before disclaimer draws attention to HbA1c), Phase 2 (GlucoseChart component must exist)
**Requirements**: HOME-01, HOME-02, HOME-03, HIST-04
**Success Criteria** (what must be TRUE):
  1. Tapping the main mmol/L reading on HomeScreen opens a full-day line graph showing the last 24 hours of glucose readings with reference lines at 3.9 and 10.0 mmol/L
  2. Tapping the estimated HbA1c value shows a modal that reads: "Please be aware HbA1c is usually calculated over 90 days. You should get accurate testing and take guidance from your diabetes team."
  3. Quick log buttons on HomeScreen are visually centred on screen
  4. User can tap an insulin log entry to edit the dose — the corrected value is saved and the original is preserved
**Plans**: TBD

### Phase 5: Data Model Extensions and Editing
**Goal**: The app captures AI carb estimate confidence for future safety surfacing, tracks long-acting insulin effectiveness via an overnight glucose window, and stores both without requiring migration scripts
**Depends on**: Phase 3
**Requirements**: PATT-03, PATT-04
**Success Criteria** (what must be TRUE):
  1. After each meal's 3-hour glucose curve completes, the app records whether the AI carb estimate agreed with the outcome — if the estimate was wrong last time and the user went low, a warning appears before the next AI estimate for the same meal
  2. Long-acting insulin log cards display a bedtime reading (target 10pm) and a morning reading (target 7am next day) — both appear on the card once readings are available, showing what the glucose did overnight
**Plans**: TBD

### Phase 6: Route to Market
**Goal**: The landing page captures pre-interest signups, the MHRA regulatory paper trail is started, and the public presence reflects the app's current capabilities
**Depends on**: Nothing (independent of app phases)
**Requirements**: MKTG-01, MKTG-02, LEGAL-01
**Success Criteria** (what must be TRUE):
  1. Landing page includes a working AI carb estimation photo demo section and a Dexcom integration teaser — both visible without scrolling past the fold on desktop
  2. A visitor can submit their email address on the landing page and it is captured for pre-interest follow-up
  3. An email has been sent to devices@mhra.gov.uk describing the app and its "no advice, only historical patterns" framing — the response (or sent date if no response) is documented in project records
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Scaffold Next.js project, Loops.so /api/subscribe Route Handler, MHRA correspondence record
- [ ] 06-02-PLAN.md — IPhoneMockup + EmailForm components, Hero / DemoSection / Footer sections, page.tsx composition
- [ ] 06-03-PLAN.md — Git init, Vercel deploy, LOOPS_API_KEY env var, custom domain, live verification checkpoint

## Progress

**Execution Order:**
Phase 6 (Route to Market) is INDEPENDENT — start immediately, in parallel with Phase 1. The MHRA email (LEGAL-01) should be sent before any code ships to establish the regulatory paper trail.
Phases 1 → 2 → 3 → 4 → 5 execute in numeric order.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Tech Debt and Foundation Fixes | 4/4 | Complete   | 2026-03-21 |
| 2. History Refactor and Core UX Components | 0/6 | Planned | - |
| 3. Intelligence Layer — Matching and Outcome Surfacing | 0/TBD | Not started | - |
| 4. HomeScreen Glucose Graph and HbA1c Disclaimer | 0/TBD | Not started | - |
| 5. Data Model Extensions and Editing | 0/TBD | Not started | - |
| 6. Route to Market | 0/3 | Planned | - |
