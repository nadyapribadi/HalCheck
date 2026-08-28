import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { serializeForRole, serializeListForRole } from "./serialize.js";

// Real cid.GetID() value, captured live and stored in the seeded users
// table (backend/scripts/seed-users.ts) -- not a fixture, the actual
// production value for ingredient-qa.
const INGREDIENT_QA_CID =
  "eDUwOTo6Q049aW5ncmVkaWVudC1xYSxPVT1jbGllbnQsTz1IeXBlcmxlZGdlcixTVD1Ob3J0aCBDYXJvbGluYSxDPVVTOjpDTj1jYS5vcmcxLmV4YW1wbGUuY29tLE89b3JnMS5leGFtcGxlLmNvbSxMPUR1cmhhbSxTVD1Ob3J0aCBDYXJvbGluYSxDPVVT";

afterAll(async () => {
  await pool.end();
});

describe("serializeForRole", () => {
  it("resolves a real submitted_by cid to role/persona, camelCases the key, and never leaks the raw string", async () => {
    const raw = { record_id: "abc123", submitted_by: INGREDIENT_QA_CID };
    const result = await serializeForRole(raw, "brand_owner");
    expect(result.submittedBy).toEqual({ role: "ingredient_qa", personaName: "Siti Rahayu" });
    expect(result).not.toHaveProperty("submitted_by");
    expect(JSON.stringify(result)).not.toContain(INGREDIENT_QA_CID);
  });

  it("returns null for an unresolvable identity rather than passing it through", async () => {
    const raw = { submitted_by: "not-a-real-cid" };
    const result = await serializeForRole(raw, "system_admin");
    expect(result.submittedBy).toBeNull();
    expect(JSON.stringify(result)).not.toContain("not-a-real-cid");
  });

  it("converts snake_case field names to camelCase", async () => {
    const raw = { record_id: "abc123", batch_id: "SL-2026-001", halal_risk_flag: true };
    const result = await serializeForRole(raw, "ingredient_qa");
    expect(result).toEqual({ recordId: "abc123", batchId: "SL-2026-001", halalRiskFlag: true });
  });

  it("strips admin-only fields for every operational role", async () => {
    const raw = { entry_id: "x", value: "CPKB", metadata: "{\"citation\":\"...\"}", superseded_by: "y" };
    for (const role of ["ingredient_qa", "production_qa", "compliance_officer", "export_officer", "brand_owner"] as const) {
      const result = await serializeForRole(raw, role);
      expect(result).not.toHaveProperty("metadata");
      expect(result).not.toHaveProperty("supersededBy");
      expect(result.value).toBe("CPKB"); // non-admin-only fields still pass through
    }
  });

  it("keeps admin-only fields for system_admin", async () => {
    const raw = { entry_id: "x", metadata: "{}", superseded_by: "y" };
    const result = await serializeForRole(raw, "system_admin");
    expect(result).toHaveProperty("metadata");
    expect(result).toHaveProperty("supersededBy");
  });

  it("recurses into nested objects and arrays", async () => {
    const raw = {
      batch_id: "SL-2026-001",
      records: [
        { record_id: "1", submitted_by: INGREDIENT_QA_CID, metadata: "hide-me" },
        { record_id: "2", submitted_by: "unknown-cid", metadata: "hide-me-too" },
      ],
    };
    const result = await serializeForRole(raw, "ingredient_qa");
    const records = result.records as Array<Record<string, unknown>>;
    expect(records[0].submittedBy).toEqual({ role: "ingredient_qa", personaName: "Siti Rahayu" });
    expect(records[0]).not.toHaveProperty("metadata");
    expect(records[1].submittedBy).toBeNull();
  });
});

describe("serializeListForRole", () => {
  it("serializes every item in a list independently", async () => {
    const raw = [{ submitted_by: INGREDIENT_QA_CID }, { submitted_by: "unknown" }];
    const result = await serializeListForRole(raw, "brand_owner");
    expect(result[0].submittedBy).toEqual({ role: "ingredient_qa", personaName: "Siti Rahayu" });
    expect(result[1].submittedBy).toBeNull();
  });
});
