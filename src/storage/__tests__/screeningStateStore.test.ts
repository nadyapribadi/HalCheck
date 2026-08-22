import { describe, expect, it } from "vitest";
import { activeDatasetRelease } from "../../data/loadDatasetRelease";
import { runScreening } from "../../engine/run";
import type { IngredientRecord, ScreeningProfile } from "../../engine/types";
import {
  clearScreeningState,
  listStoredProfileIds,
  loadScreeningState,
  saveScreeningState,
} from "../screeningStateStore";
import type { StorageAdapter } from "../storageAdapter";

// In-memory stand-in for window.localStorage -- same interface, no browser
// dependency, so these tests run under plain Node.
class FakeStorage implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length(): number {
    return this.store.size;
  }
}

const profile: ScreeningProfile = {
  profileId: "profile-under-test",
  intendedMarket: "malaysia",
  productType: "cosmetic",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const ingredientRecords: IngredientRecord[] = [
  {
    recordId: "r1",
    profileId: profile.profileId,
    ingredientEntryId: "ing-aqua",
    supplierEntryId: "sup-pt-sumber-alam-nusantara",
    halalRiskFlag: false,
  },
];

describe("saveScreeningState / loadScreeningState round trip", () => {
  it("returns not_found for a profile that was never saved", () => {
    const storage = new FakeStorage();
    const result = loadScreeningState("never-saved", storage);
    expect(result).toEqual({ status: "not_found" });
  });

  it("round-trips a real ScreeningRun unchanged", () => {
    const storage = new FakeStorage();
    const run = runScreening(profile, ingredientRecords, activeDatasetRelease);

    saveScreeningState(profile, ingredientRecords, run, storage);
    const result = loadScreeningState(profile.profileId, storage);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.state.profile).toEqual(profile);
      expect(result.state.ingredientRecords).toEqual(ingredientRecords);
      expect(result.state.run).toEqual(run);
    }
  });

  it("allows saving with no run yet (profile created, screening not run)", () => {
    const storage = new FakeStorage();
    saveScreeningState(profile, ingredientRecords, null, storage);
    const result = loadScreeningState(profile.profileId, storage);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.state.run).toBeNull();
    }
  });
});

describe("schema version handling (FRD-CORE-STORAGE-002)", () => {
  it("flags a stored record from an unrecognized schema version as unreadable, not silently misread", () => {
    const storage = new FakeStorage();
    storage.setItem(
      "halcheck:core:screening:legacy-profile",
      JSON.stringify({ schemaVersion: 999, profile, ingredientRecords: [], run: null, savedAt: "x" }),
    );

    const result = loadScreeningState("legacy-profile", storage);

    expect(result.status).toBe("unreadable");
    if (result.status === "unreadable") {
      expect(result.reason).toContain("999");
    }
  });

  it("flags corrupted JSON as unreadable rather than throwing", () => {
    const storage = new FakeStorage();
    storage.setItem("halcheck:core:screening:corrupt-profile", "{not valid json");

    const result = loadScreeningState("corrupt-profile", storage);

    expect(result.status).toBe("unreadable");
  });
});

describe("clearScreeningState / listStoredProfileIds", () => {
  it("removes a saved state so a subsequent load reports not_found", () => {
    const storage = new FakeStorage();
    saveScreeningState(profile, ingredientRecords, null, storage);

    clearScreeningState(profile.profileId, storage);

    expect(loadScreeningState(profile.profileId, storage)).toEqual({ status: "not_found" });
  });

  it("lists only halcheck screening keys, ignoring unrelated storage entries", () => {
    const storage = new FakeStorage();
    saveScreeningState(profile, ingredientRecords, null, storage);
    saveScreeningState({ ...profile, profileId: "second-profile" }, [], null, storage);
    storage.setItem("some-unrelated-app:setting", "value");

    const ids = listStoredProfileIds(storage);

    expect(ids.sort()).toEqual(["profile-under-test", "second-profile"]);
  });
});
