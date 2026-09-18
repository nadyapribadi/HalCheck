// docs/17_api_reference.md §11. Reads (GET) are open to any authenticated
// role -- chaincode/refdata.go's ListReferenceEntries/ResolveActiveReference
// carry no role check by design ("any operational role may need to
// validate its own submission against the current reference list"); only
// AddReferenceEntry/DeprecateReferenceEntry call requireSystemAdmin. An
// earlier version of this doc said "all three endpoints" were System
// Admin only, which never matched the chaincode -- fixed as part of P4
// (see docs/17's v0.6.0 changelog entry).
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { handleChaincodeEvaluate, handleChaincodeSubmit } from "./helpers.js";

export const refdataRoutes = Router();

refdataRoutes.use(requireAuth);

const ENTRY_TYPES = new Set(["ingredient", "supplier", "standard", "fail_reason"]);

function validateEntryType(type: string): string | null {
  if (!ENTRY_TYPES.has(type)) {
    return `type must be one of ${Array.from(ENTRY_TYPES).join(", ")}`;
  }
  return null;
}

refdataRoutes.get("/:type", async (req, res) => {
  const error = validateEntryType(req.params.type as string);
  if (error) {
    res.status(400).json({ reason: "invalid_entry_type", message: error });
    return;
  }
  await handleChaincodeEvaluate(req, res, {
    chaincode: "refdata",
    fn: "ListReferenceEntries",
    args: [req.params.type as string],
    auditEvent: "view",
    module: "refdata.list",
  });
});

// FRD-CHAIN-REFDATA-004: "deprecated reference-data entries must remain
// visible in reference-data history, not hidden." No requireRole, matching
// GetReferenceEntryHistory's own "No role restriction, matching
// ResolveActiveReference: this is a read" comment.
refdataRoutes.get("/:type/:value/history", async (req, res) => {
  const typeError = validateEntryType(req.params.type as string);
  if (typeError) {
    res.status(400).json({ reason: "invalid_entry_type", message: typeError });
    return;
  }
  await handleChaincodeEvaluate(req, res, {
    chaincode: "refdata",
    fn: "GetReferenceEntryHistory",
    args: [req.params.type as string, req.params.value as string],
    auditEvent: "view",
    module: "refdata.history",
  });
});

refdataRoutes.post("/:type", requireRole("system_admin"), async (req, res) => {
  const typeError = validateEntryType(req.params.type as string);
  if (typeError) {
    res.status(400).json({ reason: "invalid_entry_type", message: typeError });
    return;
  }
  const { value, metadata } = req.body as { value?: string; metadata?: unknown };
  if (!value || typeof value !== "string") {
    res.status(400).json({ reason: "missing_field", message: "value is required" });
    return;
  }

  await handleChaincodeSubmit(req, res, {
    chaincode: "refdata",
    fn: "AddReferenceEntry",
    args: [req.params.type as string, value, metadata !== undefined ? JSON.stringify(metadata) : ""],
    auditEvent: "reference_data_add",
    module: "refdata.add",
  });
});

// DeprecateReferenceEntry only takes (type, value) -- the ledger's own
// entry_id is a raw composite key (contains NUL-byte separators, see
// referenceEntryKey), unusable as a URL segment, and unnecessary anyway
// since at most one version of a (type, value) is ever active. This route
// takes the human-readable value in the path, not entry_id.
refdataRoutes.post("/:type/:value/deprecate", requireRole("system_admin"), async (req, res) => {
  const typeError = validateEntryType(req.params.type as string);
  if (typeError) {
    res.status(400).json({ reason: "invalid_entry_type", message: typeError });
    return;
  }

  await handleChaincodeSubmit(req, res, {
    chaincode: "refdata",
    fn: "DeprecateReferenceEntry",
    args: [req.params.type as string, req.params.value as string],
    auditEvent: "reference_data_deprecate",
    module: "refdata.deprecate",
  });
});
