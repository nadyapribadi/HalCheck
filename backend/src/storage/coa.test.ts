import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UnsupportedCoaFileError, extensionOf, storeCoaFile } from "./coa.js";
import { downloadAndVerify } from "./minio.js";

describe("storeCoaFile", () => {
  it("computes the hash from the bytes received, and the stored object matches it", async () => {
    const content = Buffer.from("%PDF-1.4 stage-3 coa fixture\n");
    const expected = createHash("sha256").update(content).digest("hex");

    const stored = await storeCoaFile("SL-2026-900", { buffer: content, originalname: "coa.pdf" });

    expect(stored.hash).toBe(expected);
    expect(stored.objectKey).toBe(`SL-2026-900/ingredient/${expected}.pdf`);

    const retrieved = await downloadAndVerify(stored.objectKey, stored.hash);
    expect(retrieved.equals(content)).toBe(true);
  });

  it("rejects a file whose extension isn't an accepted evidence type", async () => {
    await expect(
      storeCoaFile("SL-2026-900", { buffer: Buffer.from("x"), originalname: "payload.exe" }),
    ).rejects.toBeInstanceOf(UnsupportedCoaFileError);
  });

  it("treats a missing extension as unsupported rather than guessing one", () => {
    expect(() => extensionOf("certificate")).toThrow(UnsupportedCoaFileError);
  });
});
