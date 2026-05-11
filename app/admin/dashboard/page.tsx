"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Wristband = {
  id: string;
  qrToken: string;
  status: string;
  balanceCredits: number;
};

type Attendee = {
  id: string;
  email: string;
  name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  wristbands: Wristband[];
};

type StaffMember = {
  id: string;
  username: string;
  role: "STAFF" | "ADMIN";
  shop: {
    name: string;
    category: string;
  } | null;
};

type Transaction = {
  id: string;
  amountCredits: number;
  type: string;
  description: string | null;
  createdAt: string;
  wristbandToken: string;
  attendeeName: string;
  attendeeEmail: string;
  staffUsername: string | null;
  staffRole: string | null;
  shopName: string | null;
  shopCategory: string | null;
  itemName: string | null;
};

type Overview = {
  totals: {
    attendees: number;
    staff: number;
    admins: number;
    transactions: number;
    totalBalance: number;
    totalSpend: number;
    totalTopups: number;
  };
  attendees: Attendee[];
  staff: StaffMember[];
  transactions: Transaction[];
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      router.push("/admin/login");
      return;
    }

    const data = (await response.json()) as Overview & { message?: string };
    if (!response.ok) {
      setMessage(data.message ?? "Could not load admin data");
      setLoading(false);
      return;
    }

    setOverview(data);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
          <h1>Admin Dashboard</h1>
          <p className="muted">Operator access to attendees, staff, and transactions.</p>
        </div>
        <div className="row">
          <button className="secondary-button" type="button" onClick={() => void loadOverview()}>
            Refresh
          </button>
          <button className="secondary-button" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {message ? <div className="message error">{message}</div> : null}
      {loading ? <div className="card muted">Loading admin data...</div> : null}

      {overview ? (
        <>
          <section className="split">
            <div className="card stack">
              <span className="muted">Attendees</span>
              <strong className="big-number">{overview.totals.attendees}</strong>
            </div>
            <div className="card stack">
              <span className="muted">Staff</span>
              <strong className="big-number">{overview.totals.staff}</strong>
            </div>
            <div className="card stack">
              <span className="muted">Admins</span>
              <strong className="big-number">{overview.totals.admins}</strong>
            </div>
            <div className="card stack">
              <span className="muted">Transactions</span>
              <strong className="big-number">{overview.totals.transactions}</strong>
            </div>
          </section>

          <section className="split">
            <div className="card stack">
              <span className="muted">Credits currently on wristbands</span>
              <strong>{overview.totals.totalBalance}</strong>
            </div>
            <div className="card stack">
              <span className="muted">Credits topped up</span>
              <strong>{overview.totals.totalTopups}</strong>
            </div>
            <div className="card stack">
              <span className="muted">Credits spent</span>
              <strong>{overview.totals.totalSpend}</strong>
            </div>
          </section>

          <section className="card stack">
            <h2>Attendees</h2>
            {overview.attendees.map((attendee) => (
              <div className="admin-row" key={attendee.id}>
                <div>
                  <strong>{attendee.name}</strong>
                  <div className="muted">{attendee.email}</div>
                  <div className="muted">
                    {attendee.phone ?? "No phone"} · {attendee.gender ?? "No gender"}
                  </div>
                </div>
                <div>
                  {attendee.wristbands.map((wristband) => (
                    <div key={wristband.id}>
                      <strong>{wristband.qrToken}</strong>
                      <div className="muted">
                        {wristband.status} · {wristband.balanceCredits} credits
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="card stack">
            <h2>Staff and Admins</h2>
            {overview.staff.map((staff) => (
              <div className="admin-row" key={staff.id}>
                <div>
                  <strong>{staff.username}</strong>
                  <div className="muted">{staff.role}</div>
                </div>
                <div className="muted">
                  {staff.shop ? `${staff.shop.name} · ${staff.shop.category}` : "No shop assigned"}
                </div>
              </div>
            ))}
          </section>

          <section className="card stack">
            <h2>Recent Transactions</h2>
            {overview.transactions.length === 0 ? (
              <p className="muted">No transactions yet.</p>
            ) : null}
            {overview.transactions.map((transaction) => (
              <div className="transaction" key={transaction.id}>
                <div className="row">
                  <strong>{transaction.type}</strong>
                  <span>
                    {transaction.amountCredits > 0 ? "+" : ""}
                    {transaction.amountCredits} credits
                  </span>
                </div>
                <div>
                  {transaction.description ??
                    [transaction.itemName, transaction.shopName].filter(Boolean).join(" - ")}
                </div>
                <small className="muted">
                  {new Date(transaction.createdAt).toLocaleString()} · {transaction.attendeeName} ·{" "}
                  {transaction.wristbandToken}
                  {transaction.staffUsername ? ` · ${transaction.staffUsername}` : ""}
                </small>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}
