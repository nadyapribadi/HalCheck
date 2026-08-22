// Assembles the active DatasetRelease from the frozen JSON files under
// dataset/releases/ (docs/12_seed_data_specification.md, Core Screening App
// Dataset Specification section, §17). This is the only place that knows
// which release is "active" — everything else takes a DatasetRelease as input.

import ingredients from "../../dataset/releases/2026.07/ingredients.json";
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
