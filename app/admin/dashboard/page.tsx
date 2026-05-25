/**
 * `/admin/dashboard` - Operator overview and management console.
 *
 * Refreshes itself every 5 seconds via /api/admin/overview. From this
 * page admins can:
 *   - Generate blank wristband QR codes in bulk (and download them as a
 *     ZIP of JPGs that can be printed and physically attached at the
 *     gate).
 *   - Add an attendee manually (name, DOB, email, phone) which creates a
 *     fully-registered user + active wristband in one step.
 *   - Bulk-import attendees from a CSV with full name, DOB, email,
 *     phone, and a unique id number.
 *   - Edit any attendee's profile.
 *   - Soft-disable a wristband so it cannot be scanned by attendees or
 *     charged by staff (re-enable any time).
 *   - Create and manage staff/shop accounts.
 */
"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";

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

type BlankWristband = {
  id: string;
  qrToken: string;
  status: string;
  balanceCredits: number;
  createdAt: string;
};

type MenuItem = {
  id: string;
  name: string;
  priceCredits: number;
  category: string;
  ageRestricted: boolean;
  active: boolean;
};

type StaffMember = {
  id: string;
  username: string;
  role: "STAFF";
  active: boolean;
  shop: {
    id: string;
    name: string;
    category: string;
    items: MenuItem[];
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
    transactions: number;
    blankWristbands: number;
    totalBalance: number;
    totalSpend: number;
    totalTopups: number;
  };
  attendees: Attendee[];
  staff: StaffMember[];
  blankWristbands: BlankWristband[];
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
    ticketId: string;
  };
};

type GenerateWristbandsResponse = {
  success?: boolean;
  message?: string;
  wristbands?: BlankWristband[];
};

type GeneratedCredential = {
  username: string;
  password: string;
};

type StaffResponse = {
  success?: boolean;
  message?: string;
  errors?: string[];
  staff?: StaffMember;
  credentials?: GeneratedCredential;
  generatedCredentials?: GeneratedCredential[];
  imported?: number;
  staffImported?: number;
  staffCreated?: number;
  staffUpdated?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
};

type DraftMenuItem = {
  clientId: string;
  id?: string;
  name: string;
  priceCredits: string;
  category: string;
  ageRestricted: boolean;
  active: boolean;
};

type StaffDraft = {
  username: string;
  shopName: string;
  shopCategory: string;
  items: DraftMenuItem[];
};

type AttendeeDraft = {
  name: string;
  dob: string;
  email: string;
  phone: string;
};

function createDraftMenuItem(category = ""): DraftMenuItem {
  const clientId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  return {
    clientId,
    name: "",
    priceCredits: "",
    category,
    ageRestricted: false,
    active: true
  };
}

function menuItemToDraft(item: MenuItem): DraftMenuItem {
  return {
    clientId: item.id,
    id: item.id,
    name: item.name,
    priceCredits: String(item.priceCredits),
    category: item.category,
    ageRestricted: item.ageRestricted,
    active: item.active
  };
}

function staffToDraft(staff: StaffMember): StaffDraft {
  return {
    username: staff.username,
    shopName: staff.shop?.name ?? "",
    shopCategory: staff.shop?.category ?? "",
    items: staff.shop?.items.map(menuItemToDraft) ?? []
  };
}

function attendeeToDraft(attendee: Attendee): AttendeeDraft {
  return {
    name: attendee.name,
    dob: attendee.dob ? attendee.dob.slice(0, 10) : "",
    email: attendee.email,
    phone: attendee.phone ?? ""
  };
}

function serializeDraftItems(items: DraftMenuItem[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    priceCredits: item.priceCredits.trim() ? Number(item.priceCredits) : Number.NaN,
    category: item.category,
    ageRestricted: item.ageRestricted,
    active: item.active
  }));
}

function responseMessage(data: { message?: string; errors?: string[] }, fallback: string) {
  if (data.errors && data.errors.length > 0) {
    return `${data.message ?? fallback} ${data.errors.slice(0, 3).join(" ")}`;
  }

  return data.message ?? fallback;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const loadingOverviewRef = useRef(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importMessageType, setImportMessageType] = useState<"success" | "error">("success");
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [manualFullName, setManualFullName] = useState("");
  const [manualDob, setManualDob] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [manualMessageType, setManualMessageType] = useState<"success" | "error">("success");

  const [generateCount, setGenerateCount] = useState("10");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [generateMessageType, setGenerateMessageType] = useState<"success" | "error">("success");
  const [generatedBatch, setGeneratedBatch] = useState<BlankWristband[]>([]);
  const [zipDownloading, setZipDownloading] = useState(false);
  const qrCanvasRefs = useRef(new Map<string, HTMLCanvasElement>());

  const [editingAttendeeId, setEditingAttendeeId] = useState<string | null>(null);
  const [attendeeDraft, setAttendeeDraft] = useState<AttendeeDraft | null>(null);
  const [attendeeSaving, setAttendeeSaving] = useState(false);
  const [attendeeEditMessage, setAttendeeEditMessage] = useState<string | null>(null);
  const [attendeeEditMessageType, setAttendeeEditMessageType] =
    useState<"success" | "error">("success");

  const [wristbandToggleId, setWristbandToggleId] = useState<string | null>(null);
  const [exportingQrs, setExportingQrs] = useState(false);


  const [newStaffShopName, setNewStaffShopName] = useState("");
  const [newStaffShopCategory, setNewStaffShopCategory] = useState("");
  const [newStaffItems, setNewStaffItems] = useState<DraftMenuItem[]>([]);
  const [staffImportFile, setStaffImportFile] = useState<File | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [staffMessageType, setStaffMessageType] = useState<"success" | "error">("success");
  const [staffCredentials, setStaffCredentials] = useState<GeneratedCredential[]>([]);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState<StaffDraft | null>(null);

  const loadOverview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (loadingOverviewRef.current) {
        return;
      }

      loadingOverviewRef.current = true;
      if (!options?.silent) {
        setLoading(true);
      }

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
        setMessage(null);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch {
        setMessage("Network error. Could not load admin data.");
      } finally {
        loadingOverviewRef.current = false;
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(() => {
      void loadOverview({ silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
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
          phone: manualPhone
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
      setManualMessage(
        `Added ${data.attendee?.name ?? "attendee"} with wristband code ${
          data.attendee?.ticketId ?? "unknown"
        }.`
      );
      setManualFullName("");
      setManualDob("");
      setManualEmail("");
      setManualPhone("");
      await loadOverview();
    } catch {
      setManualMessageType("error");
      setManualMessage("Network error. Could not add attendee.");
    } finally {
      setManualLoading(false);
    }
  }

  async function generateBlankWristbands(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(generateCount);
    if (!Number.isInteger(count) || count <= 0) {
      setGenerateMessageType("error");
      setGenerateMessage("Enter a positive whole number.");
      return;
    }

    setGenerateLoading(true);
    setGenerateMessage(null);

    try {
      const response = await fetch("/api/admin/wristbands/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ count })
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as GenerateWristbandsResponse;
      if (!response.ok || !data.success || !data.wristbands) {
        setGenerateMessageType("error");
        setGenerateMessage(data.message ?? "Could not generate wristbands.");
        return;
      }

      setGenerateMessageType("success");
      setGenerateMessage(`Generated ${data.wristbands.length} blank wristbands.`);
      setGeneratedBatch(data.wristbands);
      qrCanvasRefs.current = new Map();
      await loadOverview();
    } catch {
      setGenerateMessageType("error");
      setGenerateMessage("Network error. Could not generate wristbands.");
    } finally {
      setGenerateLoading(false);
    }
  }

  async function downloadBatchAsZip() {
    if (generatedBatch.length === 0) {
      return;
    }

    setZipDownloading(true);
    setGenerateMessage(null);

    try {
      const jsZipModule = await import("jszip");
      const ZipCtor = jsZipModule.default;
      const zip = new ZipCtor();

      for (const wristband of generatedBatch) {
        const canvas = qrCanvasRefs.current.get(wristband.qrToken);
        if (!canvas) {
          continue;
        }
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92)
        );
        if (!blob) {
          continue;
        }
        const arrayBuffer = await blob.arrayBuffer();
        zip.file(`${wristband.qrToken}.jpg`, arrayBuffer);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.download = `phuconcert-wristbands-${timestamp}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setGenerateMessageType("success");
      setGenerateMessage(`Downloaded ${generatedBatch.length} QR images as a ZIP.`);
    } catch {
      setGenerateMessageType("error");
      setGenerateMessage("Could not create ZIP. Please try again.");
    } finally {
      setZipDownloading(false);
    }
  }

  async function downloadAttendeeQrsAsZip() {
    if (!overview || overview.attendees.length === 0) {
      return;
    }

    setExportingQrs(true);

    try {
      const jsZipModule = await import("jszip");
      const ZipCtor = jsZipModule.default;
      const zip = new ZipCtor();

      let addedCount = 0;
      for (const attendee of overview.attendees) {
        for (const wristband of attendee.wristbands) {
          const canvas = qrCanvasRefs.current.get(wristband.qrToken);
          if (!canvas) {
            continue;
          }
          const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92)
          );
          if (!blob) {
            continue;
          }
          const arrayBuffer = await blob.arrayBuffer();
          const safeName = attendee.name.replace(/[^a-zA-Z0-9_ -]/g, "");
          zip.file(`${safeName}-${wristband.qrToken}.jpg`, arrayBuffer);
          addedCount++;
        }
      }

      if (addedCount === 0) {
        alert("No QR code elements were found to export. Make sure they are visible on the screen.");
        setExportingQrs(false);
        return;
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.download = `phuconcert-attendee-qrs-${timestamp}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Could not export ZIP. Please try again.");
    } finally {
      setExportingQrs(false);
    }
  }

  function startEditingAttendee(attendee: Attendee) {

    setEditingAttendeeId(attendee.id);
    setAttendeeDraft(attendeeToDraft(attendee));
    setAttendeeEditMessage(null);
  }

  function updateAttendeeDraft(patch: Partial<AttendeeDraft>) {
    setAttendeeDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveAttendeeEdit() {
    if (!editingAttendeeId || !attendeeDraft) {
      return;
    }

    setAttendeeSaving(true);
    setAttendeeEditMessage(null);

    try {
      const response = await fetch(`/api/admin/attendees/${editingAttendeeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fullName: attendeeDraft.name,
          dob: attendeeDraft.dob,
          email: attendeeDraft.email,
          phone: attendeeDraft.phone
        })
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !data.success) {
        setAttendeeEditMessageType("error");
        setAttendeeEditMessage(data.message ?? "Could not update attendee.");
        return;
      }

      setAttendeeEditMessageType("success");
      setAttendeeEditMessage("Attendee updated.");
      setEditingAttendeeId(null);
      setAttendeeDraft(null);
      await loadOverview();
    } catch {
      setAttendeeEditMessageType("error");
      setAttendeeEditMessage("Network error. Could not update attendee.");
    } finally {
      setAttendeeSaving(false);
    }
  }

  async function toggleWristbandStatus(wristband: { id: string; status: string }) {
    setWristbandToggleId(wristband.id);

    const nextStatus = wristband.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      const response = await fetch(`/api/admin/wristbands/${wristband.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: nextStatus })
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !data.success) {
        setMessage(data.message ?? "Could not update wristband.");
        return;
      }

      await loadOverview();
    } catch {
      setMessage("Network error. Could not update wristband.");
    } finally {
      setWristbandToggleId(null);
    }
  }

  function updateNewStaffItem(index: number, patch: Partial<DraftMenuItem>) {
    setNewStaffItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  }

  function removeNewStaffItem(index: number) {
    setNewStaffItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStaffLoading(true);
    setStaffMessage(null);
    setStaffCredentials([]);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          shopName: newStaffShopName,
          shopCategory: newStaffShopCategory,
          items: serializeDraftItems(newStaffItems)
        })
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as StaffResponse;
      if (!response.ok || !data.success || !data.credentials) {
        setStaffMessageType("error");
        setStaffMessage(responseMessage(data, "Could not create staff."));
        return;
      }

      setStaffMessageType("success");
      setStaffMessage(`Created ${data.credentials.username}. Save the generated password now.`);
      setStaffCredentials([data.credentials]);
      setNewStaffShopName("");
      setNewStaffShopCategory("");
      setNewStaffItems([]);
      await loadOverview();
    } catch {
      setStaffMessageType("error");
      setStaffMessage("Network error. Could not create staff.");
    } finally {
      setStaffLoading(false);
    }
  }

  async function importStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!staffImportFile) {
      setStaffMessageType("error");
      setStaffMessage("Choose a staff/menu CSV file first.");
      setStaffCredentials([]);
      return;
    }

    setStaffLoading(true);
    setStaffMessage(null);
    setStaffCredentials([]);

    const formData = new FormData();
    formData.append("file", staffImportFile);

    try {
      const response = await fetch("/api/admin/staff/import", {
        method: "POST",
        body: formData
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as StaffResponse;
      if (!response.ok || !data.success) {
        setStaffMessageType("error");
        setStaffMessage(responseMessage(data, "Staff import failed."));
        return;
      }

      setStaffMessageType("success");
      setStaffMessage(
        `Imported ${data.imported ?? 0} rows: ${data.staffCreated ?? 0} staff created, ${
          data.staffUpdated ?? 0
        } staff updated, ${data.itemsCreated ?? 0} items created, ${
          data.itemsUpdated ?? 0
        } items updated.`
      );
      setStaffCredentials(data.generatedCredentials ?? []);
      setStaffImportFile(null);
      form.reset();
      await loadOverview();
    } catch {
      setStaffMessageType("error");
      setStaffMessage("Network error. Could not import staff.");
    } finally {
      setStaffLoading(false);
    }
  }

  function startEditingStaff(staff: StaffMember) {
    setEditingStaffId(staff.id);
    setStaffDraft(staffToDraft(staff));
    setStaffMessage(null);
  }

  function updateStaffDraft(patch: Partial<StaffDraft>) {
    setStaffDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateStaffDraftItem(index: number, patch: Partial<DraftMenuItem>) {
    setStaffDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item
            )
          }
        : current
    );
  }

  function addStaffDraftItem() {
    setStaffDraft((current) =>
      current
        ? {
            ...current,
            items: [...current.items, createDraftMenuItem(current.shopCategory)]
          }
        : current
    );
  }

  function removeStaffDraftItem(index: number) {
    setStaffDraft((current) => {
      if (!current) {
        return current;
      }

      const item = current.items[index];
      if (!item) {
        return current;
      }

      if (!item.id) {
        return {
          ...current,
          items: current.items.filter((_, itemIndex) => itemIndex !== index)
        };
      }

      return {
        ...current,
        items: current.items.map((existingItem, itemIndex) =>
          itemIndex === index ? { ...existingItem, active: false } : existingItem
        )
      };
    });
  }

  async function saveStaffEdit() {
    if (!editingStaffId || !staffDraft) {
      return;
    }

    setStaffLoading(true);
    setStaffMessage(null);
    setStaffCredentials([]);

    try {
      const response = await fetch(`/api/admin/staff/${editingStaffId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: staffDraft.username,
          shopName: staffDraft.shopName,
          shopCategory: staffDraft.shopCategory,
          items: serializeDraftItems(staffDraft.items)
        })
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as StaffResponse;
      if (!response.ok || !data.success) {
        setStaffMessageType("error");
        setStaffMessage(responseMessage(data, "Could not save staff."));
        return;
      }

      setStaffMessageType("success");
      setStaffMessage("Staff updated.");
      setEditingStaffId(null);
      setStaffDraft(null);
      await loadOverview();
    } catch {
      setStaffMessageType("error");
      setStaffMessage("Network error. Could not save staff.");
    } finally {
      setStaffLoading(false);
    }
  }

  async function resetStaffPassword(staff: StaffMember) {
    setStaffLoading(true);
    setStaffMessage(null);
    setStaffCredentials([]);

    try {
      const response = await fetch(`/api/admin/staff/${staff.id}/reset-password`, {
        method: "POST"
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as StaffResponse;
      if (!response.ok || !data.success || !data.credentials) {
        setStaffMessageType("error");
        setStaffMessage(responseMessage(data, "Could not reset password."));
        return;
      }

      setStaffMessageType("success");
      setStaffMessage(`Reset password for ${data.credentials.username}.`);
      setStaffCredentials([data.credentials]);
    } catch {
      setStaffMessageType("error");
      setStaffMessage("Network error. Could not reset password.");
    } finally {
      setStaffLoading(false);
    }
  }

  async function deactivateStaff(staff: StaffMember) {
    if (!window.confirm(`Deactivate ${staff.username}?`)) {
      return;
    }

    setStaffLoading(true);
    setStaffMessage(null);
    setStaffCredentials([]);

    try {
      const response = await fetch(`/api/admin/staff/${staff.id}`, {
        method: "DELETE"
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/login/admin");
        return;
      }

      const data = (await response.json()) as StaffResponse;
      if (!response.ok || !data.success) {
        setStaffMessageType("error");
        setStaffMessage(responseMessage(data, "Could not deactivate staff."));
        return;
      }

      setStaffMessageType("success");
      setStaffMessage(`Deactivated ${staff.username}.`);
      if (editingStaffId === staff.id) {
        setEditingStaffId(null);
        setStaffDraft(null);
      }
      await loadOverview();
    } catch {
      setStaffMessageType("error");
      setStaffMessage("Network error. Could not deactivate staff.");
    } finally {
      setStaffLoading(false);
    }
  }

  function renderMenuDraftRow(
    item: DraftMenuItem,
    index: number,
    updateItem: (index: number, patch: Partial<DraftMenuItem>) => void,
    removeItem: (index: number) => void
  ) {
    return (
      <div className={`menu-edit-row ${item.active ? "" : "inactive-row"}`} key={item.clientId}>
        <label>
          Item
          <input
            value={item.name}
            onChange={(event) => updateItem(index, { name: event.target.value })}
            placeholder="Burger"
          />
        </label>
        <label>
          Credits
          <input
            inputMode="numeric"
            min="1"
            step="1"
            type="number"
            value={item.priceCredits}
            onChange={(event) => updateItem(index, { priceCredits: event.target.value })}
            placeholder="120"
          />
        </label>
        <label>
          Category
          <input
            value={item.category}
            onChange={(event) => updateItem(index, { category: event.target.value })}
            placeholder="FOOD"
          />
        </label>
        <label className="checkbox-label">
          <input
            checked={item.ageRestricted}
            type="checkbox"
            onChange={(event) => updateItem(index, { ageRestricted: event.target.checked })}
          />
          21+
        </label>
        <label className="checkbox-label">
          <input
            checked={item.active}
            type="checkbox"
            onChange={(event) => updateItem(index, { active: event.target.checked })}
          />
          Active
        </label>
        <button
          className="danger-button small-button"
          type="button"
          onClick={() => removeItem(index)}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <main className="page stack">
      <div className="header-actions">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="muted">
            Operator access to attendees, staff, wristbands and transactions. Auto-refreshes
            every 5 seconds.
            {lastUpdated ? ` Last updated ${lastUpdated}.` : ""}
          </p>
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
              <span className="muted">Blank wristbands</span>
              <strong className="big-number">{overview.totals.blankWristbands}</strong>
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
            <h2>Generate Blank Wristbands</h2>
            <p className="muted">
              Pre-creates wristband tokens without any attendee attached. Print the QR codes,
              attach them to physical wristbands, and the first attendee to scan one will be
              prompted to register.
            </p>
            <form className="row" onSubmit={generateBlankWristbands}>
              <label>
                Count
                <input
                  inputMode="numeric"
                  min="1"
                  max="200"
                  step="1"
                  type="number"
                  value={generateCount}
                  onChange={(event) => setGenerateCount(event.target.value)}
                />
              </label>
              <button type="submit" disabled={generateLoading}>
                {generateLoading ? "Generating..." : "Generate"}
              </button>
              {generatedBatch.length > 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void downloadBatchAsZip()}
                  disabled={zipDownloading}
                >
                  {zipDownloading ? "Building ZIP..." : "Download as ZIP"}
                </button>
              ) : null}
            </form>
            {generateMessage ? (
              <div className={`message ${generateMessageType}`}>{generateMessage}</div>
            ) : null}
            {generatedBatch.length > 0 ? (
              <div className="qr-grid">
                {generatedBatch.map((wristband) => (
                  <div className="qr-grid-item" key={wristband.id}>
                    <QRCodeCanvas
                      value={wristband.qrToken}
                      size={180}
                      includeMargin
                      ref={(canvas) => {
                        if (canvas) {
                          qrCanvasRefs.current.set(wristband.qrToken, canvas);
                        } else {
                          qrCanvasRefs.current.delete(wristband.qrToken);
                        }
                      }}
                    />
                    <code>{wristband.qrToken}</code>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card stack">
            <h2>Import Attendees</h2>
            <form className="stack" onSubmit={importAttendees}>
              <label>
                Attendee CSV
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
                <span className="muted">
                  Columns: FULL NAME, dob, email, phone, Unique id number
                </span>
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
                    placeholder="Jane Doe"
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
                  Email
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
                  Phone
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    type="tel"
                    value={manualPhone}
                    onChange={(event) => setManualPhone(event.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </label>
              </div>
              <div className="row">
                <button type="submit" disabled={manualLoading}>
                  {manualLoading ? "Adding..." : "Add attendee"}
                </button>
                <span className="muted">Generates an 8-digit code and active wristband.</span>
              </div>
            </form>
            {manualMessage ? (
              <div className={`message ${manualMessageType}`}>{manualMessage}</div>
            ) : null}
          </section>

          <section className="card stack">
            <h2>Staff Management</h2>
            <form className="stack" onSubmit={createStaff}>
              <div className="split">
                <label>
                  Shop name
                  <input
                    value={newStaffShopName}
                    onChange={(event) => setNewStaffShopName(event.target.value)}
                    placeholder="Food Counter"
                  />
                </label>
                <label>
                  Shop category
                  <input
                    autoCapitalize="characters"
                    value={newStaffShopCategory}
                    onChange={(event) => setNewStaffShopCategory(event.target.value)}
                    placeholder="FOOD"
                  />
                </label>
              </div>
              <div className="stack">
                <div className="header-actions">
                  <strong>Starting menu</strong>
                  <button
                    className="secondary-button small-button"
                    type="button"
                    onClick={() =>
                      setNewStaffItems((current) => [
                        ...current,
                        createDraftMenuItem(newStaffShopCategory)
                      ])
                    }
                  >
                    Add item
                  </button>
                </div>
                {newStaffItems.length === 0 ? (
                  <p className="muted">Create the staff account now or add menu items first.</p>
                ) : null}
                {newStaffItems.map((item, index) =>
                  renderMenuDraftRow(item, index, updateNewStaffItem, removeNewStaffItem)
                )}
              </div>
              <button type="submit" disabled={staffLoading}>
                {staffLoading ? "Working..." : "Create staff"}
              </button>
            </form>

            <form className="stack staff-import" onSubmit={importStaff}>
              <h3>Import Staff/Menu CSV</h3>
              <label>
                Staff CSV
                <input
                  accept=".csv,text/csv"
                  type="file"
                  onChange={(event) => setStaffImportFile(event.currentTarget.files?.[0] ?? null)}
                />
              </label>
              <div className="row">
                <button type="submit" disabled={staffLoading}>
                  {staffLoading ? "Importing..." : "Import staff CSV"}
                </button>
                <span className="muted">
                  staff username, shop name, shop category, item name, price credits
                </span>
              </div>
            </form>

            {staffMessage ? (
              <div className={`message ${staffMessageType}`}>{staffMessage}</div>
            ) : null}
            {staffCredentials.length > 0 ? (
              <div className="credential-list">
                {staffCredentials.map((credential) => (
                  <div
                    className="credential-row"
                    key={`${credential.username}-${credential.password}`}
                  >
                    <span>{credential.username}</span>
                    <strong>{credential.password}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {overview.staff.length === 0 ? <p className="muted">No active staff yet.</p> : null}
            {overview.staff.map((staff) => (
              <div className="staff-management-row" key={staff.id}>
                {editingStaffId === staff.id && staffDraft ? (
                  <div className="stack">
                    <div className="split">
                      <label>
                        Username
                        <input
                          value={staffDraft.username}
                          onChange={(event) => updateStaffDraft({ username: event.target.value })}
                        />
                      </label>
                      <label>
                        Shop name
                        <input
                          value={staffDraft.shopName}
                          onChange={(event) => updateStaffDraft({ shopName: event.target.value })}
                        />
                      </label>
                      <label>
                        Shop category
                        <input
                          value={staffDraft.shopCategory}
                          onChange={(event) =>
                            updateStaffDraft({ shopCategory: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="header-actions">
                      <strong>Menu</strong>
                      <button
                        className="secondary-button small-button"
                        type="button"
                        onClick={addStaffDraftItem}
                      >
                        Add item
                      </button>
                    </div>
                    {staffDraft.items.length === 0 ? (
                      <p className="muted">No menu items yet.</p>
                    ) : null}
                    {staffDraft.items.map((item, index) =>
                      renderMenuDraftRow(
                        item,
                        index,
                        updateStaffDraftItem,
                        removeStaffDraftItem
                      )
                    )}

                    <div className="row">
                      <button type="button" disabled={staffLoading} onClick={() => void saveStaffEdit()}>
                        Save staff
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setEditingStaffId(null);
                          setStaffDraft(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-row">
                    <div>
                      <strong>{staff.username}</strong>
                      <div className="muted">
                        {staff.shop ? `${staff.shop.name} · ${staff.shop.category}` : "No shop"}
                      </div>
                      <div className="muted">
                        {staff.shop?.items.filter((item) => item.active).length ?? 0} active menu
                        items
                      </div>
                    </div>
                    <div className="row staff-actions">
                      <button
                        className="secondary-button small-button"
                        type="button"
                        onClick={() => startEditingStaff(staff)}
                      >
                        Edit
                      </button>
                      <button
                        className="secondary-button small-button"
                        type="button"
                        disabled={staffLoading}
                        onClick={() => void resetStaffPassword(staff)}
                      >
                        Reset password
                      </button>
                      <button
                        className="danger-button small-button"
                        type="button"
                        disabled={staffLoading}
                        onClick={() => void deactivateStaff(staff)}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="card stack">
            <div className="split" style={{ alignItems: "center" }}>
              <h2>Attendees</h2>
              {overview.attendees.length > 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void downloadAttendeeQrsAsZip()}
                  disabled={exportingQrs}
                >
                  {exportingQrs ? "Exporting ZIP..." : "Export Attendee QRs as ZIP"}
                </button>
              ) : null}
            </div>
            {attendeeEditMessage ? (
              <div className={`message ${attendeeEditMessageType}`}>{attendeeEditMessage}</div>
            ) : null}

            {overview.attendees.length === 0 ? (
              <p className="muted">No registered attendees yet.</p>
            ) : null}
            {overview.attendees.map((attendee) => {
              const isEditing = editingAttendeeId === attendee.id && attendeeDraft;
              if (isEditing && attendeeDraft) {
                return (
                  <div className="attendee-row stack" key={attendee.id}>
                    <div className="split">
                      <label>
                        Full name
                        <input
                          value={attendeeDraft.name}
                          onChange={(event) => updateAttendeeDraft({ name: event.target.value })}
                        />
                      </label>
                      <label>
                        DOB
                        <input
                          type="date"
                          value={attendeeDraft.dob}
                          onChange={(event) => updateAttendeeDraft({ dob: event.target.value })}
                        />
                      </label>
                      <label>
                        Email
                        <input
                          type="email"
                          value={attendeeDraft.email}
                          onChange={(event) => updateAttendeeDraft({ email: event.target.value })}
                        />
                      </label>
                      <label>
                        Phone
                        <input
                          type="tel"
                          value={attendeeDraft.phone}
                          onChange={(event) => updateAttendeeDraft({ phone: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        disabled={attendeeSaving}
                        onClick={() => void saveAttendeeEdit()}
                      >
                        {attendeeSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingAttendeeId(null);
                          setAttendeeDraft(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div className="admin-row" key={attendee.id}>
                  <div>
                    <strong>{attendee.name}</strong>
                    <div className="muted">{attendee.email}</div>
                    <div className="muted">
                      Ticket {attendee.ticketId ?? "—"} · DOB{" "}
                      {attendee.dob ? new Date(attendee.dob).toLocaleDateString() : "—"}
                    </div>
                    <div className="muted">Phone {attendee.phone ?? "—"}</div>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      onClick={() => startEditingAttendee(attendee)}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="stack">
                    {attendee.wristbands.map((wristband) => (
                      <div key={wristband.id} className="row" style={{ gap: "1rem", alignItems: "center" }}>
                        <div style={{ background: "white", padding: "4px", borderRadius: "4px", display: "inline-flex" }}>
                          <QRCodeCanvas
                            value={wristband.qrToken}
                            size={64}
                            includeMargin={false}
                          />
                        </div>
                        <div>
                          <strong>{wristband.qrToken}</strong>
                          <div className="muted">
                            {wristband.status} · {wristband.balanceCredits} credits
                          </div>
                        </div>
                        <button
                          type="button"
                          className={
                            wristband.status === "ACTIVE"
                              ? "danger-button small-button"
                              : "secondary-button small-button"
                          }
                          disabled={wristbandToggleId === wristband.id}
                          onClick={() => void toggleWristbandStatus(wristband)}
                        >
                          {wristband.status === "ACTIVE" ? "Disable" : "Activate"}
                        </button>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })}
          </section>

          <section className="card stack">
            <h2>Blank Wristbands ({overview.blankWristbands.length})</h2>
            <p className="muted">
              Wristbands that have been generated but no attendee has scanned them yet.
            </p>
            {overview.blankWristbands.length === 0 ? (
              <p className="muted">No blank wristbands. Generate some above.</p>
            ) : null}
            {overview.blankWristbands.map((wristband) => (
              <div className="row" key={wristband.id}>
                <div>
                  <strong>{wristband.qrToken}</strong>
                  <div className="muted">
                    {wristband.status} · created {new Date(wristband.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className={
                    wristband.status === "ACTIVE"
                      ? "danger-button small-button"
                      : "secondary-button small-button"
                  }
                  disabled={wristbandToggleId === wristband.id}
                  onClick={() => void toggleWristbandStatus(wristband)}
                >
                  {wristband.status === "ACTIVE" ? "Disable" : "Activate"}
                </button>
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
