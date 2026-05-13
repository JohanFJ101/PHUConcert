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

      <section className="split">
        <div className="card stack">
          <h2>Wristband</h2>
          {loading ? <p className="muted">Loading...</p> : null}
          {activeWristband ? (
            <>
              <div>
                <div className="muted">Token</div>
                <strong>{activeWristband.qrToken}</strong>
              </div>
              <div>
                <div className="muted">Status</div>
                <strong>{activeWristband.status}</strong>
              </div>
              <div>
                <div className="muted">Balance</div>
                <div className="big-number">{activeWristband.balanceCredits}</div>
                <div className="muted">credits</div>
              </div>
            </>
          ) : (
            <p className="muted">No wristband linked.</p>
          )}
        </div>

        <div className="card stack">
          <h2>Top-up</h2>
          <div className="row">
            {TOPUP_PRESETS.map((amount) => (
              <button
                className="secondary-button"
                key={amount}
                type="button"
                onClick={() => setTopupAmount(String(amount))}
                disabled={topupLoading}
              >
                {amount}
              </button>
            ))}
          </div>
          <label>
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
          <button type="button" onClick={() => void topUp()} disabled={topupLoading}>
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
