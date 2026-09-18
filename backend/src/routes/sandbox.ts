// docs/17_api_reference.md §10, docs/11_screen_requirements.md §10.
//
// ADR-CT-034. Both modes used to return canned rejections -- this file's own
// comment admitted "no chaincode call, nothing to submit or evaluate" -- so
// the demonstration proved nothing about the ledger, left no audit row, and
// contradicted the charter's "Tamper-evidence claim genuinely true, not
// simulated" (the reason ADR-CT-000 exists at all). Every mode below now
// makes a real call against the deployed chaincode and reports the ledger's
// own answer:
//
//   Mode 1 (alter-attempt): submits a real update transaction to the deployed
//   contract. No update function exists, so the refusal comes from the
//   chaincode itself, verbatim. Alongside it, the record's actual stored
//   bytes (from GetBatchIntegrity) are altered by one byte and re-hashed, so
//   the mismatch the digest rule produces is shown, not asserted.
//
//   Mode 2 (unlisted-value-attempt): resolves the value through refdata on the
//   live ledger. Only when the ledger genuinely does not recognize it -- and
//   only when the caller is ingredient_qa and supplied a batch -- does it also
//   attempt a real submission, so what the user sees is the chaincode's own
//   rejection.
//
// Neither mode can write: the update target does not exist, and the
// submission path resolves ingredient and supplier before it writes anything
// (chaincode/batch.go recordIngredient's own order).
import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { AuditUnavailableError, writeAuditLog } from "../audit/log.js";
import { ChaincodeCallError, connectAs, evaluate, submit } from "../fabric/gateway.js";
import { requireAuth } from "../auth/middleware.js";

export const sandboxRoutes = Router();

sandboxRoutes.use(requireAuth);

// TRD §9's fail-closed audit gate applies here too: a deliberate attempt to
// break the record is exactly the event an operator needs to be able to find
// afterwards, so if the audit log is unavailable the attempt is not made and
// the caller is told why.
async function auditAttempt(
  req: Request,
  module: string,
  outcome: "attempted" | "allowed" | "denied",
): Promise<void> {
  await writeAuditLog({
    eventType: "sandbox_attempt",
    outcome,
    actor: req.user!.fabricIdentity,
    module,
    ipAddress: req.ip,
  });
}

function describe(err: unknown): string {
  if (err instanceof ChaincodeCallError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

// One byte is enough: it is the smallest alteration a person could make, and
// the point of the demonstration is that the recorded hash catches even that.
function flipOneByte(raw: Buffer): Buffer {
  const altered = Buffer.from(raw);
  const index = Math.max(0, altered.length - 1);
  altered[index] = altered[index]! ^ 0x01;
  return altered;
}

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

// Raw chaincode shapes, snake_case: this route calls the ledger directly
// rather than through helpers.ts, which is where the RBAC serializer would
// have camelCased them. Getting this wrong is exactly how the first live run
// reported a null tamper result -- the lookup silently found nothing.
interface IntegrityRecord {
  record_id: string;
  object_type: string;
  sha256: string;
  stored_bytes_base64: string;
}

interface BatchIntegrity {
  batch_id: string;
  records: IntegrityRecord[];
}

async function handleAlterAttempt(req: Request, res: Response): Promise<void> {
  const { recordId, attemptedChange, batchId } = req.body as {
    recordId?: string;
    attemptedChange?: unknown;
    batchId?: string;
  };
  if (!recordId || typeof recordId !== "string" || typeof attemptedChange !== "object" || attemptedChange === null) {
    res.status(400).json({ reason: "missing_field", message: "recordId and attemptedChange are required" });
    return;
  }

  const module = "sandbox.alter_attempt";
  try {
    await auditAttempt(req, module, "attempted");
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    throw err;
  }

  const conn = await connectAs(req.user!.fabricIdentity);
  let ledgerRefusal: { refused: boolean; message: string };
  let tamper: {
    recordId: string;
    ledgerSha256: string;
    alteredSha256: string;
    identical: boolean;
    note: string;
  } | null = null;
  // Never silent: if the arithmetic could not be run, the response says why,
  // so a missing comparison is never mistaken for a passing one.
  let tamperNote: string | null = null;

  try {
    // (a) The real attempt: ask the deployed contract to update an existing
    // record. There is no such function, so the ledger -- not this route --
    // produces the refusal.
    try {
      await submit(conn.batch, "UpdateIngredientRecord", batchId ?? "", recordId, JSON.stringify(attemptedChange));
      ledgerRefusal = {
        refused: false,
        message:
          "the deployed chaincode accepted an UpdateIngredientRecord call -- that is a defect worth investigating immediately",
      };
    } catch (err) {
      ledgerRefusal = { refused: true, message: describe(err) };
    }

    // (b) The arithmetic: take the record's real stored bytes and change one
    // byte. Nothing is written anywhere -- this is the digest rule being
    // exercised on real ledger data.
    if (batchId) {
      try {
        const integrityBytes = await evaluate(conn.batch, "GetBatchIntegrity", batchId);
        const integrity = JSON.parse(Buffer.from(integrityBytes).toString("utf8")) as BatchIntegrity;
        const record = integrity.records.find((candidate) => candidate.record_id === recordId);
        if (record) {
          const raw = Buffer.from(record.stored_bytes_base64, "base64");
          const alteredHash = sha256Hex(flipOneByte(raw));
          tamper = {
            recordId: record.record_id,
            ledgerSha256: record.sha256,
            alteredSha256: alteredHash,
            identical: alteredHash === record.sha256,
            note: "one byte of the record's stored bytes was altered locally; the recorded hash no longer matches",
          };
        } else {
          tamperNote = `batch ${batchId} carries no record ${recordId}, so there were no bytes to alter`;
        }
      } catch (err) {
        // A batch that cannot be read (unknown id) is reported by the ledger
        // refusal above; the arithmetic is then absent with a stated reason
        // rather than turned into a second, competing error.
        tamper = null;
        tamperNote = `the batch's stored bytes could not be read for the hash comparison: ${describe(err)}`;
      }
    } else {
      tamperNote = "no batchId was supplied, so there was nothing to hash against";
    }
  } finally {
    conn.close();
  }

  await auditAttempt(req, module, ledgerRefusal.refused ? "denied" : "allowed");
  res.json({
    mode: "alter_attempt",
    attemptedChange,
    ledgerRefusal,
    tamper,
    tamperNote,
    // Claimed only when both halves of the demonstration actually ran: the
    // ledger refused the write AND the altered bytes hashed differently. A
    // missing comparison is reported through tamperNote, never folded into a
    // passing answer.
    immutable: ledgerRefusal.refused && tamper !== null && !tamper.identical,
  });
}

async function handleUnlistedValueAttempt(req: Request, res: Response): Promise<void> {
  const { field, value, batchId } = req.body as { field?: string; value?: string; batchId?: string };
  if (!field || typeof field !== "string" || !value || typeof value !== "string") {
    res.status(400).json({ reason: "missing_field", message: "field and value are required" });
    return;
  }
  if (field !== "ingredient" && field !== "supplier") {
    res.status(400).json({ reason: "invalid_entry_type", message: "field must be ingredient or supplier" });
    return;
  }

  const module = "sandbox.unlisted_value_attempt";
  try {
    await auditAttempt(req, module, "attempted");
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    throw err;
  }

  const conn = await connectAs(req.user!.fabricIdentity);
  let resolution: { recognized: boolean; message: string };
  let submissionAttempt: { attempted: boolean; refused: boolean; message: string } | null = null;

  try {
    // (a) The live ledger's own answer about this value.
    try {
      await evaluate(conn.refdata, "ResolveActiveReference", field, value);
      resolution = {
        recognized: true,
        message: `the ledger recognizes "${value}" as a ${field} -- the sandbox only demonstrates unlisted values`,
      };
    } catch (err) {
      resolution = { recognized: false, message: describe(err) };
    }

    // (b) Only for a value the ledger really does not know, and only for the
    // role that may submit: let the chaincode refuse the submission itself.
    // A recognized value never reaches this branch, so the sandbox cannot
    // write a record even by accident.
    if (!resolution.recognized && field === "ingredient" && req.user!.role === "ingredient_qa" && batchId) {
      try {
        await submit(conn.batch, "SubmitIngredient", batchId, value, value, "false", "false", "", "");
        submissionAttempt = {
          attempted: true,
          refused: false,
          message: "the chaincode accepted a submission for an unlisted value -- that is a defect worth investigating",
        };
      } catch (err) {
        submissionAttempt = { attempted: true, refused: true, message: describe(err) };
      }
    }
  } finally {
    conn.close();
  }

  const rejected = !resolution.recognized && (submissionAttempt === null || submissionAttempt.refused);
  await auditAttempt(req, module, rejected ? "denied" : "allowed");
  res.json({
    mode: "unlisted_value_attempt",
    field,
    value,
    resolution,
    submissionAttempt,
    rejected,
  });
}

// Wrapped, not passed directly: an async Express 4 handler that throws is an
// unhandled rejection that ends the whole process (the P4 incident in
// helpers.ts), and a demonstration endpoint must never be able to do that.
sandboxRoutes.post("/integrity/alter-attempt", async (req, res) => {
  try {
    await handleAlterAttempt(req, res);
  } catch (err) {
    console.error("[sandbox.alter_attempt] failed:", err);
    res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
  }
});

sandboxRoutes.post("/integrity/unlisted-value-attempt", async (req, res) => {
  try {
    await handleUnlistedValueAttempt(req, res);
  } catch (err) {
    console.error("[sandbox.unlisted_value_attempt] failed:", err);
    res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
  }
});
