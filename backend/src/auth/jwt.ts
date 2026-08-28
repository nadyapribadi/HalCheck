import jwt from "jsonwebtoken";
import { isRole, type AuthenticatedUser } from "../types.js";

const JWT_EXPIRY = process.env.JWT_EXPIRY ?? "8h";
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

// The JWT payload *is* the authenticated identity for the life of the
// session -- every field a route needs to decide role scope or which
// Fabric identity to act as comes from here, never from request input
// (docs/17_api_reference.md §2, FRD-CHAIN-IDENTITY-002). fabricIdentity in
// particular is fixed at login time from the users table and never
// accepted as a request parameter anywhere in this backend -- that's what
// "the authenticated identity matches the Fabric identity used" means in
// practice: there is no second, client-suppliable source for it to
// diverge from.
interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  personaName: string;
  fabricIdentity: string;
}

export function issueToken(user: AuthenticatedUser): string {
  const payload: JwtPayload = {
    sub: user.userId,
    username: user.username,
    role: user.role,
    personaName: user.personaName,
    fabricIdentity: user.fabricIdentity,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY } as jwt.SignOptions);
}

export function expiryFromNow(): Date {
  return new Date(Date.now() + parseExpiryMs(JWT_EXPIRY));
}

function parseExpiryMs(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) return 8 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 3_600_000;
  return value * unitMs;
}

export class InvalidTokenError extends Error {}

export function verifyToken(token: string): AuthenticatedUser {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
  } catch {
    throw new InvalidTokenError("invalid or expired token");
  }
  if (!isRole(decoded.role)) {
    throw new InvalidTokenError("token carries an unrecognized role");
  }
  return {
    userId: decoded.sub,
    username: decoded.username,
    role: decoded.role,
    personaName: decoded.personaName,
    fabricIdentity: decoded.fabricIdentity,
  };
}
