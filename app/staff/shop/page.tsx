/**
 * `/staff/shop` - Staff checkout builder.
 *
 * Staff no longer scan attendee wristbands. They build a basket from their
 * shop menu, generate a QR code, and wait for the attendee to scan the URL
 * and approve the purchase on their own phone.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

type Item = {
  id: string;
  name: string;
  priceCredits: number;
  category: string;
  ageRestricted: boolean;
};

type Shop = {
  id: string;
  name: string;
  category: string;
  items: Item[];
};

type IntentStatus = "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED";

type PurchaseIntentLine = {
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
  totalCredits: number;
  expiresAt: string;
  approvedAt?: string | null;
  declinedAt?: string | null;
  approvalPath: string;
  approvalUrl: string;
  approvedByName?: string | null;
  approvedByEmail?: string | null;
  wristbandToken?: string | null;
  lines: PurchaseIntentLine[];
};

type QuantityMap = Record<string, number>;

function formatStatus(status: IntentStatus) {
  if (status === "APPROVED") {
    return "Approved";
  }
  if (status === "DECLINED") {
    return "Declined";
  }
  if (status === "EXPIRED") {
    return "Expired";
  }
  return "Waiting for attendee";
}

export default function StaffShopPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [currentIntent, setCurrentIntent] = useState<PurchaseIntent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const cartLines = useMemo(() => {
    if (!shop) {
      return [];
    }

    return shop.items
      .map((item) => {
        const quantity = quantities[item.id] ?? 0;
        return {
          item,
          quantity,
          lineTotalCredits: item.priceCredits * quantity
        };
      })
      .filter((line) => line.quantity > 0);
  }, [shop, quantities]);

  const cartTotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.lineTotalCredits, 0),
    [cartLines]
  );

  useEffect(() => {
    async function loadShop() {
      try {
        const response = await fetch("/api/staff/shop", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) {
          router.push("/login");
          return;
        }

        const data = (await response.json()) as { shop?: Shop; message?: string };
        if (!response.ok || !data.shop) {
          setMessageType("error");
          setMessage(data.message ?? "Could not load shop");
          return;
        }

        setShop(data.shop);
      } catch {
        setMessageType("error");
        setMessage("Network error. Could not load shop.");
      } finally {
        setLoading(false);
      }
    }

    void loadShop();
  }, [router]);

  useEffect(() => {
    if (!currentIntent || currentIntent.status !== "PENDING") {
      return;
    }

    async function pollStatus() {
      try {
        const response = await fetch(`/api/staff/purchase-intents/${currentIntent?.token}`, {
          cache: "no-store"
        });
        if (response.status === 401 || response.status === 403) {
          router.push("/login");
          return;
        }

        const data = (await response.json()) as {
          purchaseIntent?: Omit<PurchaseIntent, "approvalPath" | "approvalUrl">;
          message?: string;
        };
        if (!response.ok || !data.purchaseIntent) {
          setMessageType("error");
          setMessage(data.message ?? "Could not refresh QR status.");
          return;
        }

        setCurrentIntent((existingIntent) =>
          existingIntent
            ? {
                ...existingIntent,
                ...data.purchaseIntent
              }
            : null
        );
      } catch {
        setMessageType("error");
        setMessage("Network error. Could not refresh QR status.");
      }
    }

    const interval = window.setInterval(() => {
      void pollStatus();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [currentIntent, router]);

  function setItemQuantity(itemId: string, quantity: number) {
    setCurrentIntent(null);
    setQuantities((current) => {
      const next = { ...current };
      if (!Number.isInteger(quantity) || quantity <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = quantity;
      }
      return next;
    });
  }

  async function createPurchaseIntent() {
    if (cartLines.length === 0) {
      setMessageType("error");
      setMessage("Add at least one item to the basket.");
      return;
    }

    setCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/staff/purchase-intents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lines: cartLines.map((line) => ({
            itemId: line.item.id,
            quantity: line.quantity
          }))
        })
      });
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        purchaseIntent?: PurchaseIntent;
      };

      if (!response.ok || !data.success || !data.purchaseIntent) {
        setMessageType("error");
        setMessage(data.message ?? "Could not generate purchase QR.");
        return;
      }

      setCurrentIntent(data.purchaseIntent);
      setMessageType("success");
      setMessage("Purchase QR ready for attendee approval.");
    } catch {
      setMessageType("error");
      setMessage("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function clearBasket() {
    setQuantities({});
    setCurrentIntent(null);
    setMessage(null);
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
          <h1>Staff Shop</h1>
          <p className="muted">
            {shop ? `${shop.name} · ${shop.category}` : loading ? "Loading shop..." : "No shop"}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={logout}>
          Logout
        </button>
      </div>

      {message ? <div className={`message ${messageType}`}>{message}</div> : null}

      <section className="split">
        <div className="card stack">
          <h2>Menu</h2>
          {shop?.items.length === 0 ? <p className="muted">No active menu items.</p> : null}
          {shop?.items.map((item) => {
            const quantity = quantities[item.id] ?? 0;
            return (
              <div className="menu-line" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <div className="muted">
                    {item.priceCredits} credits
                    {item.ageRestricted ? " · 21+" : ""}
                  </div>
                </div>
                <div className="quantity-control" aria-label={`${item.name} quantity`}>
                  <button
                    className="secondary-button icon-button"
                    type="button"
                    onClick={() => setItemQuantity(item.id, quantity - 1)}
                    disabled={quantity === 0}
                    aria-label={`Remove ${item.name}`}
                  >
                    -
                  </button>
                  <input
                    aria-label={`${item.name} quantity`}
                    inputMode="numeric"
                    min="0"
                    step="1"
                    type="number"
                    value={quantity || ""}
                    onChange={(event) => setItemQuantity(item.id, Number(event.target.value))}
                    placeholder="0"
                  />
                  <button
                    className="secondary-button icon-button"
                    type="button"
                    onClick={() => setItemQuantity(item.id, quantity + 1)}
                    aria-label={`Add ${item.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card stack">
          <div className="header-actions">
            <h2>Basket</h2>
            <button className="secondary-button" type="button" onClick={clearBasket}>
              Clear
            </button>
          </div>
          {cartLines.length === 0 ? <p className="muted">Add items from the menu.</p> : null}
          {cartLines.map((line) => (
            <div className="purchase-line" key={line.item.id}>
              <span>
                {line.quantity} x {line.item.name}
              </span>
              <strong>{line.lineTotalCredits}</strong>
            </div>
          ))}
          <div className="purchase-total">
            <span>Total</span>
            <strong>{cartTotal} credits</strong>
          </div>
          <button
            type="button"
            onClick={() => void createPurchaseIntent()}
            disabled={creating || cartLines.length === 0 || currentIntent?.status === "PENDING"}
          >
            {creating ? "Generating..." : "Generate approval QR"}
          </button>
        </div>
      </section>

      {currentIntent ? (
        <section className="card stack">
          <div className="header-actions">
            <div>
              <h2>Attendee Approval</h2>
              <p className="muted">
                {formatStatus(currentIntent.status)} · expires{" "}
                {new Date(currentIntent.expiresAt).toLocaleTimeString()}
              </p>
            </div>
            <strong>{currentIntent.totalCredits} credits</strong>
          </div>

          <div
            className={`message ${
              currentIntent.status === "DECLINED" || currentIntent.status === "EXPIRED"
                ? "error"
                : "success"
            }`}
          >
            {currentIntent.status === "PENDING"
              ? "Ask the attendee to scan this QR with their phone camera."
              : currentIntent.status === "APPROVED"
                ? `Approved${
                    currentIntent.approvedByName ? ` by ${currentIntent.approvedByName}` : ""
                  }.`
                : formatStatus(currentIntent.status)}
          </div>

          {currentIntent.status === "PENDING" ? (
            <div className="qr-layout">
              <div className="qr-box" aria-label="Purchase approval QR code">
                <QRCodeSVG value={currentIntent.approvalUrl} size={220} />
              </div>
              <div className="stack">
                <div>
                  <div className="muted">Approval URL</div>
                  <a href={currentIntent.approvalUrl}>{currentIntent.approvalUrl}</a>
                </div>
                <div>
                  <div className="muted">Basket</div>
                  {currentIntent.lines.map((line) => (
                    <div className="purchase-line" key={line.id}>
                      <span>
                        {line.quantity} x {line.itemName}
                        {line.ageRestricted ? " · 21+" : ""}
                      </span>
                      <strong>{line.lineTotalCredits}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {currentIntent.status !== "PENDING" ? (
            <button className="secondary-button" type="button" onClick={clearBasket}>
              Start next basket
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
