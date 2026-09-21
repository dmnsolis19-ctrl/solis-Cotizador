import { env } from "cloudflare:workers";
import { businessYear } from "@/lib/dates";

/**
 * Reserves a monotonically increasing document sequence in one D1 statement.
 * `existingCount` is only a compatibility floor for installations that already
 * contain documents created before the sequence table was introduced.
 */
export async function reserveDocumentSequence(
  ownerEmail: string,
  scope: string,
  existingCount = 0,
) {
  const floor = Math.max(0, Math.trunc(existingCount)) + 1;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    INSERT INTO document_sequences (public_id, owner_email, scope, value, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_email, scope) DO UPDATE SET
      value = MAX(document_sequences.value + 1, excluded.value),
      updated_at = excluded.updated_at
    RETURNING value
  `)
    .bind(crypto.randomUUID(), ownerEmail, scope, floor, now)
    .first<{ value: number }>();

  const value = Number(row?.value);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("No fue posible reservar la numeración del documento.");
  }
  return value;
}

export function documentScope(kind: "quote" | "work_order" | "purchase" | "billing", date = new Date()) {
  return `${kind}:${businessYear(date)}`;
}
