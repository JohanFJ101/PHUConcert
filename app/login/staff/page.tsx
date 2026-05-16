/**
 * `/login/staff` - Username/password sign-in for shop staff.
 *
 * Posts to `/api/auth/staff-login` and on success redirects to the staff
 * shop. The endpoint rejects ADMIN accounts, so an admin trying this
 * form will see the same generic "Invalid username or password" error.
 */
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
    <main className="role-page role-staff">
      <div className="role-shell">
        <Link className="role-back" href="/login">
          &larr; Back to login choices
        </Link>
        {message ? <div className="message error">{message}</div> : null}

        <form className="role-card" onSubmit={loginStaff}>
          <h2>Staff credentials</h2>
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
          <div className="role-hint">
            Enter the Username and password provided.
          </div>
          <button type="submit" className="role-button" disabled={loading}>
            {loading ? "Logging in..." : "Sign in to shop"}
          </button>
        </form>
      </div>
    </main>
  );
}
