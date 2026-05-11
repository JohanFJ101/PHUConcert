"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const response = await fetch("/api/attendee/wristbands", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        attendee?: {
          name?: string;
          dob?: string | null;
          gender?: string | null;
          phone?: string | null;
        };
      };

      setName(data.attendee?.name ?? "");
      setDob(data.attendee?.dob ? data.attendee.dob.slice(0, 10) : "");
      setGender(data.attendee?.gender ?? "");
      setPhone(data.attendee?.phone ?? "");
    }

    void loadProfile();
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        dob,
        gender,
        phone
      })
    });
    const data = (await response.json()) as { success?: boolean; message?: string };

    setLoading(false);

    if (!response.ok || !data.success) {
      setMessageType("error");
      setMessage(data.message ?? "Profile update failed");
      return;
    }

    setMessageType("success");
    setMessage("Profile updated");
  }

  return (
    <main className="narrow-page stack">
      <div className="header-actions">
        <h1>Onboarding</h1>
        <button
          className="secondary-button"
          type="button"
          onClick={() => router.push("/attendee/dashboard")}
        >
          Wallet
        </button>
      </div>

      {message ? <div className={`message ${messageType}`}>{message}</div> : null}

      <form className="card stack" onSubmit={saveProfile}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Date of birth
          <input type="date" value={dob} onChange={(event) => setDob(event.target.value)} />
        </label>
        <label>
          Gender
          <input value={gender} onChange={(event) => setGender(event.target.value)} />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save profile"}
        </button>
      </form>
    </main>
  );
}
