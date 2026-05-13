"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/admin-login", {
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
        setMessage(data.message ?? "Could not log in admin");
        return;
      }

      router.push("/admin/dashboard");
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
        <h1>Admin Login</h1>
        <p className="muted">Admin operators can view attendees, staff, and transactions.</p>
      </div>

      {message ? <div className="message error">{message}</div> : null}

      <form className="card stack" onSubmit={loginAdmin}>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
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
          {loading ? "Logging in..." : "Admin login"}
        </button>
      </form>
    </main>
  );
}
