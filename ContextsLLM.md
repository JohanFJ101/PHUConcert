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
- Stack: Next.js App Router, TypeScript, Prisma, PostgreSQL, plain CSS, bcryptjs.
- Devices do not talk directly to each other. Attendee, staff, and admin clients all use API routes; PostgreSQL is the source of truth.
- Local server command: `npm run dev -- --hostname 0.0.0.0 -p 3000`
- Local database command: `docker compose up -d`
- Database setup commands: `npm run prisma:migrate`, then `npm run prisma:seed`
- Stop everything: stop the process listening on port `3000`, then run `docker compose down`.

### Main Routes

- `/login`: role chooser for attendee, staff, and admin.
- `/login/attendee`: demo attendee login.
- `/attendee/dashboard`: attendee wallet, wristband balance, top-ups, transaction history, polling refresh.
- `/login/staff`: staff login.
- `/staff/shop`: shop-specific menu and wristband charging page.
- `/login/admin`: admin/operator login.
- `/admin/dashboard`: operator view of attendees, staff/admins, and recent transactions.
- `/onboarding`: attendee profile form kept available for later expansion.

### Main API Routes

- `POST /api/auth/mock-attendee-login`
- `POST /api/auth/staff-login`
- `POST /api/auth/admin-login`
- `POST /api/auth/logout`
- `GET /api/attendee/wristbands`
- `GET /api/attendee/transactions`
- `POST /api/attendee/topup`
- `POST /api/staff/charge`
- `GET /api/staff/shop`
- `GET /api/admin/overview`
- `POST /api/onboarding`

### Auth And Roles

- Session uses a simple signed httpOnly cookie implemented in `lib/session.ts`.
- Session cookie name: `phu_session`.
- Roles:
  - `ATTENDEE`: normal attendee user from `User`.
  - `STAFF`: shop/counter operator from `Staff`, must have an assigned shop.
  - `ADMIN`: highest privilege operator from `Staff`, no shop required.
- Staff/admin passwords are hashed with `bcryptjs`.
- Do not expose `passwordHash` to frontend/API responses.

### Prisma/Data Notes

- Prisma schema lives in `prisma/schema.prisma`.
- Seed data lives in `prisma/seed.js`.
- Migrations currently include:
  - `20260511000000_init`: initial MVP schema.
  - `20260511010000_add_admin_role`: adds `ADMIN` role and makes `Staff.shopId` nullable.
- Demo credentials after seed:
  - Attendee: use the demo login button.
  - Staff: `food_staff / password123`
  - Staff: `bar_staff / password123`
  - Admin: `admin / password123`
  - Demo wristband token: `wb_demo_001`

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
- Added `/attendee/login`, `/staff/login`, and `/admin/login`.
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
