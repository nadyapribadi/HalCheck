import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { issueToken } from "./jwt.js";
import { requireAuth, requireRole } from "./middleware.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", () => {
    const req = { header: () => undefined } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect((res.body as any).reason).toBe("unauthenticated");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-Bearer) header", () => {
    const req = { header: () => "Basic abc123" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", () => {
    const req = { header: () => "Bearer not-a-real-token" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("populates req.user and calls next() for a valid token", () => {
    const token = issueToken({
      userId: 1,
      username: "ingredient-qa",
      role: "ingredient_qa",
      personaName: "Siti Rahayu",
      fabricIdentity: "ingredient-qa",
    });
    const req = { header: () => `Bearer ${token}` } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe("ingredient_qa");
    expect(req.user?.fabricIdentity).toBe("ingredient-qa");
  });
});

describe("requireRole", () => {
  it("rejects when req.user is missing (requireAuth didn't run first)", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();
    requireRole("ingredient_qa")(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a role not in the allowed list", () => {
    const req = {
      user: { userId: 2, username: "production-qa", role: "production_qa", personaName: "Budi Santoso", fabricIdentity: "production-qa" },
    } as Request;
    const res = mockRes();
    const next = vi.fn();
    requireRole("ingredient_qa")(req, res, next);
    expect(res.statusCode).toBe(403);
    expect((res.body as any).reason).toBe("role_scope_violation");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a role in the allowed list and calls next()", () => {
    const req = {
      user: { userId: 1, username: "ingredient-qa", role: "ingredient_qa", personaName: "Siti Rahayu", fabricIdentity: "ingredient-qa" },
    } as Request;
    const res = mockRes();
    const next = vi.fn();
    requireRole("ingredient_qa", "system_admin")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200); // untouched
  });
});
