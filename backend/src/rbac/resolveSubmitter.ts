// Resolves a raw cid.GetID() string (as chaincode writes it into
// submitted_by/added_by/deprecated_by) back to a role/persona for display
// -- the only known, closed set of identities this network has (the 6 demo
// users), so an in-memory cache loaded once is correct and sufficient;
// there is no registration flow that could add a 7th at runtime.
import { pool } from "../db/pool.js";
import type { Role } from "../types.js";

export interface ResolvedSubmitter {
  role: Role;
  personaName: string;
}

let cache: Map<string, ResolvedSubmitter> | undefined;

async function loadCache(): Promise<Map<string, ResolvedSubmitter>> {
  const result = await pool.query<{ fabric_cid: string | null; role: Role; persona_name: string }>(
    `SELECT fabric_cid, role, persona_name FROM users WHERE fabric_cid IS NOT NULL`,
  );
  const map = new Map<string, ResolvedSubmitter>();
  for (const row of result.rows) {
    map.set(row.fabric_cid as string, { role: row.role, personaName: row.persona_name });
  }
  return map;
}

// resolveSubmitter never returns the raw input on a miss -- TRD §23.4
// makes the raw certificate-derived string H (hidden) for every role,
// with no exception. An unresolvable cid is a data problem to surface
// explicitly, not something to silently leak into a response.
export async function resolveSubmitter(fabricCid: string): Promise<ResolvedSubmitter | null> {
  if (!cache) {
    cache = await loadCache();
  }
  return cache.get(fabricCid) ?? null;
}
