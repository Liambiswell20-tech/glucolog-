# Requirements: BolusBrain — Milestone 2

**Defined:** 2026-03-18
**Core Value:** Show the user what happened last time, clearly and honestly — so they can make their own informed decisions, never be told what to do.

## v1 Requirements

### Tech Debt

- [ ] **DEBT-01**: Nightscout URL and token moved to `.env` as `EXPO_PUBLIC_NIGHTSCOUT_URL` and `EXPO_PUBLIC_NIGHTSCOUT_TOKEN` — no credentials in source files
- [ ] **DEBT-02**: `GlucoseStore.sum` recomputed from `readings` array on every `updateGlucoseStore` call — eliminates silent HbA1c drift
- [ ] **DEBT-03**: `buildGlucoseResponse()` extracted as a shared pure function used by both `fetchAndStoreCurveForMeal` and `_fetchCurveForSession` — no more duplicate logic
- [ ] **DEBT-04**: `carbEstimate.ts` migrated from `expo-file-system/legacy` to current `expo-file-system` API — no future SDK upgrade breakage

### History UX

- [ ] **HIST-01**: User can tap any history card to expand it and see full glucose stats, trend graph, and session context
- [ ] **HIST-02**: History screen groups entries into day folders (e.g. "Wednesday 18 Mar") that are collapsed by default and expand on tap
- [ ] **HIST-03**: Every meal history card displays a traffic light outcome badge — Green (glucose stayed 3.9–10.0 mmol/L), Orange (slight rise then returned to range), Red (went below 3.9 mmol/L OR above 13 mmol/L OR above 10 mmol/L and did not return within 3 hours)
- [ ] **HIST-04**: User can edit a previously logged insulin dose to correct a mistake — corrected value persists in storage
- [ ] **HIST-05**: User can tap "Late Entry" when logging a meal or insulin dose, select an earlier time that day, and have the glucose curve fetched from that earlier time rather than the current time

### Pattern Intelligence

- [ ] **PATT-01**: When viewing an expanded history card or logging a new meal, user sees a "You've eaten this before" section showing up to 5 matching past sessions — displayed as "Last time: [meal name], [units] units, [outcome badge]" with no advice or recommendation
- [ ] **PATT-02**: Meals where glucose stayed in range (Green outcome) are marked as successful — when a matching meal appears in "You've eaten this before", the successful flag is surfaced ("This went well last time")
- [ ] **PATT-03**: AI carb estimation tracks whether each estimate agreed with the actual outcome (glucose stayed in range vs went high/low) — a confidence score per meal is stored and updated after the curve completes; if the estimate was wrong last time and the user went low, a warning is shown before the next estimate for the same meal
- [ ] **PATT-04**: Long-acting insulin logs capture a bedtime reading (target 10pm) and a morning reading (target 7am next day) as the overnight window — these are displayed on the insulin log card to show basal effectiveness

### HomeScreen

- [ ] **HOME-01**: User can tap the main mmol/L reading on HomeScreen to open a full-day glucose trend graph showing readings for the last 24 hours as a line chart
- [ ] **HOME-02**: User can tap the estimated HbA1c value to see a modal stating: "Please be aware HbA1c is usually calculated over 90 days. You should get accurate testing and take guidance from your diabetes team."
- [ ] **HOME-03**: Quick log buttons on HomeScreen are centred on screen

### Route to Market

- [ ] **MKTG-01**: Landing page finalised with AI carb estimation photo demo section and Dexcom integration as next-steps teaser
- [ ] **MKTG-02**: Email capture form on landing page captures pre-interest signups and stores them
- [ ] **LEGAL-01**: MHRA informal guidance email sent to devices@mhra.gov.uk with app description and "no advice, only historical patterns" framing — response and date documented in project records

## v2 Requirements

### Pattern Intelligence (deferred — needs data volume)

- **PATT-V2-01**: Pattern reports and trend summaries — available only after 90+ days of data; not before
- **PATT-V2-02**: Meal outcome trends over time — "This meal has gone well 4 out of 5 times"

### Infrastructure (deferred — needs backend)

- **INFRA-V2-01**: Cloud backup and data export for device loss protection
- **INFRA-V2-02**: Backend (Node.js + PostgreSQL) with AsyncStorage as cache layer
- **INFRA-V2-03**: User authentication for multi-device and cloud sync

### Integrations (deferred)

- **INT-V2-01**: Dexcom CGM integration (FreeStyle Libre 2 Plus via Nightscout sufficient for v1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Insulin dosing advice or recommendations | Legal/regulatory — crosses into SaMD territory; all framing must be historical only |
| Prediction engine | Deferred until 50+ meals logged AND 90+ days of data; requires MHRA guidance + potentially regulatory solicitor |
| "You should take X units" language anywhere | Non-negotiable legal constraint — replaced by "last time you ate this, you took X units" |
| Suggestions before 90 days of data | Statistically meaningless and potentially misleading for T1D management |
| Multi-user support | Requires backend + auth — v2 milestone |
| Social or sharing features | Out of scope for personal app v1 |
| Carb database lookup | UK CoFID AI estimation is the approach — no USDA lookup, no pre-built database |
| Gamification | Inappropriate for medical context |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEBT-01 | Phase 1 | Pending |
| DEBT-02 | Phase 1 | Pending |
| DEBT-03 | Phase 1 | Pending |
| DEBT-04 | Phase 1 | Pending |
| HIST-01 | Phase 2 | Pending |
| HIST-02 | Phase 2 | Pending |
| HIST-03 | Phase 2 | Pending |
| HIST-05 | Phase 2 | Pending |
| PATT-01 | Phase 3 | Pending |
| PATT-02 | Phase 3 | Pending |
| HOME-01 | Phase 4 | Pending |
| HOME-02 | Phase 4 | Pending |
| HOME-03 | Phase 4 | Pending |
| HIST-04 | Phase 4 | Pending |
| PATT-03 | Phase 5 | Pending |
| PATT-04 | Phase 5 | Pending |
| MKTG-01 | Phase 6 | Pending |
| MKTG-02 | Phase 6 | Pending |
| LEGAL-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
