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
    <main className="role-page role-admin">
      <div className="role-shell">
        <Link className="role-back" href="/login">
          &larr; Back to login choices
        </Link>
        {message ? <div className="message error">{message}</div> : null}

        <form className="role-card" onSubmit={loginAdmin}>
          <h2>Admin credentials</h2>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter here"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter here"
            />
          </label>
  
          <button type="submit" className="role-button" disabled={loading}>
            {loading ? "Logging in..." : "Enter admin console"}
          </button>
        </form>
      </div>
    </main>
  );
}
