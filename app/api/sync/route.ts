import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { syncReceipts } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { syncOperationSchema } from "@/lib/sync-contract";
import { PATCH as updateClient, POST as createClient } from "@/app/api/clients/route";
import { POST as createCatalogItem } from "@/app/api/catalog/route";
import { PATCH as updateQuote, POST as createQuote } from "@/app/api/quotes/route";
import { PATCH as updateOrder } from "@/app/api/orders/route";
import { POST as updateExecution } from "@/app/api/order-execution/route";
import { POST as createMaterialRequest } from "@/app/api/material-requests/route";

import { POST as saveBundle } from "@/app/api/catalog-bundles/route";
import { POST as saveComparison } from "@/app/api/supplier-comparisons/route";

async function hashPayload(payload: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  let claimed: { id: string; owner: string } | null = null;
  try {
    const operation = syncOperationSchema.parse(await request.json());
    const session = await requirePermission(({
      "client.create": "clients.write",
      "client.update": "clients.write",
      "catalog.create": "catalog.write", "bundle.save": "catalog.write", "comparison.save": "purchases.manage",
      "quote.create": "quotes.write",
      "quote.update": "quotes.write",
      "order.update": "orders.write",
      "activity.create": "orders.execute",
      "activity.update": "orders.execute",
      "entry.create": "orders.execute",
      "material_request.create": "orders.execute",
    } as const)[operation.type]);
    const offlineUser = request.headers.get("X-Solis-Offline-User");
    if (offlineUser && offlineUser !== session.user.publicId) return Response.json({ error: "La sesión cambió. Ingrese con el usuario que creó los cambios offline." }, { status: 409 });
    const ownerEmail = session.ownerEmail;
    const db = getDb();
    const payloadHash = await hashPayload(operation.payload);
    const [receipt] = await db.select().from(syncReceipts).where(eq(syncReceipts.operationId, operation.id)).limit(1);
    if (receipt) {
      if (receipt.ownerEmail !== ownerEmail || receipt.operationType !== operation.type || receipt.payloadHash !== payloadHash) {
        return Response.json({ error: "El identificador de sincronización ya fue usado con otros datos." }, { status: 409 });
      }
      const saved = JSON.parse(receipt.resultJson);
      if (saved.__syncState === "processing") return Response.json({ error: "Este cambio está en proceso o requiere comprobar su resultado antes de repetirlo." }, { status: Date.now() - Date.parse(receipt.createdAt) < 30000 ? 503 : 409 });
      if (saved.__syncState === "rejected") return Response.json(saved.result, { status: saved.status });
      if (saved.__syncState === "uncertain") return Response.json({ error: "El resultado de este intento es incierto. Revise el registro antes de volver a crearlo." }, { status: 409 });
      return Response.json({ replayed: true, result: saved });
    }

    const reservation = await db.insert(syncReceipts).values({ operationId: operation.id, ownerEmail, operationType: operation.type, payloadHash, resultJson: JSON.stringify({ __syncState: "processing" }), createdAt: new Date().toISOString() }).onConflictDoNothing().returning();
    if (!reservation.length) return Response.json({ error: "Este cambio se está sincronizando en otro proceso." }, { status: 503 });
    claimed = { id: operation.id, owner: ownerEmail };
    const handler = ({
      "client.create": createClient,
      "client.update": updateClient,
      "catalog.create": createCatalogItem,
      "bundle.save": saveBundle,
      "comparison.save": saveComparison,
      "quote.create": createQuote,
      "quote.update": updateQuote,
      "order.update": updateOrder,
      "activity.create": updateExecution,
      "activity.update": updateExecution,
      "entry.create": updateExecution,
      "material_request.create": createMaterialRequest,
    } as const)[operation.type];
    const forwarded = new Request(request.url, {
      method: operation.type === "client.update" || operation.type === "order.update" || operation.type === "quote.update" ? "PATCH" : "POST",
      headers: request.headers,
      body: JSON.stringify(operation.payload),
    });
    const response = await handler(forwarded);
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      await db.update(syncReceipts).set({ resultJson: JSON.stringify({ __syncState: "rejected", status: response.status, result }) }).where(and(eq(syncReceipts.ownerEmail, ownerEmail), eq(syncReceipts.operationId, operation.id)));
      claimed = null;
      return Response.json(result, { status: response.status });
    }

    await db.update(syncReceipts).set({ resultJson: JSON.stringify(result) }).where(and(eq(syncReceipts.ownerEmail, ownerEmail), eq(syncReceipts.operationId, operation.id)));
    claimed = null;
    const [saved] = await db.select().from(syncReceipts).where(and(eq(syncReceipts.ownerEmail, ownerEmail), eq(syncReceipts.operationId, operation.id))).limit(1);
    if (!saved) throw new Error("No fue posible confirmar la sincronización.");
    return Response.json({ replayed: false, result });
  } catch (error) {
    if (claimed) {
      await getDb().update(syncReceipts).set({ resultJson: JSON.stringify({ __syncState: "uncertain" }) }).where(and(eq(syncReceipts.ownerEmail, claimed.owner), eq(syncReceipts.operationId, claimed.id))).catch(() => undefined);
      return Response.json({ error: "No fue posible confirmar el resultado. Revise el registro antes de crear otro intento." }, { status: 409 });
    }
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible sincronizar la operación." }, { status: 400 });
  }
}
