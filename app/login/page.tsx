"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginAttendee() {
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/auth/mock-attendee-login", {
      method: "POST"
    });
    const data = (await response.json()) as { success?: boolean; message?: string };

    setLoading(false);

    if (!response.ok || !data.success) {
      setMessage(data.message ?? "Could not log in attendee");
      return;
    }

    router.push("/attendee/dashboard");
  }

  async function loginStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/auth/staff-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });
    const data = (await response.json()) as { success?: boolean; message?: string };

    setLoading(false);

    if (!response.ok || !data.success) {
      setMessage(data.message ?? "Could not log in staff");
      return;
    }

    router.push("/staff/shop");
  }

  return (
    <main className="narrow-page stack">
      <h1>Login</h1>

      {message ? <div className="message error">{message}</div> : null}

      <section className="card stack">
        <h2>Attendee</h2>
        <p className="muted">Use the seeded demo attendee account.</p>
        <button type="button" onClick={loginAttendee} disabled={loading}>
          Mock attendee login
        </button>
      </section>

      <section className="card stack">
        <h2>Staff</h2>
        <form className="stack" onSubmit={loginStaff}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="food_staff"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password123"
            />
          </label>
          <button type="submit" disabled={loading}>
            Staff login
          </button>
        </form>
      </section>
    </main>
  );
}
