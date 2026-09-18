import { describe, expect, it } from "vitest";
import { AttestationBuildError, buildAttestation, type RawBatchTrail } from "./build.js";

// These exercise the ledger -> engine bridge against the real dataset release
// (src/data/loadDatasetRelease.ts), not a fixture: Cetyl Alcohol is the
// dataset's halal-risk ingredient, PT Distribusi Kosmetik Prima is its
// deliberately unverified supplier, and PT Sumber Alam Nusantara is verified.
//
// Since ADR-CT-033 the release is only half the story, and these tests are
// written to hold that line: the facts the rules consume have to come from
// the record, and the release may only answer for records written before the
// snapshot existed.
function trailWith(
  records: RawBatchTrail["ingredient_records"],
  market: "Malaysia" | "Indonesia" = "Malaysia",
): RawBatchTrail {
  return {
    batch: { batch_id: "SL-2026-900", intended_market: market },
    ingredient_records: records,
    effective_input_digest: "digest-over-every-ledger-record",
  };
}

// The shape every record written since ADR-CT-033 has: the supplier's
// verification status travels with the record.
function record(overrides: Partial<RawBatchTrail["ingredient_records"][number]> = {}) {
  return {
    record_id: "orig-record-id",
    ingredient_name_snapshot: "Cetyl Alcohol",
    ingredient_reference_entry_id: "ingredient-entry-id",
    ingredient_reference_version: "1",
    source_snapshot: "PT Distribusi Kosmetik Prima",
    supplier_reference_entry_id: "supplier-entry-id",
    supplier_reference_version: "1",
    halal_risk_flag: true,
    supplier_verification_status: "unverified",
    ...overrides,
  };
}

describe("buildAttestation", () => {
  it("fails and flags the risky record when nothing corrects it", () => {
    const attestation = buildAttestation(trailWith([record()]));

    expect(attestation.result).toBe("fail");
    expect(attestation.flagged_record_id).toBe("orig-record-id");
    expect(attestation.fail_reason).toBe("Unverified ingredient source");
    // The rules themselves are still the release's job -- ADR-CT-033
    // narrows what the release owns, it doesn't remove it.
    expect(attestation.rules_release).toBe("2026.07");
  });

  // Regression: the ledger keeps a corrected record's predecessor forever
  // (TRD §23.5), so evaluating every record present meant a corrected batch
  // could never pass -- observed live on SL-2026-009, where a corrected
  // ingredient still produced a Fail verdict against the superseded record.
  it("evaluates the correction, not the superseded record it replaces", () => {
    const attestation = buildAttestation(
      trailWith([
        record(),
        record({
          record_id: "corrected-record-id",
          source_snapshot: "PT Sumber Alam Nusantara",
          supplier_verification_status: "verified",
          supersedes_record_id: "orig-record-id",
        }),
      ]),
    );

    expect(attestation.result).toBe("pass");
    expect(attestation.flagged_record_id).toBeUndefined();
    expect(attestation.fail_reason).toBeUndefined();
  });

  it("still binds the attestation to the full ledger state, not just the effective records", () => {
    const attestation = buildAttestation(
      trailWith([record(), record({ record_id: "corrected-record-id", supersedes_record_id: "orig-record-id" })]),
    );

    expect(attestation.input_digest).toBe("digest-over-every-ledger-record");
  });

  // ADR-CT-033's decisive case, and the SL-2026-021 failure it removes: a
  // System Admin adds an ingredient and a supplier through the governance
  // shell, Ingredient QA submits them, and the verdict must be decided on
  // what the ledger now holds -- neither name is in the frozen release, and
  // that must no longer matter.
  it("evaluates values the dataset release has never heard of", () => {
    const attestation = buildAttestation(
      trailWith([
        record({
          ingredient_name_snapshot: "Ekstrak Uji ADR33",
          source_snapshot: "PT Uji ADR33",
          supplier_verification_status: "verified",
        }),
      ]),
    );

    expect(attestation.result).toBe("pass");
  });

  // The snapshot is the record's own fact, so it has to win over the
  // release in both directions -- otherwise the release is still quietly
  // deciding verdicts and the drift has only moved.
  it("prefers the record's snapshotted status over a contradicting release", () => {
    const releaseSaysUnverified = buildAttestation(
      trailWith([record({ source_snapshot: "PT Distribusi Kosmetik Prima", supplier_verification_status: "verified" })]),
    );
    expect(releaseSaysUnverified.result).toBe("pass");

    const releaseSaysVerified = buildAttestation(
      trailWith([record({ source_snapshot: "PT Sumber Alam Nusantara", supplier_verification_status: "unverified" })]),
    );
    expect(releaseSaysVerified.result).toBe("fail");
    expect(releaseSaysVerified.fail_reason).toBe("Unverified ingredient source");
  });

  // A status the governed data doesn't use is still not "verified" -- the
  // engine's rule is that anything other than verified is not verified, so
  // an unrecognized value fails closed rather than passing.
  it("treats an unrecognized snapshotted status as not verified", () => {
    const attestation = buildAttestation(trailWith([record({ supplier_verification_status: "pending_review" })]));

    expect(attestation.result).toBe("fail");
  });

  describe("records written before ADR-CT-033", () => {
    // The compatibility path has to be invisible: an already-recorded batch
    // evaluated through the release must produce exactly what it did before
    // this change. Here the release says the supplier is unverified...
    it("still evaluates through the release when the record carries no snapshot", () => {
      const { supplier_verification_status: _dropped, ...legacyShape } = record();
      const attestation = buildAttestation(trailWith([legacyShape]));

      expect(attestation.result).toBe("fail");
      expect(attestation.fail_reason).toBe("Unverified ingredient source");
    });

    // ...and here that it says the supplier is verified.
    it("passes a legacy record whose release supplier is verified", () => {
      const { supplier_verification_status: _dropped, ...legacyShape } = record({
        source_snapshot: "PT Sumber Alam Nusantara",
      });
      const attestation = buildAttestation(trailWith([legacyShape]));

      expect(attestation.result).toBe("pass");
    });

    // The only remaining way this can fail is a pre-existing record whose
    // supplier is in neither the record nor the release -- no owner left for
    // the fact, so it fails loudly instead of guessing a status that would
    // end up inside a signed attestation.
    it("refuses to guess when neither the record nor the release owns the fact", () => {
      const { supplier_verification_status: _dropped, ...legacyShape } = record({
        ingredient_name_snapshot: "Ekstrak Uji ADR33",
        source_snapshot: "PT Uji ADR33",
      });

      expect(() => buildAttestation(trailWith([legacyShape]))).toThrow(AttestationBuildError);
    });
  });
});
