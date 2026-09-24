import { describe, expect, it } from "vitest";
import { activeDatasetRelease, legacyRecordFacts } from "../loadDatasetRelease";

// ADR-CT-036: two kinds of data that used to share one file, and must not
// again. The release is the *screening vocabulary* -- what the app offers and
// the engine resolves. The legacy facts are a compatibility shim for ledger
// records written before the supplier snapshot existed. Mixing them is how a
// workaround for one old record became a selectable ingredient in a public
// demo.
describe("dataset release vs pre-snapshot compatibility data", () => {
  it("keeps compatibility-only values out of the screening vocabulary", () => {
    const ingredientNames = activeDatasetRelease.ingredients.map((entry) => entry.name);
    const supplierNames = activeDatasetRelease.suppliers.map((entry) => entry.name);

    // The values that exist *only* because of the compatibility shim -- these
    // are the two that leaked into a screenshot as if they were demo data.
    expect(ingredientNames).not.toContain("Test1");
    expect(supplierNames).not.toContain("PT Test1");
  });

  it("lets the two files overlap only where they agree", () => {
    // A canonical supplier may legitimately be both release vocabulary and a
    // pre-snapshot fact; overlap is not a leak, but disagreement would be --
    // the fallback and the vocabulary must never tell different stories about
    // the same supplier.
    expect(activeDatasetRelease.suppliers.some((s) => s.name === "PT Distribusi Kosmetik Prima")).toBe(true);

    for (const supplier of activeDatasetRelease.suppliers) {
      const legacy = legacyRecordFacts.supplierVerificationStatus[supplier.name];
      if (legacy) expect(legacy).toBe(supplier.verificationStatus);
    }
  });

  it("still covers every supplier a pre-snapshot record can name", () => {
    // The suppliers referenced by ingredient records written before
    // 2026-09-18 (docs/14 §1.10 lists them live). If one is missing here, the
    // verdict bridge throws for that record instead of evaluating it.
    expect(legacyRecordFacts.supplierVerificationStatus["PT Sumber Alam Nusantara"]).toBe("verified");
    expect(legacyRecordFacts.supplierVerificationStatus["PT Distribusi Kosmetik Prima"]).toBe("unverified");
    expect(legacyRecordFacts.supplierVerificationStatus["PT Test1"]).toBe("verified");
  });

  it("explains itself, so the next reader can delete it safely", () => {
    expect(legacyRecordFacts.purpose.length).toBeGreaterThan(0);
    expect(legacyRecordFacts.why.length).toBeGreaterThan(0);
    expect(legacyRecordFacts.deleteWhen.length).toBeGreaterThan(0);
  });
});
