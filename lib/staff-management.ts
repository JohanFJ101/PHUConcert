import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type FieldName =
  | "username"
  | "shopName"
  | "shopCategory"
  | "itemName"
  | "priceCredits"
  | "itemCategory"
  | "ageRestricted"
  | "active";

export type StaffMenuItemInput = {
  id?: string;
  name: string;
  priceCredits: number;
  category: string;
  ageRestricted: boolean;
  active: boolean;
};

export type StaffCsvItem = Omit<StaffMenuItemInput, "id"> & {
  rowNumber: number;
};

export type StaffCsvRecord = {
  username: string;
  shopName: string;
  shopCategory: string;
  items: StaffCsvItem[];
};

const STAFF_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const HEADER_ALIASES: Record<FieldName, Set<string>> = {
  username: new Set(["staffusername", "username", "staffuser", "stafflogin"]),
  shopName: new Set(["shopname", "countername", "stallname"]),
  shopCategory: new Set(["shopcategory", "countercategory", "stallcategory", "category"]),
  itemName: new Set(["itemname", "menuitem", "productname", "item"]),
  priceCredits: new Set(["pricecredits", "credits", "price", "itemprice"]),
  itemCategory: new Set(["itemcategory", "menucategory", "productcategory"]),
  ageRestricted: new Set(["agerestricted", "age21", "restricted", "twentyoneplus", "21plus"]),
  active: new Set(["active", "enabled", "available"])
};

function normalizeHeader(header: string) {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCsvRecords(csvText: string) {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRecord.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      currentRecord.push(currentValue.trim());
      if (currentRecord.some((value) => value.length > 0)) {
        records.push(currentRecord);
      }
      currentRecord = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (inQuotes) {
    return {
      records: [],
      errors: ["CSV has an unterminated quoted value."]
    };
  }

  currentRecord.push(currentValue.trim());
  if (currentRecord.some((value) => value.length > 0)) {
    records.push(currentRecord);
  }

  return {
    records,
    errors: []
  };
}

function findColumn(headers: string[], fieldName: FieldName) {
  const aliases = HEADER_ALIASES[fieldName];
  return headers.findIndex((header) => aliases.has(normalizeHeader(header)));
}

function parseBoolean(rawValue: string, defaultValue: boolean) {
  const value = rawValue.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  if (["true", "yes", "y", "1", "active", "enabled", "available"].includes(value)) {
    return true;
  }
  if (["false", "no", "n", "0", "inactive", "disabled", "unavailable"].includes(value)) {
    return false;
  }
  return null;
}

function parsePriceCredits(rawValue: string) {
  if (!/^\d+$/.test(rawValue.trim())) {
    return null;
  }

  const priceCredits = Number(rawValue);
  if (!Number.isSafeInteger(priceCredits) || priceCredits <= 0) {
    return null;
  }

  return priceCredits;
}

export function isValidStaffUsername(username: string) {
  return /^[a-zA-Z0-9_.-]{3,40}$/.test(username);
}

export function generateShortStaffPassword(length = 8) {
  const random = randomBytes(length);
  let password = "";

  for (const byte of random) {
    password += STAFF_PASSWORD_ALPHABET[byte % STAFF_PASSWORD_ALPHABET.length];
  }

  return password;
}

export async function hashStaffPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function buildStaffUsernameBase(shopName: string, shopCategory: string) {
  const source = shopName || shopCategory || "staff";
  const slug =
    source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 28) || "staff";

  return slug.endsWith("_staff") ? slug : `${slug}_staff`;
}

export async function generateUniqueStaffUsername(base: string) {
  const cleanBase = isValidStaffUsername(base) ? base : "staff";

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const username = suffix === 0 ? cleanBase : `${cleanBase}_${suffix + 1}`;
    const existing = await prisma.staff.findUnique({
      where: {
        username
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return username;
    }
  }

  throw new Error("Could not generate a unique staff username.");
}

export function parseMenuItemsFromJson(
  rawItems: unknown,
  defaultCategory: string
): { items: StaffMenuItemInput[]; errors: string[] } {
  const values = Array.isArray(rawItems) ? rawItems : [];
  const errors: string[] = [];
  const items: StaffMenuItemInput[] = [];

  values.forEach((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      errors.push(`Menu row ${index + 1}: item must be an object.`);
      return;
    }

    const item = rawItem as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const category =
      typeof item.category === "string" && item.category.trim()
        ? item.category.trim()
        : defaultCategory;
    const priceValue = item.priceCredits;
    const priceCredits =
      typeof priceValue === "number"
        ? priceValue
        : typeof priceValue === "string"
          ? Number(priceValue)
          : NaN;
    const active = typeof item.active === "boolean" ? item.active : true;
    const ageRestricted =
      typeof item.ageRestricted === "boolean" ? item.ageRestricted : false;

    if (!id && !name && !Number.isFinite(priceCredits)) {
      return;
    }

    if (!name) {
      errors.push(`Menu row ${index + 1}: item name is required.`);
    }
    if (!Number.isSafeInteger(priceCredits) || priceCredits <= 0) {
      errors.push(`Menu row ${index + 1}: price credits must be a positive whole number.`);
    }
    if (!category) {
      errors.push(`Menu row ${index + 1}: item category is required.`);
    }

    if (name && Number.isSafeInteger(priceCredits) && priceCredits > 0 && category) {
      items.push({
        id: id || undefined,
        name,
        priceCredits,
        category,
        ageRestricted,
        active
      });
    }
  });

  return {
    items,
    errors
  };
}

export function parseStaffCsv(csvText: string) {
  const { records, errors } = parseCsvRecords(csvText);
  if (errors.length > 0) {
    return {
      staff: [],
      rowCount: 0,
      errors
    };
  }

  if (records.length === 0) {
    return {
      staff: [],
      rowCount: 0,
      errors: ["CSV is empty."]
    };
  }

  const [headers, ...rows] = records;
  const columnIndexes = {
    username: findColumn(headers, "username"),
    shopName: findColumn(headers, "shopName"),
    shopCategory: findColumn(headers, "shopCategory"),
    itemName: findColumn(headers, "itemName"),
    priceCredits: findColumn(headers, "priceCredits"),
    itemCategory: findColumn(headers, "itemCategory"),
    ageRestricted: findColumn(headers, "ageRestricted"),
    active: findColumn(headers, "active")
  };
  const requiredColumns: FieldName[] = [
    "username",
    "shopName",
    "shopCategory",
    "itemName",
    "priceCredits"
  ];
  const missingColumns = requiredColumns
    .filter((fieldName) => columnIndexes[fieldName] === -1)
    .map((fieldName) => fieldName);

  if (missingColumns.length > 0) {
    return {
      staff: [],
      rowCount: 0,
      errors: [`Missing required column(s): ${missingColumns.join(", ")}.`]
    };
  }

  const rowErrors: string[] = [];
  const recordsByUsername = new Map<string, StaffCsvRecord>();
  const seenItemsByUsername = new Map<string, Map<string, number>>();
  let rowCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((value) => value.trim().length === 0)) {
      return;
    }

    rowCount += 1;
    const username = row[columnIndexes.username]?.trim() ?? "";
    const shopName = row[columnIndexes.shopName]?.trim() ?? "";
    const shopCategory = row[columnIndexes.shopCategory]?.trim() ?? "";
    const itemName = row[columnIndexes.itemName]?.trim() ?? "";
    const priceCredits = parsePriceCredits(row[columnIndexes.priceCredits] ?? "");
    const itemCategory =
      columnIndexes.itemCategory === -1
        ? shopCategory
        : row[columnIndexes.itemCategory]?.trim() || shopCategory;
    const ageRestricted =
      columnIndexes.ageRestricted === -1
        ? false
        : parseBoolean(row[columnIndexes.ageRestricted] ?? "", false);
    const active =
      columnIndexes.active === -1 ? true : parseBoolean(row[columnIndexes.active] ?? "", true);

    if (!username) {
      rowErrors.push(`Row ${rowNumber}: staff username is required.`);
    } else if (!isValidStaffUsername(username)) {
      rowErrors.push(
        `Row ${rowNumber}: staff username must be 3-40 letters, numbers, underscores, dashes, or periods.`
      );
    }
    if (!shopName) {
      rowErrors.push(`Row ${rowNumber}: shop name is required.`);
    }
    if (!shopCategory) {
      rowErrors.push(`Row ${rowNumber}: shop category is required.`);
    }
    if (!itemName) {
      rowErrors.push(`Row ${rowNumber}: item name is required.`);
    }
    if (!priceCredits) {
      rowErrors.push(`Row ${rowNumber}: price credits must be a positive whole number.`);
    }
    if (!itemCategory) {
      rowErrors.push(`Row ${rowNumber}: item category is required.`);
    }
    if (ageRestricted === null) {
      rowErrors.push(`Row ${rowNumber}: age restricted must be true/false or yes/no.`);
    }
    if (active === null) {
      rowErrors.push(`Row ${rowNumber}: active must be true/false or yes/no.`);
    }

    const existingRecord = username ? recordsByUsername.get(username) : null;
    if (existingRecord) {
      if (existingRecord.shopName !== shopName || existingRecord.shopCategory !== shopCategory) {
        rowErrors.push(
          `Row ${rowNumber}: ${username} has conflicting shop name or category in the CSV.`
        );
      }
    }

    const normalizedItemName = itemName.toLowerCase();
    const seenItems = seenItemsByUsername.get(username) ?? new Map<string, number>();
    const duplicateItemRow = seenItems.get(normalizedItemName);
    if (username && itemName && duplicateItemRow) {
      rowErrors.push(
        `Row ${rowNumber}: duplicate item for ${username} already appears on row ${duplicateItemRow}.`
      );
    }
    if (username && itemName) {
      seenItems.set(normalizedItemName, rowNumber);
      seenItemsByUsername.set(username, seenItems);
    }

    if (
      username &&
      isValidStaffUsername(username) &&
      shopName &&
      shopCategory &&
      itemName &&
      priceCredits &&
      itemCategory &&
      ageRestricted !== null &&
      active !== null &&
      !duplicateItemRow
    ) {
      const record =
        existingRecord ??
        ({
          username,
          shopName,
          shopCategory,
          items: []
        } satisfies StaffCsvRecord);

      record.items.push({
        rowNumber,
        name: itemName,
        priceCredits,
        category: itemCategory,
        ageRestricted,
        active
      });
      recordsByUsername.set(username, record);
    }
  });

  if (rowErrors.length > 0) {
    return {
      staff: [],
      rowCount,
      errors: rowErrors
    };
  }

  return {
    staff: Array.from(recordsByUsername.values()),
    rowCount,
    errors: []
  };
}
