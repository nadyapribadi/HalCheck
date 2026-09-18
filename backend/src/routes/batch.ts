// docs/17_api_reference.md §3-8.
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AuditUnavailableError, writeAuditLog } from "../audit/log.js";
import { ChaincodeCallError, connectAs, evaluate, submit } from "../fabric/gateway.js";
import { withIdempotency } from "../idempotency/index.js";
import { serializeForRole } from "../rbac/serialize.js";
import { UnsupportedCoaFileError, readCoaByHash, storeCoaFile } from "../storage/coa.js";
import { HashMismatchError, ObjectNotFoundError, ALLOWED_EVIDENCE_EXTENSIONS } from "../storage/minio.js";
import { parseIngredientCSV } from "../util/csv.js";
import { AttestationBuildError, buildAttestation, type RawBatchTrail } from "../verdict/build.js";
import { buildProofBundle, type RawBatchIntegrity, type RawBatchTrailForBundle } from "../verdict/proofBundle.js";
import { signAttestation } from "../verdict/sign.js";
import { handleChaincodeEvaluate, handleChaincodeSubmit } from "./helpers.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

export const batchRoutes = Router();

batchRoutes.use(requireAuth);

// docs/17 §3/§9 (list). No requireRole: any operational role may see what
// batches exist (chaincode.ListBatches has no role restriction, matching
// GetBatchTrail, TRD §23.4).
batchRoutes.get("/", async (req, res) => {
  await handleChaincodeEvaluate(req, res, {
    chaincode: "batch",
    fn: "ListBatches",
    args: [],
    auditEvent: "view",
    module: "batch.list",
  });
});

// docs/17 §9. No requireRole: any operational role may read a batch's own
// trail (chaincode.GetBatchTrail has no role restriction, TRD §23.4).
batchRoutes.get("/:batchId/trail", async (req, res) => {
  await handleChaincodeEvaluate(req, res, {
    chaincode: "batch",
    fn: "GetBatchTrail",
    args: [req.params.batchId as string],
    auditEvent: "view",
    module: "batch.trail",
  });
});

// docs/17 §7. The endpoint accepts no client-supplied verdict fields
// ({} body) -- everything comes from re-reading the batch's own current
// trail, running it through the Core Screening App engine, and signing the
// result. That read+build+sign happens inside handleChaincodeSubmit's
// audited/idempotent closure (args as a function, not a static list) so a
// failure here is denied-audited exactly like a chaincode rejection would
// be, and a retried Idempotency-Key doesn't re-run the engine.
batchRoutes.post("/:batchId/verdict", requireRole("compliance_officer"), async (req, res) => {
  const batchId = req.params.batchId as string;

  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "RecordVerdict",
    args: async () => {
      const conn = await connectAs(req.user!.fabricIdentity);
      let trailBytes: Uint8Array;
      try {
        trailBytes = await evaluate(conn.batch, "GetBatchTrail", batchId);
      } finally {
        conn.close();
      }
      const trail = JSON.parse(Buffer.from(trailBytes).toString("utf8")) as RawBatchTrail;

      let attestation;
      try {
        attestation = buildAttestation(trail);
      } catch (err) {
        if (err instanceof AttestationBuildError) {
          throw new ChaincodeCallError(err.message, "engine_dataset_mismatch", 500);
        }
        throw err;
      }

      const attestationJSON = JSON.stringify(attestation);
      return [attestationJSON, signAttestation(attestationJSON)];
    },
    auditEvent: "verdict_record",
    module: "batch.verdict",
  });
});

// docs/17 §13. Placeholder: no LLM provider/key chosen yet, so this always
// returns the documented "unavailable" shape rather than answering --
// never a fabricated answer. Reachable and audited now so the frontend has
// a stable contract to build against; swap the body of the try block for a
// real provider call when one is chosen, no route/shape change needed.
batchRoutes.post("/:batchId/explain", async (req, res) => {
  const { question } = req.body as { question?: string };
  if (!question || typeof question !== "string") {
    res.status(400).json({ reason: "missing_field", message: "question is required" });
    return;
  }

  try {
    await writeAuditLog({
      eventType: "ai_explanation_request",
      outcome: "denied",
      actor: req.user!.fabricIdentity,
      module: "batch.explain",
      ipAddress: req.ip,
    });
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    throw err;
  }

  res.status(503).json({ status: "unavailable", message: "Explanation service is temporarily unavailable." });
});

batchRoutes.post("/", requireRole("ingredient_qa"), async (req, res) => {
  const { intendedMarket } = req.body as { intendedMarket?: string };
  if (!intendedMarket || typeof intendedMarket !== "string") {
    res.status(400).json({ reason: "missing_field", message: "intendedMarket is required" });
    return;
  }

  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "CreateBatch",
    args: [intendedMarket],
    auditEvent: "batch_create",
    module: "batch.create",
    status: "awaiting_ingredients",
  });
});

interface IngredientBody {
  name?: string;
  source?: string;
  halalRiskFlag?: boolean;
  overrideReason?: string | null;
}

// multipart/form-data delivers every field as a string, JSON delivers real
// booleans -- normalize before the same validation runs over both, so an
// upload can't smuggle in a value the JSON path would have rejected.
//
// A `coaFileHash` in the body is dropped, deliberately and structurally: it
// is not a field of IngredientBody, and the hash handed to chaincode is the
// one storage/coa.ts computed from bytes this backend actually hashed. An
// earlier version of this route passed `body.coaFileHash ?? ""` straight
// through, letting any caller assert a hash for content that was never
// uploaded or checked -- the exact bypass T-006 exists to prevent.
export function normalizeIngredientBody(raw: unknown): IngredientBody {
  const body = { ...(raw as Record<string, unknown>) };
  if (body.halalRiskFlag === "true") body.halalRiskFlag = true;
  if (body.halalRiskFlag === "false") body.halalRiskFlag = false;
  delete body.coaFileHash;
  return body as IngredientBody;
}

// chaincode/batch.go's recordIngredient() only reads halalRiskFlag
// (overrideHalalRisk on the Go side) when overrideReason is non-empty;
// otherwise it derives the flag itself from the resolved reference
// entry's own default classification. Requiring both together when
// either is present prevents a request that names an override without
// really meaning to (e.g. halalRiskFlag silently defaulting to false)
// from ever reaching the chaincode call at all.
function validateIngredientBody(body: IngredientBody): string | null {
  if (!body.name || typeof body.name !== "string") return "name is required";
  if (!body.source || typeof body.source !== "string") return "source is required";
  const isOverride = body.overrideReason != null && body.overrideReason !== "";
  if (isOverride && typeof body.halalRiskFlag !== "boolean") {
    return "halalRiskFlag is required (as a boolean) when overrideReason is provided";
  }
  if (!isOverride && body.halalRiskFlag !== undefined && typeof body.halalRiskFlag !== "boolean") {
    return "halalRiskFlag must be a boolean if provided";
  }
  return null;
}

export function ingredientArgs(batchId: string, body: IngredientBody, coaFileHash: string): string[] {
  const isOverride = body.overrideReason != null && body.overrideReason !== "";
  return [
    batchId,
    body.name!,
    body.source!,
    String(isOverride),
    String(body.halalRiskFlag ?? false),
    isOverride ? body.overrideReason! : "",
    coaFileHash,
  ];
}

// Optional COA upload shared by SubmitIngredient and CorrectIngredient. A
// file that arrives must be stored before the chaincode call, never after:
// a ledger record whose hash points at an object that was never written
// would be unverifiable evidence. If storage is down, the submission fails
// closed rather than silently recording an empty hash.
async function coaHashForUpload(
  batchId: string,
  file: { buffer: Buffer; originalname: string } | undefined,
  res: import("express").Response,
): Promise<string | null> {
  if (!file) return "";
  try {
    return (await storeCoaFile(batchId, file)).hash;
  } catch (err) {
    if (err instanceof UnsupportedCoaFileError) {
      res.status(400).json({ reason: "missing_field", message: err.message });
      return null;
    }
    console.error("[batch.ingredients] COA storage failed:", err);
    res.status(503).json({
      reason: "storage_unavailable",
      message: "the certificate of analysis could not be stored, so the submission was rejected",
    });
    return null;
  }
}

batchRoutes.post(
  "/:batchId/ingredients",
  requireRole("ingredient_qa"),
  // JSON, or multipart/form-data when a COA file accompanies the submission.
  // multer passes non-multipart requests through untouched, so the documented
  // JSON contract is unchanged.
  upload.single("file"),
  async (req, res) => {
    const body = normalizeIngredientBody(req.body);
    const error = validateIngredientBody(body);
    if (error) {
      res.status(400).json({ reason: "missing_field", message: error });
      return;
    }
    const batchId = req.params.batchId as string;
    const coaFileHash = await coaHashForUpload(batchId, req.file, res);
    if (coaFileHash === null) return;

    await handleChaincodeSubmit(req, res, {
      chaincode: "batch",
      fn: "SubmitIngredient",
      args: ingredientArgs(batchId, body, coaFileHash),
      auditEvent: "ingredient_submit",
      module: "batch.ingredients.submit",
    });
  },
);

// docs/17 §5 "Bulk upload variant". One HTTP request, many chaincode
// submissions -- doesn't fit handleChaincodeSubmit's one-call shape, so
// this reuses its lower-level pieces directly (audit gating, idempotency,
// serialization) around a per-row loop instead. Idempotency wraps the
// *whole* upload as one unit: a retried Idempotency-Key returns the
// original aggregate result rather than re-submitting every row.
// uploadSessionId is backend-only (a fresh UUID per request), not
// persisted on any ledger record -- IngredientRecord.UploadSessionID
// exists in chaincode but no function sets it; adding one just to thread
// a grouping label through isn't needed for correctness here.
batchRoutes.post(
  "/:batchId/ingredients/upload",
  requireRole("ingredient_qa"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ reason: "missing_field", message: "file is required" });
      return;
    }

    const batchId = req.params.batchId as string;
    const user = req.user!;
    const idempotencyKey = req.header("Idempotency-Key");
    const ipAddress = req.ip;
    const fileBuffer = req.file.buffer;

    try {
      const { status, body } = await withIdempotency<Record<string, unknown>>(
        user.userId,
        idempotencyKey,
        "batch.ingredients.upload",
        async () => {
          const rows = parseIngredientCSV(fileBuffer.toString("utf8"));
          const results: Array<Record<string, unknown>> = [];

          const conn = await connectAs(user.fabricIdentity);
          try {
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const rowNum = i + 1;
              const validationError = validateIngredientBody(row);
              if (validationError) {
                results.push({ row: rowNum, status: "rejected", reason: "missing_field", message: validationError });
                continue;
              }

              await writeAuditLog({
                eventType: "ingredient_submit",
                outcome: "attempted",
                actor: user.fabricIdentity,
                module: "batch.ingredients.upload",
                ipAddress,
              });
              try {
                // No COA file accompanies a bulk CSV row: one file per
                // request can't be attributed to one particular row without
                // inventing a mapping the ledger has no field for.
                const submitted = await submit(conn.batch, "SubmitIngredient", ...ingredientArgs(batchId, row, ""));
                await writeAuditLog({
                  eventType: "ingredient_submit",
                  outcome: "allowed",
                  actor: user.fabricIdentity,
                  module: "batch.ingredients.upload",
                  ipAddress,
                });
                const raw = JSON.parse(Buffer.from(submitted.result).toString("utf8"));
                const serialized = await serializeForRole(raw, user.role);
                results.push({ row: rowNum, status: "committed", recordId: serialized.recordId, txId: submitted.txId });
              } catch (err) {
                if (err instanceof ChaincodeCallError) {
                  await writeAuditLog({
                    eventType: "ingredient_submit",
                    outcome: "denied",
                    actor: user.fabricIdentity,
                    module: "batch.ingredients.upload",
                    ipAddress,
                  });
                  // refdata's own rejection message names which entry type
                  // ("ingredient" or "supplier") didn't resolve -- surfaced
                  // as `field` to match docs/17's example, not re-derived
                  // from anything the client submitted.
                  const fieldMatch = /no (ingredient|supplier) entry/.exec(err.message);
                  results.push({
                    row: rowNum,
                    status: "rejected",
                    reason: err.reason,
                    message: err.message,
                    ...(fieldMatch ? { field: fieldMatch[1] === "ingredient" ? "name" : "source" } : {}),
                  });
                  continue;
                }
                throw err;
              }
            }
          } finally {
            conn.close();
          }

          return { status: 200, body: { uploadSessionId: randomUUID(), results } };
        },
      );

      res.status(status).json(body);
    } catch (err) {
      if (err instanceof AuditUnavailableError) {
        res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
        return;
      }
      // Same rule as routes/helpers.ts: an escaping throw out of an async
      // Express 4 handler is an unhandled rejection that ends the process.
      console.error("[batch.ingredients.upload] failed:", err);
      res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
    }
  },
);

batchRoutes.post(
  "/:batchId/ingredients/correct",
  requireRole("ingredient_qa"),
  upload.single("file"),
  async (req, res) => {
    const body = normalizeIngredientBody(req.body);
    const error = validateIngredientBody(body);
    if (error) {
      res.status(400).json({ reason: "missing_field", message: error });
      return;
    }
    const batchId = req.params.batchId as string;
    const coaFileHash = await coaHashForUpload(batchId, req.file, res);
    if (coaFileHash === null) return;

    await handleChaincodeSubmit(req, res, {
      chaincode: "batch",
      fn: "CorrectIngredient",
      args: ingredientArgs(batchId, body, coaFileHash),
      auditEvent: "ingredient_correct",
      module: "batch.ingredients.correct",
    });
  },
);

function validateProductionBody(body: { lineSegregationConfirmed?: boolean }): string | null {
  if (typeof body.lineSegregationConfirmed !== "boolean") {
    return "lineSegregationConfirmed is required and must be a boolean";
  }
  return null;
}

batchRoutes.post("/:batchId/production", requireRole("production_qa"), async (req, res) => {
  const error = validateProductionBody(req.body);
  if (error) {
    res.status(400).json({ reason: "missing_field", message: error });
    return;
  }
  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "ConfirmProduction",
    args: [req.params.batchId as string, String(req.body.lineSegregationConfirmed)],
    auditEvent: "production_confirm",
    module: "batch.production.confirm",
  });
});

batchRoutes.post("/:batchId/production/correct", requireRole("production_qa"), async (req, res) => {
  const error = validateProductionBody(req.body);
  if (error) {
    res.status(400).json({ reason: "missing_field", message: error });
    return;
  }
  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "CorrectProduction",
    args: [req.params.batchId as string, String(req.body.lineSegregationConfirmed)],
    auditEvent: "production_correct",
    module: "batch.production.correct",
  });
});

batchRoutes.post("/:batchId/export", requireRole("export_officer"), async (req, res) => {
  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "RequestExport",
    args: [req.params.batchId as string],
    auditEvent: "export_request",
    module: "batch.export",
    status: "exported",
  });
});

// ---------------------------------------------------------------------------
// ADR-CT-034 — the verifiability surfaces. Each one exists so that a claim
// this system makes can be checked by someone who does not have to take its
// word for it: a digest they can recompute, evidence they can re-hash, and a
// bundle they can verify offline without an account. docs/17 §17-20.
// ---------------------------------------------------------------------------

const EVIDENCE_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  csv: "text/csv",
  txt: "text/plain; charset=utf-8",
};

function contentTypeForEvidence(objectKey: string): string {
  const ext = objectKey.split(".").pop()?.toLowerCase() ?? "";
  if (!(ALLOWED_EVIDENCE_EXTENSIONS as readonly string[]).includes(ext)) return "application/octet-stream";
  return EVIDENCE_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

// P1a: the raw material behind effective_input_digest -- each record's own
// stored bytes and hash, in the order the digest hashed them, so a caller can
// recompute the digest instead of trusting a field that says "valid". Read
// only, no role restriction: it exposes exactly what the trail already
// exposes, in a form that can be hashed.
batchRoutes.get("/:batchId/integrity", async (req, res) => {
  await handleChaincodeEvaluate(req, res, {
    chaincode: "batch",
    fn: "GetBatchIntegrity",
    args: [req.params.batchId as string],
    auditEvent: "view",
    module: "batch.integrity",
  });
});

// P1b: the certificate a record's coa_file_hash names, re-hashed against that
// ledger value on every retrieval -- T-006's actual enforcement point
// (storage/minio.ts downloadAndVerify), which until now had no caller
// anywhere in the running product.
batchRoutes.get("/:batchId/ingredients/:recordId/coa", async (req, res) => {
  const batchId = req.params.batchId as string;
  const recordId = req.params.recordId as string;
  const ipAddress = req.ip;

  try {
    await writeAuditLog({
      eventType: "view",
      outcome: "attempted",
      actor: req.user!.fabricIdentity,
      module: "batch.coa",
      ipAddress,
    });

    const conn = await connectAs(req.user!.fabricIdentity);
    let trailBytes: Uint8Array;
    try {
      trailBytes = await evaluate(conn.batch, "GetBatchTrail", batchId);
    } finally {
      conn.close();
    }
    const trail = JSON.parse(Buffer.from(trailBytes).toString("utf8")) as RawBatchTrail;
    const record = trail.ingredient_records.find((candidate) => candidate.record_id === recordId);
    if (!record) {
      res.status(404).json({ reason: "record_not_found", message: `no ingredient record ${recordId} on batch ${batchId}` });
      return;
    }
    if (!record.coa_file_hash) {
      res.status(404).json({
        reason: "no_evidence",
        message: "this ingredient record names no certificate of analysis",
      });
      return;
    }

    const { objectKey, content } = await readCoaByHash(batchId, record.coa_file_hash);

    await writeAuditLog({
      eventType: "view",
      outcome: "allowed",
      actor: req.user!.fabricIdentity,
      module: "batch.coa",
      ipAddress,
    });

    res.setHeader("content-type", contentTypeForEvidence(objectKey));
    // The ledger's own hash travels with the bytes, so a client can re-check
    // them itself rather than trusting that this route verified anything.
    res.setHeader("x-evidence-sha256", record.coa_file_hash);
    res.setHeader("cache-control", "no-store");
    res.send(content);
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    if (err instanceof HashMismatchError) {
      // The whole point of storing the hash on an immutable record: a swapped
      // file is caught here rather than served as if it were the original.
      res.status(409).json({ reason: "evidence_hash_mismatch", message: err.message });
      return;
    }
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ reason: "evidence_missing", message: err.message });
      return;
    }
    if (err instanceof ChaincodeCallError) {
      res.status(err.httpStatus).json({ reason: err.reason, message: err.message });
      return;
    }
    console.error("[batch.coa] read failed:", err);
    res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
  }
});

// P2: everything a verifier needs, in one artifact. Fetching it needs a
// session (it is this system's data); checking it does not -- see
// src/proof/verifyProofBundle.ts, which runs offline against the bundle
// alone and is what the no-account /verify screen and the CLI both use.
batchRoutes.get("/:batchId/proof-bundle", async (req, res) => {
  const batchId = req.params.batchId as string;
  const ipAddress = req.ip;

  try {
    await writeAuditLog({
      eventType: "view",
      outcome: "attempted",
      actor: req.user!.fabricIdentity,
      module: "batch.proof_bundle",
      ipAddress,
    });

    const conn = await connectAs(req.user!.fabricIdentity);
    let integrity: RawBatchIntegrity;
    let trail: RawBatchTrailForBundle;
    let publicKeyPem: string;
    try {
      const integrityBytes = await evaluate(conn.batch, "GetBatchIntegrity", batchId);
      integrity = JSON.parse(Buffer.from(integrityBytes).toString("utf8")) as RawBatchIntegrity;
      const trailBytes = await evaluate(conn.batch, "GetBatchTrail", batchId);
      trail = JSON.parse(Buffer.from(trailBytes).toString("utf8")) as RawBatchTrailForBundle;
      const keyBytes = await evaluate(conn.batch, "GetAttestationPublicKey");
      // A function returning a bare string comes back as its raw bytes, not as
      // JSON -- contractapi only marshals struct returns. Parsing it as JSON
      // threw, and the route answered 500 until this read was corrected
      // against the live chaincode.
      publicKeyPem = Buffer.from(keyBytes).toString("utf8");
    } finally {
      conn.close();
    }

    await writeAuditLog({
      eventType: "view",
      outcome: "allowed",
      actor: req.user!.fabricIdentity,
      module: "batch.proof_bundle",
      ipAddress,
    });

    res.json(
      buildProofBundle({ integrity, trail, attestationPublicKeyPem: publicKeyPem, generatedAt: new Date().toISOString() }),
    );
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    if (err instanceof ChaincodeCallError) {
      res.status(err.httpStatus).json({ reason: err.reason, message: err.message });
      return;
    }
    console.error("[batch.proof_bundle] failed:", err);
    res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
  }
});
