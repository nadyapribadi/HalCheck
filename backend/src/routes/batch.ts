// docs/17_api_reference.md §3-8.
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ChaincodeCallError, connectAs, evaluate } from "../fabric/gateway.js";
import { AttestationBuildError, buildAttestation, type RawBatchTrail } from "../verdict/build.js";
import { signAttestation } from "../verdict/sign.js";
import { handleChaincodeEvaluate, handleChaincodeSubmit } from "./helpers.js";

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

function ingredientArgs(batchId: string, body: IngredientBody): string[] {
  const isOverride = body.overrideReason != null && body.overrideReason !== "";
  return [
    batchId,
    body.name!,
    body.source!,
    String(isOverride),
    String(body.halalRiskFlag ?? false),
    isOverride ? body.overrideReason! : "",
  ];
}

batchRoutes.post("/:batchId/ingredients", requireRole("ingredient_qa"), async (req, res) => {
  const error = validateIngredientBody(req.body);
  if (error) {
    res.status(400).json({ reason: "missing_field", message: error });
    return;
  }
  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "SubmitIngredient",
    args: ingredientArgs(req.params.batchId as string, req.body),
    auditEvent: "ingredient_submit",
    module: "batch.ingredients.submit",
  });
});

batchRoutes.post("/:batchId/ingredients/correct", requireRole("ingredient_qa"), async (req, res) => {
  const error = validateIngredientBody(req.body);
  if (error) {
    res.status(400).json({ reason: "missing_field", message: error });
    return;
  }
  await handleChaincodeSubmit(req, res, {
    chaincode: "batch",
    fn: "CorrectIngredient",
    args: ingredientArgs(req.params.batchId as string, req.body),
    auditEvent: "ingredient_correct",
    module: "batch.ingredients.correct",
  });
});

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
