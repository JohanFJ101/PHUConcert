"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AttendeeLoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginAttendee() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/mock-attendee-login", {
        method: "POST"
      });
      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        setMessage(data.message ?? "Could not log in attendee");
        return;
      }

      router.push("/attendee/dashboard");
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="role-page role-attendee">
      <div className="role-shell">
        <Link className="role-back" href="/login">
          &larr; Back to login choices
        </Link>

        {message ? <div className="message error">{message}</div> : null}

        <section className="role-card">
          <h2>Demo attendee</h2>
          <p className="muted">
            This MVP uses a seeded demo account so you can try the wallet without
            signing up.
          </p>
          <div className="role-hint">
            You will log in as <strong>Demo User</strong> with wristband token{" "}
            <code>wb_demo_001</code>.
          </div>
          <button
            type="button"
            className="role-button"
            onClick={loginAttendee}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Continue as demo attendee"}
          </button>
        </section>
      </div>
    </main>
  );
}
