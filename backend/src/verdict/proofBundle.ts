// Assembles a proof bundle: everything a third party needs to check a batch's
// accountability claims WITHOUT this application, without a Fabric client,
// and without a login (ADR-CT-034, the P2 slice).
//
// Pure on purpose -- every input is already-fetched ledger data, so the
// assembly is unit-testable without a network, and the verifier that consumes
// the bundle (src/proof/verifyProofBundle.ts) has no dependency on this file
// or on Fabric at all. What makes the bundle checkable is not that this
// backend built it, but that the signature inside it cannot be produced
// without the officer's key, and the digest inside it cannot be reproduced
// from altered records.

export interface IntegrityRecord {
  record_id: string;
  object_type: string;
  sha256: string;
  stored_bytes_base64: string;
}

export interface RawBatchIntegrity {
  batch_id: string;
  algorithm: string;
  digest_order: string;
  records: IntegrityRecord[];
  effective_input_digest: string;
}

export interface RawTrailVerdict {
  record_id: string;
  status: string;
  engine_version?: string;
  rules_release?: string;
  timestamp?: string;
  engine_attestation?: string;
  engine_attestation_signature?: string;
}

export interface RawBatchTrailForBundle {
  batch: { batch_id: string; intended_market: string };
  verdict_records: RawTrailVerdict[];
}

export interface ProofBundle {
  bundleVersion: number;
  generatedAt: string;
  batchId: string;
  intendedMarket: string;
  chaincode: { module: string; integrityFunction: string };
  integrity: {
    algorithm: string;
    digestOrder: string;
    effectiveInputDigest: string;
    records: Array<{
      recordId: string;
      objectType: string;
      sha256: string;
      storedBytesBase64: string;
    }>;
  };
  verdicts: Array<{
    recordId: string;
    status: string;
    engineVersion?: string;
    rulesRelease?: string;
    timestamp?: string;
    attestation: string;
    attestationSignature: string;
  }>;
  attestationPublicKeyPem: string;
}

export const PROOF_BUNDLE_VERSION = 1;

export function buildProofBundle(input: {
  integrity: RawBatchIntegrity;
  trail: RawBatchTrailForBundle;
  attestationPublicKeyPem: string;
  generatedAt: string;
}): ProofBundle {
  // Verdicts recorded before ADR-CT-034 carry neither the attestation nor its
  // signature -- they are listed only if there is something to verify, so a
  // bundle never contains a verdict a reader would wrongly assume was
  // checkable.
  const verdicts = input.trail.verdict_records
    .filter((verdict) => verdict.engine_attestation && verdict.engine_attestation_signature)
    .map((verdict) => ({
      recordId: verdict.record_id,
      status: verdict.status,
      engineVersion: verdict.engine_version,
      rulesRelease: verdict.rules_release,
      timestamp: verdict.timestamp,
      attestation: verdict.engine_attestation!,
      attestationSignature: verdict.engine_attestation_signature!,
    }));

  return {
    bundleVersion: PROOF_BUNDLE_VERSION,
    generatedAt: input.generatedAt,
    batchId: input.trail.batch.batch_id,
    intendedMarket: input.trail.batch.intended_market,
    chaincode: { module: "batch", integrityFunction: "GetBatchIntegrity" },
    integrity: {
      algorithm: input.integrity.algorithm,
      digestOrder: input.integrity.digest_order,
      effectiveInputDigest: input.integrity.effective_input_digest,
      // Normalized to the same camelCase the rest of the bundle uses, so a
      // verifier written against this format never has to know which parts
      // came straight off the ledger.
      records: input.integrity.records.map((record) => ({
        recordId: record.record_id,
        objectType: record.object_type,
        sha256: record.sha256,
        storedBytesBase64: record.stored_bytes_base64,
      })),
    },
    verdicts,
    attestationPublicKeyPem: input.attestationPublicKeyPem,
  };
}
