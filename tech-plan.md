# TTC Companion App — Implementation Plan (fresh build)

## Context

You're building a fertility app that coaches **both partners as a team**: her cycle
tracking + his habit tracking → one weekly "here's what to do next", with privacy
(database-enforced consent) as a headline feature. The tech stack and data model are
already decided in your architecture doc; this plan turns that into an **ordered,
build-it-in-this-sequence** list where **each step can be tested on its own**, and
**real login is built last** so early testing stays friction-free.

We are starting from scratch (ignoring the earlier `app-code` and the old 20-step plan).
Build lives in `/Users/vadiga/Documents/Personal/Projects/ttc`.

Two decisions you confirmed:

- **Follow the architecture exactly** — Cloudflare Workers (Hono) API + self-hosted
  Better Auth + Supabase used only as managed Postgres/Storage.
- **Scaffold with a CLI**, then trim.

---

## The stack (plain terms)

| Layer          | What we use                                     | What it does                                     |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| Mobile app     | React Native + **Expo** (TypeScript)            | One codebase → iOS + Android                     |
| Navigation     | Expo Router                                     | File = screen                                    |
| Server API     | **Cloudflare Workers** + Hono                   | All logic; the app never touches the DB directly |
| Login          | **Better Auth** (runs inside the Worker)        | Email + Apple + Google. **Added last.**          |
| Database       | **Supabase Postgres**                           | Data + the consent rules that enforce privacy    |
| File storage   | Supabase Storage                                | OPK photos, private per user                     |
| Payments       | RevenueCat                                      | App Store / Play subscriptions                   |
| Push           | Expo Notifications                              | Reminders + coaching nudges                      |
| Shared code    | Zod (validation), Drizzle (DB schema), date-fns | Same types on app + server                       |
| Marketing site | **Astro** (static) — built last (Phase 12)      | SEO landing page → sends people to install       |

Everything else (Sentry, PostHog analytics, Resend email) is plumbing we add near the end.

---

## Scaffolding — one command to a running skeleton

Use **Better-T-Stack**, which wires Expo + Hono-on-Cloudflare-Workers + Better Auth +
Drizzle + Postgres in one go — almost exactly this stack:

```bash
npx create-better-t-stack@latest ttc
```

Pick in the prompts: **Expo (React Native)** frontend, **Hono** backend, **Cloudflare
Workers** runtime, **Better Auth**, **Drizzle** ORM, **PostgreSQL**. Skip the web app,
skip examples.

**Then trim:** delete the generated web app if any, and **park the auth screens** (we
turn login on last — see below). Point Drizzle/Postgres at your Supabase connection
string. Keep the monorepo layout: `apps/mobile`, `apps/api` (Worker), `packages/*` (shared).

> If the CLI's choices drift from the stack above, fall back to manual:
> `create-expo-app` + `npm create hono@latest` (cloudflare-workers template) +
> add `better-auth` + `drizzle-kit`. Same end state, more steps.

---

## The one trick that makes "login last" work

Every privacy rule in the DB depends on knowing **who is asking** — a value called
`app.user_id` the server sets on each request. Normally that comes from a verified login.

Instead, until the very end we use a **dev login shim**:

- **Server:** in dev/staging only, the Worker reads a header `x-dev-user-id` and uses it
  as the current user (sets `app.user_id`). In production this shim is off.
- **Seed** two fake users in the dev DB — "her" and "him" — already linked as a couple.
- **App:** a dev-only "Switch user: Her / Him" toggle that sets that header.

Now you can build and test **the entire app** — tracking, consent, dashboard, coaching,
paywall — by flipping between two fake users, with **no login screen in the way**.

**The last step** swaps the shim for real Better Auth. The only thing that changes is
_where `app.user_id` comes from_. All the DB rules, API routes, and screens stay exactly
as built and tested. (Your architecture doc says the same: "only the source of the user
id changed.")

**Where you'll test:** primarily by _running the real app_ — iOS Simulator, Android
emulator, or **Expo web** (`expo start --web`, a browser tab, fastest to click through) —
and using the dev user-switcher to walk each flow as "her" and "him". Unit tests and DB
consent tests are the **added-advantage safety net** underneath that hands-on testing, not
a replacement for it.

---

## Build steps (each is independently testable)

Ordered to build the two hard custom pieces early (consent + coaching) and nail **her
solo tracker first** (she's the acquisition channel), with login last.

### Phase 0 — Skeleton + dev harness

- **Build:** scaffold (above); connect Worker → Supabase Postgres; `/health` route; the
  dev login shim + seed two fake linked users; the app's dev user-switcher; a shared
  API client and TanStack Query in the app.
- **Test it by:** `curl /health` works; app boots to a placeholder screen and can call the
  Worker as "her" or "him" via the switcher.
- Tier: n/a (plumbing)

### Phase 1 — Data model + the consent/privacy engine (hardest piece, done first)

- **Build:** all tables from the architecture doc as Drizzle schema + SQL migrations
  (profiles, couple, `sharing_consent`, cycle/bbt/opk/mucus/symptom, habit, todo, coaching,
  entitlement). Turn on **row-level security**: default-deny; a partner can read a category
  only if a `sharing_consent` row says so. Add DB roles that can't bypass RLS.
- **Test it by:** database tests (pgTAP via `supabase test db`) proving: owner sees own
  data; a linked partner sees **only** granted categories; an unrelated user sees nothing;
  flipping consent to false cuts access immediately.
- Tier: Free (privacy is foundational)

### Phase 2 — Her core tracker (period, BBT, OPK, mucus, symptoms)

- **Build:** create/edit/delete API routes for each log (one entry per day); the tracking
  screens; OPK photo upload to private storage.
- **Test it by:** as fake "her", log a period/temp/OPK/mucus/symptom, edit and delete it,
  see it persist; confirm "him" can't read it yet (no consent granted).
- Tier: Free

### Phase 3 — Adaptive prediction (pure function, easiest to test)

- **Build:** a pure `packages/domain` function: reads her logged cycles, returns next-period
  - fertile-window estimate **with an honest confidence level**. Never assumes 28 days; with
    <3 cycles returns "not enough data" instead of a fake date. It's derived, never stored.
- **Test it by:** unit tests over fixed example cycles (short, long, irregular, missing,
  edited) — no server or DB needed. Then show the estimate on her tracker.
- Tier: Free

### Phase 4 — His profile + daily habit log

- **Build:** his habit-log API + screen (alcohol, smoking, exercise, sleep, heat, stress);
  his role shows the "his" version of the app.
- **Test it by:** as fake "him", log habits, edit them, confirm they're private to him.
- Tier: Free

### Phase 5 — Couple link + consent capture + shared dashboard

- **Build:** the shared dashboard route that returns **only consent-allowed** data
  (her fertile window + his habit status); the consent-capture UI (default-OFF switches).
- **Test it by:** as "her", grant "fertile_window"; as "him", see it appear on the shared
  dashboard; revoke it, confirm it disappears on the next load. The server, not the app,
  decides what's visible.
- Tier: Free

### Phase 6 — Shared to-dos + partner-invite flow

- **Build:** shared to-do list (assignable to either partner); the invite flow — generate a
  single-use, expiring invite link (Resend email + native share); accepting creates the
  couple and writes the consent rows chosen during invite.
- **Test it by:** create a to-do, assign it, complete it; generate an invite link, "accept"
  it as a second fake user, confirm the couple links and consent rows are created.
- Tier: Free

### Phase 7 — Coaching rules engine (the paid differentiator)

- **Build:** rules stored as **data, not code** (condition + priority + templated text +
  version). A weekly job reads both partners' logs and emits **one action each**, stamped
  with rule id/version. Starter rules: doctor nudge, short luteal phase, irregular-cycle
  honesty, fertile-window-this-week, missed-BBT, heat-exposure, alcohol/smoking. Every
  output wrapped in the persistent "guidance, not medical advice" frame. Gate it behind a
  **fake `is_pro` flag** for now.
- **Test it by:** golden unit tests — each rule fires only on its condition, right priority
  wins, text fills correctly, disclaimer always present. Toggle the fake pro flag to see it
  in-app.
- Tier: Paid

### Phase 8 — Subscriptions + real server-side gating

- **Build:** RevenueCat products + `pro` entitlement; the paywall screen; the server
  **re-checks entitlement** before returning coaching (don't trust the client). Replace the
  fake `is_pro` flag from Phase 7 with the real one.
- **Test it by:** store sandbox purchase flips you to pro and unlocks coaching; a
  non-pro/modified client calling the coaching API directly is refused by the server.
- Tier: Paid boundary

### Phase 9 — Privacy controls + content + notifications

- **Build:** one-tap **delete-everything** (a real hard delete, tested to leave zero rows) +
  data export; optional PIN/biometric app-lock; a few intro content pieces + basic tips;
  push tokens + discreet notifications (no health details on the lock screen).
- **Test it by:** run delete → automated test asserts no residual rows/photos/sessions;
  export produces a file; app-lock gates entry; a coaching push arrives with discreet text.
- Tier: Free (delete/export/app-lock/content), Paid (personalized content later)

### Phase 10 — REAL LOGIN (last) + onboarding

- **Build:** turn on **Better Auth** (email+verify, Apple, Google) in the Worker; replace
  the dev shim so `app.user_id` now comes from the verified session; add the login/signup/
  reset screens and the **onboarding quiz + role selection** (her/him) that until now the
  dev switcher faked. Turn the dev shim **off in production**.
- **Test it by:** register → verify → sign in → app restart keeps you signed in → sign out;
  everything built in Phases 1–9 keeps working, now driven by a real account instead of the
  switcher.
- Tier: Free

### Phase 11 — Hardening + beta

- **Build:** Sentry (scrubbed) + PostHog (allow-listed events, **no health data**); store
  privacy labels; legal/clinical review of thresholds and copy; EAS builds to TestFlight +
  Play Internal.
- **Test it by:** full journeys pass on real devices; alerts fire on synthetic failures
  without leaking health data.
- Tier: n/a

### Phase 12 — Marketing website (SEO + install landing) — after the app is built

- **What it is:** a **separate**, mostly-static site (its own `apps/web`) — landing page,
  features, pricing, the "we never sell your data" pledge, an FAQ/blog for SEO, privacy
  policy + terms, and **App Store / Play Store buttons**. Not the app itself; a page that
  gets found on Google and sends people to install.
- **Build with Astro** (`npm create astro@latest`) — static output, excellent SEO, almost no
  JavaScript, cheap to host (Cloudflare Pages, same account as your Workers). Reuse your
  brand colors/copy from the app; the blog/FAQ is where the SEO traffic comes from.
  - Add: correct `<title>`/meta tags + Open Graph per page, a sitemap + `robots.txt`
    (Astro has an official sitemap integration), fast Lighthouse scores, and **smart store
    links** — a single "Get the app" link that sends iPhones to the App Store and Android to
    Play. Optionally a deferred-deep-link so an invite URL opens the app if installed, else
    the right store.
- **Why separate from the Expo app:** Expo's web output is a single-page app and weak for
  SEO; a static Astro site is what actually ranks. They share brand, not code.
- **Test it by:** run `astro dev`, click every page in the browser; check the store buttons
  route correctly from an iPhone vs. Android; run Lighthouse for SEO/perf; confirm the
  sitemap and meta tags are present. (This one is naturally browser-tested.)
- Tier: n/a (acquisition)

---

## How to verify throughout

**Primary: run it and click through.** Every phase is checked first by running the real
app and exercising the flow by hand:

- **Expo web** (`expo start --web`) — fastest loop, a browser tab, great for most screens.
- **iOS Simulator / Android emulator** — for anything touching native bits (camera/OPK
  photos, push, biometrics, in-app purchase).
- Use the **dev user-switcher** to walk each flow as "her" and "him".

**Added-advantage safety net (write where cheap, not everywhere):**

- **Pure logic (prediction, coaching):** Vitest unit tests in `packages/domain` — zero
  infrastructure, so worth having. These catch cycle-math and rule bugs a manual click won't.
- **Privacy/consent (the promise you're selling):** database tests (pgTAP) + a few Worker
  integration tests asserting a partner cannot read un-shared data. This is the one area
  where automated tests genuinely earn their keep — keep it green on every change.
- App component tests (React Native Testing Library) only where a screen has real logic.

**End-to-end (after Phase 10):** register → track → invite → link → consent → coach →
subscribe → delete, on iOS and Android dev builds.

Rule of thumb: **manual on simulator/web is the default check; automate the two things that
are actually yours — consent/RLS and the coaching rules.**

---

## Deliberately not in this plan (per your docs)

Wearables / Apple Health sync, automated OPK photo-reading, conversational AI coaching,
correlation insights, hardware partnerships, community. The data model leaves room for
them; none are built for MVP.

**Before production:** a privacy attorney reviews policy/consent/deletion, and a fertility
clinician approves prediction thresholds, semen-analysis ranges, doctor-nudge timing, and
all coaching copy. Keep that copy gated until signed off.
