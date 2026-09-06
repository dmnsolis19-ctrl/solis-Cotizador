import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { syncReceipts } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { syncOperationSchema } from "@/lib/sync-contract";
import { POST as createClient } from "@/app/api/clients/route";
import { POST as createCatalogItem } from "@/app/api/catalog/route";
import { POST as createQuote } from "@/app/api/quotes/route";
import { PATCH as updateOrder } from "@/app/api/orders/route";
import { POST as updateExecution } from "@/app/api/order-execution/route";
import { POST as createMaterialRequest } from "@/app/api/material-requests/route";

async function hashPayload(payload: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const operation = syncOperationSchema.parse(await request.json());
    const session = await requirePermission(({
      "client.create": "clients.write",
      "catalog.create": "catalog.write",
      "quote.create": "quotes.write",
      "order.update": "orders.write",
      "activity.create": "orders.execute",
      "activity.update": "orders.execute",
      "entry.create": "orders.execute",
      "material_request.create": "orders.execute",
    } as const)[operation.type]);
    const ownerEmail = session.ownerEmail;
    const db = getDb();
    const payloadHash = await hashPayload(operation.payload);
    const [receipt] = await db.select().from(syncReceipts).where(eq(syncReceipts.operationId, operation.id)).limit(1);
    if (receipt) {
      if (receipt.ownerEmail !== ownerEmail || receipt.operationType !== operation.type || receipt.payloadHash !== payloadHash) {
        return Response.json({ error: "El identificador de sincronización ya fue usado con otros datos." }, { status: 409 });
      }
      return Response.json({ replayed: true, result: JSON.parse(receipt.resultJson) });
    }

    const handler = ({
      "client.create": createClient,
      "catalog.create": createCatalogItem,
      "quote.create": createQuote,
      "order.update": updateOrder,
      "activity.create": updateExecution,
      "activity.update": updateExecution,
      "entry.create": updateExecution,
      "material_request.create": createMaterialRequest,
    } as const)[operation.type];
    const forwarded = new Request(request.url, {
      method: operation.type === "order.update" ? "PATCH" : "POST",
      headers: request.headers,
      body: JSON.stringify(operation.payload),
    });
    const response = await handler(forwarded);
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) return Response.json(result, { status: response.status });

    await db.insert(syncReceipts).values({
      operationId: operation.id, ownerEmail, operationType: operation.type,
      payloadHash, resultJson: JSON.stringify(result), createdAt: new Date().toISOString(),
    }).onConflictDoNothing();
    const [saved] = await db.select().from(syncReceipts).where(and(eq(syncReceipts.ownerEmail, ownerEmail), eq(syncReceipts.operationId, operation.id))).limit(1);
    if (!saved) throw new Error("No fue posible confirmar la sincronización.");
    return Response.json({ replayed: false, result });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible sincronizar la operación." }, { status: 400 });
  }
}
