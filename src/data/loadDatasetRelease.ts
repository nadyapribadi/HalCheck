// Assembles the active DatasetRelease from the frozen JSON files under
// dataset/releases/ (docs/12_seed_data_specification.md, Core Screening App
// Dataset Specification section, §17). This is the only place that knows
// which release is "active" — everything else takes a DatasetRelease as input.

import ingredients from "../../dataset/releases/2026.07/ingredients.json";
import legacyRecordFactsJson from "../../dataset/releases/2026.07/legacy-record-facts.json";
import recognitionAgreements from "../../dataset/releases/2026.07/recognition_agreements.json";
import release from "../../dataset/releases/2026.07/release.json";
import standards from "../../dataset/releases/2026.07/standards.json";
import suppliers from "../../dataset/releases/2026.07/suppliers.json";
import type { DatasetRelease } from "../engine/types";

export const activeDatasetRelease: DatasetRelease = {
  ...release,
  standards,
  ingredients,
  suppliers,
  recognitionAgreements,
} as DatasetRelease;

// Compatibility data for ingredient records written before 2026-09-18, which
// carry no supplier_verification_status of their own (ADR-CT-033). It lives
// beside the release because it is frozen with it, and deliberately NOT inside
// it: these names are not the screening vocabulary -- they are what the
// governed reference list said on the day the snapshot rule took effect.
// Keeping the two apart is what stops a compatibility shim for old ledger
// records from showing up as a selectable ingredient in the screening app
// (ADR-CT-036).
export interface LegacyRecordFacts {
  purpose: string;
  why: string;
  deleteWhen: string;
  supplierVerificationStatus: Record<string, "verified" | "unverified">;
}

export const legacyRecordFacts = legacyRecordFactsJson as LegacyRecordFacts;
