import { describe, expect, it } from "vitest";
import { ingredientArgs, normalizeIngredientBody } from "./batch.js";

// Security Threat Model T-006 relies on the COA hash stored on a ledger
// record being the backend's own sha256 of bytes it actually received and
// stored (storage/coa.ts), because retrieval is re-verified against it
// (storage/minio.ts downloadAndVerify). While this route read
// `req.body.coaFileHash`, any caller could assert a hash for content that
// was never uploaded -- a documented control with no enforcement behind it.
describe("ingredient submission args", () => {
  it("ignores a client-supplied coaFileHash and passes only the server-computed one", () => {
    const body = normalizeIngredientBody({
      name: "Aqua",
      source: "PT Sumber Alam Nusantara",
      halalRiskFlag: false,
      coaFileHash: "deadbeef-attacker-supplied",
    });

    // Args order is chaincode/batch.go recordIngredient's own parameter list;
    // the COA hash is the last one.
    expect(ingredientArgs("SL-2026-900", body, "")).toEqual([
      "SL-2026-900",
      "Aqua",
      "PT Sumber Alam Nusantara",
      "false",
      "false",
      "",
      "",
    ]);
    const withServerHash = ingredientArgs("SL-2026-900", body, "server-hash");
    expect(withServerHash[withServerHash.length - 1]).toBe("server-hash");
    expect(withServerHash).not.toContain("deadbeef-attacker-supplied");
  });

  it("coerces multipart string booleans so an upload can't smuggle in what JSON would reject", () => {
    const body = normalizeIngredientBody({
      name: "Cetyl Alcohol",
      source: "PT Sumber Alam Nusantara",
      halalRiskFlag: "true",
      overrideReason: "supplier evidence verified out of band",
    });

    expect(body.halalRiskFlag).toBe(true);
    expect(ingredientArgs("SL-2026-900", body, "")[3]).toBe("true");
  });
});
