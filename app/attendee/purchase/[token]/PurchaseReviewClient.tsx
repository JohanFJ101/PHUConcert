/**
 * Client purchase approval UI. It loads the pending basket after login,
 * shows the attendee the full cost breakdown, and posts approve/decline
 * actions back to attendee-only API routes.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type IntentStatus = "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED";

type PurchaseLine = {
  id: string;
  itemName: string;
  unitPriceCredits: number;
  quantity: number;
  lineTotalCredits: number;
  ageRestricted: boolean;
};

type PurchaseIntent = {
  token: string;
  status: IntentStatus;
  shopName: string;
  shopCategory: string | null;
  totalCredits: number;
  expiresAt: string;
  approvedAt: string | null;
  declinedAt: string | null;
  lines: PurchaseLine[];
};

type Wristband = {
  id: string;
  qrToken: string;
  status: string;
  balanceCredits: number;
};

type PurchaseResponse = {
  purchaseIntent?: PurchaseIntent;
  wristband?: Wristband | null;
  balanceAfterCredits?: number | null;
  message?: string;
};

function statusText(status: IntentStatus) {
  if (status === "APPROVED") {
    return "Approved";
  }
  if (status === "DECLINED") {
    return "Declined";
  }
  if (status === "EXPIRED") {
    return "Expired";
  }
  return "Awaiting approval";
}

export default function PurchaseReviewClient({ token }: { token: string }) {
  const router = useRouter();
  const [purchaseIntent, setPurchaseIntent] = useState<PurchaseIntent | null>(null);
  const [wristband, setWristband] = useState<Wristband | null>(null);
  const [balanceAfterCredits, setBalanceAfterCredits] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"approve" | "decline" | null>(null);

  const purchasePath = useMemo(() => `/attendee/purchase/${token}`, [token]);
  const loginPath = useMemo(
    () => `/login/attendee?next=${encodeURIComponent(purchasePath)}`,
    [purchasePath]
  );

  const loadPurchase = useCallback(async () => {
    try {
      const response = await fetch(`/api/attendee/purchase-intents/${token}`, {
        cache: "no-store"
      });
      if (response.status === 401 || response.status === 403) {
        router.push(loginPath);
        return;
      }

      const data = (await response.json()) as PurchaseResponse;
      if (!response.ok || !data.purchaseIntent) {
        setMessageType("error");
        setMessage(data.message ?? "Could not load purchase.");
        return;
      }

      setPurchaseIntent(data.purchaseIntent);
      setWristband(data.wristband ?? null);
      setBalanceAfterCredits(data.balanceAfterCredits ?? null);
    } catch {
      setMessageType("error");
      setMessage("Network error. Could not load purchase.");
    } finally {
      setLoading(false);
    }
  }, [loginPath, router, token]);

  useEffect(() => {
    void loadPurchase();
  }, [loadPurchase]);

  async function submitAction(action: "approve" | "decline") {
    setActionLoading(action);
    setMessage(null);

    try {
      const response = await fetch(`/api/attendee/purchase-intents/${token}/${action}`, {
        method: "POST"
      });
      if (response.status === 401 || response.status === 403) {
        router.push(loginPath);
        return;
      }

      const data = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !data.success) {
        setMessageType("error");
        setMessage(data.message ?? `Could not ${action} purchase.`);
        await loadPurchase();
        return;
      }

      setMessageType("success");
      setMessage(data.message ?? (action === "approve" ? "Purchase approved." : "Purchase declined."));
      await loadPurchase();
    } catch {
      setMessageType("error");
      setMessage("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  const canAct =
    purchaseIntent?.status === "PENDING" &&
    Boolean(wristband) &&
    typeof balanceAfterCredits === "number" &&
    balanceAfterCredits >= 0;

  return (
    <main className="page stack">
      <div className="header-actions">
        <div>
          <h1>Approve Purchase</h1>
          <p className="muted">
            {purchaseIntent
              ? `${purchaseIntent.shopName}${
                  purchaseIntent.shopCategory ? ` · ${purchaseIntent.shopCategory}` : ""
                }`
              : loading
                ? "Loading purchase..."
                : "Purchase unavailable"}
          </p>
        </div>
        <Link className="secondary-link" href="/attendee/dashboard">
          Wallet
        </Link>
      </div>

      {message ? <div className={`message ${messageType}`}>{message}</div> : null}
      {loading ? <div className="card muted">Loading purchase...</div> : null}

      {purchaseIntent ? (
        <>
          <section className="card stack">
            <div className="header-actions">
              <div>
                <h2>{statusText(purchaseIntent.status)}</h2>
                <p className="muted">
                  Expires {new Date(purchaseIntent.expiresAt).toLocaleString()}
                </p>
              </div>
              <strong>{purchaseIntent.totalCredits} credits</strong>
            </div>

            {purchaseIntent.lines.map((line) => (
              <div className="purchase-line" key={line.id}>
                <div>
                  <strong>{line.itemName}</strong>
                  <div className="muted">
                    {line.quantity} x {line.unitPriceCredits} credits
                    {line.ageRestricted ? " · 21+" : ""}
                  </div>
                </div>
                <strong>{line.lineTotalCredits}</strong>
              </div>
            ))}

            <div className="purchase-total">
              <span>Total</span>
              <strong>{purchaseIntent.totalCredits} credits</strong>
            </div>
          </section>

          <section className="card stack">
            <h2>Wallet Impact</h2>
            {wristband ? (
              <>
                <div className="purchase-line">
                  <span>Wristband</span>
                  <strong>{wristband.qrToken}</strong>
                </div>
                <div className="purchase-line">
                  <span>Current balance</span>
                  <strong>{wristband.balanceCredits} credits</strong>
                </div>
                <div className="purchase-line">
                  <span>After approval</span>
                  <strong>{balanceAfterCredits} credits</strong>
                </div>
                {typeof balanceAfterCredits === "number" && balanceAfterCredits < 0 ? (
                  <div className="message error">Insufficient balance for this purchase.</div>
                ) : null}
              </>
            ) : (
              <div className="message error">No active wristband found for this attendee.</div>
            )}

            {purchaseIntent.status === "PENDING" ? (
              <div className="row">
                <button
                  type="button"
                  onClick={() => void submitAction("approve")}
                  disabled={!canAct || actionLoading !== null}
                >
                  {actionLoading === "approve" ? "Approving..." : "Approve purchase"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void submitAction("decline")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "decline" ? "Declining..." : "Decline"}
                </button>
              </div>
            ) : (
              <Link className="button-link" href="/attendee/dashboard">
                Return to wallet
              </Link>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
