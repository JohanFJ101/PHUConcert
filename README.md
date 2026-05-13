# PHUConcert

Fullstack MVP for a festival wristband payment flow. One phone can run the attendee wallet, another phone can run the staff shop, and both use the same backend/database.

## What is included

- Next.js App Router with TypeScript
- Prisma with PostgreSQL
- Simple signed httpOnly cookie sessions for local MVP auth
- Separate attendee, staff, and admin login pages
- Staff and admin login with hashed passwords
- Attendee wallet polling every 2 seconds
- Mock top-up credits with preset amounts or a custom typed amount
- Staff shop charging by manual wristband token
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

Docker was not detected in the current development environment when this app was scaffolded. If Docker is unavailable, install Docker Desktop or update `DATABASE_URL` in `.env` to point at any PostgreSQL database.

4. Run the Prisma migration:

```bash
npm run prisma:migrate
```

5. Seed demo data:

```bash
npm run prisma:seed
```

6. Start the dev server for two-phone testing:

```bash
npm run dev -- --hostname 0.0.0.0 -p 3000
```

7. Find your laptop IP address, then open this URL from both phones:

```text
http://LAPTOP_IP:3000/login
```

On Windows, you can usually find the IP address with:

```bash
ipconfig
```

## Demo credentials

Attendee:

- Go to `/login/attendee` or choose Attendee from `/login`.
- Use the mock attendee login button.

Staff:

- Go to `/login/staff` or choose Staff from `/login`.
- `food_staff` / `password123`
- `bar_staff` / `password123`

Admin:

- Go to `/login/admin` or choose Admin from `/login`.
- `admin` / `password123`
- Admin dashboard: `/admin/dashboard`

Demo wristband token:

- `wb_demo_001`

## Manual test checklist

1. Open `/login` on phone 1.
2. Choose Attendee, then click mock attendee login.
3. Confirm dashboard shows `wb_demo_001` and `500` credits.
4. Open `/login` on phone 2.
5. Choose Staff, then login as `food_staff` / `password123`.
6. Select Burger.
7. Enter `wb_demo_001`.
8. Click Charge.
9. Confirm staff sees success.
10. Confirm attendee phone balance updates within 2 seconds.
11. Login as `bar_staff`.
12. Select Beer.
13. Enter `wb_demo_001`.
14. Confirm charge succeeds for demo user because DOB is `2000-01-01`.
15. Change demo DOB to under 21 and confirm alcohol charge fails.
16. Try invalid QR token and confirm clean error.
17. Try charging more than balance and confirm insufficient balance error.
18. Choose Admin, then login as `admin` / `password123`.
19. Confirm the admin dashboard shows attendees, staff/admins, and recent transactions.

## Useful commands

```bash
npm run lint
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## MVP limitations

- No real Google OAuth yet.
- No real camera QR scanning yet.
- No real payment gateway yet.
- No third-party ticketing integration yet.
- Staff and attendee devices never communicate directly; the database-backed API is the source of truth.
