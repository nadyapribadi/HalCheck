// The one shared serialization utility TRD §14 requires ("a single shared
// configuration... not scattered per-endpoint logic"), driven directly by
// the canonical matrix in TRD §23.4. Every route that returns ledger or
// audit data must pass its response through this before res.json() --
// never hand-roll field omission per route.
import type { Role } from "../types.js";
import { resolveSubmitter } from "./resolveSubmitter.js";

// TRD §23.4: "Reference internal metadata and supersession administration"
// is H for every operational role, R/W for System Admin only.
const ADMIN_ONLY_FIELDS = new Set(["metadata", "superseded_by"]);

// TRD §23.4: "Audit-log entries, IP/device, subject hints" is H for every
// operational role, R for System Admin only. Routes already gate the
// whole audit-log endpoint to System Admin (docs/17 §12); this is the
// field-level backstop, not the only enforcement of it.
const ADMIN_ONLY_AUDIT_FIELDS = new Set(["ip_address"]);

// Raw cid.GetID() strings -- H for every role, no exception (TRD §23.4).
// Never passed through as-is; always resolved to {role, persona_name} or
// explicitly null if the identity can't be resolved (never silently
// dropped, so an integration bug is visible, not hidden).
const IDENTITY_FIELDS = new Set(["submitted_by", "added_by", "deprecated_by", "actor"]);

// Chaincode returns snake_case (Go/JSON convention); docs/17_api_reference.md's
// own examples are consistently camelCase (batchId, intendedMarket, ...).
// Converting here, once, is what keeps every route's response shape
// matching the documented contract without each route re-deriving it.
function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

async function transformValue(value: unknown, role: Role): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => transformValue(item, role)));
  }
  if (value && typeof value === "object") {
    return serializeForRole(value as Record<string, unknown>, role);
  }
  return value;
}

export async function serializeForRole<T extends Record<string, unknown>>(
  data: T,
  role: Role,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (role !== "system_admin" && ADMIN_ONLY_FIELDS.has(key)) continue;
    if (role !== "system_admin" && ADMIN_ONLY_AUDIT_FIELDS.has(key)) continue;

    const outKey = toCamelCase(key);

    if (IDENTITY_FIELDS.has(key) && typeof value === "string" && value.length > 0) {
      out[outKey] = await resolveSubmitter(value);
      continue;
    }

    out[outKey] = await transformValue(value, role);
  }

  return out;
}

export async function serializeListForRole<T extends Record<string, unknown>>(
  items: T[],
  role: Role,
): Promise<Record<string, unknown>[]> {
  return Promise.all(items.map((item) => serializeForRole(item, role)));
}
