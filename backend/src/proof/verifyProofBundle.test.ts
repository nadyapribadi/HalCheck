import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ProofBundleFormatError,
  verifyProofBundle,
  type ProofBundle,
  type ProofBundleVerdict,
} from "../../../src/proof/verifyProofBundle";

// These use a locally generated P-256 key and the same DER signing Node uses
// in the backend, so the verifier is exercised against the real signature
// format rather than a fixture -- and every failure mode below is a mutation
// of one field of an otherwise valid bundle.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(recordId: string, objectType: string, payload: Record<string, unknown>) {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  return { recordId, objectType, sha256: sha256Hex(bytes), storedBytesBase64: bytes.toString("base64") };
}

function attestationFor(batchId: string, inputDigest: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    batch_id: batchId,
    input_digest: inputDigest,
    intended_market: "Malaysia",
    engine_version: "0.1.0",
    rules_release: "2026.07",
    result: "pass",
    regulation_value: "JAKIM HC-2024",
    ...overrides,
  });
}

function signAttestation(attestation: string, key = privateKey): string {
  return sign("sha256", Buffer.from(attestation), { key, dsaEncoding: "der" }).toString("base64");
}

function bundleFixture(overrides: { verdict?: Partial<ProofBundleVerdict> } = {}): ProofBundle {
  const records = [
    record("ing-1", "ingredientRecord", { record_id: "ing-1", halal_risk_flag: false }),
    record("prod-1", "productionRecord", { record_id: "prod-1", line_segregation_confirmed: true }),
  ];
  const digest = sha256Hex(Buffer.concat(records.map((r) => Buffer.from(r.storedBytesBase64, "base64"))));
  const attestation = attestationFor("SL-2026-900", digest);

  return {
    bundleVersion: 1,
    generatedAt: "2026-09-18T00:00:00.000Z",
    batchId: "SL-2026-900",
    intendedMarket: "Malaysia",
    chaincode: { module: "batch", integrityFunction: "GetBatchIntegrity" },
    integrity: {
      algorithm: "sha256",
      digestOrder: "ingredient records in ledger key order, then production records in ledger key order",
      effectiveInputDigest: digest,
      records,
    },
    verdicts: [
      {
        recordId: "verdict-1",
        status: "pass",
        attestation,
        attestationSignature: signAttestation(attestation),
        ...overrides.verdict,
      },
    ],
    attestationPublicKeyPem: publicKeyPem,
  };
}

function statusOf(report: Awaited<ReturnType<typeof verifyProofBundle>>, id: string): string {
  return report.checks.find((check) => check.id === id)?.status ?? "(missing check)";
}

describe("verifyProofBundle", () => {
  it("passes a bundle whose records, digest and signature all agree", async () => {
    const report = await verifyProofBundle(bundleFixture());

    expect(report.ok).toBe(true);
    expect(statusOf(report, "record-hash:ing-1")).toBe("pass");
    expect(statusOf(report, "batch-digest")).toBe("pass");
    expect(statusOf(report, "attestation-signature:verdict-1")).toBe("pass");
    expect(statusOf(report, "attestation-batch:verdict-1")).toBe("pass");
  });

  // The PRD's own acceptance wording: attempt an edit, observe the failure.
  it("fails when one byte of a record is altered", async () => {
    const bundle = bundleFixture();
    const bytes = Buffer.from(bundle.integrity.records[0]!.storedBytesBase64, "base64");
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0x01;
    bundle.integrity.records[0]!.storedBytesBase64 = bytes.toString("base64");

    const report = await verifyProofBundle(bundle);

    expect(report.ok).toBe(false);
    expect(statusOf(report, "record-hash:ing-1")).toBe("fail");
    expect(statusOf(report, "batch-digest")).toBe("fail");
  });

  it("fails when the recorded hash is rewritten to match altered bytes", async () => {
    const bundle = bundleFixture();
    const bytes = Buffer.from(bundle.integrity.records[0]!.storedBytesBase64, "base64");
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0x01;
    bundle.integrity.records[0]!.storedBytesBase64 = bytes.toString("base64");
    bundle.integrity.records[0]!.sha256 = sha256Hex(bytes);

    const report = await verifyProofBundle(bundle);

    // The record's own hash agrees with its bytes now, but the batch digest
    // does not -- which is what makes rewriting one field insufficient.
    expect(statusOf(report, "record-hash:ing-1")).toBe("pass");
    expect(statusOf(report, "batch-digest")).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("fails when the attestation is altered after signing", async () => {
    const bundle = bundleFixture();
    const altered = attestationFor("SL-2026-900", bundle.integrity.effectiveInputDigest, { result: "pass", engine_version: "9.9.9" });
    bundle.verdicts[0]!.attestation = altered;

    const report = await verifyProofBundle(bundle);

    expect(statusOf(report, "attestation-signature:verdict-1")).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("fails when the signature comes from a different key than the bundle publishes", async () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
    const bundle = bundleFixture();
    bundle.verdicts[0]!.attestationSignature = signAttestation(bundle.verdicts[0]!.attestation, other);

    const report = await verifyProofBundle(bundle);

    expect(statusOf(report, "attestation-signature:verdict-1")).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("fails when the attestation is for a different batch", async () => {
    const bundle = bundleFixture();
    const attestation = attestationFor("SL-2026-901", bundle.integrity.effectiveInputDigest);
    bundle.verdicts[0]!.attestation = attestation;
    bundle.verdicts[0]!.attestationSignature = signAttestation(attestation);

    const report = await verifyProofBundle(bundle);

    expect(statusOf(report, "attestation-batch:verdict-1")).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("fails when a fail verdict names a record that is not in the bundle", async () => {
    const bundle = bundleFixture();
    const attestation = attestationFor("SL-2026-900", bundle.integrity.effectiveInputDigest, {
      result: "fail",
      fail_reason: "Unverified ingredient source",
      flagged_record_id: "does-not-exist",
    });
    bundle.verdicts[0]!.attestation = attestation;
    bundle.verdicts[0]!.attestationSignature = signAttestation(attestation);
    bundle.verdicts[0]!.status = "fail";

    const report = await verifyProofBundle(bundle);

    expect(statusOf(report, "flagged-record:verdict-1")).toBe("fail");
    expect(report.ok).toBe(false);
  });

  // A corrected batch legitimately has a Fail verdict whose attested digest
  // no longer matches the current records. That must read as history, not as
  // tampering -- otherwise the strongest recovery story in the product would
  // look like an integrity failure.
  it("reports a verdict decided on an earlier batch state as information, not failure", async () => {
    const bundle = bundleFixture();
    const attestation = attestationFor("SL-2026-900", "a-digest-from-before-the-correction");
    bundle.verdicts[0]!.attestation = attestation;
    bundle.verdicts[0]!.attestationSignature = signAttestation(attestation);

    const report = await verifyProofBundle(bundle);

    expect(statusOf(report, "attestation-digest:verdict-1")).toBe("info");
    expect(report.ok).toBe(true);
  });

  it("rejects input that is not a proof bundle", async () => {
    await expect(verifyProofBundle({ batchId: "SL-2026-900" })).rejects.toThrow(ProofBundleFormatError);
    await expect(verifyProofBundle("not a bundle")).rejects.toThrow(ProofBundleFormatError);
  });
});
