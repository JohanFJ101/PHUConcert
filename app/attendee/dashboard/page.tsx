/**
 * `/attendee/dashboard` - The attendee wallet.
 *
 * Three responsibilities:
 *   1. Show the active wristband (token + status + balance).
 *   2. Let the user top up by either a preset or a freely typed amount.
 *   3. Show transaction history.
 *
 * Data is fetched from `/api/attendee/wristbands` and
 * `/api/attendee/transactions` on mount, then re-fetched every 2 seconds
 * so that a charge taken on the staff phone appears here almost
 * immediately. There is no websocket; polling is good enough for an MVP
 * with low concurrency.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";

type Wristband = {
  id: string;
  qrToken: string;
  status: string;
  balanceCredits: number;
};

type Attendee = {
  name: string;
  email: string;
};

type Transaction = {
  id: string;
  wristbandToken: string;
  amountCredits: number;
  type: string;
  description: string | null;
  itemName: string | null;
  shopName: string | null;
  createdAt: string;
};

/** Quick-fill values for the top-up input; the user can also type anything. */
const TOPUP_PRESETS = [100, 250, 500];

export default function AttendeeDashboardPage() {
  const router = useRouter();
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [wristbands, setWristbands] = useState<Wristband[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState("100");
  const [topupLoading, setTopupLoading] = useState(false);

  // Attendees can have multiple wristbands in the schema, but the MVP UI
  // only renders the first one. Memoising keeps the value stable for the
  // top-up handler.
  const activeWristband = useMemo(() => wristbands[0] ?? null, [wristbands]);

  /**
   * Fetch wristbands and transactions in parallel and update local state.
   * Wrapped in `useCallback` because the polling effect uses it as a
   * dependency and we want a stable identity.
   *
   * On 401 we redirect to `/login`; on transport error we surface a
   * banner without wiping the existing data so a brief network blip does
   * not blank the screen.
   */
  const loadData = useCallback(async () => {
    try {
      const [wristbandResponse, transactionResponse] = await Promise.all([
        fetch("/api/attendee/wristbands", { cache: "no-store" }),
        fetch("/api/attendee/transactions", { cache: "no-store" })
      ]);

      if (wristbandResponse.status === 401 || transactionResponse.status === 401) {
        router.push("/login");
        return;
      }

      if (!wristbandResponse.ok || !transactionResponse.ok) {
        setMessageType("error");
        setMessage("Could not refresh wallet data");
        return;
      }

      const wristbandData = (await wristbandResponse.json()) as {
        attendee?: Attendee;
        wristbands: Wristband[];
      };
      const transactionData = (await transactionResponse.json()) as {
        transactions: Transaction[];
      };

      setAttendee(wristbandData.attendee ?? null);
      setWristbands(wristbandData.wristbands);
      setTransactions(transactionData.transactions);
    } catch {
      setMessageType("error");
      setMessage("Network error. Could not refresh wallet data.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Initial load + 2s polling. The interval is cleared on unmount so the
  // attendee navigating away doesn't keep hammering the API.
  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => {
      void loadData();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [loadData]);

  /**
   * Validate the top-up amount client-side and submit it. The server
   * re-validates everything, so this check is purely a UX nicety.
   */
  async function topUp() {
    if (!activeWristband) {
      setMessageType("error");
      setMessage("No wristband found");
      return;
    }

    const amountCredits = Number(topupAmount);
    if (!Number.isInteger(amountCredits) || amountCredits <= 0) {
      setMessageType("error");
      setMessage("Enter a whole number greater than 0");
      return;
    }

    setTopupLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/attendee/topup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          wristbandId: activeWristband.id,
          amountCredits
        })
      });
      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        setMessageType("error");
        setMessage(data.message ?? "Top-up failed");
        return;
      }

      setMessageType("success");
      setMessage(`Added ${amountCredits} credits`);
      // Reload immediately so the balance and history update without
      // waiting for the next poll tick.
      await loadData();
    } catch {
      setMessageType("error");
      setMessage("Network error. Please try again.");
    } finally {
      setTopupLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });
    router.push("/login");
  }

  return (
    <main className="page stack">
      <div className="header-actions">
        <div>
          <h1>Attendee Wallet</h1>
          <p className="muted">{attendee ? attendee.name : "Loading attendee..."}</p>
        </div>
        <button className="secondary-button" type="button" onClick={logout}>
          Logout
        </button>
      </div>

      {message ? <div className={`message ${messageType}`}>{message}</div> : null}

      {/* ── Wristband Pass ── */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p className="muted">Loading wristband...</p>
        </div>
      ) : activeWristband ? (
        <section style={{
          background: activeWristband.status === "ACTIVE"
            ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
            : "linear-gradient(135deg, #475569 0%, #64748b 100%)",
          color: "#fff",
          borderRadius: "16px",
          padding: "1.5rem",
          boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
          position: "relative",
          overflow: "hidden"
        }}>
          {/* decorative circles */}
          <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "140px", height: "140px", borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "-50px", left: "-30px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />

          {/* top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.85 }}>PHUConcert Pass</span>
            <span style={{
              fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
              background: activeWristband.status === "ACTIVE" ? "rgba(255,255,255,0.2)" : "rgba(239,68,68,0.25)",
              padding: "0.2rem 0.6rem", borderRadius: "999px"
            }}>● {activeWristband.status}</span>
          </div>

          {/* main content: QR left, info right */}
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <div style={{ background: "#fff", padding: "10px", borderRadius: "12px", flexShrink: 0, boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}>
              <QRCodeCanvas value={activeWristband.qrToken} size={120} includeMargin={false} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: 0 }}>
              <div>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, opacity: 0.7 }}>Token</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.04em" }}>{activeWristband.qrToken}</div>
              </div>
              <div style={{ display: "flex", gap: "1.5rem" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, opacity: 0.7 }}>Attendee</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{attendee?.name ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, opacity: 0.7 }}>Balance</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>{activeWristband.balanceCredits} <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>credits</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p className="muted">No wristband linked.</p>
        </div>
      )}

      {/* ── Top-up ── */}
      <section className="card stack">
        <h2>Top-up</h2>
        <div className="row" style={{ gap: "0.5rem" }}>
          {TOPUP_PRESETS.map((amount) => (
            <button
              className="secondary-button"
              key={amount}
              type="button"
              onClick={() => setTopupAmount(String(amount))}
              disabled={topupLoading}
              style={{ flex: 1 }}
            >
              {amount}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            Credits to add
            <input
              inputMode="numeric"
              min="1"
              step="1"
              type="number"
              value={topupAmount}
              onChange={(event) => setTopupAmount(event.target.value)}
              placeholder="Enter amount"
            />
          </label>
          <button type="button" onClick={() => void topUp()} disabled={topupLoading} style={{ whiteSpace: "nowrap" }}>
            {topupLoading ? "Adding..." : "Add credits"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Transaction History</h2>
        {transactions.length === 0 ? <p className="muted">No transactions yet.</p> : null}
        {transactions.map((transaction) => (
          <div className="transaction" key={transaction.id}>
            <div className="row">
              <strong>{transaction.type}</strong>
              <span>{transaction.amountCredits > 0 ? "+" : ""}{transaction.amountCredits} credits</span>
            </div>
            <div className="muted">
              {transaction.description ??
                [transaction.itemName, transaction.shopName].filter(Boolean).join(" - ")}
            </div>
            <small className="muted">
              {new Date(transaction.createdAt).toLocaleString()} · {transaction.wristbandToken}
            </small>
          </div>
        ))}
      </section>
    </main>
  );
}
