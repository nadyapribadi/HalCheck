// TRD §8: "submission endpoints accept an optional client-generated
// idempotency key; a retried request with the same key returns the
// original result rather than creating a duplicate ledger entry." A naive
// check-then-insert has a real race: two copies of the same retried
// request arriving close together could both see "no existing key" and
// both call chaincode, creating exactly the duplicate this exists to
// prevent. This instead inserts a placeholder row first and uses the
// (user_id, idempotency_key) primary key itself as the race winner --
// whichever request's INSERT actually lands performs the operation; the
// loser polls briefly for that result instead of also calling chaincode.
import { pool } from "../db/pool.js";

const PLACEHOLDER_STATUS = 0;
const POLL_INTERVAL_MS = 200;
// Poll for as long as the longest a legitimate concurrent request could
// still be genuinely in flight -- SDK_TIMEOUT_MS is that ceiling (every
// Fabric Gateway call is wrapped with it, gateway.ts). Anything shorter
// risks falling through to a second real chaincode call while the first
// is still legitimately running, which is exactly the double-submission
// this mechanism exists to prevent.
const SDK_TIMEOUT_MS = Number(process.env.SDK_TIMEOUT_MS ?? 10000);
const MAX_POLL_ATTEMPTS = Math.ceil(SDK_TIMEOUT_MS / POLL_INTERVAL_MS);

export interface RouteResult<T> {
  status: number;
  body: T;
}

export async function withIdempotency<T>(
  userId: number,
  idempotencyKey: string | undefined,
  route: string,
  handler: () => Promise<RouteResult<T>>,
): Promise<RouteResult<T>> {
  if (!idempotencyKey) {
    return handler();
  }

  const inserted = await pool.query(
    `INSERT INTO idempotency_keys (user_id, idempotency_key, route, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING user_id`,
    [userId, idempotencyKey, route, PLACEHOLDER_STATUS, JSON.stringify({})],
  );

  if (inserted.rows.length > 0) {
    // We won the race for this key -- actually perform the operation.
    try {
      const result = await handler();
      await pool.query(
        `UPDATE idempotency_keys SET response_status = $3, response_body = $4
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey, result.status, JSON.stringify(result.body)],
      );
      return result;
    } catch (err) {
      // Don't leave a permanent placeholder on failure -- a transient
      // error (e.g. ledger_unavailable) must be retriable with the same
      // key, not wedged forever holding the slot.
      await pool.query(`DELETE FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2`, [
        userId,
        idempotencyKey,
      ]);
      throw err;
    }
  }

  // Someone else already holds this key -- poll for their result rather
  // than also calling chaincode ourselves.
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const existing = await pool.query(
      `SELECT response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    // response_body is TEXT, not JSONB (db/init/001_schema.sql) -- the
    // payloads it caches contain \u0000 separators from reference-entry
    // keys, which Postgres' JSON parser refuses to store. Parsed back here.
    const row = existing.rows[0] as { response_status: number; response_body: string } | undefined;
    if (!row) break; // the other attempt failed and cleaned up -- safe to try ourselves below
    if (row.response_status !== PLACEHOLDER_STATUS) {
      return { status: row.response_status, body: JSON.parse(row.response_body) as T };
    }
  }

  // Timed out waiting, or the other holder's placeholder was cleaned up --
  // perform the operation ourselves rather than blocking forever.
  return handler();
}
