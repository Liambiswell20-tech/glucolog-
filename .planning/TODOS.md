# TODOS — BolusBrain Milestone 2

## Open

### ~~TODO-01: Outcome badge algorithm — resolve the stayed-elevated case~~ ✓ RESOLVED 2026-03-18
**Decision:** Dark Amber = stayed above 10.0 but below 14.0 mmol/L. Red reserved for hypo (<3.9) or extreme high (≥14.0). See HIST-03 in REQUIREMENTS.md for the full 6-state algorithm.

---

### TODO-02: Chart library selection for Phase 2
**Priority:** P1 — must resolve before Phase 2 planning begins
**What:** Phase 2 introduces a `GlucoseChart` component. Candidate libraries: `react-native-gifted-charts`, `victory-native`, `react-native-svg + custom`. All require Expo managed workflow compatibility verification.

**Why this matters:** Chart library config is the most common cause of Phase 2 delays — native dependencies, Expo SDK compatibility, SVG rendering on both iOS and Android all have gotchas. Choose before planning, not during execution.

**To decide:** Which library to use. Victory Native 40+ or Gifted Charts are both SDK 54 compatible but have different APIs.

**Effort:** S (30 min research spike)
**Depends on:** Nothing — resolve at Phase 2 plan kickoff

---

## Awaiting External Response

### LEGAL-01: MHRA response
Email sent 2026-03-18 to devices@mhra.gov.uk. Response may take weeks or not arrive at all — either outcome is fine for the paper trail. When a response arrives, update REQUIREMENTS.md with the response date and any guidance received.

## Resolved

*(none yet)*
