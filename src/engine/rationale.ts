// Helpers for building structured finding rationale.
//
// buildRationale() is deterministic: given the same structured input it
// always returns the same sentence (FRD-CORE-ENGINE-006). It is never
// free-form or model-generated — every branch maps directly to a field
// already present on the EvaluationResult it explains.

import type { CertifyingBody, FailReason, RecognitionAgreement, StandardRule } from "./types";

export type RationaleInput =
  | { result: "pass"; rule: StandardRule; recognitionAgreement?: RecognitionAgreement }
  | { result: "not_applicable"; reason: string }
  | {
      result: "fail";
      rule: StandardRule;
      failReason: FailReason;
      ingredientName?: string;
      recognitionPair?: { issuingBody: CertifyingBody; requiringBody: CertifyingBody };
    };

const FAIL_REASON_TEXT: Record<FailReason, string> = {
  unverified_ingredient_source: "sourced from a supplier that is not on the verified list",
  missing_certificate_of_analysis: "missing a required Certificate of Analysis",
  line_segregation_not_confirmed: "missing confirmed production line segregation",
  recognition_requirement_not_satisfied: "certified by a body this rule does not recognize",
  other: "flagged for a reason recorded outside the standard catalog",
};

export function buildRationale(input: RationaleInput): string {
  switch (input.result) {
    case "pass":
      if (input.recognitionAgreement) {
        return (
          `Pass — ${input.rule.citation}: certificate recognized under the ` +
          `${input.recognitionAgreement.issuingBody} → ${input.recognitionAgreement.requiringBody} agreement ` +
          `(as of ${input.recognitionAgreement.asOfDate}).`
        );
      }
      return `Pass — ${input.rule.citation}: no gap found against this rule.`;

    case "not_applicable":
      return `Not applicable — ${input.reason}`;

    case "fail": {
      const detail = FAIL_REASON_TEXT[input.failReason];
      const subject = input.ingredientName ? `${input.ingredientName} is` : "This ingredient is";
      if (input.recognitionPair) {
        return (
          `Fail — ${input.rule.citation}: ${subject} ${detail} ` +
          `(${input.recognitionPair.issuingBody} → ${input.recognitionPair.requiringBody} is not a recognized pairing).`
        );
      }
      return `Fail — ${input.rule.citation}: ${subject} ${detail}.`;
    }
  }
}
