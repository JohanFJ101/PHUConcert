/**
 * `/admin/dashboard` - Operator overview.
 *
 * Single-page view that summarises the entire event:
 *   - Header tiles: counts of attendees, staff, admins, and transactions
 *     plus the credit totals (balance on wristbands, top-ups, spend).
 *   - Attendee table with linked wristbands.
 *   - Staff/admin table with shop assignment.
 *   - The latest 100 transactions, newest first.
 *
 * All numbers come from `/api/admin/overview` (one round-trip). The page
 * does not poll; a manual "Refresh" button is enough for the MVP.
 *
 * If the session is missing or has the wrong role, the API responds with
 * 401/403 and we route back to `/login/admin`.
 */
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
  ticketId: string | null;
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

// Shape returned by `/api/admin/overview`. Keep this in sync with the
// route handler.
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

type ImportResponse = {
  success?: boolean;
  message?: string;
  errors?: string[];
  imported?: number;
  attendeesCreated?: number;
  attendeesUpdated?: number;
  wristbandsCreated?: number;
  wristbandsUpdated?: number;
};

type AddAttendeeResponse = {
  success?: boolean;
  message?: string;
  attendee?: {
    id: string;
    name: string;
    email: string;
  };
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importMessageType, setImportMessageType] = useState<"success" | "error">("success");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [manualFullName, setManualFullName] = useState("");
  const [manualDob, setManualDob] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualTicketId, setManualTicketId] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [manualMessageType, setManualMessageType] = useState<"success" | "error">("success");

  /**
   * One-shot fetch that fills every section of the page. Wrapped in
   * `useCallback` so the "Refresh" button has a stable handler.
   */
  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as Overview & { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "Could not load admin data");
        return;
      }

      setOverview(data);
    } catch {
      setMessage("Network error. Could not load admin data.");
    } finally {
      setLoading(false);
    }
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

  async function importAttendees(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!importFile) {
      setImportMessageType("error");
      setImportMessage("Choose a CSV file first.");
      setImportErrors([]);
      return;
    }

    setImportLoading(true);
    setImportMessage(null);
    setImportErrors([]);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await fetch("/api/admin/attendees/import", {
        method: "POST",
        body: formData
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as ImportResponse;
      if (!response.ok || !data.success) {
        setImportMessageType("error");
        setImportMessage(data.message ?? "Attendee import failed.");
        setImportErrors(data.errors ?? []);
        return;
      }

      setImportMessageType("success");
      setImportMessage(
        `Imported ${data.imported ?? 0} attendees: ${data.attendeesCreated ?? 0} created, ${
          data.attendeesUpdated ?? 0
        } updated.`
      );
      setImportFile(null);
      form.reset();
      await loadOverview();
    } catch {
      setImportMessageType("error");
      setImportMessage("Network error. Could not import attendees.");
    } finally {
      setImportLoading(false);
    }
  }

  async function addManualAttendee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualLoading(true);
    setManualMessage(null);

    try {
      const response = await fetch("/api/admin/attendees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fullName: manualFullName,
          dob: manualDob,
          email: manualEmail,
          ticketId: manualTicketId
        })
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as AddAttendeeResponse;
      if (!response.ok || !data.success) {
        setManualMessageType("error");
        setManualMessage(data.message ?? "Could not add attendee.");
        return;
      }

      setManualMessageType("success");
      setManualMessage(`Added ${data.attendee?.name ?? "attendee"} with code ${manualTicketId}.`);
      setManualFullName("");
      setManualDob("");
      setManualEmail("");
      setManualTicketId("");
      await loadOverview();
    } catch {
      setManualMessageType("error");
      setManualMessage("Network error. Could not add attendee.");
    } finally {
      setManualLoading(false);
    }
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
            <h2>Import Attendees</h2>
            <form className="stack" onSubmit={importAttendees}>
              <label>
                BookMyShow CSV
                <input
                  accept=".csv,text/csv"
                  type="file"
                  onChange={(event) => setImportFile(event.currentTarget.files?.[0] ?? null)}
                />
              </label>
              <div className="row">
                <button type="submit" disabled={importLoading}>
                  {importLoading ? "Importing..." : "Import CSV"}
                </button>
                <span className="muted">FULL NAME, dob, email, Unique id number</span>
              </div>
            </form>
            {importMessage ? (
              <div className={`message ${importMessageType}`}>{importMessage}</div>
            ) : null}
            {importErrors.length > 0 ? (
              <ul className="error-list">
                {importErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="card stack">
            <h2>Add Attendee</h2>
            <form className="stack" onSubmit={addManualAttendee}>
              <div className="split">
                <label>
                  Full name
                  <input
                    value={manualFullName}
                    onChange={(event) => setManualFullName(event.target.value)}
                    placeholder="Full name"
                  />
                </label>
                <label>
                  DOB
                  <input
                    type="date"
                    value={manualDob}
                    onChange={(event) => setManualDob(event.target.value)}
                  />
                </label>
                <label>
                  Email used for registering
                  <input
                    autoComplete="email"
                    inputMode="email"
                    type="email"
                    value={manualEmail}
                    onChange={(event) => setManualEmail(event.target.value)}
                    placeholder="attendee@example.com"
                  />
                </label>
                <label>
                  Unique id number
                  <input
                    autoCapitalize="characters"
                    value={manualTicketId}
                    onChange={(event) => setManualTicketId(event.target.value)}
                    placeholder="BMS-001"
                  />
                </label>
              </div>
              <div className="row">
                <button type="submit" disabled={manualLoading}>
                  {manualLoading ? "Adding..." : "Add attendee"}
                </button>
                <span className="muted">Creates an active wristband using the same code.</span>
              </div>
            </form>
            {manualMessage ? (
              <div className={`message ${manualMessageType}`}>{manualMessage}</div>
            ) : null}
          </section>

          <section className="card stack">
            <h2>Attendees</h2>
            {overview.attendees.map((attendee) => (
              <div className="admin-row" key={attendee.id}>
                <div>
                  <strong>{attendee.name}</strong>
                  <div className="muted">{attendee.email}</div>
                  <div className="muted">
                    Ticket {attendee.ticketId ?? "No ticket id"} · DOB{" "}
                    {attendee.dob ? new Date(attendee.dob).toLocaleDateString() : "No DOB"}
                  </div>
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
