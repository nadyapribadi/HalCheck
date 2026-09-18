// COA (Certificate of Analysis) intake for ingredient submissions.
//
// The hash that lands on a ledger record must always be this backend's own
// sha256 of the bytes it actually received and stored -- never a value the
// caller supplied. A client-asserted hash could name any content it liked,
// which would defeat Security Threat Model T-006's mitigation outright: the
// point of storing the hash on an immutable record is that retrieval can be
// re-verified against it (storage/minio.ts downloadAndVerify).
//
// This module exists because that hash used to be readable from the request
// body (`req.body.coaFileHash`), while both the code comment beside it and
// docs/17_api_reference.md §5 stated it was server-computed only. Found
// during P5 closure: a documented control with no enforcement behind it is
// exactly the defect class docs/18_vibe_coding_guardrails.md §3 forbids.
import {
  ALLOWED_EVIDENCE_EXTENSIONS,
  downloadAndVerify,
  findObjectKeyByHash,
  uploadFile,
  type UploadResult,
} from "./minio.js";

const ALLOWED = new Set<string>(ALLOWED_EVIDENCE_EXTENSIONS);

export class UnsupportedCoaFileError extends Error {}

export function extensionOf(originalName: string): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "";
  if (!ext || !ALLOWED.has(ext)) {
    throw new UnsupportedCoaFileError(
      `unsupported COA file type "${ext || "(none)"}" -- allowed: ${ALLOWED_EVIDENCE_EXTENSIONS.join(", ")}`,
    );
  }
  return ext;
}

// Object key convention is minio.ts's own: {batchId}/{recordType}/{sha256}.{ext}
// (docs/04_trd.md §11), so the ledger's recorded hash and the stored object's
// name always agree by construction.
export async function storeCoaFile(
  batchId: string,
  file: { buffer: Buffer; originalname: string },
): Promise<UploadResult> {
  return uploadFile(batchId, "ingredient", file.buffer, extensionOf(file.originalname));
}

// The retrieval half of T-006, and the half that had no caller at all until
// ADR-CT-034: `downloadAndVerify` existed, was unit-tested, and was reachable
// from no route -- so the mitigation the threat model rests on had never
// actually run in the product. Reads the object the ledger record names and
// re-hashes it against the hash on that record, every time.
export async function readCoaByHash(
  batchId: string,
  hash: string,
): Promise<{ objectKey: string; content: Buffer }> {
  const objectKey = await findObjectKeyByHash(batchId, "ingredient", hash);
  const content = await downloadAndVerify(objectKey, hash);
  return { objectKey, content };
}
