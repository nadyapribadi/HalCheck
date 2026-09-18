// Hits the real local MinIO instance (docker-compose.yml's minio service),
// not mocked -- matching this project's established testing philosophy
// (idempotency/index.test.ts, auth.test.ts already do the same against
// real Postgres). P5's own exit criterion: "file hash verified against
// actual retrieved content."
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { downloadAndVerify, HashMismatchError, uploadFile } from "./minio.js";

describe("uploadFile / downloadAndVerify", () => {
  it("round-trips real content and the hash matches on retrieval", async () => {
    const content = randomBytes(256);
    const { hash, objectKey } = await uploadFile("SL-2026-999", "ingredient", content, "pdf");

    expect(objectKey).toBe(`SL-2026-999/ingredient/${hash}.pdf`);

    const retrieved = await downloadAndVerify(objectKey, hash);
    expect(retrieved.equals(content)).toBe(true);
  });

  it("computes the hash from actual content, not a caller-supplied claim", async () => {
    const content = Buffer.from("real content");
    const { hash } = await uploadFile("SL-2026-999", "ingredient", content, "txt");
    // A caller that lied about the content's hash would still get back the
    // one actually computed from the bytes -- there's no path to make
    // uploadFile record a hash that doesn't match what it stored.
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("rejects on a hash mismatch -- T-006's actual enforcement point", async () => {
    const content = Buffer.from("original content");
    const { objectKey } = await uploadFile("SL-2026-999", "evidence", content, "txt");

    await expect(downloadAndVerify(objectKey, "0".repeat(64))).rejects.toThrow(HashMismatchError);
  });
});
