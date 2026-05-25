/**
 * POST /api/staff/purchase-intents
 *
 * Creates a short-lived pending basket for the logged-in staff member's
 * shop. The response includes a URL for the attendee approval page; the
 * staff UI renders that URL as a QR code.
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getBrowserBaseUrl } from "@/lib/google-oauth";
import { jsonError, readJsonObject, requireStaffSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const PURCHASE_INTENT_TTL_MS = 5 * 60 * 1000;

function parseRequestedLines(body: Record<string, unknown> | null) {
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const quantitiesByItem = new Map<string, number>();

  for (const rawLine of rawLines) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      continue;
    }

    const line = rawLine as Record<string, unknown>;
    const itemId = typeof line.itemId === "string" ? line.itemId : "";
    const quantity = typeof line.quantity === "number" ? line.quantity : 0;
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    quantitiesByItem.set(itemId, (quantitiesByItem.get(itemId) ?? 0) + quantity);
  }

  return Array.from(quantitiesByItem, ([itemId, quantity]) => ({ itemId, quantity }));
}

function buildApprovalUrl(request: NextRequest, token: string) {
  const approvalPath = `/attendee/purchase/${token}`;
  const approvalUrl = new URL(approvalPath, getBrowserBaseUrl(request));

  return {
    approvalPath,
    approvalUrl: approvalUrl.toString()
  };
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireStaffSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const requestedLines = parseRequestedLines(body);
  if (requestedLines.length === 0) {
    return jsonError("Add at least one item to the basket.", 400);
  }

  try {
    const staff = await prisma.staff.findUnique({
      where: {
        id: session.staffId
      },
      select: {
        id: true,
        role: true,
        active: true,
        shopId: true,
        shop: {
          select: {
            id: true,
            name: true,
            category: true
          }
        }
      }
    });

    if (!staff || staff.role !== "STAFF" || !staff.active || !staff.shopId || !staff.shop) {
      return jsonError("Staff shop not found", 403);
    }

    const requestedItemIds = requestedLines.map((line) => line.itemId);
    const items = await prisma.item.findMany({
      where: {
        id: {
          in: requestedItemIds
        },
        shopId: staff.shopId,
        active: true
      },
      select: {
        id: true,
        name: true,
        priceCredits: true,
        ageRestricted: true
      }
    });

    if (items.length !== requestedLines.length) {
      return jsonError("One or more items are unavailable for this shop.", 400);
    }

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const lines = requestedLines.map((line) => {
      const item = itemsById.get(line.itemId);
      if (!item) {
        throw new Error("validated item missing");
      }

      const lineTotalCredits = item.priceCredits * line.quantity;
      return {
        itemId: item.id,
        itemName: item.name,
        unitPriceCredits: item.priceCredits,
        quantity: line.quantity,
        lineTotalCredits,
        ageRestricted: item.ageRestricted
      };
    });
    const totalCredits = lines.reduce((sum, line) => sum + line.lineTotalCredits, 0);
    if (totalCredits <= 0) {
      return jsonError("Basket total must be greater than 0.", 400);
    }

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + PURCHASE_INTENT_TTL_MS);
    const purchaseIntent = await prisma.purchaseIntent.create({
      data: {
        token,
        staffId: staff.id,
        shopId: staff.shopId,
        totalCredits,
        expiresAt,
        lines: {
          create: lines
        }
      },
      include: {
        lines: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    const { approvalPath, approvalUrl } = buildApprovalUrl(request, purchaseIntent.token);

    return NextResponse.json({
      success: true,
      purchaseIntent: {
        token: purchaseIntent.token,
        status: purchaseIntent.status,
        totalCredits: purchaseIntent.totalCredits,
        expiresAt: purchaseIntent.expiresAt,
        approvalPath,
        approvalUrl,
        shop: staff.shop,
        lines: purchaseIntent.lines.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          itemName: line.itemName,
          unitPriceCredits: line.unitPriceCredits,
          quantity: line.quantity,
          lineTotalCredits: line.lineTotalCredits,
          ageRestricted: line.ageRestricted
        }))
      }
    });
  } catch {
    return jsonError("Could not create purchase QR. Check database setup.", 500);
  }
}
