// Independent verification of a Compliance Trail proof bundle (ADR-CT-034).
//
// This module is deliberately standalone: no application imports, no Fabric
// client, no network, no login. Give it a bundle and it either reproduces the
// batch's recorded digest from the records inside it, or it says which check
// failed. That is the whole difference between "the system says this record
// is intact" and "anyone can see for themselves that it is".
//
// Runs unchanged in Node (the CLI) and in the browser (the /verify screen) --
// both expose WebCrypto as `crypto.subtle`. The signature format is ASN.1 DER
// over SHA-256 (what backend/src/verdict/sign.ts produces and what
// chaincode/batch/batch.go verifies with ecdsa.VerifyASN1); WebCrypto wants
// the raw r||s form, so the conversion lives here, in one place.

export interface ProofBundleRecord {
  recordId: string;
  objectType: string;
  sha256: string;
  storedBytesBase64: string;
}

export interface ProofBundleVerdict {
  recordId: string;
  status: string;
  engineVersion?: string;
  rulesRelease?: string;
  timestamp?: string;
  attestation: string;
  attestationSignature: string;
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
    records: ProofBundleRecord[];
  };
  verdicts: ProofBundleVerdict[];
  attestationPublicKeyPem: string;
}

export type ProofCheckStatus = "pass" | "fail" | "info";

export interface ProofCheck {
  id: string;
  label: string;
  status: ProofCheckStatus;
  detail: string;
}

export interface ProofVerificationReport {
  /** True when no check failed; "info" findings never make a bundle invalid. */
  ok: boolean;
  batchId: string;
  checks: ProofCheck[];
}

export class ProofBundleFormatError extends Error {}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(value: string): Uint8Array {
  // atob is a global in every browser and in Node 16+, so one code path serves
  // both consumers (the CLI and the browser) with no Node-only types leaking
  // into a module the frontend also compiles.
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  if (!body) throw new ProofBundleFormatError("public key PEM contains no key material");
  return base64ToBytes(body);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

// One DER INTEGER, left-padded to `size` bytes with leading zeros stripped --
// the two encodings differ only in how a positive big-endian integer is
// framed, so this is the whole conversion.
function readDerInteger(der: Uint8Array, offset: number, size: number): { value: Uint8Array; next: number } {
  if (der[offset] !== 0x02) throw new ProofBundleFormatError("expected a DER INTEGER in the signature");
  const length = der[offset + 1]!;
  const start = offset + 2;
  let value = der.slice(start, start + length);
  let firstSignificant = 0;
  while (firstSignificant < value.length - 1 && value[firstSignificant] === 0) firstSignificant += 1;
  value = value.slice(firstSignificant);
  if (value.length > size) throw new ProofBundleFormatError("signature component is larger than the curve size");
  const padded = new Uint8Array(size);
  padded.set(value, size - value.length);
  return { value: padded, next: start + length };
}

export function derSignatureToRaw(der: Uint8Array, size = 32): Uint8Array {
  if (der[0] !== 0x30) throw new ProofBundleFormatError("signature is not a DER SEQUENCE");
  let offset = 2;
  if ((der[1]! & 0x80) !== 0) offset = 2 + (der[1]! & 0x7f); // long-form length
  const r = readDerInteger(der, offset, size);
  const s = readDerInteger(der, r.next, size);
  const raw = new Uint8Array(size * 2);
  raw.set(r.value, 0);
  raw.set(s.value, size);
  return raw;
}

async function importAttestationKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToDer(pem) as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

function isBundle(value: unknown): value is ProofBundle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProofBundle>;
  return (
    typeof candidate.batchId === "string" &&
    typeof candidate.attestationPublicKeyPem === "string" &&
    !!candidate.integrity &&
    Array.isArray(candidate.integrity.records) &&
    typeof candidate.integrity.effectiveInputDigest === "string" &&
    Array.isArray(candidate.verdicts)
  );
}

// The digest rule is not configurable, and that is the point: a verifier that
// could be told which order to hash in could be told the wrong one. Records
// are concatenated in the order the bundle presents them, which
// BatchIntegrity.DigestOrder states in words for a human reader.
export async function verifyProofBundle(bundle: unknown): Promise<ProofVerificationReport> {
  if (!isBundle(bundle)) {
    throw new ProofBundleFormatError("this is not a proof bundle: expected batchId, integrity.records and verdicts");
  }

  const checks: ProofCheck[] = [];
  const decoded: Array<{ record: ProofBundleRecord; bytes: Uint8Array }> = [];

  for (const record of bundle.integrity.records) {
    const bytes = base64ToBytes(record.storedBytesBase64);
    decoded.push({ record, bytes });
    const actual = await sha256Hex(bytes);
    checks.push({
      id: `record-hash:${record.recordId}`,
      label: `Record ${record.objectType} ${record.recordId.slice(0, 12)}… hashes to the value the bundle states`,
      status: actual === record.sha256 ? "pass" : "fail",
      detail: actual === record.sha256 ? actual : `claimed ${record.sha256}, recomputed ${actual}`,
    });
  }

  const concatenated = new Uint8Array(decoded.reduce((total, entry) => total + entry.bytes.length, 0));
  let cursor = 0;
  for (const entry of decoded) {
    concatenated.set(entry.bytes, cursor);
    cursor += entry.bytes.length;
  }
  const recomputedDigest = await sha256Hex(concatenated);
  checks.push({
    id: "batch-digest",
    label: `The ${bundle.integrity.records.length} records recompute to the batch's effective input digest`,
    status: recomputedDigest === bundle.integrity.effectiveInputDigest ? "pass" : "fail",
    detail:
      recomputedDigest === bundle.integrity.effectiveInputDigest
        ? recomputedDigest
        : `claimed ${bundle.integrity.effectiveInputDigest}, recomputed ${recomputedDigest}`,
  });

  let key: CryptoKey | null = null;
  try {
    key = await importAttestationKey(bundle.attestationPublicKeyPem);
    checks.push({
      id: "public-key",
      label: "The bundle's public key is a readable P-256 attestation key",
      status: "pass",
      detail: "SPKI parsed",
    });
  } catch (err) {
    checks.push({
      id: "public-key",
      label: "The bundle's public key is a readable P-256 attestation key",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const recordIds = new Set(decoded.map((entry) => entry.record.recordId));

  if (bundle.verdicts.length === 0) {
    checks.push({
      id: "verdicts",
      label: "Signed verdicts present in the bundle",
      status: "info",
      detail: "no verdict in this bundle carries a stored attestation (recorded before attestation storage existed, or no verdict yet)",
    });
  }

  for (const verdict of bundle.verdicts) {
    let attestation: { batch_id?: string; input_digest?: string; result?: string; flagged_record_id?: string } = {};
    try {
      attestation = JSON.parse(verdict.attestation) as typeof attestation;
    } catch (err) {
      checks.push({
        id: `attestation-parse:${verdict.recordId}`,
        label: `Verdict ${verdict.recordId.slice(0, 12)}… carries a parseable attestation`,
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (key) {
      let signatureValid = false;
      let detail = "signature could not be decoded";
      try {
        const signature = derSignatureToRaw(base64ToBytes(verdict.attestationSignature));
        signatureValid = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          key,
          signature as unknown as ArrayBuffer,
          new TextEncoder().encode(verdict.attestation) as unknown as ArrayBuffer,
        );
        detail = signatureValid
          ? `signed over SHA-256 of the attestation by the key in this bundle (verdict status: ${verdict.status})`
          : "the signature does not verify against the attestation and key in this bundle";
      } catch (err) {
        detail = err instanceof Error ? err.message : String(err);
      }
      checks.push({
        id: `attestation-signature:${verdict.recordId}`,
        label: `Verdict ${verdict.recordId.slice(0, 12)}… carries a valid ECDSA attestation signature`,
        status: signatureValid ? "pass" : "fail",
        detail,
      });
    }

    checks.push({
      id: `attestation-batch:${verdict.recordId}`,
      label: `Verdict ${verdict.recordId.slice(0, 12)}… attests to this batch`,
      status: attestation.batch_id === bundle.batchId ? "pass" : "fail",
      detail: `attestation batch_id ${attestation.batch_id ?? "(missing)"} vs bundle ${bundle.batchId}`,
    });

    // Informational by design: a Fail that was later corrected legitimately
    // cites a digest the batch no longer produces. Tampering is caught by the
    // signature check above, not by this one.
    const consistent = attestation.input_digest === recomputedDigest;
    checks.push({
      id: `attestation-digest:${verdict.recordId}`,
      label: `Verdict ${verdict.recordId.slice(0, 12)}… was decided on the batch's current records`,
      status: "info",
      detail: consistent
        ? "yes -- the attested digest is the digest these records produce"
        : "no -- this verdict was recorded against an earlier state of the batch (a later correction, for example)",
    });

    if (attestation.result === "fail" || verdict.status === "fail") {
      const flagged = attestation.flagged_record_id;
      checks.push({
        id: `flagged-record:${verdict.recordId}`,
        label: `Verdict ${verdict.recordId.slice(0, 12)}… names a record that is in this bundle`,
        status: flagged && recordIds.has(flagged) ? "pass" : "fail",
        detail: flagged ? `flagged ${flagged.slice(0, 12)}…` : "no flagged_record_id in a fail attestation",
      });
    }
  }

  return {
    ok: checks.every((check) => check.status !== "fail"),
    batchId: bundle.batchId,
    checks,
  };
}
