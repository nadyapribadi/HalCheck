// Attribute contracts, verdicts, inputs, and outputs live here.
//
// Shapes mirror docs/06_erd.md's Core Screening App Data Model section. Field
// names are camelCase in code; the ERD's snake_case names map 1:1.

export type CertifyingBody = "BPJPH" | "JAKIM";

export type IntendedMarket = "indonesia" | "malaysia";

export type StandardName =
  | "BPJPH Halal Requirement"
  | "JAKIM Halal Requirement"
  | "CPKB Manufacturing Standard";

export type RequirementType = "ingredient_source" | "certificate" | "line_segregation";

export type EvaluationResultStatus = "pass" | "fail" | "not_applicable";

export type FailReason =
  | "unverified_ingredient_source"
  | "missing_certificate_of_analysis"
  | "line_segregation_not_confirmed"
  | "recognition_requirement_not_satisfied"
  | "other";

export interface StandardRule {
  ruleId: string;
  standard: StandardName;
  citation: string;
  appliesToMarket: IntendedMarket;
  requirementType: RequirementType;
}

export interface IngredientEntry {
  entryId: string;
  name: string;
  defaultHalalRisk: boolean;
  riskNote?: string;
}

export interface SupplierEntry {
  entryId: string;
  name: string;
  verificationStatus: "verified" | "unverified";
}

export interface RecognitionAgreement {
  agreementId: string;
  issuingBody: CertifyingBody;
  requiringBody: CertifyingBody;
  recognized: boolean;
  asOfDate: string;
  note?: string;
}

export interface DatasetRelease {
  releaseId: string;
  frozenAt: string;
  status: "draft" | "verified" | "released";
  standards: StandardRule[];
  ingredients: IngredientEntry[];
  suppliers: SupplierEntry[];
  recognitionAgreements: RecognitionAgreement[];
}

export interface ScreeningProfile {
  profileId: string;
  intendedMarket: IntendedMarket;
  productType: string;
  createdAt: string;
}

export interface IngredientRecord {
  recordId: string;
  profileId: string;
  ingredientEntryId: string;
  supplierEntryId: string;
  /** Auto-populated from the matched IngredientEntry at intake (FRD-CORE-INTAKE-004); only ever set otherwise via an explicit override. */
  halalRiskFlag: boolean;
  overrideReason?: string;
  certificateIssuingBody?: CertifyingBody;
}

/**
 * The resolved, joined view evaluate() actually operates on — assembled by
 * the caller from an IngredientRecord plus its resolved reference entries,
 * so evaluate() itself never has to look anything up (FRD-CORE-ENGINE-001).
 */
export interface EvaluationTarget {
  record: IngredientRecord;
  ingredient: IngredientEntry;
  supplier: SupplierEntry;
}

/** The atomic output of evaluate(): one target checked against one rule. */
export interface EvaluationResult {
  ruleId: string;
  targetRecordId: string;
  result: EvaluationResultStatus;
  failReason?: FailReason;
  recognitionAgreementId?: string;
  rationaleText: string;
}

/**
 * The rule-level rollup reported in a ScreeningRun — matches the FINDING
 * entity in docs/06_erd.md's Core Screening App Data Model section, and the
 * VERDICT_RECORD contract Compliance Trail expects (06_erd.md §10).
 */
export interface Finding {
  findingId: string;
  runId: string;
  ruleId: string;
  result: EvaluationResultStatus;
  flaggedRecordId?: string;
  failReason?: FailReason;
  recognitionAgreementId?: string;
  rationaleText: string;
}

export interface ScreeningRun {
  runId: string;
  profileId: string;
  datasetReleaseId: string;
  engineVersion: string;
  overallStatus: "pass" | "fail";
  runAt: string;
  findings: Finding[];
}
