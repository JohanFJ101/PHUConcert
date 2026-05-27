# PHUConcert 🎸
---

## 🚀 Local Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Files
Duplicate the environment template file:
```bash
copy .env.example .env
```
Ensure your database connection string and session secrets are properly configured.

### 3. Run PostgreSQL Database
A pre-configured Docker Compose Postgres configuration is provided. (Ensure you have Docker Desktop running):
```bash
docker compose up -d
```

### 4. Setup database schema & seed data
Initialize the database and load the 10 demo attendees and counters:
```bash
npm run prisma:migrate
npm run prisma:seed
```

---

## 📱 Testing on Phones (Secure HTTPS Tunnel)

To test the **wristband QR scanner** on a physical phone, the browser requires a secure **HTTPS** origin (non-localhost HTTP connections block camera APIs like `navigator.mediaDevices.getUserMedia`). 

We have bundled a zero-configuration **Cloudflare Tunnel** that automatically assigns a secure HTTPS URL to your local server:

1. **Stop** any currently running Next.js dev servers on your machine.
2. **Start the secure development tunnel** by running:
   ```bash
   npm run dev:tunnel
   ```
3. Copy the secure Cloudflare URL printed in your terminal:
   ```text
   Cloudflare URL: https://xxxx-xxxx.trycloudflare.com
   ```
4. Open this URL on your phone's browser. You will be prompted to grant camera access when using the scanner, and it will function perfectly!

> [!NOTE]
> The helper script automatically updates your `APP_BASE_URL` in `.env` every time the tunnel starts up, so there is no need to manually edit `.env` files.

---

## 🔑 Demo Credentials

| Role | Username / ID | Password | Access URL |
| :--- | :--- | :--- | :--- |
| **Attendee (Hardcoded)** | `10000001` to `10000010` | *None (Use token code/QR)* | `/login/attendee` |
| **Food Staff** | `food_staff` | `password123` | `/login/staff` |
| **Bar Staff** | `bar_staff` | `password123` | `/login/staff` |
| **Admin** | `admin` | `password123` | `/login/admin` |

---

## 🛠️ Features & Workflow

### 1. Wristband QR Code Export & Import
- Log in to the Admin Dashboard (`/admin/dashboard`).
- From the **Attendees** section, click **"Export Attendee QRs as ZIP"**.
- This generates high-resolution, shareable QR codes for all 10 seeded attendees instantly.
- You can also upload a custom CSV containing names, DOBs, emails, and ticket numbers to bulk-import new attendees.

### 2. Cashless Ordering Flow
1. **Log in as Staff** (e.g., `food_staff` / `password123`).
2. Add items (e.g., Burger, Fries) to the cart and click **Generate QR**.
3. **Log in as Attendee** on a second device (or scan the staff's QR code using the physical phone camera).
4. Review the transaction details (current balance, items, total cost, and post-transaction balance).
5. Confirm the transaction to instantly deduct credits. The staff terminal will update automatically to reflect approval!

---

## 💻 Helpful Scripts

- `npm run dev` — Start the standard development server on `localhost:3000`.
- `npm run dev:tunnel` — Start dev server with secure HTTPS public URL (recommended for phones).
- `npm run lint` — Run ESLint diagnostics.
- `npm run build` — Create production bundle.
- `npm run prisma:generate` — Regenerate Prisma client.
