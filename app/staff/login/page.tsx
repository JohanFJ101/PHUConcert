"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function StaffLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
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

      if (!response.ok || !data.success) {
        setMessage(data.message ?? "Could not log in staff");
        return;
      }

      router.push("/staff/shop");
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
        <h1>Staff Login</h1>
        <p className="muted">Use this page for shop/counter staff only.</p>
      </div>

      {message ? <div className="message error">{message}</div> : null}

      <form className="card stack" onSubmit={loginStaff}>
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
          {loading ? "Logging in..." : "Staff login"}
        </button>
      </form>
    </main>
  );
}
