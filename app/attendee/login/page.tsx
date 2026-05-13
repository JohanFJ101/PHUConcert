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
    <main className="narrow-page stack">
      <div>
        <Link href="/login">Back to login choices</Link>
        <h1>Attendee Login</h1>
        <p className="muted">Local MVP uses the seeded demo attendee account.</p>
      </div>

      {message ? <div className="message error">{message}</div> : null}

      <section className="card stack">
        <h2>Demo attendee</h2>
        <p className="muted">Logs in as Demo User with wristband token wb_demo_001.</p>
        <button type="button" onClick={loginAttendee} disabled={loading}>
          {loading ? "Logging in..." : "Continue as demo attendee"}
        </button>
      </section>
    </main>
  );
}
