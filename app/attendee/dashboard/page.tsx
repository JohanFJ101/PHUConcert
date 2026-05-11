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

export default function AttendeeDashboardPage() {
  const router = useRouter();
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [wristbands, setWristbands] = useState<Wristband[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState<number | null>(null);

  const activeWristband = useMemo(() => wristbands[0] ?? null, [wristbands]);

  const loadData = useCallback(async () => {
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
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => {
      void loadData();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [loadData]);

  async function topUp(amountCredits: number) {
    if (!activeWristband) {
      setMessageType("error");
      setMessage("No wristband found");
      return;
    }

    setTopupLoading(amountCredits);
    setMessage(null);

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

    setTopupLoading(null);

    if (!response.ok || !data.success) {
      setMessageType("error");
      setMessage(data.message ?? "Top-up failed");
      return;
    }

    setMessageType("success");
    setMessage(`Added ${amountCredits} credits`);
    await loadData();
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
          <h2>Mock Top-up</h2>
          <div className="row">
            {[100, 250, 500].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => void topUp(amount)}
                disabled={topupLoading !== null}
              >
                {topupLoading === amount ? "Adding..." : `+${amount}`}
              </button>
            ))}
          </div>
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
