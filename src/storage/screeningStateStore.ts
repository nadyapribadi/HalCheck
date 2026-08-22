// Persists a screening run to local storage only (FRD-CORE-STORAGE-001).
// Nothing in this file makes a network call — nothing entered during intake
// ever leaves the device (FRD-CORE-STORAGE-003). Storage schema is
// versioned; a stored record from an unrecognized schema version is flagged
// unreadable, never silently misread (FRD-CORE-STORAGE-002).

import type { IngredientRecord, ScreeningProfile, ScreeningRun } from "../engine/types";
import { resolveDefaultStorageAdapter, type StorageAdapter } from "./storageAdapter";
import { STORAGE_SCHEMA_VERSION, type LoadResult, type StoredScreeningState } from "./types";

const KEY_PREFIX = "halcheck:core:screening:";

function keyFor(profileId: string): string {
  return `${KEY_PREFIX}${profileId}`;
}

export function saveScreeningState(
  profile: ScreeningProfile,
  ingredientRecords: IngredientRecord[],
  run: ScreeningRun | null,
  storage: StorageAdapter = resolveDefaultStorageAdapter(),
): void {
  const state: StoredScreeningState = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    profile,
    ingredientRecords,
    run,
    savedAt: new Date().toISOString(),
  };
  storage.setItem(keyFor(profile.profileId), JSON.stringify(state));
}

export function loadScreeningState(
  profileId: string,
  storage: StorageAdapter = resolveDefaultStorageAdapter(),
): LoadResult {
  const raw = storage.getItem(keyFor(profileId));
  if (raw === null) {
    return { status: "not_found" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unreadable", reason: "Stored value is not valid JSON." };
  }

  if (!isPlainRecord(parsed) || typeof parsed.schemaVersion !== "number") {
    return { status: "unreadable", reason: "Stored value has no recognizable schema version." };
  }

  if (parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) {
    return {
      status: "unreadable",
      reason:
        `Stored schema version ${parsed.schemaVersion} is not supported by this build ` +
        `(expects ${STORAGE_SCHEMA_VERSION}). No migration exists yet.`,
    };
  }

  return { status: "found", state: parsed as unknown as StoredScreeningState };
}

export function clearScreeningState(
  profileId: string,
  storage: StorageAdapter = resolveDefaultStorageAdapter(),
): void {
  storage.removeItem(keyFor(profileId));
}

export function listStoredProfileIds(
  storage: StorageAdapter = resolveDefaultStorageAdapter(),
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      ids.push(key.slice(KEY_PREFIX.length));
    }
  }
  return ids;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
