import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="narrow-page stack">
      <h1>Login</h1>
      <p className="muted">Choose the workspace you need for this device.</p>

      <section className="card stack">
        <h2>Attendee</h2>
        <p className="muted">For guests checking their wristband balance and history.</p>
        <Link className="button-link" href="/attendee/login">
          Attendee login
        </Link>
      </section>

      <section className="card stack">
        <h2>Staff</h2>
        <p className="muted">For food and bar counters charging wristbands.</p>
        <Link className="button-link" href="/staff/login">
          Staff login
        </Link>
      </section>

      <section className="card stack">
        <h2>Admin</h2>
        <p className="muted">For operators with access to attendees, staff, and transactions.</p>
        <Link className="button-link" href="/admin/login">
          Admin login
        </Link>
      </section>
    </main>
  );
}
