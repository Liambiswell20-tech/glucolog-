# Phase 6: Route to Market - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Build and deploy the BolusBrain landing page at bolusbrain.app. The page captures pre-interest email signups via Loops.so, showcases the AI carb estimation feature with screenshots in an iPhone mockup, and includes a Dexcom integration teaser. MHRA email is already sent (LEGAL-01 complete). This phase is independent of app phases 1–5.

</domain>

<decisions>
## Implementation Decisions

### Stack
- **Framework:** Next.js 14 (App Router, TypeScript) — consistent with project's TypeScript codebase
- **Hosting:** Vercel free tier — deploy to bolusbrain.app via custom domain
- **Styling:** Tailwind CSS — utility-first, no component library overhead
- **Email capture:** Loops.so via a Next.js API route (POST handler) — keeps API key server-side

### Above-the-fold layout (desktop)
- Hero: App name + one-line tagline + single hero screenshot in iPhone mockup + email capture form
- The demo section starts at or just below the fold — demo screenshots visible without full scroll
- Requirement: AI carb demo section AND Dexcom teaser both visible without scrolling past fold on desktop (from MKTG-01)

[auto] Q: "What goes above the fold?" → Selected: "Tagline + hero screenshot + email form" (standard mobile app landing page pattern; email capture highest priority)

### AI carb demo section
- **Format:** Static screenshots (not a live demo) — user will supply actual app screenshots
- **Presentation:** 2–3 key screenshots in iPhone mockup frames showing the flow: photo capture → AI carb estimate result
- **Layout:** Side-by-side on desktop, stacked on mobile
- No live Claude API call on the web page — screenshots only for now

[auto] Q: "Live demo or screenshots?" → Selected: "Static screenshots in iPhone mockup" (simpler, ships faster, user confirmed screenshots approach)

### Dexcom teaser
- A minimal "Coming soon" section — one sentence description of Dexcom integration
- Visual: small badge or pill label ("Coming soon") on a card
- No false promises — framed as next integration, not a current feature
- Position: visible in fold area alongside demo section

[auto] Q: "How to present Dexcom teaser?" → Selected: "Minimal coming-soon card/badge" (no false promises, honest about current state)

### Email capture behaviour
- Inline form: email input + submit button
- On submit: POST to `/api/subscribe` → Loops.so API → success message in place ("You're on the list!")
- No redirect, no modal — message replaces button inline
- Validation: basic email format check client-side, error message if Loops.so returns error
- Loops.so API key stored in `.env.local` as `LOOPS_API_KEY` (server-side only, never `NEXT_PUBLIC_`)

[auto] Q: "Post-submit behaviour?" → Selected: "Inline success message, no redirect" (least friction, works one-handed)

### Design tone
- Clean, medical-adjacent but not clinical — approachable for T1D community
- Dark mode preferred (matches the app's existing dark UI)
- Single-page, minimal copy — T1D users are busy, scan don't read

[auto] Q: "Design tone?" → Selected: "Dark, clean, minimal" (matches app aesthetic, appropriate for medical adjacent tool)

### Claude's Discretion
- Exact colour palette and typography (stay dark, modern, accessible)
- Spacing and animation details
- Mobile breakpoint specifics
- SEO meta tags content

</decisions>

<specifics>
## Specific Ideas

- Page must satisfy MKTG-01: AI carb demo section AND Dexcom teaser both visible without scrolling past fold on desktop
- MKTG-02: Email submitted → captured in Loops.so for pre-interest follow-up
- Domain already purchased: bolusbrain.app
- Screenshots to be provided by user — placeholders in initial build, replaced once screenshots supplied
- Loops.so chosen for email — simple REST API, good deliverability, built for SaaS pre-launch lists

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` §Route to Market — MKTG-01, MKTG-02, LEGAL-01 definitions
- `.planning/ROADMAP.md` §Phase 6 — success criteria (fold requirement, email capture, MHRA)

### Project constraints
- `.planning/PROJECT.md` §Constraints — safety/legal framing (historical only, no advice), never hardcode API keys
- `bolusbrain-app/CLAUDE.md` §Security Rules — env var conventions (EXPO_PUBLIC_ pattern for app; LOOPS_API_KEY server-side for landing page)

### No external specs
No additional ADRs or design docs exist for this phase — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a new Next.js project, separate from the Expo app — no shared components
- The Expo app's colour scheme (red <3.9, green 3.9–10.0, orange >10.0) can inform the landing page palette
- Screenshots from the existing Expo app screens: HomeScreen, MealLogScreen, MealHistoryScreen

### Established Patterns
- Project uses TypeScript throughout — landing page should too
- Secrets via env vars only (never hardcoded) — `LOOPS_API_KEY` in `.env.local`, gitignored
- App is dark-themed — landing page should match

### Integration Points
- Landing page is a standalone Next.js project, NOT inside `bolusbrain-app/`
- Suggested location: `C:\Users\Liamb\bolusbrain-landing\` (new repo)
- Vercel deployment connects to bolusbrain.app domain via DNS settings

</code_context>

<deferred>
## Deferred Ideas

- Live AI carb estimation demo (visitor uploads photo → real Claude API call) — future enhancement once landing page is live and tested
- Facebook groups community outreach — marketing activity, not a code phase
- Revenue model decision — business decision, not in scope for this build phase

</deferred>

---

*Phase: 06-route-to-market*
*Context gathered: 2026-03-18*
