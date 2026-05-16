/**
 * `/login/attendee` - Attendee sign-in.
 *
 * The primary flow is Google OAuth. The callback only permits accounts
 * whose email was imported by an admin from the ticketing CSV. Attendees can
 * also enter their imported Unique id number as a basic fallback login code.
 */
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AttendeeLoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");

  async function loginWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/code-attendee-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code
        })
      });
      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        setMessage(data.message ?? "Could not log in with that code.");
        return;
      }

      router.push("/attendee/dashboard");
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const errorCode = new URLSearchParams(window.location.search).get("error");
    if (!errorCode) {
      return;
    }
    router.replace(`/login/attendee/error?reason=${encodeURIComponent(errorCode)}`);
  }, [router]);

  return (
    <main className="role-page role-attendee">
      <div className="role-shell">
        <Link className="role-back" href="/login">
          &larr; Back to login choices
        </Link>

        {message ? <div className="message error">{message}</div> : null}

        <section className="role-card">
          <h2>Attendee OAuth</h2>
          <p className="muted">
            Sign in with the same Google email used when registering for the event.
          </p>
          <div className="role-hint">
            Admins must import the ticketing CSV before attendee OAuth can succeed.
          </div>
          <a className="role-button-link" href="/api/auth/google/start">
            Continue with Google
          </a>
        </section>

        <form className="role-card" onSubmit={loginWithCode}>
          <h2>Login with code</h2>
          <p className="muted">Enter the Unique id number from your ticket entry.</p>
          <label>
            Code
            <input
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="BMS-MOCK-001"
            />
          </label>
          <button type="submit" className="role-button" disabled={loading}>
            {loading ? "Checking..." : "Login with code"}
          </button>
        </form>
      </div>
    </main>
  );
}
