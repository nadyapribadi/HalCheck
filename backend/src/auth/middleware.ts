import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser, Role } from "../types.js";
import { InvalidTokenError, verifyToken } from "./jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Every route except /auth/login requires a valid bearer JWT
// (docs/17_api_reference.md §2). Populates req.user from the token's own
// claims -- this is the only place req.user is ever set, so every
// downstream handler's notion of "who is this" traces back to a verified
// signature, never to anything else in the request.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ reason: "unauthenticated", message: "missing bearer token" });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      res.status(401).json({ reason: "unauthenticated", message: err.message });
      return;
    }
    throw err;
  }
}

// Route-level role gate -- mirrors chaincode's own role_scope_violation
// check, but this is UX only (docs/17 §2's redirect-with-reason pattern);
// the real enforcement is chaincode's requireRole, which runs regardless
// of whether this check is ever reached (AGENTS.md's "no rule enforced
// only outside chaincode").
export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ reason: "unauthenticated", message: "missing bearer token" });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({
        reason: "role_scope_violation",
        message: `role ${req.user.role} may not perform this action`,
      });
      return;
    }
    next();
  };
}
