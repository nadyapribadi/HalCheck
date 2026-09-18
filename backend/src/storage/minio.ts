// docs/04_trd.md §11: object key convention
// "{batchId}/{recordType}/{sha256hash}.{ext}" -- any file is directly
// locatable from ledger data alone (batchId, recordType, and the hash are
// all already on the ledger record), no separate lookup table. The hash is
// always computed here, server-side, from the actual bytes received --
// never accepted as a client-supplied value (Security Threat Model T-006:
// a client that could name its own hash could claim one file's hash for
// different content, defeating the whole point of recording it).
import { createHash } from "node:crypto";
import { Client } from "minio";

const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucketEnv = process.env.MINIO_BUCKET;
if (!endpoint || !accessKey || !secretKey || !bucketEnv) {
  throw new Error("MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET must be set");
}
const bucket: string = bucketEnv;
// MINIO_ENDPOINT should be an IPv4 literal ("127.0.0.1:9000"), not
// "localhost" -- observed live: on macOS, Node resolves "localhost" IPv6
// first, and each of this client's requests eats a real (multi-second,
// per-request, so it compounds fast) timeout falling back to IPv4 before
// connecting at all. Not a MinIO or minio-js issue, just a DNS-order trap
// this project's own setup docs/.env.example now avoid outright.
const [host, portStr] = endpoint.split(":");
if (!host) throw new Error(`MINIO_ENDPOINT is malformed: ${endpoint}`);

const client = new Client({
  endPoint: host,
  port: portStr ? Number(portStr) : undefined,
  useSSL: false, // local/demo only -- docs/15_config_reference.md's tunnel-activation credential rotation applies before any public exposure
  accessKey,
  secretKey,
});

let bucketReady: Promise<void> | undefined;
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    if (!(await client.bucketExists(bucket))) {
      await client.makeBucket(bucket);
    }
  })();
  return bucketReady;
}

export type RecordType = "ingredient" | "production" | "evidence";

// The only extensions an evidence object can have been stored under
// (storage/coa.ts validates against this same list before uploading).
export const ALLOWED_EVIDENCE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "csv", "txt"] as const;

export interface UploadResult {
  hash: string;
  objectKey: string;
}

// Hashes and uploads content that hasn't been committed to a ledger record
// yet -- callers pass the returned hash into the chaincode submission, so
// the ledger's own copy of the hash and this object's key always agree by
// construction, not by a separate reconciliation step.
export async function uploadFile(
  batchId: string,
  recordType: RecordType,
  content: Buffer,
  ext: string,
): Promise<UploadResult> {
  await ensureBucket();
  const hash = createHash("sha256").update(content).digest("hex");
  const objectKey = `${batchId}/${recordType}/${hash}.${ext}`;
  await client.putObject(bucket, objectKey, content, content.length);
  return { hash, objectKey };
}

export class HashMismatchError extends Error {
  constructor(objectKey: string) {
    super(`retrieved content for ${objectKey} does not match its recorded hash -- possible tampering (T-006)`);
  }
}

export class ObjectNotFoundError extends Error {
  constructor(prefix: string) {
    super(`no stored object matches ${prefix} -- the evidence this record names is not in storage`);
  }
}

// A ledger record stores only the hash (its key convention puts the extension
// in the object name, docs/04_trd.md §11), so retrieval discovers the object
// rather than reconstructing a key it would have to guess. Deterministic: at
// most one HEAD per allowed extension, no listing semantics to get wrong.
export async function findObjectKeyByHash(
  batchId: string,
  recordType: RecordType,
  hash: string,
): Promise<string> {
  await ensureBucket();
  for (const ext of ALLOWED_EVIDENCE_EXTENSIONS) {
    const candidate = `${batchId}/${recordType}/${hash}.${ext}`;
    try {
      await client.statObject(bucket, candidate);
      return candidate;
    } catch {
      // Not this extension; keep looking. A storage outage surfaces as
      // ObjectNotFoundError after the loop, which is the honest answer:
      // nothing could be found for this hash.
    }
  }
  throw new ObjectNotFoundError(`${batchId}/${recordType}/${hash}.<ext>`);
}

// The actual T-006 enforcement point: re-hashes the retrieved bytes and
// compares against what the caller (who read it from the ledger record)
// expects, every retrieval -- not just trusting the object key's own name.
export async function downloadAndVerify(objectKey: string, expectedHash: string): Promise<Buffer> {
  const stream = await client.getObject(bucket, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  const content = Buffer.concat(chunks);
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== expectedHash) {
    throw new HashMismatchError(objectKey);
  }
  return content;
}
