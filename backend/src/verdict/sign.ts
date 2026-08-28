// Signs a verdict attestation with the backend's ECDSA private key, matching
// chaincode/batch/batch.go's verifyAttestationSignature exactly: SHA-256
// digest, ASN.1 DER signature, base64-encoded. Node's crypto.sign("sha256",
// ..., {dsaEncoding:"der"}) is the proven-live-correct way to replicate Go's
// ecdsa.VerifyASN1(pub, sha256.Sum256(payload), sig) -- letting Node hash
// internally (not pre-hashing) is what made this work in the earlier
// identity-cid capture probe this session.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const KEY_PATH = process.env.VERDICT_ATTESTATION_KEY_PATH;
if (!KEY_PATH) throw new Error("VERDICT_ATTESTATION_KEY_PATH must be set");

const privateKey = createPrivateKey(readFileSync(KEY_PATH));

export function signAttestation(attestationJSON: string): string {
  const signature = sign("sha256", Buffer.from(attestationJSON), { key: privateKey, dsaEncoding: "der" });
  return signature.toString("base64");
}
