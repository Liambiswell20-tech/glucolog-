# BolusBrain — Claude Code Project Rules

## What This App Is
A personal meal and insulin tracking app for Type 1 diabetics.
Developer and first user: Liam Biswell (T1D, FreeStyle Libre 2 Plus, UK).

Full project brief: `C:\Users\Liamb\OneDrive\Desktop\Bolus Brain Project\CLAUDE.md`

---

## Security Rules — NON-NEGOTIABLE
- **NEVER hardcode API keys, tokens, URLs with tokens, or credentials in source files**
- All secrets must live in `.env` only — use `EXPO_PUBLIC_*` prefix for Expo access
- `.env` is gitignored — never commit it, never suggest committing it
- When adding a new external service, always use an env var from day one
- If a secret is ever accidentally committed, treat it as compromised immediately — rotate it

**Env vars in use:**
- `EXPO_PUBLIC_NIGHTSCOUT_URL` — Nightscout API endpoint
- `EXPO_PUBLIC_NIGHTSCOUT_TOKEN` — Nightscout access token
- `EXPO_PUBLIC_ANTHROPIC_API_KEY` — Claude API key for carb estimation

---

## Absolute Rules
- **NEVER suggest, recommend, or perform any action that could cause data loss** — no clearing app data, no deleting AsyncStorage, no factory resets, no destructive migrations. Liam's logged data is irreplaceable.
- Always display glucose in **mmol/L** — never mg/dL
- **Never give insulin dosing advice** — show historical patterns only
- Frame everything as "last time you ate this..." not "you should take X units"
- Keep UI simple — used at mealtimes, often one-handed

## Glucose Colour Ranges (used throughout the app)
- Red: `< 3.9 mmol/L` (low / hypo)
- Green: `3.9 – 10.0 mmol/L` (in range)
- Orange: `> 10.0 mmol/L` (high)

## Nightscout API
- URL: set via `EXPO_PUBLIC_NIGHTSCOUT_URL` in `.env`
- Token: set via `EXPO_PUBLIC_NIGHTSCOUT_TOKEN` in `.env`
- `sgv` is mg/dL — divide by 18 for mmol/L
- Readings every 5 minutes

## Key Architecture Decisions
- **Canonical curve location**: `Meal.glucoseResponse` — always use `fetchAndStoreCurveForMeal(mealId)` to fetch and store curves. The `_fetchCurveForSession` path (which saves to `Session.glucoseResponse`) is deprecated — it exists for backward compatibility only and must not be used for new features.
- Sessions exist in storage for future pattern matching but are NOT displayed in history
- Session grouping caps strictly at `session.startedAt + 3hrs` (no chain-reaction)
- `GlucoseResponse` fields: startGlucose, peakGlucose, timeToPeakMins, totalRise, endGlucose, fallFromPeak, timeFromPeakToEndMins, readings, isPartial, fetchedAt

## Current Build Phase
- **Phase 11 (Supabase Migration): COMPLETE** (2026-04-17) — auth, biometric, migration, rate limit, consent, help copy all verified on real device
- **Session Grouping Phase A (Schema): COMPLETE** (2026-04-22) — types, classification-keywords.json, Supabase migration SQL
- **Session Grouping Phase B (Classification Engine): COMPLETE** (2026-04-22) — classifyMeal(), computeMatchingKey(), loadKeywordDictionary() in src/services/classification.ts. 31 tests.
- **Session Grouping Phase C (Overlap Detection + Session Lifecycle): COMPLETE** (2026-04-22) — detectOverlaps(), groupOrCreateSession(), reEvaluateOnEdit(), reEvaluateOnDelete(), computeSessionEnd(), isSessionClosed() in src/services/sessionGrouping.ts. 22 tests.
- **Session Grouping Phase D (Audit Trail): COMPLETE** (2026-04-22) — logSessionEvent(), logSessionEvents(), getSessionEvents(), getAllSessionEvents() in src/services/sessionEventLog.ts. Append-only AsyncStorage log. 21 tests.
- **Session Grouping Phase E (Non-Meal Event Interactions): COMPLETE** (2026-04-22) — handleCorrectionDose(), handleHypoTreatment(), handleContextEvent(), findActiveSessionAtTimestamp() in src/services/nonMealInteractions.ts. Pure functions, no storage writes. 23 tests.
- **Session Grouping Phase F (Confidence Scoring + CGM Coverage): COMPLETE** (2026-04-22) — computeMealConfidence(), computeSessionConfidence(), computeCgmCoverage(), computeEndedElevated(), computeEndedLow(), computeReturnToBaselineMinutes() in src/services/confidenceScoring.ts. Pure functions, no storage writes. 47 tests.
- **Session Grouping Phase G (Pattern Matching + matching_key Overhaul): COMPLETE** (2026-04-22) — findSoloPatterns(), findSessionPatterns(), findPatterns(), PatternCache in src/services/patternMatching.ts. Uses stored matching_key (not runtime fingerprint). Solo vs session separation, N-based thresholds (0/1-2/3+), confidence filtering (HIGH counted, MEDIUM muted, LOW excluded), 5-min cache. matching.ts deprecated. 22 tests.
- **Session Grouping Phase H (Integration): COMPLETE** (2026-04-22) — V2 saveMeal/updateMeal/deleteMeal rewrite, V1 rollback layer, 20 integration tests. Commits `104a490`, `9d98007`.
- **Session Grouping Phase I (Data Migration): COMPLETE** (2026-04-22) — migrateToSessionGroupingV2(), rollbackMigration() in src/services/sessionMigration.ts. Idempotent, pre-migration backup, audit trail. 20 tests. Commit `4f44660`.
- **Session Grouping Phase J (UI — History Cards + Session-Level Row): COMPLETE** (2026-04-23) — getMealChips(), MealChipRow, ChipInfoSheet, SessionSubHeader V2, accent bar. 23 tests. Commit `b181d45`.
- **Next: Session Grouping Phase K** — UI: Pattern View
- Authoritative spec: [Session Grouping Design Spec (Notion)](https://www.notion.so/34451b52df6e811abfcbd385555158d8)
- GSD project initialized — see `.planning/` for roadmap and requirements
- Do NOT build prediction engine until 50+ meals logged

---

## Tool Orchestration Rules

Three tools are in use. Each has a distinct role — do NOT let them overlap:

| Tool | Role | Owns |
|------|------|------|
| **GSD** | Project orchestrator | Roadmap, phase planning, execution waves, verification |
| **gstack CEO/Eng review** | Strategic review | Plan quality review before execution |
| **Superpowers** | Per-task discipline | TDD enforcement, git worktrees, code review within tasks |

**Rules:**
- GSD drives all phase planning and execution — never invoke `superpowers:writing-plans` or `superpowers:executing-plans` while GSD is managing a phase
- Superpowers TDD (`superpowers:test-driven-development`) SHOULD be invoked for every implementation task within a phase
- Superpowers systematic debugging (`superpowers:systematic-debugging`) SHOULD be invoked when investigating bugs
- Superpowers code review (`superpowers:requesting-code-review`) SHOULD run before completing each plan
- GSD executor subagents automatically skip Superpowers (enforced by `<SUBAGENT-STOP>` in Superpowers itself)
