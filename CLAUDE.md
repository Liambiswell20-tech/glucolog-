# BolusBrain — Claude Code Project Rules

## What This App Is
A personal meal and insulin tracking app for Type 1 diabetics.
Developer and first user: Liam Biswell (T1D, FreeStyle Libre 2 Plus, UK).

Full project brief: `C:\Users\Liamb\OneDrive\Desktop\Glucolog Project\CLAUDE.md`

---

## Absolute Rules
- Always display glucose in **mmol/L** — never mg/dL
- **Never give insulin dosing advice** — show historical patterns only
- Frame everything as "last time you ate this..." not "you should take X units"
- Keep UI simple — used at mealtimes, often one-handed

## Glucose Colour Ranges (used throughout the app)
- Red: `< 3.9 mmol/L` (low / hypo)
- Green: `3.9 – 10.0 mmol/L` (in range)
- Orange: `> 10.0 mmol/L` (high)

## Nightscout API
- URL: `https://p01--nightscout--7x4mdclxhl6z.code.run/api/v1/entries.json`
- Token: `librelinku-b02e1144f33f2822`
- `sgv` is mg/dL — divide by 18 for mmol/L
- Readings every 5 minutes

## Key Architecture Decisions
- Curves stored on `meal.glucoseResponse` (not session) — use `fetchAndStoreCurveForMeal(mealId)`
- Sessions exist in storage for future pattern matching but are NOT displayed in history
- Session grouping caps strictly at `session.startedAt + 3hrs` (no chain-reaction)
- `GlucoseResponse` fields: startGlucose, peakGlucose, timeToPeakMins, totalRise, endGlucose, fallFromPeak, timeFromPeakToEndMins, readings, isPartial, fetchedAt

## Current Build Phase
- Phase 3 in progress — meal history redesign complete, meal matching foundation built
- Next: surface "you've eaten this before" matches in history UI
- Do NOT build prediction engine until 50+ meals logged
