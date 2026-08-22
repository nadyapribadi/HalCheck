// Public surface of the local storage layer.

export type { StorageAdapter } from "./storageAdapter";
export { resolveDefaultStorageAdapter } from "./storageAdapter";
export type { LoadResult, StoredScreeningState } from "./types";
export { STORAGE_SCHEMA_VERSION } from "./types";
export {
  clearScreeningState,
  listStoredProfileIds,
  loadScreeningState,
  saveScreeningState,
} from "./screeningStateStore";
