// Maps a batch's ledger trail into the Core Screening App engine's own
// shapes, runs it, and builds the signed-attestation payload
// batch.RecordVerdict expects (docs/04_trd.md §23.2). The engine (src/engine)
// is reused as-is (a separate, already-complete module) -- this file is the
// only place that knows how to bridge Compliance Trail's ledger shape to it.
//
// ADR-CT-033 is the rule this file now follows: every fact the rules consume
// comes from the batch's own records, because the signed attestation binds
// those records and nothing else. The dataset release keeps exactly two jobs
// -- the rules/standards and the recognition agreements -- plus one
// compatibility path for records written before supplier verification status
// was snapshotted. Before this, an ingredient or supplier added to the
// governed reference list by a System Admin could still be refused by the
// engine's frozen vocabulary at verdict time (live failure on SL-2026-021,
// docs/21_decisions.md ADR-CT-033), i.e. one compliance fact with two owners,
// and the refusal landed on the Compliance Officer, who has no remedy.
import { runScreeningForTargets, ENGINE_VERSION } from "../../../src/engine/index";
import { activeDatasetRelease } from "../../../src/data/loadDatasetRelease";
import type { EvaluationTarget, ScreeningProfile } from "../../../src/engine/types";

// Raw (snake_case, unserialized) shape of chaincode/batch.go's GetBatchTrail
// response -- only the fields this bridge actually needs.
export interface RawBatchTrail {
  batch: { batch_id: string; intended_market: "Indonesia" | "Malaysia" };
  ingredient_records: Array<{
    record_id: string;
    ingredient_name_snapshot: string;
    ingredient_reference_entry_id: string;
    ingredient_reference_version: string;
    source_snapshot: string;
    supplier_reference_entry_id: string;
    supplier_reference_version: string;
    halal_risk_flag: boolean;
    // Absent on records written before ADR-CT-033 (chaincode/batch.go's
    // SupplierVerificationStatus is `omitempty`), present on every record
    // written since -- batch.recordIngredient refuses a submission whose
    // supplier entry carries no status, so a record written under the new
    // rule can never be missing it. Its presence is therefore the whole
    // compatibility question, and the only place that question is asked is
    // resolveSupplierVerificationStatus below.
    supplier_verification_status?: string;
    // Only read by the evidence route (ADR-CT-034) -- the verdict path never
    // consults it, since a missing COA is a certificate-rule input, not an
    // ingredient-source one.
    coa_file_hash?: string;
    // Empty on a plain submission, set to the flagged record's ID on a
    // correction (chaincode/batch.go CorrectIngredient, TRD §23.5).
    supersedes_record_id?: string;
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

type SupplierVerificationStatus = EvaluationTarget["supplier"]["verificationStatus"];

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

  // TRD §23.5: a correction is a *new* record linked to the one it replaces
  // -- the ledger keeps both, and nothing is ever deleted. So the engine has
  // to evaluate the effective set, not every record present: filtering is
  // done by finding which records some other record supersedes. Without
  // this, a corrected batch can never pass -- the replacement record passes
  // its rules while the original it replaced keeps failing every run, which
  // is exactly what happened live: SL-2026-009 flagged an ingredient,
  // CorrectIngredient succeeded, and the re-recorded verdict still came back
  // Fail against the superseded record's ID.
  //
  // The digest deliberately does NOT get this treatment: it is computed by
  // chaincode over the batch's full record set (computeEffectiveInputDigest),
  // including superseded records, so the signed attestation still binds to
  // everything the ledger actually holds -- corrections included.
  const supersededRecordIds = new Set(
    trail.ingredient_records
      .map((r) => r.supersedes_record_id)
      .filter((id): id is string => Boolean(id)),
  );
  const effectiveIngredientRecords = trail.ingredient_records.filter(
    (r) => !supersededRecordIds.has(r.record_id),
  );

  // ADR-CT-033: the evaluation target is assembled from the record's own
  // snapshots -- names, the reference entry ids and versions they were
  // resolved from, the halal risk classification, and the supplier's
  // verification status -- rather than by looking those names up in the
  // dataset release. That is what makes the signed digest cover the whole
  // input set: an evaluation input held outside the record set would mean
  // the signature attests to something the batch's own trail can't prove.
  const targets: EvaluationTarget[] = effectiveIngredientRecords.map((r) => ({
    record: {
      recordId: r.record_id,
      profileId: trail.batch.batch_id,
      ingredientEntryId: r.ingredient_reference_entry_id,
      supplierEntryId: r.supplier_reference_entry_id,
      halalRiskFlag: r.halal_risk_flag,
      // No certificateIssuingBody: Compliance Trail's ledger never captures
      // one, so every certificate-type rule correctly evaluates
      // not_applicable (src/engine/evaluate.ts's own documented behavior
      // for a missing certificate) rather than a fabricated value.
    },
    ingredient: {
      entryId: r.ingredient_reference_entry_id,
      // The ledger's own canonical value, as resolved when the record was
      // written. evaluate() uses it for the rationale sentence only.
      name: r.ingredient_name_snapshot,
      // Also unread by evaluate(), which judges the record's own
      // halalRiskFlag; carried so the entry shape stays complete rather
      // than being a partial object with a default dropped into it.
      defaultHalalRisk: r.halal_risk_flag,
    },
    supplier: {
      entryId: r.supplier_reference_entry_id,
      name: r.source_snapshot,
      verificationStatus: resolveSupplierVerificationStatus(r),
    },
  }));

  const profile: ScreeningProfile = {
    profileId: trail.batch.batch_id,
    intendedMarket,
    productType: "Cosmetic Product",
    createdAt: new Date().toISOString(),
  };

  // runScreeningForTargets, not runScreening: the latter would re-resolve
  // each record's entries out of the dataset release, discarding exactly the
  // snapshots this function just assembled.
  const run = runScreeningForTargets(profile, targets, activeDatasetRelease);

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

// The one question ADR-CT-033 leaves open, answered in one place so no
// caller has to ask "which generation of record is this?" anywhere else
// (the mode-flag-in-the-verdict-path the ADR rejects).
//
// A record's own snapshot wins, always. It is only absent for records
// written before chaincode/batch.go started capturing it, and those were
// written when the release *was* the only owner of this fact -- so for them
// the release remains the answer, unchanged from how they were evaluated
// before. A pre-existing record whose supplier isn't in the release has no
// owner left for the fact at all: that is a genuine defect (the two
// governance sources have drifted), so it fails loudly here rather than
// being guessed at, and rather than being written into a signed attestation
// as a claim the ledger can't support.
//
// The failures this can still produce are therefore confined to records
// that already existed on the ledger before this change; a record written
// since can never reach them, because batch.recordIngredient refuses to
// write one without the status in the first place.
function resolveSupplierVerificationStatus(
  record: RawBatchTrail["ingredient_records"][number],
): SupplierVerificationStatus {
  if (record.supplier_verification_status) {
    // Stored verbatim by chaincode/batch.go, deliberately not validated
    // against a closed enum there (refdata owns that vocabulary), so this is
    // a narrowing for the engine's own type -- the engine's rule is
    // "anything other than verified is not verified", which is exactly what
    // an unrecognized value should keep meaning.
    return record.supplier_verification_status as SupplierVerificationStatus;
  }

  const supplier = activeDatasetRelease.suppliers.find((s) => s.name === record.source_snapshot);
  if (!supplier) {
    throw new AttestationBuildError(
      `ingredient record ${record.record_id} carries no supplier_verification_status (written before ADR-CT-033) and its supplier "${record.source_snapshot}" is not in dataset release ${activeDatasetRelease.releaseId} either -- nothing owns that compliance fact, so it cannot be bound into an attestation`,
    );
  }
  return supplier.verificationStatus;
}
