/**
 * `/login` - Role chooser.
 *
 * Attendee is the primary action and lives front-and-centre as a large
 * card. Staff and Admin are intentional second-class citizens for a
 * festival use-case: a single small button in each top corner so they
 * are reachable without dominating the layout.
 */

import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <Link className="login-corner login-corner-left" href="/login/staff">
        Staff
      </Link>
      <Link className="login-corner login-corner-right" href="/login/admin">
        Admin
      </Link>

      <div className="login-center">
        <section className="role-card role-attendee login-attendee-card">
          <h1>Attendee</h1>
          <p className="muted">
            Scan the QR code on your wristband to view your credits and history.
          </p>
          <Link className="role-button-link" href="/login/attendee">
            Scan my wristband
          </Link>
        </section>
      </div>
    </main>
  );
}
