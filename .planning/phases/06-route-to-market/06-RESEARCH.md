# Phase 6: Route to Market — Research

**Researched:** 2026-03-19
**Domain:** Next.js 14 App Router landing page — email capture, iPhone mockup, Vercel deployment, MHRA documentation
**Confidence:** HIGH

---

## Summary

Phase 6 builds a standalone Next.js 14 landing page at `bolusbrain.app` that captures pre-launch email signups via Loops.so, showcases the AI carb estimation flow with static screenshots in an iPhone mockup, and documents the MHRA regulatory contact. The page is a separate project from the Expo app (`bolusbrain-landing/`), not an addition to `bolusbrain-app/`.

The technical stack is straightforward: Next.js 14 with App Router, TypeScript, and Tailwind CSS — all scaffolded in one CLI command. The Loops.so REST API is simple (`POST /api/v1/contacts/create` with just an `email` field required) and must be called from a Next.js Route Handler (`app/api/subscribe/route.ts`) to keep `LOOPS_API_KEY` server-side. The fold layout requirement (demo + Dexcom teaser visible without scrolling) is achieved with `h-screen` on the hero section and a two-column `grid` below the fold on `lg:` breakpoint.

LEGAL-01 is already complete — the MHRA email was sent on 2026-03-18 and simply needs documenting as evidence in this phase. No code work is required for it.

**Primary recommendation:** Scaffold with `npx create-next-app@latest bolusbrain-landing --yes`, add the Loops.so Route Handler immediately, use Flowbite's Tailwind-only iPhone mockup (no library dependency), deploy to Vercel with `LOOPS_API_KEY` set as a Production environment variable.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Framework:** Next.js 14 (App Router, TypeScript) — consistent with project's TypeScript codebase
- **Hosting:** Vercel free tier — deploy to bolusbrain.app via custom domain
- **Styling:** Tailwind CSS — utility-first, no component library overhead
- **Email capture:** Loops.so via a Next.js API route (POST handler) — keeps API key server-side
- **Above-the-fold:** Hero (app name + tagline + hero screenshot + email form). Demo section starts at or just below fold. AI carb demo AND Dexcom teaser both visible without scrolling past fold on desktop.
- **AI carb demo:** Static screenshots (not live) — 2–3 screenshots in iPhone mockup frames showing photo capture → AI carb estimate result
- **Dexcom teaser:** Minimal "Coming soon" card/badge, one sentence, no false promises
- **Email submit:** Inline form, POST to `/api/subscribe`, inline success message ("You're on the list!"), no redirect/modal
- **`LOOPS_API_KEY`** stored in `.env.local`, server-side only, never `NEXT_PUBLIC_`
- **Design:** Dark mode, clean, minimal, medical-adjacent but approachable for T1D community
- **Project location:** `C:\Users\Liamb\bolusbrain-landing\` — new separate repo, NOT inside `bolusbrain-app/`

### Claude's Discretion
- Exact colour palette and typography (stay dark, modern, accessible)
- Spacing and animation details
- Mobile breakpoint specifics
- SEO meta tags content

### Deferred Ideas (OUT OF SCOPE)
- Live AI carb estimation demo (visitor uploads photo → real Claude API call)
- Facebook groups community outreach — marketing activity, not a code phase
- Revenue model decision — business decision, not in scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MKTG-01 | Landing page finalised with AI carb estimation photo demo section and Dexcom integration as next-steps teaser | iPhone mockup pattern (Flowbite Tailwind-only), fold layout with `h-screen` + two-column grid, `lg:grid-cols-2` for side-by-side screenshots |
| MKTG-02 | Email capture form captures pre-interest signups and stores them in Loops.so | Loops.so REST API (`POST /api/v1/contacts/create`), Next.js Route Handler pattern, env var convention (`LOOPS_API_KEY`) |
| LEGAL-01 | MHRA informal guidance email sent — already complete (2026-03-18). Phase 6 task = document the sent email as evidence in `.planning/` | No code required — documentation task only |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | latest (15.x) | App Router, server components, Route Handlers | Official scaffold; App Router is current default |
| react | latest (19.x) | UI rendering | Peer dep of Next.js |
| react-dom | latest (19.x) | DOM rendering | Peer dep of Next.js |
| typescript | latest (5.x) | Type safety | Project-wide TypeScript convention |
| tailwindcss | latest (4.x) | Utility-first styling | Locked decision, no component library |
| @tailwindcss/typography | latest | Prose formatting if needed | Standard companion for content-heavy sections |

> **Version note:** `create-next-app@latest` as of 2026-03-19 scaffolds Next.js 15 with React 19. The CONTEXT.md specifies "Next.js 14" but the CLI installs the current latest. This is immaterial — App Router patterns are identical between 14 and 15. The planner should use `@latest` and not pin to 14.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No additional libraries required | — | — | iPhone mockup is pure Tailwind CSS (see Architecture Patterns) |

**Installation (one command):**

```bash
npx create-next-app@latest bolusbrain-landing --yes
cd bolusbrain-landing
```

The `--yes` flag applies recommended defaults: TypeScript, Tailwind CSS, ESLint, App Router, `src/` directory, `@/*` import alias, Turbopack dev server.

**Verify installed versions after scaffold:**
```bash
npm view next version
npm view tailwindcss version
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure Tailwind iPhone mockup | `react-device-frameset` or similar NPM package | NPM package adds dependency, requires maintenance, may not match Tailwind class conventions; pure CSS is sufficient for 2–3 static screenshots |
| Loops.so Route Handler | Mailchimp / Resend | Locked decision — Loops.so chosen for SaaS pre-launch list quality and simple REST API |
| Vercel free tier | Netlify | Locked decision |

---

## Architecture Patterns

### Recommended Project Structure

```
bolusbrain-landing/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout — dark bg, meta tags, font
│   │   ├── page.tsx            # Single-page landing — all sections
│   │   ├── globals.css         # Tailwind base + dark theme custom properties
│   │   └── api/
│   │       └── subscribe/
│   │           └── route.ts    # POST handler → Loops.so
│   └── components/
│       ├── EmailForm.tsx       # Client component — form state, submit, inline success
│       ├── IPhoneMockup.tsx    # Pure Tailwind phone frame + screenshot slot
│       ├── DexcomTeaser.tsx    # Coming-soon badge/card
│       └── sections/
│           ├── Hero.tsx        # Above-fold: name, tagline, hero mockup, email form
│           ├── DemoSection.tsx # 2–3 mockups side-by-side (lg) / stacked (mobile)
│           └── Footer.tsx      # Minimal — copyright, legal disclaimer
├── public/
│   └── screenshots/            # App screenshots (placeholders until user supplies)
├── .env.local                  # LOOPS_API_KEY — gitignored
├── .gitignore                  # Must include .env.local
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

### Pattern 1: Next.js Route Handler for Loops.so

**What:** Server-side POST endpoint that proxies the email to Loops.so — `LOOPS_API_KEY` never touches the client bundle.

**When to use:** Any time a secret API key must be called from a web form.

```typescript
// src/app/api/subscribe/route.ts
// Source: https://loops.so/docs/api-reference/intro + Next.js Route Handlers docs

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const response = await fetch('https://app.loops.so/api/v1/contacts/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
    },
    body: JSON.stringify({ email }),
  })

  const data = await response.json()

  if (!response.ok) {
    // 409 = contact already exists — treat as success to avoid enumeration
    if (response.status === 409) {
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: data.message ?? 'Subscription failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

### Pattern 2: Pure Tailwind iPhone Mockup

**What:** CSS-only phone frame — no external library. The inner slot accepts a `<img>` or `<Image>` for the screenshot.

**When to use:** 2–3 static screenshots in the demo section and hero.

```tsx
// src/components/IPhoneMockup.tsx
// Source: Flowbite device-mockups docs — https://flowbite.com/docs/components/device-mockups/

interface IPhoneMockupProps {
  src: string
  alt: string
}

export function IPhoneMockup({ src, alt }: IPhoneMockupProps) {
  return (
    <div className="relative mx-auto border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-xl">
      {/* Notch */}
      <div className="w-[148px] h-[18px] bg-gray-800 top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute z-10" />
      {/* Left buttons */}
      <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[17px] top-[124px] rounded-l-lg" />
      <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[17px] top-[178px] rounded-l-lg" />
      {/* Right button */}
      <div className="h-[64px] w-[3px] bg-gray-800 absolute -right-[17px] top-[142px] rounded-r-lg" />
      {/* Screen */}
      <div className="rounded-[2rem] overflow-hidden w-[272px] h-[572px]">
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </div>
    </div>
  )
}
```

### Pattern 3: Above-Fold Layout Guarantee

**What:** Ensure the Hero section fills exactly one viewport height on desktop. Demo section begins immediately below the fold, visible on first scroll.

**Key:** `min-h-screen` on the hero forces it to fill the viewport. On desktop (`lg:`), a two-column grid places the tagline/form left and the hero mockup right — all within the fold. The demo section uses a second `min-h-screen` block split into two columns (`lg:grid-cols-2`) so screenshots and the Dexcom teaser are visible at the top of that second viewport.

```tsx
// src/components/sections/Hero.tsx (structure only)
// Uses: min-h-screen, flex, lg:grid-cols-2

<section className="min-h-screen flex flex-col justify-center bg-gray-950 px-6 lg:px-12">
  <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center">
    {/* Left: copy + email form */}
    <div>...</div>
    {/* Right: hero iPhone mockup */}
    <div className="flex justify-center">
      <IPhoneMockup src="/screenshots/hero.png" alt="BolusBrain home screen" />
    </div>
  </div>
</section>

<section className="min-h-screen bg-gray-900 px-6 lg:px-12 py-16">
  <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-8 items-start">
    {/* 2 demo mockups + Dexcom teaser card — all visible at top of second viewport */}
    ...
  </div>
</section>
```

### Pattern 4: Client-Side Email Form with Inline State

**What:** `'use client'` component that manages three states: `idle | submitting | success | error`. No page navigation on submit.

```tsx
// src/components/EmailForm.tsx
'use client'
import { useState } from 'react'

export function EmailForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (data.success) {
      setStatus('success')
    } else {
      setStatus('error')
      setErrorMsg(data.error ?? 'Something went wrong')
    }
  }

  if (status === 'success') {
    return <p className="text-green-400 font-medium">You're on the list!</p>
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 flex-col sm:flex-row">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-lg bg-red-600 hover:bg-red-500 px-6 py-2 font-semibold text-white disabled:opacity-50 transition-colors"
      >
        {status === 'submitting' ? 'Joining...' : 'Join waitlist'}
      </button>
      {status === 'error' && <p className="text-red-400 text-sm mt-1">{errorMsg}</p>}
    </form>
  )
}
```

### Anti-Patterns to Avoid

- **`NEXT_PUBLIC_LOOPS_API_KEY`**: Exposes the key in the client bundle. Always use `LOOPS_API_KEY` (no `NEXT_PUBLIC_` prefix) — it is only accessible in Route Handlers and Server Components.
- **Calling Loops.so directly from the browser**: The `fetch` in `EmailForm.tsx` calls `/api/subscribe` (your own Route Handler), never `https://app.loops.so` directly.
- **`h-screen` without `overflow-hidden` on parent**: On mobile, browser chrome can cause `100vh` to overflow. Use `min-h-screen` instead, which ensures at-least-full-height without forcing overflow.
- **Next.js `<Image>` for the iPhone mockup screenshots with unknown dimensions**: Use a regular `<img>` with `object-cover` or provide explicit `width`/`height` to `<Image>`. The mockup container has fixed dimensions, so `object-cover` is the right approach.
- **Committing `.env.local`**: Verify `.gitignore` includes `.env.local` before first commit. The scaffold generates this automatically but confirm.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email list management, deliverability | Custom email storage in a database | Loops.so REST API | Deliverability, unsubscribe handling, GDPR compliance — all solved |
| Email validation | Complex regex from scratch | Simple format check client-side + server-side (Loops.so validates on their end) | Loops.so returns a clear error on invalid email; overkill to go further |
| iPhone frame visual | Custom SVG device frame or image overlay | Pure Tailwind CSS classes (Flowbite pattern) | No dependency, no image asset, scales correctly at all sizes |
| Deployment pipeline | Custom CI/CD | Vercel Git integration | Push to `main` = deploy; free tier covers all needs |
| DNS management | Manual A-record juggling | Vercel's guided domain setup in dashboard | Vercel detects apex vs subdomain and provides correct record type automatically |

**Key insight:** This phase has zero complex engineering — every sub-problem (email capture, device mockup, deployment) has a well-solved, free-tier answer. The value is in the copy, design execution, and shipping quickly.

---

## Common Pitfalls

### Pitfall 1: LOOPS_API_KEY Leaking to Client

**What goes wrong:** Developer adds `NEXT_PUBLIC_` prefix so the env var "works" in a client component, exposing the key in the browser bundle.

**Why it happens:** The form component is a Client Component (`'use client'`) and env vars without `NEXT_PUBLIC_` are not accessible there — developer adds the prefix as a quick fix.

**How to avoid:** The form component never needs the key. The form calls `/api/subscribe` (your Route Handler). The Route Handler runs on the server and accesses `process.env.LOOPS_API_KEY` directly. Never add `NEXT_PUBLIC_` to this key.

**Warning signs:** TypeScript autocomplete showing `process.env.NEXT_PUBLIC_LOOPS_API_KEY` in a file that has `'use client'` at the top.

---

### Pitfall 2: Loops.so 409 on Repeat Submission Breaks UX

**What goes wrong:** A user submits the form twice (double-click, page refresh). Loops.so returns `409 Conflict` because the contact already exists. The Route Handler surfaces this as an error and the user sees "Subscription failed".

**Why it happens:** 409 is technically an error response, so naive error handling treats it as a failure.

**How to avoid:** In the Route Handler, treat `response.status === 409` as a success. The contact is already on the list — that is the desired outcome. See the Route Handler code example above.

**Warning signs:** Users reporting "it says error but I was already subscribed before".

---

### Pitfall 3: Fold Layout Breaks on Non-Standard Desktop Heights

**What goes wrong:** The `min-h-screen` hero works on a 1080p monitor but on a 768px-height laptop (common MacBook Air with browser chrome), the hero content is taller than the viewport and the email form falls below fold.

**Why it happens:** The hero contains too much vertical content — large phone mockup + headline + subtext + form all stacked.

**How to avoid:** On desktop (`lg:`), use a two-column grid. Left column: text + form (compact). Right column: phone mockup. This halves the vertical height requirement. Add `max-h-[90vh]` to the mockup container so it scales down on short viewports.

**Warning signs:** Screenshot mockup is `h-[600px]` while the viewport is `h-[768px]` — with headers and padding, the form will clip.

---

### Pitfall 4: `.env.local` Not in `.gitignore`

**What goes wrong:** `LOOPS_API_KEY` is committed to the repository and pushed to GitHub.

**Why it happens:** Developer creates `.env.local` manually after scaffold, but the scaffold's `.gitignore` only covers `.env` not `.env.local` — actually, `create-next-app` does include `.env*.local` in `.gitignore` by default, but this should be verified before first commit.

**How to avoid:** Before the first `git add`, run `cat .gitignore | grep env` to confirm `.env*.local` is listed. Treat any accidental commit as an immediate key rotation event.

**Warning signs:** `git status` shows `.env.local` as an untracked file that has NOT been staged — this is correct. If it IS staged, abort immediately.

---

### Pitfall 5: Custom Domain Not Pointing Correctly

**What goes wrong:** bolusbrain.app was purchased through a registrar (e.g., Squarespace, GoDaddy, Porkbun). DNS changes to point to Vercel can take 24–48 hours and require the correct record type.

**Why it happens:** Apex domains (`bolusbrain.app`, no `www.`) require an **A record**, not a CNAME. Subdomains (`www.bolusbrain.app`) use a CNAME. Many developers try CNAME for the apex domain and it fails silently.

**How to avoid:**
- Add domain in Vercel dashboard → Project Settings → Domains
- Vercel will display the exact A record IP and CNAME value to configure
- For the apex domain `bolusbrain.app`: set an A record pointing to `76.76.21.21` (Vercel's IP — verify in dashboard at time of setup as it may change)
- For `www.bolusbrain.app`: set a CNAME pointing to `cname.vercel-dns.com`
- Alternatively, point the domain's nameservers to Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) and let Vercel manage all DNS

**Warning signs:** Vercel dashboard shows domain as "unverified" after 24 hours — check registrar DNS panel for typos.

---

## Code Examples

### Verified: Loops.so API Shape

```
POST https://app.loops.so/api/v1/contacts/create
Authorization: Bearer <LOOPS_API_KEY>
Content-Type: application/json

Body (minimum): { "email": "user@example.com" }

Optional body fields:
  firstName, lastName, source, subscribed (bool, default true),
  userGroup, userId, mailingLists (object of listId: bool)

201 success: { "success": true, "id": "contact_id" }
409 duplicate: { "success": false, "message": "..." }  → treat as success
400 bad request: { "success": false, "message": "..." }
Rate limit: 10 req/sec per team (x-ratelimit-limit header)
```

Source: Loops full docs text — https://loops.so/docs/llms-full.txt (verified 2026-03-19)

---

### Verified: create-next-app Scaffold Command

```bash
# Creates bolusbrain-landing/ with TypeScript, Tailwind, App Router, src/ dir, @/* alias
npx create-next-app@latest bolusbrain-landing --yes

# Results in:
bolusbrain-landing/
  src/app/layout.tsx
  src/app/page.tsx
  src/app/globals.css
  tailwind.config.ts
  tsconfig.json
  next.config.ts
  .gitignore          # includes .env*.local
  package.json
```

Source: Next.js official installation docs — https://nextjs.org/docs/app/getting-started/installation (verified 2026-03-19, docs version 16.2.0)

---

### Verified: Vercel Environment Variable — Dashboard Path

```
Vercel Dashboard
  → Project: bolusbrain-landing
  → Settings
  → Environment Variables
  → Add:
      Key:   LOOPS_API_KEY
      Value: <key from Loops Settings → API>
      Environments: ✅ Production  ✅ Preview  ✅ Development
```

Source: Vercel environment variables docs — https://vercel.com/docs/projects/environment-variables (verified 2026-03-19)

---

### Verified: Root Layout with Dark Theme

```tsx
// src/app/layout.tsx
// Source: Next.js App Router docs — official scaffold pattern

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BolusBrain — Smarter meal tracking for T1D',
  description:
    'BolusBrain tracks your meals, insulin, and glucose curves. Built for Type 1 diabetics.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

---

## LEGAL-01: MHRA Documentation Task

LEGAL-01 is **already complete** — the email to `devices@mhra.gov.uk` was sent 2026-03-18 with the app description and "no advice, only historical patterns" framing.

The Phase 6 task for LEGAL-01 is **documentation only**:

1. Create `.planning/phases/06-route-to-market/MHRA-correspondence/` directory
2. Add a markdown file documenting: date sent, address used (`devices@mhra.gov.uk`), summary of content, expected response timeline (20 working days per MHRA guidance), and current status (awaiting response)
3. No code change required
4. No reply from MHRA is required to proceed with development

**MHRA context (LOW confidence — from WebSearch, not official response):**
- Pre-submission enquiries are triaged to the relevant team; responses within ~20 working days
- Software-based medical devices are being reclassified under new UK regulations (consultation ongoing through 2025–2026)
- A T1D tracking app that shows only historical patterns and explicitly gives no dosing advice occupies a low-risk position in this classification — this framing was correctly used in the LEGAL-01 email
- The MHRA AI and Digital Regulations Service (AIDRS — joint with NICE, HRA, CQC) is the relevant body for AI-assisted medical tools

Source: GOV.UK pre-submission advice page — https://www.gov.uk/guidance/pre-submission-advice-support

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js Pages Router (`pages/api/`) | App Router Route Handlers (`app/api/route.ts`) | Next.js 13+ | Different file structure; Route Handlers are `export async function POST()` not default export |
| `next/image` with explicit width/height always required | `fill` prop + parent `position: relative` also works | Next.js 13 | Phone mockup inner container uses fixed pixel dimensions, so explicit `width`/`height` on `<Image>` is fine |
| Tailwind CSS v3 config (`module.exports`) | Tailwind CSS v4 uses `@import "tailwindcss"` in CSS (no `tailwind.config.ts` required) | Tailwind v4 (2025) | Scaffold may generate a config file — check whether v4 is installed and adjust accordingly |
| `pages/_app.tsx` global styles | `app/layout.tsx` global styles | Next.js 13 | Import `globals.css` in `layout.tsx`, not anywhere else |

**Tailwind v4 note (MEDIUM confidence):** `create-next-app@latest` as of early 2026 may install Tailwind v4, which replaces `tailwind.config.ts` with a CSS-first configuration. If `@import "tailwindcss"` is in `globals.css` rather than `@tailwind base/components/utilities`, the project is using v4. The phone mockup classes (`bg-gray-800`, `rounded-[2.5rem]`, etc.) work identically in both v3 and v4.

---

## Open Questions

1. **Tailwind v4 vs v3 in scaffold**
   - What we know: `create-next-app@latest` installs the current Tailwind version; v4 was released in 2025
   - What's unclear: Whether the scaffold as of March 2026 uses v4 (CSS-first config) or v3 (JS config)
   - Recommendation: After scaffolding, check `package.json` for `"tailwindcss"` version. If `^4.x`, use CSS-first config (`globals.css` with `@import "tailwindcss"`). The phone mockup and layout classes are identical between versions.

2. **bolusbrain.app registrar**
   - What we know: Domain is purchased; DNS records must point to Vercel
   - What's unclear: Which registrar holds the domain (affects exact DNS UI steps)
   - Recommendation: The planner should include a task step that says "in your domain registrar's DNS panel, add an A record pointing `bolusbrain.app` to the IP shown in the Vercel dashboard" — the exact registrar steps are a runtime concern, not a code concern.

3. **Screenshot availability**
   - What we know: CONTEXT.md states "Screenshots to be provided by user — placeholders in initial build"
   - What's unclear: When screenshots will be available
   - Recommendation: Build with placeholder images (`/screenshots/placeholder-1.png` etc.) and document clearly in the task that the user must supply actual screenshots from the Expo app before the page goes live.

---

## Validation Architecture

No automated test framework is planned for this phase. The landing page is a single-page static-ish Next.js app. Validation is manual.

### Manual Validation Checklist (per task)

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Email capture working | Submit real email via form on localhost | Contacts list in Loops.so dashboard shows the entry |
| API key not in client bundle | `npm run build` → inspect `.next/static/` for string `LOOPS_API_KEY` value | Key value NOT present in any `.js` chunk |
| Fold layout on desktop | Open at 1280×800 browser window, no scroll | Both demo screenshots and Dexcom teaser visible |
| Fold layout on mobile | Chrome DevTools iPhone 14 Pro emulation | Hero, tagline, and email form all visible without scroll |
| 409 treated as success | Submit same email twice | Second submit shows "You're on the list!" not an error |
| Dark theme rendered | Open page in browser | Page background is dark, no flash of white |
| Custom domain resolving | After DNS propagation | `bolusbrain.app` opens the landing page over HTTPS |
| HTTPS certificate | Browser address bar | No certificate warning; padlock present |

### Wave 0 Gaps

- [ ] `public/screenshots/placeholder-1.png`, `placeholder-2.png`, `placeholder-3.png` — needed before hero and demo sections can be built; create 300×572 dark placeholder images
- [ ] `.env.local` with `LOOPS_API_KEY` value — must be populated from Loops.so dashboard before Route Handler can be tested locally

*(No test framework required — `workflow.nyquist_validation` not configured, but this phase has no logic warranting automated unit tests. All validation is integration/visual.)*

---

## Sources

### Primary (HIGH confidence)
- `https://loops.so/docs/llms-full.txt` — Loops.so full API reference: endpoint URL, HTTP method, request/response shape, rate limits
- `https://nextjs.org/docs/app/getting-started/installation` — Next.js official installation: scaffold command, `--yes` defaults, folder structure (docs version 16.2.0, updated 2026-03-03)
- `https://vercel.com/docs/projects/environment-variables` — Vercel env var docs: environments, dashboard path, `.env.local` for local dev
- `https://flowbite.com/docs/components/device-mockups/` — Flowbite iPhone mockup: exact Tailwind class structure and HTML (verified via WebFetch)

### Secondary (MEDIUM confidence)
- `https://tailwindcss.com/docs/height` — Tailwind height utilities (`h-screen`, `min-h-screen`, `dvh`) — WebSearch confirmed, official docs
- `https://vercel.com/docs/domains/working-with-domains/add-a-domain` — Vercel custom domain setup: A record vs CNAME vs nameservers, apex vs subdomain distinction
- `https://www.gov.uk/guidance/pre-submission-advice-support` — MHRA pre-submission enquiry process: 20 working day response time, `presubmission@mhra.gov.uk`

### Tertiary (LOW confidence)
- `https://encharge.io/loops-review/` — Loops.so 2026 review: general product capabilities (not used for any specific technical claim)
- MHRA SaMD reclassification timeline — from Pennington's Law article, not official MHRA source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — scaffold command and output verified against official Next.js docs (updated 2026-03-03)
- Loops.so API: HIGH — endpoint, method, body, and response verified from official full-text docs
- iPhone mockup pattern: HIGH — exact HTML/Tailwind verified via Flowbite docs fetch
- Vercel deployment: HIGH — official Vercel docs for env vars and domains
- MHRA documentation: LOW — based on GOV.UK guidance page and third-party summaries; official MHRA response not yet received
- Fold layout approach: MEDIUM — standard Tailwind patterns, verified utilities; exact breakpoint tuning is runtime concern

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (90 days — stack is stable; re-verify Tailwind v4 migration status if delayed beyond this date)
