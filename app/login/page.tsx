/**
 * `/login` - Role chooser.
 *
 * The shared entry point for every device. We do not auto-pick a role
 * because the same laptop/phone can be used as attendee, staff, or admin
 * at different points during the festival. Each option links to its own
 * themed login page under `/login/<role>`.
 */

import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="narrow-page stack">
      <h1>Login</h1>
      <p className="muted">Choose the workspace you need for this device.</p>

      <section className="card stack">
        <h2>Attendee</h2>
        <p className="muted">For guests checking their wristband balance and history.</p>
        <Link className="button-link" href="/login/attendee">
          Attendee login
        </Link>
      </section>

      <section className="card stack">
        <h2>Staff</h2>
        <p className="muted">For food and bar counters charging wristbands.</p>
        <Link className="button-link" href="/login/staff">
          Staff login
        </Link>
      </section>

      <section className="card stack">
        <h2>Admin</h2>
        <p className="muted">For operators with access to attendees, staff, and transactions.</p>
        <Link className="button-link" href="/login/admin">
          Admin login
        </Link>
      </section>
    </main>
  );
}
