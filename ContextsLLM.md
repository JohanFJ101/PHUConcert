# ContextsLLM

This file is for agentic LLMs working in this repository. Keep it brief, factual, and useful for handoff. When an agent completes a task, append a dated entry under that agent's heading with:

- what changed
- where the main files are
- how it was verified
- any unresolved issue or assumption

## Codex

### Current Project Snapshot

- Repo: `C:\Users\johan\Documents\PHUconcert`
- App type: fullstack festival wristband payment MVP.
- Stack: Next.js 16 App Router, React 19, TypeScript 5.7, Prisma 5.22, PostgreSQL 16, plain CSS, `bcryptjs` for password hashing.
- Devices do not talk directly to each other. Attendee, staff, and admin clients all use API routes; PostgreSQL is the source of truth.
- Local server command: `npm run dev -- --hostname 0.0.0.0 -p 3000`
- Local database command: `docker compose up -d`
- Database setup commands: `npm run prisma:migrate`, then `npm run prisma:seed`
- Stop everything: stop the process listening on port `3000`, then run `docker compose down`.

### High-Level Architecture

```
Browser (attendee / staff / admin phone)
        |
        |  fetch('/api/...', credentials: 'cookie')
        v
Next.js App Router (Route Handlers + Server Components)
        |
        |  Prisma Client (singleton in lib/prisma.ts)
        v
PostgreSQL (Docker container, port 5432)
```

- Auth is a single signed httpOnly cookie (`phu_session`) issued by the login routes and verified by `lib/session.ts` on every request.
- The money-moving endpoint (`POST /api/staff/charge`) runs all of its checks and writes inside one `prisma.$transaction` at `Serializable` isolation to prevent double-spend.
- The attendee dashboard polls `/api/attendee/wristbands` and `/api/attendee/transactions` every 2 seconds; no websockets.

### Directory Map

```
app/
  layout.tsx                  Root <html>/<body>, loads globals.css, sets metadata.
  page.tsx                    Server-side redirect from `/` to `/login`.
  globals.css                 All styles. Organised: palette -> base -> layout
                              utilities -> components -> role-themed login pages.

  login/
    page.tsx                  /login: role chooser (attendee / staff / admin).
    attendee/page.tsx         /login/attendee: one-click mock attendee login.
    staff/page.tsx            /login/staff: username/password for STAFF.
    admin/page.tsx            /login/admin: username/password for ADMIN.

  attendee/dashboard/page.tsx /attendee/dashboard: wallet, top-up, history.
                              Polls APIs every 2s. Top-up presets + custom amount.
  staff/shop/page.tsx         /staff/shop: shop menu + wristband charge form.
  admin/dashboard/page.tsx    /admin/dashboard: totals, attendees, staff, last 100 tx.
  onboarding/page.tsx         /onboarding: attendee profile editor (future signup flow).

  api/
    auth/
      mock-attendee-login/route.ts   POST: log in as the seeded demo attendee.
      staff-login/route.ts           POST: STAFF username+password login.
      admin-login/route.ts           POST: ADMIN username+password login.
      logout/route.ts                POST: clears phu_session.
    attendee/
      wristbands/route.ts            GET: attendee profile + wristbands.
      transactions/route.ts          GET: attendee transaction history.
      topup/route.ts                 POST: increment balance + write TOPUP row.
    staff/
      shop/route.ts                  GET: staff's shop and active menu.
      charge/route.ts                POST: serializable charge against a wristband.
    admin/
      overview/route.ts              GET: all attendees, staff, last 100 tx + totals.
    onboarding/route.ts              POST: update attendee profile fields.

lib/
  prisma.ts        Singleton PrismaClient with dev-mode hot-reload cache.
  session.ts       HMAC-signed cookie session: create/verify/set/clear.
  http.ts          jsonError + requireAttendee/Staff/AdminSession + readJsonObject.
  age.ts           UTC-safe attendee age calculation for age-restricted items.

prisma/
  schema.prisma                              Models: User, Staff, Shop, Item,
                                             Wristband, Transaction. Enum Role.
  seed.js                                    Wipes and reseeds demo data.
  migrations/20260511000000_init/            Initial schema.
  migrations/20260511010000_add_admin_role/  Adds ADMIN enum value and makes
                                             Staff.shopId nullable.

Top-level config:
  package.json        Scripts (dev/build/lint/prisma:*) and dependency pins.
  tsconfig.json       Strict TS, App Router-friendly, "@/*" path alias to root.
  eslint.config.mjs   next/core-web-vitals + next/typescript flat-config.
  next.config.mjs     Empty defaults; placeholder for future config.
  docker-compose.yml  Postgres 16 with named volume `phuconcert-postgres-data`.
  .env.example        DATABASE_URL + SESSION_SECRET template.
```

### Main Routes (UI)

- `/login`: role chooser for attendee, staff, and admin.
- `/login/attendee`: demo attendee login.
- `/login/staff`: staff login.
- `/login/admin`: admin/operator login.
- `/attendee/dashboard`: attendee wallet, wristband balance, top-ups, transaction history, polling refresh.
- `/staff/shop`: shop-specific menu and wristband charging page.
- `/admin/dashboard`: operator view of attendees, staff/admins, totals, and recent transactions.
- `/onboarding`: attendee profile form kept available for later expansion.

### Main API Routes

- `POST /api/auth/mock-attendee-login` - issues ATTENDEE session for the seeded `demo@example.com`.
- `POST /api/auth/staff-login` - body `{ username, password }`, issues STAFF session. Rejects ADMIN rows.
- `POST /api/auth/admin-login` - body `{ username, password }`, issues ADMIN session. Rejects STAFF rows.
- `POST /api/auth/logout` - clears `phu_session`, role-agnostic.
- `GET /api/attendee/wristbands` - returns `{ attendee, wristbands[] }`.
- `GET /api/attendee/transactions` - reverse-chronological history with item/shop names.
- `POST /api/attendee/topup` - body `{ wristbandId, amountCredits }`. Wrapped in `prisma.$transaction`.
- `POST /api/staff/charge` - body `{ qrToken, itemId }`. Runs all validation inside one `prisma.$transaction` at `Serializable` isolation.
- `GET /api/staff/shop` - returns `{ staff, shop: { ..., items[] } }`. Inactive items filtered out.
- `GET /api/admin/overview` - returns `{ totals, attendees, staff, transactions }`. Last 100 transactions.
- `POST /api/onboarding` - body `{ name, dob?, gender?, phone? }`, updates the attendee profile.

### Auth And Roles

- Session uses a simple signed httpOnly cookie implemented in `lib/session.ts`.
- Session cookie name: `phu_session`.
- Cookie format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256 of payload)>` using `SESSION_SECRET`.
- Cookie options: `httpOnly: true`, `sameSite: "lax"`, `secure` only in production, `path: "/"`, `maxAge: 7 days`.
- Roles (see `AppSession` discriminated union in `lib/session.ts`):
  - `ATTENDEE`: normal attendee user from `User`. Session has `userId`.
  - `STAFF`: shop/counter operator from `Staff`. Must have an assigned `shopId`. Session has `staffId`.
  - `ADMIN`: highest-privilege operator from `Staff`. No shop required. Session has `staffId`.
- Login routes enforce role/credentials with `bcrypt.compare` and a single generic error message to avoid username enumeration.
- Route handlers gate access with `requireAttendeeSession` / `requireStaffSession` / `requireAdminSession` from `lib/http.ts`. They return 401 when no session, 403 when wrong role.
- Staff/admin passwords are hashed with `bcryptjs` cost 10.
- `passwordHash` is never `select`ed in responses returned to the frontend.

### Prisma/Data Notes

- Prisma schema lives in `prisma/schema.prisma`.
- Seed data lives in `prisma/seed.js`. The seed deletes everything before inserting; safe to re-run.
- Money is stored as integer "credits" only. Wristband `balanceCredits` is the running total; the `Transaction` table is the ledger of changes (positive = top-up, negative = purchase).
- `Transaction.staffId / shopId / itemId` are nullable with `onDelete: SetNull` so historical rows survive when an operator/shop/item is deleted.
- `Transaction.wristbandId` cascades from `Wristband`, and `Wristband.userId` cascades from `User`, so deleting an attendee cleanly removes all of their data.
- Indexes:
  - `Transaction(wristbandId, createdAt)` for the attendee history view.
  - `Transaction(shopId, createdAt)` for per-shop reporting.
- Migrations currently include:
  - `20260511000000_init`: initial MVP schema.
  - `20260511010000_add_admin_role`: adds `ADMIN` role and makes `Staff.shopId` nullable.
- Do NOT edit existing migration `.sql` files (Prisma checksums them); add a new migration instead with `npm run prisma:migrate`.
- Demo credentials after seed:
  - Attendee: use the demo login button.
  - Staff: `food_staff / password123`
  - Staff: `bar_staff / password123`
  - Admin: `admin / password123`
  - Demo wristband token: `wb_demo_001`
  - Demo attendee DOB: `2000-01-01` (over 21, so alcohol purchases work; edit and re-seed to test the under-21 path).

### Key Implementation Patterns

- **Singleton Prisma client**: `lib/prisma.ts` caches the client on `globalThis` outside production so Next dev hot-reloads don't exhaust the connection pool.
- **Signed cookie sessions**: `lib/session.ts` uses HMAC-SHA256 + `timingSafeEqual` for signature verification. Cookies are read via `next/headers#cookies()` (App Router pattern).
- **Role guards**: every Route Handler that needs a logged-in user starts with `await requireXSession()` and short-circuits on `error`.
- **Tolerant JSON body parsing**: `readJsonObject` in `lib/http.ts` returns `null` instead of throwing on malformed bodies, so handlers can return a clean 400.
- **Serializable charges**: `POST /api/staff/charge` does all five checks (staff, item, wristband, age, balance) and both writes inside a single `prisma.$transaction` with `isolationLevel: Prisma.TransactionIsolationLevel.Serializable`. A custom `ChargeFailure` class threads the appropriate HTTP status through the rollback.
- **UTC age math**: `lib/age.ts` does whole-year UTC calculations so the result is consistent regardless of staff device timezone.
- **Polling, not websockets**: the attendee dashboard refreshes every 2 seconds via `setInterval` inside `useEffect`. The ESLint rule `react-hooks/set-state-in-effect` is disabled in the config to allow this pattern.
- **Role-themed login pages**: `globals.css` defines `.role-attendee`, `.role-staff`, `.role-admin` which override `--role-*` CSS variables consumed by `.role-page`, `.role-hero`, `.role-button`, etc.

### Gotchas / Notes For Future Agents

- The Glob tool may report the `attendee/login`, `staff/login`, and `admin/login` paths because of historical references in `.next/dev/types/routes.d.ts`; only the canonical `login/<role>` files exist on disk now.
- `next-env.d.ts` is auto-generated and contains the explicit comment "should not be edited" — leave it alone.
- `package.json` is strict JSON (no comments allowed); other config files (`tsconfig.json`, `next.config.mjs`, `eslint.config.mjs`, `docker-compose.yml`, `.env.example`, `.gitignore`) are commented.
- Migration `.sql` files are checksummed by Prisma; do not modify, comment, or rename them. Add a new migration if the schema changes.
- The admin dashboard totals for spend and top-ups are derived from the latest 100 transactions only (matching the "Recent Transactions" UI). Be aware of this if you wire up reports.
- The MVP intentionally does not have: real Google OAuth, camera QR scanning, real payment gateway, or third-party ticketing integration. Don't assume any of these exist.

### Verification Steps (used when changing things)

- `npm run lint` - ESLint flat-config.
- `npm run build` - Next.js production build (also typechecks).
- `npx prisma validate` - quick schema check.
- `npm run prisma:migrate` - applies migrations to the local DB.
- `npm run prisma:seed` - re-seeds demo data.
- Manual smoke flow: log in as demo attendee, top up, log in as `food_staff` on a second device, charge `wb_demo_001` for Burger, confirm attendee balance drops within 2s.

### Timeline

#### 2026-05-11 - Initial Fullstack MVP

Codex scaffolded the app from an effectively empty repo. Added Next.js App Router, TypeScript, Prisma, PostgreSQL config, Docker Compose, seed script, API routes, and minimal UI.

Summary:
- Implemented attendee wallet, staff shop, mock login, top-up, staff charge, and transaction history.
- Added safe staff charge flow with `prisma.$transaction` and serializable isolation.
- Added README setup and two-phone testing instructions.
- Verified `npm run lint`, `npm run build`, Prisma validation, login page HTTP 200, and API login paths.

#### 2026-05-11 - Docker And Runtime Troubleshooting

Codex diagnosed Docker/PostgreSQL and app startup issues on Windows.

Summary:
- Found Docker CLI permission/service issues at different points.
- Confirmed PostgreSQL was reachable on `localhost:5432` when running.
- Started/stopped Next.js dev server and Docker Compose as needed.
- Verified attendee, staff, and charge backend flows directly through API calls.

#### 2026-05-11 - Separate Login Pages And Admin Role

Codex made login less mock-like and added an operator/admin role.

Summary:
- Changed `/login` into a role chooser.
- Added `/attendee/login`, `/staff/login`, and `/admin/login` (later renamed to `/login/<role>`).
- Added `ADMIN` role to Prisma.
- Added admin account in seed data.
- Added `/api/auth/admin-login` and `/api/admin/overview`.
- Added `/admin/dashboard` with attendees, staff/admins, totals, and transactions.
- Verified role separation: admin credentials cannot use staff login, and staff credentials cannot use admin login.
- Verified lint, build, Prisma validation, migration, seed, and API paths.

#### 2026-05-11 - Custom Attendee Top-Up Amount

Codex changed attendee top-up from fixed-only amounts to preset plus custom amount.

Summary:
- Updated `/attendee/dashboard` to show preset buttons `100`, `250`, `500` above a numeric input.
- Preset buttons fill the input; user can type any positive whole number.
- Updated `POST /api/attendee/topup` to accept any positive integer.
- Updated README wording for top-ups.
- Verified `npm run lint` and `npm run build`.

#### 2026-05-12 - ContextsLLM Handoff File

Codex added this `ContextsLLM.md` file for future agents.

Summary:
- Documented app purpose, stack, routes, API routes, auth roles, data notes, demo credentials, and task timeline.
- Future agents should append a short dated entry under their own heading, or under `Codex` when the agent is Codex.

#### 2026-05-13 - Repo-Wide Comments And Expanded Handoff Doc

Cursor agent added file-level and inline comments across every editable file in the repo and expanded this handoff document.

Summary:
- Commented `lib/age.ts`, `lib/prisma.ts`, `lib/session.ts`, `lib/http.ts` with module headers and per-function JSDoc explaining intent and security choices (HMAC + timingSafeEqual, cookie options, role guard contracts, age-math UTC reasoning).
- Annotated `prisma/schema.prisma` with model-level and field-level comments, including the cascade vs SetNull policy for transaction history. `prisma/seed.js` got a header describing destructive behaviour and per-fixture rationale.
- Added file-level docstrings and key inline notes to every Route Handler under `app/api/**` covering request/response shape, auth requirement, and notable failure modes (the serializable transaction in `staff/charge`, the parallel reads in `admin/overview`, the ownership check in `attendee/topup`).
- Added file-level docstrings to every page under `app/login/**`, `app/attendee/dashboard`, `app/staff/shop`, `app/admin/dashboard`, `app/onboarding`, plus `app/layout.tsx` and `app/page.tsx`.
- Sectioned `app/globals.css` into commented blocks (palette, resets, layout utilities, component classes, role-themed login pages).
- Commented `next.config.mjs`, `eslint.config.mjs` (explaining the `set-state-in-effect` override), `tsconfig.json`, `docker-compose.yml`, `.env.example`, and `.gitignore`.
- Intentionally left untouched: `package.json` (strict JSON, no comments allowed), `next-env.d.ts` (auto-generated, explicit "do not edit" comment), and every `prisma/migrations/**/migration.sql` (Prisma checksums these files; modifying them would break `prisma migrate`).
- Expanded this file with: high-level architecture diagram, directory map for every editable file, expanded auth/session description, key implementation patterns, gotchas, and verification steps.
- Verified the typed configs and pages by running `npm run lint`.

#### 2026-05-15 - OAuth And Third-Party Ticket Linking Architecture

Codex discussed how attendee OAuth should link to tickets bought on third-party platforms such as BookMyShow.

Summary:
- Clarified that OAuth proves control of an email address, but does not itself provide ticket-purchase details from the ticketing provider.
- Recommended ingesting third-party ticket data through a provider API, webhook, CSV/manual import, or staff ticket scan flow, then linking rows to verified OAuth users by normalized verified email.
- Recommended future schema additions around external ticket/provider records, ticket status, and user-ticket linking before showing purchase details in `/attendee/dashboard`.
- Noted important edge cases: one email buying multiple tickets, transfers, unverified emails, provider API availability, and fallback claim flows using ticket codes or staff-assisted linking.

#### 2026-05-15 - BookMyShow API Availability Check

Codex checked public BookMyShow-facing sources for whether there is an official API suitable for importing purchaser/ticket details into PHUConcert.

Summary:
- No public self-serve BookMyShow developer API for order/ticket lookup was found in the available public sources.
- BookMyShow does expose partner/listing channels and a restricted partner app, which suggests organizer/partner tooling exists but is not the same as an open API.
- Recommended treating BookMyShow integration as a private partnership discussion; for MVP/pilot, use CSV/manual import or staff ticket scan/claim flow until official partner API/webhook/export access is confirmed.

#### 2026-05-15 - Full Web App Planning Direction

Codex proposed the full product architecture before further coding.

Summary:
- Recommended separating the app into six domains: identity, ticket ingestion, wristband issuance/linking, wallet/payments, staff POS/entry operations, and admin reporting.
- Recommended implementing ticket-provider access through an internal `ExternalTicket` model plus provider adapters, starting with CSV/manual import and later swapping to official API/webhook access if BookMyShow or another provider grants it.
- Recommended building in phases: stabilize auth/schema, add ticket import/linking, improve attendee dashboard, add staff entry/POS flows, expand admin operations, then harden security/deployment.

#### 2026-05-16 - Local Production OAuth Redirect Fix

Codex fixed a Google OAuth failure that appeared under `npm run start`.

Summary:
- Removed the active placeholder `GOOGLE_OAUTH_REDIRECT_URI` from `.env` and `.env.example`; only one redirect URI should be active at a time.
- Added `APP_BASE_URL="http://localhost:3000"` to the active local `.env` so production-start redirects resolve to the same browser origin used in Google OAuth.
- Changed auth and OAuth state cookies to use Secure only when the configured browser-facing app URL is HTTPS, so local `next start` over HTTP behaves correctly while real HTTPS deployments still get Secure cookies.
