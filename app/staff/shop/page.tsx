/**
 * `/staff/shop` - Staff checkout (scan + charge).
 *
 * Staff build a basket from their shop menu, scan the attendee's
 * wristband (or type the code manually), confirm, and the wristband is
 * debited immediately via /api/staff/charge. There is no attendee
 * approval step in this flow; the attendee verifies the price by
 * watching the staff phone before scanning.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

type ChargeLineSummary = {
  itemName: string;
  quantity: number;
  lineTotalCredits: number;
};

type ChargeResult = {
  attendeeName: string;
  wristbandToken: string;
  newBalance: number;
  totalCredits: number;
  lines: ChargeLineSummary[];
};

type QuantityMap = Record<string, number>;

const SCANNER_ELEMENT_ID = "phu-staff-scanner";

export default function StaffShopPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [scanMode, setScanMode] = useState<"closed" | "camera" | "manual">("closed");
  const [manualToken, setManualToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);
  const [lastCharge, setLastCharge] = useState<ChargeResult | null>(null);

  const scanInFlightRef = useRef(false);
  const lastDecodedRef = useRef<string>("");

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

  const submitCharge = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setMessageType("error");
        setMessage("Wristband code is required.");
        return;
      }
      if (cartLines.length === 0) {
        setMessageType("error");
        setMessage("Add at least one item to the basket first.");
        return;
      }

      setCharging(true);
      setMessage(null);

      try {
        const response = await fetch("/api/staff/charge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            token: trimmed,
            lines: cartLines.map((line) => ({
              itemId: line.item.id,
              quantity: line.quantity
            }))
          })
        });

        if (response.status === 401 || response.status === 403) {
          router.push("/login");
          return;
        }

        const data = (await response.json()) as {
          success?: boolean;
          message?: string;
          charge?: ChargeResult;
        };

        if (!response.ok || !data.success || !data.charge) {
          setMessageType("error");
          setMessage(data.message ?? "Charge failed.");
          return;
        }

        setMessageType("success");
        setMessage(data.message ?? "Charge complete.");
        setLastCharge(data.charge);
        setQuantities({});
        setScanMode("closed");
        setManualToken("");
      } catch {
        setMessageType("error");
        setMessage("Network error. Please try again.");
      } finally {
        setCharging(false);
      }
    },
    [cartLines, router]
  );

  // Camera scanner lifecycle. html5-qrcode is loaded lazily so SSR is
  // never asked to evaluate the camera library.
  useEffect(() => {
    if (scanMode !== "camera") {
      return;
    }

    let cancelled = false;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    (async () => {
      try {
        const qrModule = await import("html5-qrcode");
        if (cancelled) {
          return;
        }
        const instance = new qrModule.Html5Qrcode(SCANNER_ELEMENT_ID);
        scanner = instance;

        await instance.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 240, height: 240 } },
          async (decodedText: string) => {
            if (scanInFlightRef.current) {
              return;
            }
            if (lastDecodedRef.current === decodedText) {
              return;
            }
            lastDecodedRef.current = decodedText;
            scanInFlightRef.current = true;

            try {
              await instance.stop();
              instance.clear();
            } catch {
              /* already stopped */
            }
            scanner = null;
            await submitCharge(decodedText);
            scanInFlightRef.current = false;
          },
          () => {
            /* ignore frame errors */
          }
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Camera unavailable.";
        setMessageType("error");
        setMessage(`Could not open camera (${detail}). Use manual entry instead.`);
        setScanMode("manual");
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => {});
      }
      scanInFlightRef.current = false;
    };
  }, [scanMode, submitCharge]);

  function setItemQuantity(itemId: string, quantity: number) {
    setLastCharge(null);
    setMessage(null);
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

  function clearBasket() {
    setQuantities({});
    setScanMode("closed");
    setManualToken("");
    setLastCharge(null);
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
            disabled={charging || cartLines.length === 0 || scanMode !== "closed"}
            onClick={() => {
              setMessage(null);
              lastDecodedRef.current = "";
              setScanMode("camera");
            }}
          >
            {charging ? "Charging..." : "Scan wristband to charge"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={charging || cartLines.length === 0 || scanMode !== "closed"}
            onClick={() => {
              setMessage(null);
              setManualToken("");
              setScanMode("manual");
            }}
          >
            Enter code manually
          </button>
        </div>
      </section>

      {scanMode === "camera" ? (
        <section className="card stack">
          <div className="header-actions">
            <h2>Scanning wristband</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setScanMode("closed")}
            >
              Cancel
            </button>
          </div>
          <p className="muted">Hold the wristband 15 cm from the camera.</p>
          <div id={SCANNER_ELEMENT_ID} className="scanner-viewport" />
        </section>
      ) : null}

      {scanMode === "manual" ? (
        <section className="card stack">
          <div className="header-actions">
            <h2>Enter wristband code</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setScanMode("closed")}
            >
              Cancel
            </button>
          </div>
          <label>
            Wristband code
            <input
              autoFocus
              inputMode="numeric"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              placeholder="e.g. 10000001"
            />
          </label>
          <button
            type="button"
            disabled={charging}
            onClick={() => void submitCharge(manualToken)}
          >
            {charging ? "Charging..." : `Charge ${cartTotal} credits`}
          </button>
        </section>
      ) : null}

      {lastCharge ? (
        <section className="card stack">
          <h2>Last charge</h2>
          <p>
            Charged <strong>{lastCharge.totalCredits} credits</strong> to{" "}
            <strong>{lastCharge.attendeeName}</strong> (wristband{" "}
            <strong>{lastCharge.wristbandToken}</strong>). New balance:{" "}
            <strong>{lastCharge.newBalance}</strong>.
          </p>
          {lastCharge.lines.map((line) => (
            <div className="purchase-line" key={`${line.itemName}-${line.quantity}`}>
              <span>
                {line.quantity} x {line.itemName}
              </span>
              <strong>{line.lineTotalCredits}</strong>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
