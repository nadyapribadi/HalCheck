import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { verifyToken } from "../auth/jwt.js";
import { authRoutes } from "./auth.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  return app;
}

// Real seeded credentials (backend/scripts/seed-users.ts) -- read from the
// gitignored local credentials file this test run's environment already
// has, not hardcoded, since passwords are freshly randomized every seed.
async function seededPassword(username: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(resolve(here, "../../seeded-users.credentials.local"), "utf8");
  const line = raw.split("\n").find((l) => l.includes(`username=${username} `));
  if (!line) throw new Error(`no seeded password found for ${username} -- run npm run seed:users first`);
  const match = /password=(\S+)/.exec(line);
  if (!match) throw new Error(`could not parse password from line: ${line}`);
  return match[1];
}

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/auth/login", () => {
  it("issues a valid JWT for correct credentials, matching the real seeded user", async () => {
    const password = await seededPassword("ingredient-qa");
    const app = buildApp();
    const res = await request(app).post("/api/v1/auth/login").send({ username: "ingredient-qa", password });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ingredient_qa");
    expect(typeof res.body.token).toBe("string");
    expect(new Date(res.body.expires_at).getTime()).toBeGreaterThan(Date.now());

    const verified = verifyToken(res.body.token);
    expect(verified.role).toBe("ingredient_qa");
    expect(verified.fabricIdentity).toBe("ingredient-qa");
    expect(verified.personaName).toBe("Siti Rahayu");
  });

  it("rejects a wrong password with 401 invalid_credentials", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/v1/auth/login").send({ username: "ingredient-qa", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("invalid_credentials");
  });

  it("rejects an unknown username identically to a wrong password (no enumeration)", async () => {
    const app = buildApp();
    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "ingredient-qa", password: "wrong" });
    const unknownUser = await request(app).post("/api/v1/auth/login").send({ username: "nobody", password: "wrong" });
    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it("rejects a missing password with 400 missing_field", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/v1/auth/login").send({ username: "ingredient-qa" });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("missing_field");
  });

  it("audits both an allowed and a denied login attempt", async () => {
    const password = await seededPassword("production-qa");
    const app = buildApp();
    await request(app).post("/api/v1/auth/login").send({ username: "production-qa", password });
    await request(app).post("/api/v1/auth/login").send({ username: "production-qa", password: "wrong" });

    const result = await pool.query(
      `SELECT outcome, actor FROM audit_log
       WHERE module = 'auth.login' AND actor IN ('production-qa')
       ORDER BY id DESC LIMIT 2`,
    );
    const outcomes = result.rows.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["allowed", "denied"]);
  });
});
