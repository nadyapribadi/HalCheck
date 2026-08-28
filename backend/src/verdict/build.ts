// Maps a batch's ledger trail into the Core Screening App engine's own
// shapes, runs it, and builds the signed-attestation payload
// batch.RecordVerdict expects (docs/04_trd.md §23.2). The engine and its
// dataset (src/engine, src/data) are untouched, reused as-is (they're a
// separate, already-complete module) -- this file is the only place that
// knows how to bridge Compliance Trail's ledger shape to it.
import { runScreening, ENGINE_VERSION } from "../../../src/engine/index";
import { activeDatasetRelease } from "../../../src/data/loadDatasetRelease";
import type { IngredientRecord as EngineIngredientRecord, ScreeningProfile } from "../../../src/engine/types";

// Raw (snake_case, unserialized) shape of chaincode/batch.go's GetBatchTrail
// response -- only the fields this bridge actually needs.
export interface RawBatchTrail {
  batch: { batch_id: string; intended_market: "Indonesia" | "Malaysia" };
  ingredient_records: Array<{
    record_id: string;
    ingredient_name_snapshot: string;
    source_snapshot: string;
    halal_risk_flag: boolean;
  }>;
  effective_input_digest: string;
}

// docs/12_seed_data_specification.md §"Fail Reason Catalog" -- the refdata
// catalog values a Fail attestation's fail_reason must resolve against.
// Only the reasons evaluate() can actually produce are ever used, but the
// full mapping is kept here so it stays obviously complete against the
// catalog, not just the reachable subset.
const FAIL_REASON_CATALOG: Record<string, string> = {
  unverified_ingredient_source: "Unverified ingredient source",
  missing_certificate_of_analysis: "Missing Certificate of Analysis",
  line_segregation_not_confirmed: "Line segregation not confirmed",
  recognition_requirement_not_satisfied: "Recognition requirement not satisfied",
  other: "Other",
};

export class AttestationBuildError extends Error {}

export interface VerdictAttestation {
  batch_id: string;
  input_digest: string;
  intended_market: string;
  engine_version: string;
  rules_release: string;
  result: "pass" | "fail";
  regulation_value: string;
  fail_reason?: string;
  flagged_record_id?: string;
  recognition_check?: {
    issuing_body: string;
    requiring_body: string;
    recognized: boolean;
    as_of_date: string;
  };
}

export function buildAttestation(trail: RawBatchTrail): VerdictAttestation {
  const intendedMarket = trail.batch.intended_market.toLowerCase() as "indonesia" | "malaysia";

  const engineRecords: EngineIngredientRecord[] = trail.ingredient_records.map((r) => {
    const ingredient = activeDatasetRelease.ingredients.find((i) => i.name === r.ingredient_name_snapshot);
    const supplier = activeDatasetRelease.suppliers.find((s) => s.name === r.source_snapshot);
    if (!ingredient || !supplier) {
      throw new AttestationBuildError(
        `ledger ingredient/supplier ("${r.ingredient_name_snapshot}"/"${r.source_snapshot}") not found in the active dataset release -- refdata and the engine dataset have drifted apart`,
      );
    }
    return {
      recordId: r.record_id,
      profileId: trail.batch.batch_id,
      ingredientEntryId: ingredient.entryId,
      supplierEntryId: supplier.entryId,
      halalRiskFlag: r.halal_risk_flag,
      // No certificateIssuingBody: Compliance Trail's ledger never captures
      // one, so every certificate-type rule correctly evaluates
      // not_applicable (src/engine/evaluate.ts's own documented behavior
      // for a missing certificate) rather than a fabricated value.
    };
  });

  const profile: ScreeningProfile = {
    profileId: trail.batch.batch_id,
    intendedMarket,
    productType: "Cosmetic Product",
    createdAt: new Date().toISOString(),
  };

  const run = runScreening(profile, engineRecords, activeDatasetRelease);

  // The finding that actually governs this verdict: the first applicable
  // (non-not_applicable) finding for this market. A Fail anywhere makes the
  // batch Fail overall (run.overallStatus), but the *reported* governing
  // regulation/fail reason/flagged record always come from one specific
  // finding, never synthesized separately from the aggregate.
  const reporting = run.findings.find((f) => f.result !== "not_applicable") ?? run.findings[0];
  if (!reporting) {
    throw new AttestationBuildError(`no standards rule produced a finding for market "${intendedMarket}"`);
  }
  const rule = activeDatasetRelease.standards.find((s) => s.ruleId === reporting.ruleId);
  if (!rule) {
    throw new AttestationBuildError(`finding referenced unknown rule "${reporting.ruleId}"`);
  }

  const attestation: VerdictAttestation = {
    batch_id: trail.batch.batch_id,
    input_digest: trail.effective_input_digest,
    intended_market: trail.batch.intended_market,
    engine_version: ENGINE_VERSION,
    rules_release: activeDatasetRelease.releaseId,
    result: run.overallStatus,
    regulation_value: rule.citation,
  };

  if (run.overallStatus === "fail") {
    const failure = run.findings.find((f) => f.result === "fail");
    if (!failure || !failure.failReason || !failure.flaggedRecordId) {
      throw new AttestationBuildError("overall status is fail but no finding carries a fail reason/flagged record");
    }
    attestation.fail_reason = FAIL_REASON_CATALOG[failure.failReason];
    attestation.flagged_record_id = failure.flaggedRecordId;

    if (failure.recognitionAgreementId) {
      const agreement = activeDatasetRelease.recognitionAgreements.find(
        (a) => a.agreementId === failure.recognitionAgreementId,
      );
      if (agreement) {
        attestation.recognition_check = {
          issuing_body: agreement.issuingBody,
          requiring_body: agreement.requiringBody,
          recognized: agreement.recognized,
          as_of_date: agreement.asOfDate,
        };
      }
    }
  }

  return attestation;
}
