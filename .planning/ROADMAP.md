# Roadmap: BolusBrain — Milestone 2

## Overview

Milestone 2 transforms BolusBrain from a data-collection app into an intelligent personal companion. The matching engine is already built but has never been surfaced in any UI. This milestone exposes that intelligence incrementally: first fixing the data integrity bugs and fragile code that would silently corrupt what the user sees, then building the history screen components on a correct data model, then wiring the matching engine into those components, then completing the HomeScreen improvements, then extending the data model for longer-horizon features, and finally establishing the route to market. Every phase delivers a coherent, observable capability that works without the phases that follow it.

## Phases

- [x] **Phase 1: Tech Debt and Foundation Fixes** - Eliminate data bugs and fragile error handling that would corrupt new features built on top of them (completed 2026-03-21)
- [ ] **Phase 2: History Refactor and Core UX Components** - Migrate history screen to session model and build the reusable components all intelligence features depend on
- [ ] **Phase 3: Intelligence Layer — Matching and Outcome Surfacing** - Wire the existing matching engine into history cards and meal log screen
- [x] **Phase 4: Session Grouping, Pattern Recall & HomeScreen Redesign** - Arc gauge HomeScreen, pattern recall bottom sheet, averaged stats, HbA1c disclaimer (completed 2026-03-24)
- [ ] **Phase 5: Data Model Extensions and Editing** - Add AI confidence tracking, long-acting overnight window, and dose editing
- [ ] **Phase 6: Route to Market** - Complete landing page, email capture, and MHRA regulatory contact
- [x] **Phase 8: B2B Data Capture Layer** - Equipment onboarding gate, equipment changelog, meal stamping, hypo treatment quick log, TIR calculation, and data consent — positioning the dataset for acquisition (completed 2026-03-31)
- [ ] **Phase 9: Pre-Beta Polish** - Onboarding rework (data sharing + about me screens), hypo treatment rework, tablet dosing, history tabs with long-acting view, help copy update, keyboard and navigation bug fixes
- [x] **Phase 10: UI Component Library & Charting** - Install React Native Reusables + NativeWind v4, refactor core components to design system (completed 2026-04-14)
- [x] **Phase 10.5: MemStack Selective Install** - Persistent session memory, structured handoffs, commit standards (completed 2026-04-14)
- [ ] **Phase 11: Supabase Migration & Multi-User Backend** - Migrate from AsyncStorage to Supabase (auth, PostgreSQL, encrypted storage), server-side rate limiting, AI consent flow, multi-user data isolation

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
  3. Every history card shows an outcome badge: Green (stayed 3.9-10.0), Orange (went above 10, returned to range), Dark Amber (stayed above 10 but below 14), Red (below 3.9 or >=14.0), Pending (curve incomplete), or None (no curve)
  4. User can tap "Late Entry" when logging a meal and select an earlier time — the glucose curve is fetched from that earlier time rather than now
  5. All legacy meals (pre-session data) are migrated to proper session records on first launch after this phase ships — migration is idempotent and runs only once
**Plans**: 6 plans

Plans:
- [x] 02-01-PLAN.md — Install react-native-gifted-charts, define component prop contracts in src/components/types.ts
- [x] 02-02-PLAN.md — Build GlucoseChart (line chart with reference lines) and OutcomeBadge (coloured pill) components
- [x] 02-03-PLAN.md — Build ExpandableCard, DayGroupHeader, SessionSubHeader components
- [x] 02-04-PLAN.md — Add migrateLegacySessions to storage.ts, refactor MealHistoryScreen to session model, wire migration in App.tsx
- [x] 02-05-PLAN.md — Add Late Entry time picker to MealLogScreen and InsulinLogScreen
- [ ] 02-06-PLAN.md — Automated checks + human verification checkpoint

### Phase 3: Intelligence Layer — Matching and Outcome Surfacing
**Goal**: The existing matching engine is wired into the UI — users see "You've eaten this before" with past outcomes on both expanded history cards and at meal log time, and successful past sessions are flagged
**Depends on**: Phase 2
**Requirements**: PATT-01, PATT-02
**Success Criteria** (what must be TRUE):
  1. When a history card is expanded, a "You've eaten this before" section appears if 2 or more past matching sessions exist — showing up to 5 matches as "Last time: [meal name], [units] units, [outcome badge]" with no advice or recommendation
  2. When typing a meal name in the meal log screen, matching past sessions appear after a short delay — each showing the same historical format with no suggestion language
  3. Any match where glucose stayed in range (Green outcome) shows a "This went well last time" indicator — the indicator appears only when the outcome badge is Green, never when data is incomplete
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Wave 0: Create matching.test.ts covering findSimilarSessions contract (null return, exclusion rules, MAX_MATCHES cap)
- [x] 03-02-PLAN.md — Wave 2: Extract glucoseColor util, widen MatchingSlotProps type, build MatchingSlot in ExpandableCard, wire allSessions through MealHistoryScreen
- [x] 03-03-PLAN.md — Wave 3: Add debounced live matching and insulin hint to MealLogScreen
- [ ] 03-04-PLAN.md — Wave 4: Human verification checkpoint (Tests A-F)

### Phase 4: Session Grouping, Pattern Recall & HomeScreen Redesign
**Goal**: The HomeScreen is redesigned with an arc gauge displaying current glucose, pattern recall is surfaced via a bottom sheet from history cards and averaged stats in meal log, and the HbA1c estimate is shown with an appropriate disclaimer — completing the user's ability to understand their glucose story at a glance
**Depends on**: Phase 1 (sum fix must be verified before disclaimer draws attention to HbA1c), Phase 2 (GlucoseChart component must exist)
**Requirements**: HOME-01, HOME-02, HOME-03, HIST-04
**Success Criteria** (what must be TRUE):
  1. HomeScreen displays current glucose as an arc gauge spanning 2.0-20.0 mmol/L across a 270-degree sweep, using JetBrains Mono for the glucose value and a pulsing LIVE indicator — null/loading state renders "- -" in the gauge centre
  2. Tapping a history card opens a bottom sheet showing up to 10 past matching sessions as tabs — each tab renders a GlucoseChart for that session; the sheet is silent (does not open) if 0 past sessions exist
  3. The meal log screen shows averaged stats (avgRise, avgPeak, avgTimeToPeak) above live match rows when 2 or more matching past sessions exist
  4. Tapping the estimated HbA1c value shows a modal that reads: "Please be aware HbA1c is usually calculated over 90 days. You should get accurate testing and take guidance from your diabetes team."
  5. All AsyncStorage.getItem calls in storage.ts are wrapped in try/catch — corrupt entries log a warning and return safe defaults rather than crashing
**Plans**: 7 plans

Plans:
- [x] 04-01-PLAN.md — Wave 1: Extract formatDate utility, create glucoseToArcAngle pure function, create theme.ts
- [x] 04-02-PLAN.md — Wave 1: Harden all AsyncStorage.getItem calls in storage.ts with try/catch (HIST-04 storage hardening)
- [x] 04-03-PLAN.md — Wave 2: Create SafetyDisclaimer and AveragedStatsPanel components
- [x] 04-04-PLAN.md — Wave 2: Create MealHistoryCard (rename from ExpandableCard, tap-to-open-sheet) and MealBottomSheet
- [x] 04-05-PLAN.md — Wave 3: Wire MealHistoryScreen to MealHistoryCard + MealBottomSheet; wire MealLogScreen to AveragedStatsPanel
- [x] 04-06-PLAN.md — Wave 3: HomeScreen full redesign (arc gauge, HbA1c modal, centred buttons, animations) + App.tsx font loading
- [x] 04-07-PLAN.md — Wave 4: Unit tests for all new Phase 4 utilities and components

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
Phases 1 -> 2 -> 3 -> 4 -> 5 execute in numeric order.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Tech Debt and Foundation Fixes | 4/4 | Complete   | 2026-03-21 |
| 2. History Refactor and Core UX Components | 5/6 | In Progress|  |
| 3. Intelligence Layer — Matching and Outcome Surfacing | 3/4 | In Progress|  |
| 4. Session Grouping, Pattern Recall & HomeScreen Redesign | 7/7 | Complete   | 2026-03-24 |
| 5. Data Model Extensions and Editing | 0/TBD | Not started | - |
| 6. Route to Market | 0/3 | Planned | - |
| 8. B2B Data Capture Layer | 8/8 | Complete   | 2026-03-31 |
| 9. Pre-Beta Polish | 7/7 | Complete   | 2026-04-08 |
| 10. UI Component Library & Charting | —/— | Complete   | 2026-04-14 |
| 10.5. MemStack Selective Install | —/— | Complete   | 2026-04-14 |
| 11. Supabase Migration & Multi-User Backend | 3/8 | In Progress|  |

### Phase 7: Premium features and monetization strategy

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 7/7 plans complete

Plans:
- [ ] TBD (run /gsd:plan-phase 7 to break down)

### Phase 11: Supabase Migration & Multi-User Backend
**Goal**: The app moves from local-only AsyncStorage to Supabase as the backend — with auth (email/password + biometric), encrypted health data storage, server-side rate limiting on the carb estimate proxy, AI consent flow, multi-user data isolation, and data migration from AsyncStorage to cloud — enabling multiple beta users to use the app independently
**Depends on**: Phase 9 (pre-beta polish), Phase 10 (UI library), Phase 10.5 (MemStack) — all complete
**Requirements**: SUPA-01, SUPA-02, SUPA-03, SUPA-04, SUPA-05, SUPA-06, SUPA-07, SUPA-08
**Success Criteria** (what must be TRUE):
  1. Users can sign up and sign in with email/password — biometric unlock (Face ID / fingerprint) available after first login
  2. All health data (glucose, meals, insulin, HbA1c) stored in Supabase PostgreSQL with row-level security — each user sees only their own data
  3. Health data encrypted at rest (GDPR Article 9 special category data compliance)
  4. Server-side rate limiting on `/api/carb-estimate` proxy (JWT-based, 10 req/day/user) — client-side bypass eliminated
  5. AI consent modal shown before first carb estimate: "Your photo is sent to Anthropic's Claude API for carb estimation and is not stored by them" — one-tap accept, persisted
  6. Existing AsyncStorage data migrated to Supabase via manual Settings button — migration is idempotent and preserves all historical meals, insulin logs, equipment profiles, and consent records
  7. Data sharing toggle enforced server-side — when user turns off, their data is excluded from any aggregation queries
  8. HelpScreen copy updated to accurately reflect that photos pass through Anthropic's servers for carb estimation
**Plans**: 8 plans

Plans:
- [x] 11-01-PLAN.md — Wave 1: Pre-migration refactor — consolidate AsyncStorage calls from App.tsx and HomeScreen.tsx into storage.ts
- [x] 11-02-PLAN.md — Wave 1: Supabase client setup (LargeSecureStore adapter), schema SQL (9 tables + RLS), TypeScript row types, polyfill imports
- [x] 11-03-PLAN.md — Wave 1: Server-side rate limit on /api/carb-estimate (JWT auth + Postgres counter) in bolusbrain-landing repo
- [ ] 11-04-PLAN.md — Wave 2: AuthContext (session + signIn/signUp/signOut), LoginScreen, SignUpScreen, auth-gated navigation in App.tsx
- [ ] 11-05-PLAN.md — Wave 3: Biometric unlock (expo-local-authentication + expo-secure-store), auto-enable after first login
- [ ] 11-06-PLAN.md — Wave 4: Idempotent migration runner (chunked upserts, progress UI), Settings "Migrate my data" button, sign-out button, data sharing enforcement
- [ ] 11-07-PLAN.md — Wave 2: AI consent modal, consent gate in carbEstimate.ts, HelpScreen copy update
- [ ] 11-08-PLAN.md — Wave 5: Unit tests (migration, consent, crypto guard) + human verification checkpoint on real data

### Phase 9: Pre-Beta Polish
**Goal**: The onboarding flow captures data sharing consent and demographic profile before equipment, hypo treatment supports free-text with optional brand/amount, tablet dosing is configurable in settings, history has a long-acting insulin tab with 12-hour glucose curves, help copy reflects anonymised data sharing, and keyboard/navigation bugs are fixed — the app is ready for external beta testers
**Depends on**: Phase 8 (B2B data capture layer must be complete)
**Requirements**: BETA-01, BETA-02, BETA-03, BETA-04, BETA-05, BETA-06, BETA-07
**Success Criteria** (what must be TRUE):
  1. On first launch, user sees 3 onboarding screens in order: Data Sharing opt-in -> About Me demographics -> Equipment (existing)
  2. About Me captures age range, gender (mandatory) and T1D duration, HbA1c (optional) — stored in AsyncStorage
  3. Hypo treatment shows preset suggestions with open text, optional brand free-text, optional amount — single item save
  4. Settings has a Tablet Dosing section where user can add multiple tablets (name, mg, amount per day)
  5. History page has two tabs: Meals + rapid insulin (existing) and Long-acting insulin (dose list with 12-hour glucose curves)
  6. Help & FAQ data sharing section mentions fully anonymised data used to improve diabetes care
  7. Keyboard no longer obscures save buttons; no white flash on home navigation
**Plans**: 7 plans

Plans:
- [x] 09-01-PLAN.md — Types, storage helpers, dark theme, onboarding gate infrastructure, background standardisation
- [x] 09-02-PLAN.md — DataSharingOnboardingScreen + AboutMeOnboardingScreen + App.tsx wiring
- [x] 09-03-PLAN.md — Hypo treatment rework (free text, optional brand/amount) + Help FAQ copy update
- [x] 09-04-PLAN.md — Multi-tablet dosing in SettingsScreen
- [x] 09-05-PLAN.md — History two-tab layout with long-acting insulin tab and 12hr glucose curves
- [x] 09-06-PLAN.md — KeyboardAvoidingView standardisation across all form screens
- [x] 09-07-PLAN.md — Full test suite + human verification checkpoint (all BETA-01 through BETA-07)

### Phase 8: B2B Data Capture Layer

**Goal**: The app records which insulin brand and delivery device was active at every data point, tracks hypo treatment events with recovery curves, calculates time-in-range longitudinally, and captures user consent — creating a structured dataset that is commercially credible for acquisition or partnership positioning
**Depends on**: Phase 4 (HomeScreen and storage hardening must be complete)
**Requirements**: B2B-01, B2B-02, B2B-03, B2B-04, B2B-05, B2B-06, B2B-07, B2B-08
**Success Criteria** (what must be TRUE):
  1. On first launch (or after storage clear), EquipmentOnboardingScreen is shown full-screen before HomeScreen — user cannot reach HomeScreen without completing the 4 mandatory pickers (rapid insulin, long-acting insulin, delivery method, CGM device)
  2. Every meal saved after this phase ships has immutable `insulin_brand` and `delivery_method` fields stamped from `getCurrentEquipmentProfile()` at save time
  3. Changing any equipment field in Settings shows a confirmation modal before committing the change — the equipment changelog stores the old and new values with a shared timestamp
  4. The HomeScreen has an optional "Treating a low?" button; tapping it opens a bottom sheet where the user can log treatment type, amount, and unit — the record is saved as a `HypoTreatment` with the current glucose reading pre-filled
  5. On app foreground, if no `DailyTIR` record exists for yesterday, one is silently calculated and stored; the store never exceeds 90 records
  6. Settings screen has a "Data & Research" toggle that is OFF by default; toggling it saves a `DataConsent` record with version "1.0"
  7. All B2B-02 unit tests pass: equipmentProfile.test.ts (11 cases) and timeInRange.test.ts (6 cases)
**Plans**: 8 plans

Plans:
- [x] 08-01-PLAN.md — Wave 0: src/types/equipment.ts interfaces + equipmentProfile.test.ts (11 stubs) + timeInRange.test.ts (6 stubs)
- [x] 08-02-PLAN.md — Wave 1: Implement equipmentProfile.ts (4 functions) + timeInRange.ts (3 functions), turn all 17 stubs green
- [x] 08-03-PLAN.md — Wave 2: EquipmentOnboardingScreen + App.tsx navigation gate (gateChecked state, conditional initialRouteName)
- [x] 08-04-PLAN.md — Wave 3: EquipmentChangeConfirmation modal + "My Equipment" section in SettingsScreen
- [x] 08-05-PLAN.md — Wave 3: Meal stamping (Meal interface extension + MealLogScreen stamp + read-only chip)
- [x] 08-06-PLAN.md — Wave 3: HypoTreatmentSheet + HomeScreen hypo button + useAppForeground hook + App.tsx TIR/recovery foreground handler
- [x] 08-07-PLAN.md — Wave 3: Data & Research consent toggle in SettingsScreen (versioned, OFF by default)
- [x] 08-08-PLAN.md — Wave 4: Full test run + human verification checkpoint (all B2B-01 through B2B-08 acceptance checks)

### Phase 10: UI Component Library & Charting
**Goal**: Core UI moved to a design system foundation — NativeWind v4 + React Native Reusables (RNR) components (Card, Badge, Button, Dialog, Switch, Skeleton, Alert, Label, Tabs, Separator, Text, Input) with design tokens (bb-background, bb-surface, bb-green, etc.) and JetBrains Mono/Inter font loading — enabling consistent styling across every screen without bespoke StyleSheets
**Depends on**: Phase 9 (pre-beta polish)
**Status**: Complete 2026-04-14 (git tags: `phase-10-complete`, `v0.7-beta`)
**Plans**: Built outside GSD (direct implementation over 2 sessions)
**Key outcomes**:
  - NativeWind v4 (Tailwind CSS v3) with design tokens + `~/` path alias
  - RNR components installed and wired into MealHistoryCard, OutcomeBadge, save buttons, delete dialogs, Settings switches, loading skeletons
  - Long-acting insulin filtered from Meals tab (now Long-acting tab only)
  - Trend arrow added to HomeScreen arc gauge
  - Reverted: `react-native-gifted-charts` (data offset bug), RNR Tabs on MealBottomSheet/MealHistoryScreen (render bug) — SVG charts + Pressable tabs retained
  - Protected components verified untouched: SafetyDisclaimer, arc gauge, equipment onboarding/changelog, hypo treatment, TIR, data consent, `getMealFingerprint`, AI carb estimation, Nightscout integration

### Phase 10.5: MemStack Selective Install
**Goal**: Persistent session memory, structured handoffs, and commit discipline for Claude Code — without conflicting with existing GSD + CARL infrastructure
**Depends on**: Phase 10
**Status**: Complete 2026-04-14 (commit `6a28785`)
**Plans**: Built outside GSD (selective install)
**Key outcomes**:
  - Rules installed: Echo (memory recall), Diary (session logging), memstack.md (commit/build standards), headroom.md (proxy docs)
  - Commands: `/memstack-search`, `/memstack-headroom`
  - SQLite DB initialized at `memstack/db/memstack.db`
  - All paths absolute for cross-directory compatibility
  - Skipped by design: all hooks (conflict with CARL + GSD), Headroom proxy (risky without auto-start), work.md (overlaps GSD), notify/nudges/pro-skills/MCP rules
  - Zero app code changes
