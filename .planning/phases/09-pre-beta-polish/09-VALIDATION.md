---
phase: 9
slug: pre-beta-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x + jest-expo |
| **Config file** | jest.config.js |
| **Quick run command** | `npx jest --bail` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --bail`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing test infrastructure covers phase requirements (jest + jest-expo already installed from Phase 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Onboarding 3-screen flow order | SC-1 | Navigation flow requires visual verification | Launch app with cleared AsyncStorage, verify Data Sharing → About Me → Equipment → Home |
| Keyboard not obscuring save buttons | SC-7 | Keyboard interaction is device-specific | Open each screen with text inputs, verify save button visible above keyboard |
| No white flash on navigation | SC-7 | Visual transition requires real device | Navigate between screens rapidly, verify no white flash |
| History tab switching | SC-5 | Tab UI interaction | Switch between Meals and Long-acting tabs, verify correct content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
