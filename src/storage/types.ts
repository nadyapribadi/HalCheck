import type { IngredientRecord, ScreeningProfile, ScreeningRun } from "../engine/types";

/**
 * Bump this whenever StoredScreeningState's shape changes. loadScreeningState()
 * refuses to read a mismatched version rather than guess at it
 * (FRD-CORE-STORAGE-002) — add a migration step here when that's needed.
 */
export const STORAGE_SCHEMA_VERSION = 1;

export interface StoredScreeningState {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  profile: ScreeningProfile;
  ingredientRecords: IngredientRecord[];
  run: ScreeningRun | null;
  savedAt: string;
}

export type LoadResult =
  | { status: "found"; state: StoredScreeningState }
  | { status: "not_found" }
  | { status: "unreadable"; reason: string };
