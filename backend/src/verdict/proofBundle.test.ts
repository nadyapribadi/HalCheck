import { describe, expect, it } from "vitest";
import { buildProofBundle, type RawBatchIntegrity, type RawBatchTrailForBundle } from "./proofBundle.js";

function integrity(): RawBatchIntegrity {
  return {
    batch_id: "SL-2026-900",
    algorithm: "sha256",
    digest_order: "ingredient records in ledger key order, then production records in ledger key order",
    records: [
      {
        record_id: "ing-1",
        object_type: "ingredientRecord",
        sha256: "a".repeat(64),
        stored_bytes_base64: "eyJyZWNvcmRfaWQiOiJpbmctMSJ9",
      },
    ],
    effective_input_digest: "b".repeat(64),
  };
}

function trail(verdictRecords: RawBatchTrailForBundle["verdict_records"]): RawBatchTrailForBundle {
  return {
    batch: { batch_id: "SL-2026-900", intended_market: "Malaysia" },
    verdict_records: verdictRecords,
  };
}

const signedVerdict = {
  record_id: "verdict-1",
  status: "pass",
  engine_version: "0.1.0",
  rules_release: "2026.07",
  timestamp: "2026-09-18T00:00:00Z",
  engine_attestation: '{"batch_id":"SL-2026-900"}',
  engine_attestation_signature: "c2lnbmF0dXJl",
};

describe("buildProofBundle", () => {
  it("carries the integrity material, the signed verdict and the published key", () => {
    const bundle = buildProofBundle({
      integrity: integrity(),
      trail: trail([signedVerdict]),
      attestationPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----",
      generatedAt: "2026-09-18T10:00:00.000Z",
    });

    expect(bundle.bundleVersion).toBe(1);
    expect(bundle.batchId).toBe("SL-2026-900");
    expect(bundle.integrity.effectiveInputDigest).toBe("b".repeat(64));
    // Records are normalized to the bundle's own camelCase, so a verifier
    // never has to know which parts came straight off the ledger.
    expect(bundle.integrity.records[0]).toEqual({
      recordId: "ing-1",
      objectType: "ingredientRecord",
      sha256: "a".repeat(64),
      storedBytesBase64: "eyJyZWNvcmRfaWQiOiJpbmctMSJ9",
    });
    expect(bundle.verdicts).toHaveLength(1);
    expect(bundle.verdicts[0]!.attestationSignature).toBe("c2lnbmF0dXJl");
    expect(bundle.attestationPublicKeyPem).toContain("BEGIN PUBLIC KEY");
  });

  // A verdict recorded before attestation storage existed has nothing to
  // verify. Including it would make a reader believe it had been checked.
  it("omits verdicts that carry no stored attestation", () => {
    const bundle = buildProofBundle({
      integrity: integrity(),
      trail: trail([
        { record_id: "legacy-verdict", status: "pass", engine_version: "0.1.0" },
        signedVerdict,
      ]),
      attestationPublicKeyPem: "pem",
      generatedAt: "2026-09-18T10:00:00.000Z",
    });

    expect(bundle.verdicts.map((verdict) => verdict.recordId)).toEqual(["verdict-1"]);
  });

  it("builds a bundle for a batch with no verdict yet", () => {
    const bundle = buildProofBundle({
      integrity: integrity(),
      trail: trail([]),
      attestationPublicKeyPem: "pem",
      generatedAt: "2026-09-18T10:00:00.000Z",
    });

    expect(bundle.verdicts).toEqual([]);
    expect(bundle.integrity.records).toHaveLength(1);
  });
});
