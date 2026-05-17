# PHUConcert

Fullstack MVP for a festival wristband payment flow. One phone can run the attendee wallet, another phone can run the staff shop, and both use the same backend/database.

## What is included

- Next.js App Router with TypeScript
- Prisma with PostgreSQL
- Simple signed httpOnly cookie sessions for local MVP auth
- Separate attendee, staff, and admin login pages
- Google OAuth attendee login matched against pre-imported ticket emails
- Admin CSV import for BookMyShow-style attendee rows
- Staff and admin login with hashed passwords
- Attendee wallet polling every 2 seconds
- Mock top-up credits with preset amounts or a custom typed amount
- Staff shop basket checkout with attendee QR approval
- Admin/operator dashboard for attendees, staff, and transactions
- Transaction history saved in the database

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
copy .env.example .env
```

3. Start PostgreSQL. A Docker Compose file is included:

```bash
docker compose up -d
```

4. Run the Prisma migration:

```bash
npm run prisma:migrate
```

5. Seed demo data:

```bash
npm run prisma:seed
```

6. Configure Google OAuth for attendee login.

For same-machine localhost testing, create a Google OAuth web client and add
this redirect URI:

```text
http://localhost:3000/api/auth/google/callback
```

Then set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
`APP_BASE_URL="http://localhost:3000"` in `.env`.

Do not use `0.0.0.0` as a browser URL or Google callback URL. It is only the
server bind address used in the `npm run dev` command.

7. Start the dev server:

```bash
npm run dev -- --hostname 0.0.0.0 -p 3000
```

8. For phone testing with Google OAuth, start a temporary HTTPS Cloudflare
tunnel in a second terminal:

```bash
npm run tunnel
```

Cloudflare prints a random URL like `https://example.trycloudflare.com`.
Use that URL to update `.env`:

```bash
npm run tunnel:env -- https://example.trycloudflare.com
```

The helper prints the exact Google callback URI. Add that exact URI to the
Google OAuth web client, then restart the Next.js server so it reloads `.env`.
Open the Cloudflare HTTPS URL from both phones, for example:

```text
https://example.trycloudflare.com/login
```

The random `trycloudflare.com` URL changes each time you restart the tunnel, so
repeat the `tunnel:env` step and update the Google callback URI whenever the
tunnel URL changes.

## Demo credentials

Attendee:

- Go to `/login/attendee` or choose Attendee from `/login`.
- Use Google OAuth with an email imported by the admin CSV.
- For fallback/local testing, use "Login with code" and enter the attendee Unique id number.

Staff:

- Go to `/login/staff` or choose Staff from `/login`.
- `food_staff` / `password123`
- `bar_staff` / `password123`

Admin:

- Go to `/login/admin` or choose Admin from `/login`.
- `admin` / `password123`
- Admin dashboard: `/admin/dashboard`

Demo wristband token:

- `BMS-DEMO-001`

## Admin attendee CSV import

Login as admin and open `/admin/dashboard`. The import form accepts a CSV with
these columns:

```csv
FULL NAME,dob,email used for registering,Unique id number
Demo User,2000-01-01,demo@example.com,BMS-DEMO-001
```

The importer validates the whole file, upserts attendees by email, stores the
unique id as `ticketId`, and creates an active wristband whose QR token is the
same unique id for the current MVP.

## Manual test checklist

1. Open `/login` on phone 1 using the same origin that is in `APP_BASE_URL`.
2. Choose Staff, then login as `food_staff` / `password123`.
3. Add Burger and Fries to the basket.
4. Click Generate approval QR.
5. Open the QR URL on phone 2 while logged out, or scan the QR with the phone camera.
6. Login as the attendee using Google or Login with code `BMS-DEMO-001`.
7. Confirm the attendee returns to the purchase review page.
8. Confirm the review shows Burger, Fries, quantities, line totals, total credits, current balance, and balance after approval.
9. Approve the purchase.
10. Confirm the staff phone changes from waiting to approved.
11. Open `/attendee/dashboard` and confirm the balance and transaction history update.
12. Login as `bar_staff` and generate a Beer approval QR.
13. Confirm approval succeeds for the demo user because DOB is `2000-01-01`.
14. Change demo DOB to under 21 and confirm alcohol approval fails.
15. Try a basket that costs more than the attendee balance and confirm approval is blocked.
16. Let a QR sit for more than 5 minutes and confirm it expires.
17. POST to `/api/staff/charge` and confirm it returns `410 Gone`.
18. Choose Admin, then login as `admin` / `password123`.
19. Confirm the admin dashboard shows attendees, staff/admins, and recent transactions.

## Useful commands

```bash
npm run lint
npm run build
npm run tunnel
npm run tunnel:env -- https://example.trycloudflare.com
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## MVP limitations

- No in-app camera scanner yet; QR approval uses the phone camera/browser opening the encoded URL.
- No real payment gateway yet.
- Ticketing integration is CSV import only; there is no live BookMyShow API sync yet.
- Staff and attendee devices never communicate directly; the database-backed API is the source of truth.
