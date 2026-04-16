---
phase: 11
slug: supabase-migration-multi-user-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `^29.7.0` + `jest-expo` `^54.0.17` (already installed) |
| **Config file** | `package.json` `"jest"` key |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (160 existing tests + ~30 new) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` + `! grep -r 'crypto\.randomUUID' src/ lib/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | SUPA-01 | unit | `npx jest src/contexts/__tests__/AuthContext.test.tsx` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 0 | SUPA-01 | unit | `npx jest src/hooks/__tests__/useBiometric.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 0 | SUPA-06 | unit | `npx jest src/services/__tests__/migration.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 0 | SUPA-05 | unit | `npx jest src/services/__tests__/aiConsent.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-05 | 01 | 0 | SUPA-07 | unit | `npx jest src/services/__tests__/dataSharing.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-06 | 01 | 0 | SUPA-08 | unit | `npx jest src/screens/__tests__/HelpScreen.test.tsx` | ❌ W0 | ⬜ pending |
| 11-01-07 | 01 | 0 | SUPA-04 | unit | `cd ../bolusbrain-landing && npm test` | ❌ W0 | ⬜ pending |
| 11-01-08 | 01 | 0 | (guard) | lint | `! grep -r 'crypto\.randomUUID' src/ lib/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/contexts/__tests__/AuthContext.test.tsx` — stubs for auth sign-in/up/error flows
- [ ] `src/hooks/__tests__/useBiometric.test.ts` — stubs for biometric success/cancel/no-hardware
- [ ] `src/services/__tests__/migration.test.ts` — stubs for idempotency, partial failure, payload shape
- [ ] `src/services/__tests__/aiConsent.test.ts` — stubs for consent check / missing consent
- [ ] `src/services/__tests__/dataSharing.test.ts` — stubs for consent filter
- [ ] `src/screens/__tests__/HelpScreen.test.tsx` — snapshot or text assertion for Anthropic disclosure
- [ ] `__mocks__/@supabase/supabase-js.ts` — shared mock Supabase client
- [ ] `__mocks__/expo-secure-store.ts` — mock for Jest (not auto-mocked by jest-expo)
- [ ] `__mocks__/expo-local-authentication.ts` — mock for Jest
- [ ] CI/lint guard: `grep -r 'crypto\.randomUUID' src/ lib/ && exit 1 || exit 0`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RLS: user A can't see user B's meals | SUPA-02 | Requires 2 Supabase auth sessions, no local pgTAP | Create 2 test accounts; log meal as User A; verify User B sees empty history |
| Migration preserves ALL Liam's real data | SUPA-06 | Irreplaceable production data, no synthetic substitute | Run migration button on Liam's device; compare AsyncStorage meal count vs Supabase rows; verify offline history works |
| Biometric unlock on real device | SUPA-01 | Expo emulator can't simulate Face ID / fingerprint | Sign in on Liam's iPhone; close app; reopen; verify Face ID prompt; verify fallback to password |
| Rate limit returns 429 after 10 uses | SUPA-04 | Requires 10 real HTTP calls to deployed endpoint | Hit /api/carb-estimate 11 times; verify 429 on 11th; verify Retry-After header |
| AsyncStorage unchanged post-migration | SUPA-06 | Production data integrity | After migration: enable airplane mode; open app; verify full meal history still loads from AsyncStorage |

---

## Lint Guards

| Guard | Command | Blocks |
|-------|---------|--------|
| No `crypto.randomUUID` in source | `! grep -r 'crypto\.randomUUID' src/ lib/` | Every commit |
| No secrets in committed files | `! grep -rE 'eyJ[A-Za-z0-9_-]{10,}\|sb_[a-z0-9]{20,}\|supabase.*service_role' src/ lib/ *.ts *.tsx 2>/dev/null` | Every commit |
