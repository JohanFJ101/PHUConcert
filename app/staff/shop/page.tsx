"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function StaffShopPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);

  const selectedItem = useMemo(
    () => shop?.items.find((item) => item.id === selectedItemId) ?? null,
    [shop, selectedItemId]
  );

  useEffect(() => {
    async function loadShop() {
      const response = await fetch("/api/staff/shop", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        router.push("/login");
        return;
      }

      const data = (await response.json()) as { shop?: Shop; message?: string };
      if (!response.ok || !data.shop) {
        setMessageType("error");
        setMessage(data.message ?? "Could not load shop");
        setLoading(false);
        return;
      }

      setShop(data.shop);
      setSelectedItemId(data.shop.items[0]?.id ?? "");
      setLoading(false);
    }

    void loadShop();
  }, [router]);

  async function charge() {
    if (!selectedItemId) {
      setMessageType("error");
      setMessage("Select an item");
      return;
    }

    setCharging(true);
    setMessage(null);

    const response = await fetch("/api/staff/charge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        qrToken,
        itemId: selectedItemId
      })
    });
    const data = (await response.json()) as {
      success?: boolean;
      message?: string;
      newBalance?: number;
    };

    setCharging(false);

    if (!response.ok || !data.success) {
      setMessageType("error");
      setMessage(data.message ?? "Charge failed");
      return;
    }

    setMessageType("success");
    setMessage(data.message ?? "Charge succeeded");
    setQrToken("");
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
          {shop?.items.map((item) => (
            <button
              className={`item-button ${item.id === selectedItemId ? "selected" : ""}`}
              key={item.id}
              type="button"
              onClick={() => setSelectedItemId(item.id)}
            >
              <strong>{item.name}</strong>
              <br />
              <span>
                {item.priceCredits} credits
                {item.ageRestricted ? " · 21+" : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="card stack">
          <h2>Charge</h2>
          {selectedItem ? (
            <p>
              Selected: <strong>{selectedItem.name}</strong> ({selectedItem.priceCredits} credits)
            </p>
          ) : (
            <p className="muted">Select an item to charge.</p>
          )}
          <label>
            Wristband QR token
            <input
              value={qrToken}
              onChange={(event) => setQrToken(event.target.value)}
              placeholder="wb_demo_001"
            />
          </label>
          <button type="button" onClick={() => void charge()} disabled={charging || !selectedItemId}>
            {charging ? "Charging..." : "Charge"}
          </button>
        </div>
      </section>
    </main>
  );
}
