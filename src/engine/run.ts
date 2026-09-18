// Orchestrates a full screening run: evaluate() once per applicable rule per
// ingredient record (FRD-CORE-ENGINE-002), then rolls per-ingredient results
// up into one Finding per rule (PRD-CORE-004). A rule not applicable to the
// profile's Intended Market is recorded as not_applicable, never omitted.

import { evaluate } from "./evaluate";
import type {
  DatasetRelease,
  EvaluationResult,
  EvaluationTarget,
  Finding,
  IngredientRecord,
  ScreeningProfile,
  ScreeningRun,
  StandardRule,
} from "./types";

export const ENGINE_VERSION = "0.1.0";

// The standalone app's entry point: it has profiles and records, and the
// dataset release is the only place its reference entries come from, so
// resolving them is this module's job here (FRD-CORE-ENGINE-001's "the
// caller assembles the target" — in this app, the caller and the resolver
// are the same program).
export function runScreening(
  profile: ScreeningProfile,
  ingredientRecords: IngredientRecord[],
  release: DatasetRelease,
): ScreeningRun {
  return runScreeningForTargets(profile, resolveTargets(ingredientRecords, release), release);
}

// The same screening run, over targets the *caller* already assembled
// (types.ts's EvaluationTarget: "assembled by the caller from an
// IngredientRecord plus its resolved reference entries"). Added for
// Compliance Trail's verdict bridge (ADR-CT-033): a batch's records carry
// their own snapshots of every fact the rules consume, and the signed
// attestation binds only those records — so the bridge must not have its
// inputs re-derived from the dataset release behind its back. Nothing else
// in this file changes: runScreening above is this function plus
// resolveTargets, so the standalone app's behavior is bit-for-bit what it
// was, and its 15 tests are unchanged.
export function runScreeningForTargets(
  profile: ScreeningProfile,
  targets: EvaluationTarget[],
  release: DatasetRelease,
): ScreeningRun {
  const runId = crypto.randomUUID();

  const findings: Finding[] = release.standards.map((rule) =>
    evaluateRule(runId, rule, profile, targets, release),
  );

  const overallStatus = findings.some((f) => f.result === "fail") ? "fail" : "pass";

  return {
    runId,
    profileId: profile.profileId,
    datasetReleaseId: release.releaseId,
    engineVersion: ENGINE_VERSION,
    overallStatus,
    runAt: new Date().toISOString(),
    findings,
  };
}

// resolveTargets is the standalone app's assembly step: join each record to
// the dataset release's own entries, and fail loudly (rather than
// evaluating a partially-resolved record) if the release doesn't carry
// them.
export function resolveTargets(
  ingredientRecords: IngredientRecord[],
  release: DatasetRelease,
): EvaluationTarget[] {
  return ingredientRecords.map((record) => {
    const ingredient = release.ingredients.find((i) => i.entryId === record.ingredientEntryId);
    const supplier = release.suppliers.find((s) => s.entryId === record.supplierEntryId);
    if (!ingredient || !supplier) {
      throw new Error(
        `Ingredient record ${record.recordId} references an entry not present in dataset release ${release.releaseId}.`,
      );
    }
    return { record, ingredient, supplier };
  });
}

function evaluateRule(
  runId: string,
  rule: StandardRule,
  profile: ScreeningProfile,
  targets: EvaluationTarget[],
  release: DatasetRelease,
): Finding {
  if (rule.requirementType === "line_segregation") {
    return {
      findingId: crypto.randomUUID(),
      runId,
      ruleId: rule.ruleId,
      result: "not_applicable",
      rationaleText: "Not applicable — line segregation is confirmed at production and is not evaluated by this engine.",
    };
  }

  if (rule.appliesToMarket !== profile.intendedMarket) {
    return {
      findingId: crypto.randomUUID(),
      runId,
      ruleId: rule.ruleId,
      result: "not_applicable",
      rationaleText: `Not applicable — this rule governs the ${rule.appliesToMarket} market; this profile targets ${profile.intendedMarket}.`,
    };
  }

  const results = targets.map((target) => evaluate(target, rule, release.recognitionAgreements));

  return rollUpRuleFinding(runId, rule.ruleId, results);
}

function rollUpRuleFinding(runId: string, ruleId: string, results: EvaluationResult[]): Finding {
  const failed = results.find((r) => r.result === "fail");
  if (failed) {
    return {
      findingId: crypto.randomUUID(),
      runId,
      ruleId,
      result: "fail",
      flaggedRecordId: failed.targetRecordId,
      failReason: failed.failReason,
      recognitionAgreementId: failed.recognitionAgreementId,
      rationaleText: failed.rationaleText,
    };
  }

  const applicable = results.filter((r) => r.result !== "not_applicable");
  if (applicable.length === 0) {
    return {
      findingId: crypto.randomUUID(),
      runId,
      ruleId,
      result: "not_applicable",
      rationaleText: results[0]?.rationaleText ?? "Not applicable — this profile has no ingredients to evaluate against this rule.",
    };
  }

  return {
    findingId: crypto.randomUUID(),
    runId,
    ruleId,
    result: "pass",
    rationaleText: "Pass — no ingredient in this profile fails this rule.",
  };
}
