# BolusBrain

## What This Is

BolusBrain is a personal meal and insulin tracking app for Type 1 diabetics, built for Liam Biswell (T1D, FreeStyle Libre 2 Plus, UK). It logs meals with AI-assisted carb estimation from photos, records insulin doses, tracks post-meal glucose curves via Nightscout CGM integration, and surfaces historical patterns to help the user make better-informed decisions — without ever giving advice or recommendations.

## Core Value

Show the user what happened last time, clearly and honestly — so they can make their own informed decisions, never be told what to do.

## Requirements

### Validated

<!-- Existing capabilities confirmed in codebase — phases 1–7 complete -->

- ✓ Live glucose display with 5-minute polling, trend arrow, colour coding (red/green/orange) — Phase 1
- ✓ Meal photo logging with camera/library picker — Phase 2
- ✓ AI carb estimation from meal photo (Claude API, UK CoFID standards, 10/day limit) — Phase 2
- ✓ Insulin logging — long-acting, correction, and tablet types — Phase 3
- ✓ Post-meal 3-hour glucose curve captured and stored per meal — Phase 4
- ✓ Meal history screen with merged meals + insulin log cards, sorted newest-first — Phase 5
- ✓ Session grouping — meals within 3-hour window grouped for pattern matching — Phase 5
- ✓ Meal matching engine (Jaccard similarity, 75% meal name + 25% insulin weighting) — Phase 5
- ✓ Rolling 30-day glucose store — avg12h, avg30d computed locally — Phase 6
- ✓ Estimated HbA1c derived from avg30d, cached daily — Phase 6
- ✓ Carb estimation using UK standards (available carbs only, grams, no USDA) — Phase 7

### Active

<!-- Next milestone — surfacing data to the user + UX improvements -->

**Pattern Recognition & Intelligence**
- [ ] "You've eaten this before" UI — surface matching sessions in history and at meal log time
- [ ] Traffic light outcome badge on history cards (Green/Orange/Red based on glucose response)
- [ ] Mark meals as "successful" when glucose stayed in range; flag this in future matches
- [ ] AI carb estimate confidence model — track whether estimate agreed with outcome, build per-user confidence score, surface warning if estimate was wrong and user went low last time
- [ ] Long-acting insulin tracking window: bedtime reading (10pm) + morning reading (7am next day)
- [ ] Pattern reports and suggestions gated behind 90+ days of data (3-month minimum)

**App Design & UX**
- [ ] Interactive glucose graph — visible when user taps the main mmol reading on HomeScreen
- [ ] Expandable history cards — tap to reveal full detail, graph, and stats
- [ ] Dose editing — allow correction of mistaken insulin entries
- [ ] Day folder grouping — entries grouped by day, expandable in history
- [ ] Quick log section centred on HomeScreen
- [ ] HbA1c disclaimer modal on tap: "HbA1c is usually calculated over 90 days — get accurate testing and guidance from your diabetes team"
- [ ] Daily trend graph visible when tapping the mmol reading

**Tech Debt & Stability**
- [ ] Move Nightscout URL and token to `.env` (currently hardcoded in nightscout.ts)
- [ ] Fix `fetchGlucosesSince` silently swallowing network errors
- [ ] Fix GlucoseStore sum drift — recompute from array instead of incremental total
- [ ] Remove duplicate `GlucoseResponse` build logic — extract shared pure function
- [ ] Migrate `expo-file-system/legacy` import to current API
- [ ] One-time migration for legacy meals (pre-session) to proper session records

**Route to Market**
- [ ] Complete landing page — AI carb estimation demo section, Dexcom integration teaser
- [ ] Email capture loop for pre-interest signups
- [ ] Facebook groups community outreach (pre-interest, no spam)
- [ ] Revenue model and route to market decision

**Legal & Compliance**
- [ ] MHRA informal guidance — email devices@mhra.gov.uk with app description for paper trail
- [ ] Document the "no advice, only historical facts" framing as regulatory defence
- [ ] Regulatory solicitor consulted if/when prediction engine is considered

### Out of Scope

- Insulin dosing advice or recommendations — legal/regulatory risk; framing is always historical only
- Prediction engine — deferred until 50+ meals logged AND 90+ days of data; will require MHRA guidance and potentially regulatory solicitor
- Multi-user support — personal app first; backend/auth needed before this is possible
- Dexcom integration — v2+; currently FreeStyle Libre 2 Plus via Nightscout only
- Real-time backend sync — all data device-local for now; backend (Node.js + PostgreSQL) planned for future milestone
- Social/sharing features — out of scope for v1

## Context

**Developer:** Liam Biswell — T1D, FreeStyle Libre 2 Plus (EU2), UK
**CGM Bridge:** LibreLinkUp → Nightscout → BolusBrain API polling (5-min intervals)
**Data:** All device-local via AsyncStorage. No backend yet. Nightscout is read-only (no writes).
**Platform:** Expo ~54 / React Native 0.81.5 / TypeScript. iOS + Android targets.
**Current build state:** Phases 1–7 complete. Matching engine fully built but not yet surfaced in any UI. Phase 8 ("you've eaten this before") is the immediate next step.
**Key architectural rule:** Curves stored on `meal.glucoseResponse`, not session. Sessions exist for pattern matching only — not displayed directly.
**Legal framing:** App shows what happened historically. Never suggests what to do. Every pattern feature must be framed as "last time you ate this..." not "you should take X units."

## Constraints

- **Safety/Legal**: Never give insulin dosing advice — show historical patterns only. This is the non-negotiable core constraint.
- **Tech stack**: Expo managed workflow — must stay within Expo SDK 54 constraints until explicitly upgraded
- **Data standards**: UK CoFID/McCance & Widdowson carb standards only — available carbohydrate (starch + sugars), grams, no USDA
- **Glucose display**: Always mmol/L — conversion from mg/dL happens only at the Nightscout API boundary
- **API keys**: Never hardcoded — all secrets via `.env` with `EXPO_PUBLIC_` prefix
- **UX**: Simple one-handed use at mealtimes — no complex multi-step flows

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No global state manager | Each screen owns local state — simpler for solo dev, acceptable for current data volume | — Pending revisit at scale |
| AsyncStorage as sole data store | Personal app, device-local is sufficient for v1; backend planned for v2 | — Pending (scaling limit approaching) |
| Matching on sessions not individual meals | Groups multi-course meals correctly; more meaningful comparison | ✓ Good |
| 75% meal name + 25% insulin weighting in Jaccard similarity | Meal name is more predictive than dose for matching | — Pending validation |
| Pattern reports gated at 90+ days | Prevents premature/misleading statistical conclusions | ✓ Good |
| Never suggest doses, only recall history | Keeps app out of SaMD regulatory territory for Phase 1/2 | ✓ Good |
| MHRA contact before prediction engine | Documents good-faith regulatory engagement; avoids inadvertent SaMD classification | — Pending |

---
*Last updated: 2026-03-18 after initialization*
