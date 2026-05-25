import { normalizeAttendeeEmail } from "@/lib/email";
import { validatePhone } from "@/lib/validation";

export type AttendeeImportRow = {
  rowNumber: number;
  fullName: string;
  dob: Date;
  email: string;
  phone: string;
  ticketId: string;
};

type FieldName = "fullName" | "dob" | "email" | "phone" | "ticketId";

const HEADER_ALIASES: Record<FieldName, Set<string>> = {
  fullName: new Set(["fullname", "name", "attendeename", "customername"]),
  dob: new Set(["dob", "dateofbirth", "birthdate"]),
  email: new Set([
    "email",
    "emailaddress",
    "registeredemail",
    "registrationemail",
    "emailusedforregistering",
    "emailusedforregistration"
  ]),
  phone: new Set([
    "phone",
    "phonenumber",
    "mobile",
    "mobilenumber",
    "contact",
    "contactnumber"
  ]),
  ticketId: new Set([
    "uniqueid",
    "uniqueidnumber",
    "ticketid",
    "ticketnumber",
    "bookingid",
    "bookmyshowid",
    "registrationid"
  ])
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

function isValidDateParts(year: number, month: number, day: number, value: Date) {
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function buildDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (!isValidDateParts(year, month, day, value)) {
    return null;
  }
  return value;
}

export function parseAttendeeDob(rawValue: string) {
  const value = rawValue.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (isoMatch) {
    return buildDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const separatedMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (!separatedMatch) {
    return null;
  }

  const first = Number(separatedMatch[1]);
  const second = Number(separatedMatch[2]);
  const year = Number(separatedMatch[3]);
  const day = first <= 12 && second > 12 ? second : first;
  const month = first <= 12 && second > 12 ? first : second;
  return buildDate(year, month, day);
}

export function parseAttendeeCsv(csvText: string) {
  const { records, errors } = parseCsvRecords(csvText);
  if (errors.length > 0) {
    return {
      attendees: [],
      errors
    };
  }

  if (records.length === 0) {
    return {
      attendees: [],
      errors: ["CSV is empty."]
    };
  }

  const [headers, ...rows] = records;
  const columnIndexes = {
    fullName: findColumn(headers, "fullName"),
    dob: findColumn(headers, "dob"),
    email: findColumn(headers, "email"),
    phone: findColumn(headers, "phone"),
    ticketId: findColumn(headers, "ticketId")
  };
  const missingColumns = (Object.entries(columnIndexes) as [FieldName, number][])
    .filter(([, index]) => index === -1)
    .map(([fieldName]) => fieldName);

  if (missingColumns.length > 0) {
    return {
      attendees: [],
      errors: [`Missing required column(s): ${missingColumns.join(", ")}.`]
    };
  }

  const attendeeRows: AttendeeImportRow[] = [];
  const rowErrors: string[] = [];
  const seenEmails = new Map<string, number>();
  const seenTicketIds = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((value) => value.trim().length === 0)) {
      return;
    }

    const fullName = row[columnIndexes.fullName]?.trim() ?? "";
    const dobValue = row[columnIndexes.dob]?.trim() ?? "";
    const email = normalizeAttendeeEmail(row[columnIndexes.email] ?? "");
    const phoneRaw = row[columnIndexes.phone]?.trim() ?? "";
    const ticketId = row[columnIndexes.ticketId]?.trim() ?? "";
    const dob = parseAttendeeDob(dobValue);
    const phoneCheck = validatePhone(phoneRaw);

    if (!fullName) {
      rowErrors.push(`Row ${rowNumber}: FULL NAME is required.`);
    }
    if (!dob) {
      rowErrors.push(`Row ${rowNumber}: dob must be YYYY-MM-DD or DD/MM/YYYY.`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push(`Row ${rowNumber}: email is invalid.`);
    }
    if (!phoneCheck.ok) {
      rowErrors.push(`Row ${rowNumber}: phone must be 10-15 digits.`);
    }
    if (!ticketId) {
      rowErrors.push(`Row ${rowNumber}: Unique id number is required.`);
    }

    const duplicateEmailRow = seenEmails.get(email);
    if (email && duplicateEmailRow) {
      rowErrors.push(
        `Row ${rowNumber}: duplicate email already appears on row ${duplicateEmailRow}.`
      );
    }
    const duplicateTicketRow = seenTicketIds.get(ticketId);
    if (ticketId && duplicateTicketRow) {
      rowErrors.push(
        `Row ${rowNumber}: duplicate Unique id number already appears on row ${duplicateTicketRow}.`
      );
    }

    if (email) {
      seenEmails.set(email, rowNumber);
    }
    if (ticketId) {
      seenTicketIds.set(ticketId, rowNumber);
    }

    if (
      fullName &&
      dob &&
      email &&
      phoneCheck.ok &&
      ticketId &&
      !duplicateEmailRow &&
      !duplicateTicketRow
    ) {
      attendeeRows.push({
        rowNumber,
        fullName,
        dob,
        email,
        phone: phoneCheck.value,
        ticketId
      });
    }
  });

  if (rowErrors.length > 0) {
    return {
      attendees: [],
      errors: rowErrors
    };
  }

  return {
    attendees: attendeeRows,
    errors: []
  };
}
