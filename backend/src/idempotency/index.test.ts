import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "../db/pool.js";
import { withIdempotency } from "./index.js";

let userId: number;

beforeAll(async () => {
  const result = await pool.query<{ id: number }>(`SELECT id FROM users WHERE username = 'ingredient-qa'`);
  userId = result.rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM idempotency_keys WHERE user_id = $1 AND idempotency_key LIKE 'test-%'`, [userId]);
  await pool.end();
});

describe("withIdempotency", () => {
  it("calls the handler once for a fresh key", async () => {
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } });
    const result = await withIdempotency(userId, "test-fresh-key", "/test", handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it("returns the cached result on a retry with the same key, without calling the handler again", async () => {
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { batchId: "SL-2026-999" } });
    const first = await withIdempotency(userId, "test-retry-key", "/test", handler);
    const second = await withIdempotency(userId, "test-retry-key", "/test", handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  it("calls the handler on every request when no key is provided", async () => {
    const handler = vi.fn().mockResolvedValue({ status: 200, body: {} });
    await withIdempotency(userId, undefined, "/test", handler);
    await withIdempotency(userId, undefined, "/test", handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  // Regression: every ingredient/production/verdict/export response carries
  // its record's reference-entry snapshot key, and those keys are built with
  // \u0000 separators (chaincode/refdata referenceEntryKey). While
  // response_body was JSONB, Postgres rejected the \u0000 escape on write
  // (SQLSTATE 22P05) and the failed write killed the process -- so this
  // exact payload shape must keep round-tripping through the cache.
  it("round-trips a response body containing NUL characters", async () => {
    const body = {
      recordId: "a7c5ac45",
      ingredientReferenceEntryId: "\u0000referenceEntry\u0000ingredient\u0000Aqua\u00002\u0000",
      ingredientReferenceVersion: "2",
    };
    const handler = vi.fn().mockResolvedValue({ status: 200, body });
    const first = await withIdempotency<Record<string, unknown>>(userId, "test-nul-key", "/test", handler);
    const second = await withIdempotency<Record<string, unknown>>(userId, "test-nul-key", "/test", handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(first.body).toEqual(body);
    expect(second.body).toEqual(body);
  });

  it("cleans up the placeholder on failure, so a retry with the same key can succeed", async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error("simulated ledger_unavailable"));
    await expect(withIdempotency(userId, "test-failure-key", "/test", failingHandler)).rejects.toThrow();

    const succeedingHandler = vi.fn().mockResolvedValue({ status: 200, body: { recovered: true } });
    const result = await withIdempotency(userId, "test-failure-key", "/test", succeedingHandler);
    expect(succeedingHandler).toHaveBeenCalledOnce();
    expect(result.body).toEqual({ recovered: true });
  });

  it("the exact race TRD §8 protects against: two genuinely concurrent requests with the same key result in exactly one handler call", async () => {
    let callCount = 0;
    const handler = vi.fn().mockImplementation(async () => {
      callCount += 1;
      // Hold the "in flight" window open long enough that both concurrent
      // calls are guaranteed to have already attempted their INSERT before
      // either finishes -- this is what makes the test actually exercise
      // the race, not just get lucky with ordering.
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { status: 200, body: { recordId: "only-once" } };
    });

    const [a, b] = await Promise.all([
      withIdempotency(userId, "test-concurrent-key", "/test", handler),
      withIdempotency(userId, "test-concurrent-key", "/test", handler),
    ]);

    expect(callCount).toBe(1);
    expect(a).toEqual(b);
    expect(a.body).toEqual({ recordId: "only-once" });
  });
});
