// Shared shape for every route that forwards to chaincode -- TRD §14's "one
// shared serialization utility, not scattered per-endpoint logic" applies
// equally to the audit-gating and error-translation mechanics here, not
// just RBAC. Every batch/refdata write route is built from this.
import type { Request, Response } from "express";
import { AuditUnavailableError, writeAuditLog, type AuditEventType } from "../audit/log.js";
import { ChaincodeCallError, connectAs, evaluate, submit, type ChaincodeName } from "../fabric/gateway.js";
import { withIdempotency } from "../idempotency/index.js";
import { serializeForRole, serializeListForRole } from "../rbac/serialize.js";

interface SubmitOptions {
  chaincode: ChaincodeName;
  fn: string;
  // Static args, or a function computing them inside the audited/idempotent
  // closure (after the 'attempted' audit row, before the chaincode call) --
  // the verdict route needs this: its args are a signed attestation built
  // from a prior chaincode read plus the engine, not client-supplied.
  args: string[] | (() => Promise<string[]>);
  auditEvent: AuditEventType;
  module: string;
  // Batch chaincode deliberately doesn't store a workflow status (batch.go:
  // "derived by the backend from the latest child record present for a
  // batch"). Only CreateBatch's response documents one
  // (docs/17_api_reference.md §4, "awaiting_ingredients") -- it's the one
  // case where the status is a fixed, unconditional fact about a
  // freshly-created batch, not a full-trail computation. No other route
  // sets this.
  status?: string;
}

// TRD §9: "a successful audit insert is a precondition for every covered
// ... state-changing request; if it cannot commit, the backend returns
// audit_unavailable and does not call chaincode." This writes the
// 'attempted' outcome (db/init/001_schema.sql's audit_outcome enum has
// three values -- this is the one route helpers like this exist to use;
// nothing before this needed it) *before* touching chaincode, gating the
// ledger write on audit availability, not just the response.
//
// After the call, a second row records the real outcome (allowed/denied).
// If that second write fails, the response is still audit_unavailable even
// though a successful ledger write can't be undone at that point -- a
// documented, accepted tension: TRD's wording is unconditional ("does not
// ... return protected data" on audit failure), and the alternative
// (silently returning an unaudited success) is worse than an honest
// audit_unavailable on a rare double-failure.
export async function handleChaincodeSubmit(req: Request, res: Response, opts: SubmitOptions): Promise<void> {
  const user = req.user!;
  const idempotencyKey = req.header("Idempotency-Key");
  const ipAddress = req.ip;

  try {
    const { status, body } = await withIdempotency<Record<string, unknown>>(user.userId, idempotencyKey, opts.module, async () => {
      await writeAuditLog({
        eventType: opts.auditEvent,
        outcome: "attempted",
        actor: user.fabricIdentity,
        module: opts.module,
        ipAddress,
      });

      let raw: Record<string, unknown>;
      let txId: string;
      try {
        const args = typeof opts.args === "function" ? await opts.args() : opts.args;
        const conn = await connectAs(user.fabricIdentity);
        try {
          const submitted = await submit(conn[opts.chaincode], opts.fn, ...args);
          raw = JSON.parse(Buffer.from(submitted.result).toString("utf8"));
          txId = submitted.txId;
        } finally {
          conn.close();
        }
      } catch (err) {
        if (err instanceof ChaincodeCallError) {
          await writeAuditLog({
            eventType: opts.auditEvent,
            outcome: "denied",
            actor: user.fabricIdentity,
            module: opts.module,
            ipAddress,
          });
          return { status: err.httpStatus, body: { reason: err.reason, message: err.message } };
        }
        throw err;
      }

      await writeAuditLog({
        eventType: opts.auditEvent,
        outcome: "allowed",
        actor: user.fabricIdentity,
        module: opts.module,
        ipAddress,
      });
      const serialized = await serializeForRole(raw, user.role);
      const body = { ...serialized, txId, ...(opts.status ? { status: opts.status } : {}) };
      return { status: 200, body };
    });

    res.status(status).json(body);
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    // Anything else -- an idempotency-store failure, a storage error, an
    // unexpected chaincode-shaped throw -- must not escape an async Express
    // 4 handler: Express 4 does not forward rejected promises to error
    // middleware, so an escaping throw becomes an unhandled rejection and
    // ends the whole process. Found live during P4 verification: a JSONB
    // idempotency column rejecting the reference-entry key's \u0000 escapes
    // killed the backend on the first ingredient submission that carried an
    // Idempotency-Key. The column is TEXT now, and this is the second line
    // of defence -- one failed request never takes the service down.
    console.error(`[${opts.module}] submit failed:`, err);
    res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
  }
}

interface EvaluateOptions {
  chaincode: ChaincodeName;
  fn: string;
  args: string[];
  auditEvent: AuditEventType;
  module: string;
}

// Read-side counterpart to handleChaincodeSubmit -- same fail-closed audit
// gating (TRD §9 explicitly covers "view", not just writes) and the same
// error translation, but no idempotency (nothing to deduplicate for a
// query) and no txId (evaluate() doesn't produce a ledger transaction).
export async function handleChaincodeEvaluate(req: Request, res: Response, opts: EvaluateOptions): Promise<void> {
  const user = req.user!;
  const ipAddress = req.ip;

  try {
    await writeAuditLog({
      eventType: opts.auditEvent,
      outcome: "attempted",
      actor: user.fabricIdentity,
      module: opts.module,
      ipAddress,
    });

    let raw: unknown;
    try {
      const conn = await connectAs(user.fabricIdentity);
      try {
        const resultBytes = await evaluate(conn[opts.chaincode], opts.fn, ...opts.args);
        raw = JSON.parse(Buffer.from(resultBytes).toString("utf8"));
      } finally {
        conn.close();
      }
    } catch (err) {
      if (err instanceof ChaincodeCallError) {
        await writeAuditLog({
          eventType: opts.auditEvent,
          outcome: "denied",
          actor: user.fabricIdentity,
          module: opts.module,
          ipAddress,
        });
        res.status(err.httpStatus).json({ reason: err.reason, message: err.message });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      eventType: opts.auditEvent,
      outcome: "allowed",
      actor: user.fabricIdentity,
      module: opts.module,
      ipAddress,
    });
    const serialized = Array.isArray(raw)
      ? await serializeListForRole(raw as Record<string, unknown>[], user.role)
      : await serializeForRole(raw as Record<string, unknown>, user.role);
    res.status(200).json(serialized);
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    console.error(`[${opts.module}] read failed:`, err);
    res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
  }
}
