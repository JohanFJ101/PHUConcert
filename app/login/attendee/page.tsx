/**
 * `/login/attendee` - Attendee sign-in via wristband QR.
 *
 * Flow:
 *   1. User taps "Scan wristband" -> camera opens (html5-qrcode).
 *   2. On a successful scan (or manual entry of the same token), POST
 *      /api/auth/attendee-scan resolves the wristband:
 *        - REGISTERED  -> session cookie set, redirect to dashboard.
 *        - NEEDS_REGISTRATION -> show the small registration form.
 *   3. Registration form POSTs to /api/auth/attendee-register which
 *      creates the user, links the wristband, and signs them in.
 *
 * The session cookie persists for 7 days, so a returning attendee will
 * skip both steps and go straight to the dashboard.
 */
"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type ScanResponse = {
  success?: boolean;
  status?: "REGISTERED" | "NEEDS_REGISTRATION";
  message?: string;
  token?: string;
};

type RegisterResponse = {
  success?: boolean;
  message?: string;
};

type Mode =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "manual" }
  | { kind: "register"; token: string }
  | { kind: "checking" };

const SCANNER_ELEMENT_ID = "phu-wristband-scanner";

export default function AttendeeLoginPage() {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [manualToken, setManualToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("error");
  const [formName, setFormName] = useState("");
  const [formDob, setFormDob] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scannerInstanceRef = useRef<unknown>(null);
  const scanInFlightRef = useRef(false);
  const lastScanValueRef = useRef<string>("");

  const resolveToken = useCallback(async (token: string) => {
    if (!token.trim()) {
      setMessageType("error");
      setMessage("Enter a wristband code or scan a QR.");
      return;
    }

    setMode({ kind: "checking" });
    setMessage(null);

    try {
      const response = await fetch("/api/auth/attendee-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });

      const data = (await response.json()) as ScanResponse;
      if (!response.ok || !data.success) {
        setMessageType("error");
        setMessage(data.message ?? "Could not resolve wristband.");
        setMode({ kind: "idle" });
        return;
      }

      if (data.status === "REGISTERED") {
        window.location.assign("/attendee/dashboard");
        return;
      }

      if (data.status === "NEEDS_REGISTRATION" && data.token) {
        setMode({ kind: "register", token: data.token });
        setMessageType("success");
        setMessage("New wristband detected. Please fill in your details to register.");
        return;
      }

      setMessageType("error");
      setMessage("Unexpected response. Try again.");
      setMode({ kind: "idle" });
    } catch {
      setMessageType("error");
      setMessage("Network error. Please try again.");
      setMode({ kind: "idle" });
    }
  }, []);

  // Start the html5-qrcode camera scanner when mode flips to "scanning".
  // The library is dynamically imported so it never runs during SSR.
  useEffect(() => {
    if (mode.kind !== "scanning") {
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: { stop: () => Promise<void>; clear: () => void; getState: () => number } | null = null;
    let started = false;

    (async () => {
      try {
        const qrModule = await import("html5-qrcode");
        if (cancelled) {
          return;
        }

        const HtmlQrCode = qrModule.Html5Qrcode;
        const instance = new HtmlQrCode(SCANNER_ELEMENT_ID);
        scanner = instance;
        scannerInstanceRef.current = instance;

        await instance.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: { width: 240, height: 240 }
          },
          async (decodedText: string) => {
            if (scanInFlightRef.current) {
              return;
            }
            if (lastScanValueRef.current === decodedText) {
              return;
            }
            lastScanValueRef.current = decodedText;
            scanInFlightRef.current = true;

            try {
              // getState(): 2 = SCANNING, 3 = PAUSED — only these are safe to stop
              const state = instance.getState();
              if (state === 2 || state === 3) {
                await instance.stop();
                instance.clear();
              }
            } catch {
              /* already stopped */
            }
            scannerInstanceRef.current = null;
            scanner = null;
            await resolveToken(decodedText);
            scanInFlightRef.current = false;
          },
          () => {
            /* ignore per-frame decoding errors */
          }
        );
        started = true;
      } catch (error) {
        if (cancelled) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Camera unavailable.";
        setMessageType("error");
        setMessage(`Could not open camera (${detail}). Use manual entry instead.`);
        setMode({ kind: "manual" });
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) {
        try {
          // Only attempt to stop if the scanner actually started
          const state = scanner.getState();
          if (state === 2 || state === 3) {
            scanner
              .stop()
              .then(() => scanner?.clear())
              .catch(() => {});
          } else if (started) {
            // Already stopped by decode callback, just clear
            try { scanner.clear(); } catch { /* ignore */ }
          }
        } catch {
          /* scanner not in a stoppable state */
        }
        scannerInstanceRef.current = null;
      }
      scanInFlightRef.current = false;
    };
  }, [mode, resolveToken]);

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await resolveToken(manualToken);
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode.kind !== "register") {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/attendee-register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: mode.token,
          fullName: formName,
          dob: formDob,
          email: formEmail,
          phone: formPhone
        })
      });

      const data = (await response.json()) as RegisterResponse;
      if (!response.ok || !data.success) {
        setMessageType("error");
        setMessage(data.message ?? "Could not register. Check your details.");
        return;
      }

      window.location.assign("/attendee/dashboard");
    } catch {
      setMessageType("error");
      setMessage("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function cancelToIdle() {
    setMessage(null);
    setManualToken("");
    setMode({ kind: "idle" });
  }

  const showScanner = mode.kind === "scanning";
  const showManual = mode.kind === "manual";
  const showRegister = mode.kind === "register";
  const showIdle = mode.kind === "idle" || mode.kind === "checking";

  return (
    <main className="role-page role-attendee">
      <div className="role-shell">
        <Link className="role-back" href="/login">
          &larr; Back
        </Link>

        {message ? <div className={`message ${messageType}`}>{message}</div> : null}

        {showIdle ? (
          <section className="role-card stack">
            <h2>Scan your wristband</h2>
            <p className="muted">
              Point your camera at the QR code on your wristband. First time? You will be
              asked for a few details so the wristband knows it&apos;s yours.
            </p>
            <button
              type="button"
              className="role-button"
              onClick={() => {
                setMessage(null);
                lastScanValueRef.current = "";
                setMode({ kind: "scanning" });
              }}
              disabled={mode.kind === "checking"}
            >
              {mode.kind === "checking" ? "Checking..." : "Open camera scanner"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setMessage(null);
                setManualToken("");
                setMode({ kind: "manual" });
              }}
              disabled={mode.kind === "checking"}
            >
              Enter code manually
            </button>
          </section>
        ) : null}

        {showScanner ? (
          <section className="role-card stack">
            <h2>Camera scanner</h2>
            <p className="muted">Hold the wristband steady about 15 cm from the camera.</p>
            <div id={SCANNER_ELEMENT_ID} className="scanner-viewport" />
            <button type="button" className="secondary-button" onClick={cancelToIdle}>
              Cancel
            </button>
          </section>
        ) : null}

        {showManual ? (
          <form className="role-card stack" onSubmit={submitManual}>
            <h2>Manual entry</h2>
            <p className="muted">Type the 8-digit code printed below the QR on your wristband.</p>
            <label>
              Wristband code
              <input
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="e.g. 10000001"
              />
            </label>
            <button type="submit" className="role-button">
              Continue
            </button>
            <button type="button" className="secondary-button" onClick={cancelToIdle}>
              Cancel
            </button>
          </form>
        ) : null}

        {showRegister ? (
          <form className="role-card stack" onSubmit={submitRegistration}>
            <h2>Welcome to PHUconcert</h2>
            <p className="muted">
              Wristband <strong>{mode.token}</strong>. Fill in your details and you&apos;re in.
            </p>
            <label>
              Full name
              <input
                required
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Jane Doe"
              />
            </label>
            <label>
              Date of birth
              <input
                required
                type="date"
                value={formDob}
                onChange={(event) => setFormDob(event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                required
                inputMode="email"
                type="email"
                value={formEmail}
                onChange={(event) => setFormEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Phone
              <input
                required
                inputMode="tel"
                type="tel"
                value={formPhone}
                onChange={(event) => setFormPhone(event.target.value)}
                placeholder="+91 98765 43210"
              />
            </label>
            <button type="submit" className="role-button" disabled={submitting}>
              {submitting ? "Saving..." : "Register and continue"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={cancelToIdle}
              disabled={submitting}
            >
              Cancel
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

