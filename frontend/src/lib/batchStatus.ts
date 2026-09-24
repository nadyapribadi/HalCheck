import type { Role } from "../auth/session";

// Docs/11 §3's status vocabulary. The chaincode deliberately stores no batch
// status (chaincode/batch.go: "derived by the backend from the latest child
// record present"), so the derivation lives here, in one place, and every
// screen reads it from this function rather than re-deriving its own.
export type BatchStatus =
  | "awaiting_ingredients"
  | "awaiting_production"
  | "awaiting_verdict"
  | "awaiting_correction"
  | "awaiting_export"
  | "exported";

export const STATUS_LABELS: Record<BatchStatus, string> = {
  awaiting_ingredients: "Awaiting Ingredients",
  awaiting_production: "Awaiting Production",
  awaiting_verdict: "Awaiting Verdict",
  awaiting_correction: "Awaiting Correction",
  awaiting_export: "Awaiting Export",
  exported: "Exported",
};

export interface IngredientRecord {
  recordId: string;
  ingredientNameSnapshot: string;
  sourceSnapshot: string;
  ingredientReferenceVersion?: string;
  supplierReferenceVersion?: string;
  halalRiskFlag: boolean;
  overrideReason?: string;
  coaFileHash?: string;
  timestamp: string;
  submittedBy?: { role: Role; personaName?: string } | null;
  supersedesRecordId?: string;
}

export interface ProductionRecord {
  recordId: string;
  batchDate?: string;
  lineSegregationConfirmed: boolean;
  standardSnapshot?: string;
  standardReferenceVersion?: string;
  timestamp: string;
  submittedBy?: { role: Role; personaName?: string } | null;
  supersedesRecordId?: string;
}

export interface VerdictRecord {
  recordId: string;
  status: "pass" | "fail";
  regulationSnapshot?: string;
  engineAttestationDigest?: string;
  engineVersion?: string;
  rulesRelease?: string;
  // The API field is `failReasonSnapshot` -- chaincode's fail_reason_snapshot,
  // camelCased by the RBAC serializer. Reading `failReason` here meant the
  // trail view rendered "—" for every Fail verdict's reason, which a screenshot
  // caught and no test did: nothing asserted what the UI displays.
  failReasonSnapshot?: string;
  flaggedRecordId?: string;
  recognitionCheck?: {
    issuingBody: string;
    requiringBody: string;
    recognized: boolean;
    asOfDate: string;
  };
  timestamp: string;
  submittedBy?: { role: Role; personaName?: string } | null;
}

export interface ExportRecord {
  recordId: string;
  destinationMarket: string;
  timestamp: string;
  submittedBy?: { role: Role; personaName?: string } | null;
}

export interface BatchSummary {
  batchId: string;
  createdAt: string;
  intendedMarket: string;
}

export interface BatchTrail {
  batch: BatchSummary;
  ingredientRecords: IngredientRecord[];
  productionRecords: ProductionRecord[];
  verdictRecords: VerdictRecord[];
  exportRecords: ExportRecord[];
  effectiveInputDigest?: string;
}

export function latestVerdict(trail: BatchTrail): VerdictRecord | null {
  return trail.verdictRecords.at(-1) ?? null;
}

// A correction is a new record linked to its predecessor, so "has this Fail
// been answered yet" is answered by whether any record names the flagged one
// in supersedesRecordId -- not by counting verdicts.
export function isFlaggedRecordCorrected(trail: BatchTrail, verdict: VerdictRecord | null): boolean {
  if (!verdict || verdict.status !== "fail" || !verdict.flaggedRecordId) return false;
  const all = [...trail.ingredientRecords, ...trail.productionRecords];
  return all.some((record) => record.supersedesRecordId === verdict.flaggedRecordId);
}

export function deriveStatus(trail: BatchTrail): BatchStatus {
  if (trail.exportRecords.length > 0) return "exported";

  const verdict = latestVerdict(trail);
  if (verdict?.status === "pass") return "awaiting_export";
  if (verdict?.status === "fail") {
    return isFlaggedRecordCorrected(trail, verdict) ? "awaiting_verdict" : "awaiting_correction";
  }

  if (trail.productionRecords.length > 0) return "awaiting_verdict";
  if (trail.ingredientRecords.length > 0) return "awaiting_production";
  return "awaiting_ingredients";
}

// Docs/10 §3: Ingredient QA lands on batches awaiting ingredients *or*
// correction; Brand Owner is explicitly unfiltered; System Admin never sees
// this shell at all (handled by routing, not by a filter).
export function statusesForRole(role: Role): BatchStatus[] | null {
  switch (role) {
    case "ingredient_qa":
      return ["awaiting_ingredients", "awaiting_correction"];
    case "production_qa":
      return ["awaiting_production"];
    case "compliance_officer":
      return ["awaiting_verdict"];
    case "export_officer":
      return ["awaiting_export"];
    case "brand_owner":
      return null;
    case "system_admin":
      return [];
  }
}

export function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
