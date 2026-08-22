// A minimal, DOM-Storage-compatible interface so the store below never
// hardcodes `localStorage` directly — real usage injects `window.localStorage`,
// tests inject an in-memory fake. Keeps FRD-CORE-STORAGE-001 (local storage
// only) true without coupling this module to a browser global.

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export function resolveDefaultStorageAdapter(): StorageAdapter {
  if (typeof globalThis.localStorage !== "undefined") {
    return globalThis.localStorage;
  }
  throw new Error(
    "No localStorage available in this environment. Pass an explicit StorageAdapter.",
  );
}
