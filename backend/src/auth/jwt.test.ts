import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../types.js";
import { InvalidTokenError, issueToken, verifyToken } from "./jwt.js";

const testUser: AuthenticatedUser = {
  userId: 1,
  username: "ingredient-qa",
  role: "ingredient_qa",
  personaName: "Siti Rahayu",
  fabricIdentity: "ingredient-qa",
};

describe("issueToken / verifyToken", () => {
  it("round-trips every claim a route needs to decide role scope or Fabric identity", () => {
    const token = issueToken(testUser);
    const verified = verifyToken(token);
    expect(verified).toEqual(testUser);
  });

  it("rejects a token signed with a different secret", () => {
    // Simulates a forged token -- the exact scenario JWT verification
    // exists to catch (FRD-CHAIN-IDENTITY-002's foundation: nothing
    // downstream can trust req.user unless the signature is genuinely
    // checked, not just decoded).
    const forged = jwt.sign({ sub: 1, username: "x", role: "system_admin", personaName: "x", fabricIdentity: "x" }, "wrong-secret");
    expect(() => verifyToken(forged)).toThrow(InvalidTokenError);
  });

  it("rejects a token carrying an unrecognized role", () => {
    const secret = process.env.JWT_SECRET!;
    const tampered = jwt.sign(
      { sub: 1, username: "x", role: "not_a_real_role", personaName: "x", fabricIdentity: "x" },
      secret,
    );
    expect(() => verifyToken(tampered)).toThrow(InvalidTokenError);
  });

  it("rejects a garbage string", () => {
    expect(() => verifyToken("not-a-jwt-at-all")).toThrow(InvalidTokenError);
  });
});
