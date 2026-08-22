// Pure screening evaluator: evaluate(target, rule, recognitions) -> EvaluationResult.
//
// evaluate() judges a single ingredient/sourcing record against a single
// rule. It never looks anything up beyond what it's given, and never touches
// more than one target at a time — runScreening() (src/engine/run.ts) is
// what rolls per-target results up into the one-Finding-per-rule shape
// FRD-CORE-ENGINE-002 and PRD-CORE-004 describe. No network call, no
// wall-clock read, no random value anywhere in this file (FRD-CORE-ENGINE-001).

import { buildRationale } from "./rationale";
import type {
  EvaluationResult,
  EvaluationTarget,
  RecognitionAgreement,
  StandardRule,
} from "./types";

const REQUIRING_BODY_BY_STANDARD: Partial<Record<StandardRule["standard"], "BPJPH" | "JAKIM">> = {
  "BPJPH Halal Requirement": "BPJPH",
  "JAKIM Halal Requirement": "JAKIM",
};

export function evaluate(
  target: EvaluationTarget,
  rule: StandardRule,
  recognitions: RecognitionAgreement[],
): EvaluationResult {
  if (rule.requirementType === "line_segregation") {
    return notApplicable(
      target,
      rule,
      "Line segregation is confirmed at production and is not evaluated by this engine.",
    );
  }

  if (rule.requirementType === "ingredient_source") {
    return evaluateIngredientSource(target, rule);
  }

  return evaluateCertificate(target, rule, recognitions);
}

function evaluateIngredientSource(target: EvaluationTarget, rule: StandardRule): EvaluationResult {
  const { record, ingredient, supplier } = target;

  if (!record.halalRiskFlag || supplier.verificationStatus === "verified") {
    return pass(target, rule);
  }

  return {
    ruleId: rule.ruleId,
    targetRecordId: record.recordId,
    result: "fail",
    failReason: "unverified_ingredient_source",
    rationaleText: buildRationale({
      result: "fail",
      rule,
      failReason: "unverified_ingredient_source",
      ingredientName: ingredient.name,
    }),
  };
}

function evaluateCertificate(
  target: EvaluationTarget,
  rule: StandardRule,
  recognitions: RecognitionAgreement[],
): EvaluationResult {
  const { record, ingredient } = target;
  const issuingBody = record.certificateIssuingBody;
  const requiringBody = REQUIRING_BODY_BY_STANDARD[rule.standard];

  if (!issuingBody || !requiringBody) {
    return notApplicable(
      target,
      rule,
      "This ingredient carries no certificate; the certificate requirement does not apply.",
    );
  }

  if (issuingBody === requiringBody) {
    return pass(target, rule);
  }

  const agreement = recognitions.find(
    (a) => a.issuingBody === issuingBody && a.requiringBody === requiringBody,
  );

  if (agreement?.recognized) {
    return {
      ruleId: rule.ruleId,
      targetRecordId: record.recordId,
      result: "pass",
      recognitionAgreementId: agreement.agreementId,
      rationaleText: buildRationale({ result: "pass", rule, recognitionAgreement: agreement }),
    };
  }

  // No agreement found, or a found agreement explicitly says recognized:false
  // — either way this fails. Absence of an explicit agreement is never
  // treated as implicit recognition (FRD-CORE-ENGINE-004).
  return {
    ruleId: rule.ruleId,
    targetRecordId: record.recordId,
    result: "fail",
    failReason: "recognition_requirement_not_satisfied",
    recognitionAgreementId: agreement?.agreementId,
    rationaleText: buildRationale({
      result: "fail",
      rule,
      failReason: "recognition_requirement_not_satisfied",
      ingredientName: ingredient.name,
      recognitionPair: { issuingBody, requiringBody },
    }),
  };
}

function pass(target: EvaluationTarget, rule: StandardRule): EvaluationResult {
  return {
    ruleId: rule.ruleId,
    targetRecordId: target.record.recordId,
    result: "pass",
    rationaleText: buildRationale({ result: "pass", rule }),
  };
}

function notApplicable(target: EvaluationTarget, rule: StandardRule, reason: string): EvaluationResult {
  return {
    ruleId: rule.ruleId,
    targetRecordId: target.record.recordId,
    result: "not_applicable",
    rationaleText: buildRationale({ result: "not_applicable", reason }),
  };
}
