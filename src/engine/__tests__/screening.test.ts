// Engine-level fixtures for the three canonical scenarios in
// docs/12_seed_data_specification.md §16 (Core Screening App Dataset
// Specification section) — the same SL-2026-00x batches Compliance Trail's
// seed data assumes this engine produces.

import { describe, expect, it } from "vitest";
import { activeDatasetRelease } from "../../data/loadDatasetRelease";
import { evaluate } from "../evaluate";
import { runScreening } from "../run";
import type { IngredientRecord, ScreeningProfile } from "../types";

function ingredientRecord(
  recordId: string,
  ingredientEntryId: string,
  supplierEntryId: string,
  overrides: Partial<IngredientRecord> = {},
): IngredientRecord {
  const entry = activeDatasetRelease.ingredients.find((i) => i.entryId === ingredientEntryId);
  if (!entry) {
    throw new Error(`Fixture error: unknown ingredient entry ${ingredientEntryId}`);
  }
  return {
    recordId,
    profileId: "profile-under-test",
    ingredientEntryId,
    supplierEntryId,
    halalRiskFlag: entry.defaultHalalRisk,
    ...overrides,
  };
}

const malaysiaProfile: ScreeningProfile = {
  profileId: "profile-under-test",
  intendedMarket: "malaysia",
  productType: "cosmetic",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Scenario A — happy path (~ SL-2026-001)", () => {
  it("passes every applicable rule with six verified-source ingredients", () => {
    const records = [
      ingredientRecord("r1", "ing-aqua", "sup-pt-sumber-alam-nusantara"),
      ingredientRecord("r2", "ing-glycerin", "sup-pt-sumber-alam-nusantara"),
      ingredientRecord("r3", "ing-niacinamide", "sup-pt-sumber-alam-nusantara"),
      ingredientRecord("r4", "ing-centella-asiatica-extract", "sup-pt-sumber-alam-nusantara"),
      ingredientRecord("r5", "ing-panthenol", "sup-pt-sumber-alam-nusantara"),
      ingredientRecord("r6", "ing-phenoxyethanol", "sup-pt-sumber-alam-nusantara"),
    ];

    const run = runScreening(malaysiaProfile, records, activeDatasetRelease);

    expect(run.overallStatus).toBe("pass");
    expect(run.findings.some((f) => f.result === "fail")).toBe(false);
    expect(run.datasetReleaseId).toBe(activeDatasetRelease.releaseId);
  });
});

describe("Scenario B — gap + correction (~ SL-2026-002)", () => {
  const baseIngredients = [
    ingredientRecord("r1", "ing-aqua", "sup-pt-sumber-alam-nusantara"),
    ingredientRecord("r2", "ing-glycerin", "sup-pt-sumber-alam-nusantara"),
    ingredientRecord("r3", "ing-niacinamide", "sup-pt-sumber-alam-nusantara"),
    ingredientRecord("r4", "ing-panthenol", "sup-pt-sumber-alam-nusantara"),
  ];

  it("fails on the unverified Cetyl Alcohol source, flagging that exact record", () => {
    const withGap = [
      ...baseIngredients,
      ingredientRecord("r5", "ing-cetyl-alcohol", "sup-pt-distribusi-kosmetik-prima"),
    ];

    const run = runScreening(malaysiaProfile, withGap, activeDatasetRelease);

    expect(run.overallStatus).toBe("fail");

    const finding = run.findings.find((f) => f.ruleId === "JAKIM-ING-001");
    expect(finding?.result).toBe("fail");
    expect(finding?.flaggedRecordId).toBe("r5");
    expect(finding?.failReason).toBe("unverified_ingredient_source");
  });

  it("passes once the flagged record's source is corrected to a verified supplier", () => {
    const corrected = [
      ...baseIngredients,
      ingredientRecord("r5", "ing-cetyl-alcohol", "sup-pt-kimia-hijau-indonesia"),
    ];

    const run = runScreening(malaysiaProfile, corrected, activeDatasetRelease);

    expect(run.overallStatus).toBe("pass");
  });
});

describe("Scenario C — recognition edge case (~ SL-2026-003)", () => {
  const indonesiaProfile: ScreeningProfile = {
    ...malaysiaProfile,
    intendedMarket: "indonesia",
  };

  it("fails the BPJPH certificate rule when only a JAKIM certificate is held", () => {
    const records = [
      ingredientRecord("r1", "ing-aqua", "sup-pt-sumber-alam-nusantara", {
        certificateIssuingBody: "JAKIM",
      }),
    ];

    const run = runScreening(indonesiaProfile, records, activeDatasetRelease);

    const certFinding = run.findings.find((f) => f.ruleId === "BPJPH-CERT-001");
    expect(certFinding?.result).toBe("fail");
    expect(certFinding?.failReason).toBe("recognition_requirement_not_satisfied");
    expect(certFinding?.recognitionAgreementId).toBe("rec-jakim-to-bpjph");
    expect(certFinding?.rationaleText).toContain("JAKIM");
    expect(certFinding?.rationaleText).toContain("BPJPH");
  });

  it("passes the ingredient_source rule for a clear ingredient regardless of the certificate outcome", () => {
    const records = [
      ingredientRecord("r1", "ing-aqua", "sup-pt-sumber-alam-nusantara", {
        certificateIssuingBody: "JAKIM",
      }),
    ];

    const run = runScreening(indonesiaProfile, records, activeDatasetRelease);

    const sourceFinding = run.findings.find((f) => f.ruleId === "BPJPH-ING-001");
    expect(sourceFinding?.result).toBe("pass");
  });
});

describe("recognition-directionality asymmetry", () => {
  it("recognizes BPJPH -> JAKIM but not JAKIM -> BPJPH", () => {
    const bpjphToJakim = activeDatasetRelease.recognitionAgreements.find(
      (a) => a.issuingBody === "BPJPH" && a.requiringBody === "JAKIM",
    );
    const jakimToBpjph = activeDatasetRelease.recognitionAgreements.find(
      (a) => a.issuingBody === "JAKIM" && a.requiringBody === "BPJPH",
    );

    expect(bpjphToJakim?.recognized).toBe(true);
    expect(jakimToBpjph?.recognized).toBe(false);
  });
});

describe("evaluate() purity (FRD-CORE-ENGINE-001)", () => {
  it("returns identical output for identical input, called twice", () => {
    const rule = activeDatasetRelease.standards.find((r) => r.ruleId === "JAKIM-ING-001");
    const ingredient = activeDatasetRelease.ingredients.find((i) => i.entryId === "ing-cetyl-alcohol");
    const supplier = activeDatasetRelease.suppliers.find(
      (s) => s.entryId === "sup-pt-distribusi-kosmetik-prima",
    );
    if (!rule || !ingredient || !supplier) {
      throw new Error("Fixture error: expected dataset entries not found.");
    }

    const target = {
      record: ingredientRecord("r1", "ing-cetyl-alcohol", "sup-pt-distribusi-kosmetik-prima"),
      ingredient,
      supplier,
    };

    const first = evaluate(target, rule, activeDatasetRelease.recognitionAgreements);
    const second = evaluate(target, rule, activeDatasetRelease.recognitionAgreements);

    expect(first).toEqual(second);
  });
});

describe("rule not silently omitted when inapplicable (FRD-CORE-ENGINE-002)", () => {
  it("still reports a not_applicable Finding for a rule outside the profile's market", () => {
    const run = runScreening(malaysiaProfile, [], activeDatasetRelease);

    const bpjphFinding = run.findings.find((f) => f.ruleId === "BPJPH-ING-001");
    expect(bpjphFinding).toBeDefined();
    expect(bpjphFinding?.result).toBe("not_applicable");
  });
});
