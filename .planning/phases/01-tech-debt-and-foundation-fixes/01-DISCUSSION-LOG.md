# Phase 1: Tech Debt and Foundation Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 01-tech-debt-and-foundation-fixes
**Areas discussed:** Test framework setup, Error handling behaviour, Corrupt storage safe defaults

---

## Test Framework Setup

| Option | Description | Selected |
|--------|-------------|----------|
| `__tests__/` folder at root | Jest convention, flat structure, all unit tests in one place | |
| Co-located test files | Tests next to source files (e.g. `storage.test.ts` beside `storage.ts`) | ✓ |
| You decide | Claude picks whichever fits | |

**User's choice:** Co-located test files

---

| Option | Description | Selected |
|--------|-------------|----------|
| Local only | `npm test` runs manually, no CI setup | |
| GitHub Actions CI | Tests run automatically on every push to main | ✓ |

**User's choice:** GitHub Actions CI
**Notes:** User asked what's better for eventual scale (1000s of users) — CI recommended and accepted

---

| Option | Description | Selected |
|--------|-------------|----------|
| Exactly the 3 required | HbA1c formula, outcome badge (5 states), saveMeal session grouping (3 boundary cases) | ✓ |
| Broader coverage | More edge cases per function while in there | |

**User's choice:** Exactly the 3 required tests

---

## Error Handling Behaviour (DEBT-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Log + return `[]` | `console.warn` the status, return empty array — non-breaking | ✓ |
| Throw an error | Forces call sites to handle failure explicitly | |
| You decide | Claude picks safer option | |

**User's choice:** Log + return `[]`

---

## Corrupt Storage Safe Defaults (DEBT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| All return empty/null | Safe defaults throughout — app keeps running | ✓ |
| Some should throw | Loud failure for specific storage types | |
| You decide | Claude uses empty/null pattern | |

**User's choice:** All return empty/null safe defaults
**Notes:** Confirmed the specific defaults per function ([], null, null, [], []) — all accepted

---

## Claude's Discretion

- CI workflow file structure and configuration
- `buildGlucoseResponse()` function signature
- Inline comment wording for deprecated session write path
- CLAUDE.md section placement for canonical curve documentation

## Deferred Ideas

None.
