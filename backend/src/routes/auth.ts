import bcrypt from "bcryptjs";
import { Router } from "express";
import { expiryFromNow, issueToken } from "../auth/jwt.js";
import { findUserByUsername } from "../auth/users.js";
import { AuditUnavailableError, writeAuditLog } from "../audit/log.js";

export const authRoutes = Router();

// POST /api/v1/auth/login -- the one unauthenticated route
// (docs/17_api_reference.md §2). Audit-gated per TRD §9: a denied attempt
// is audited exactly like a successful one, and if the audit write itself
// fails, the response is audit_unavailable, not the login outcome --
// never silently skip the log to let the request through.
authRoutes.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const module = "auth.login";
  const ipAddress = req.ip;

  if (!username || !password) {
    res.status(400).json({ reason: "missing_field", message: "username and password are required" });
    return;
  }

  const user = await findUserByUsername(username);
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordMatches) {
    try {
      await writeAuditLog({ eventType: "login", outcome: "denied", actor: username, module, ipAddress });
    } catch (err) {
      if (err instanceof AuditUnavailableError) {
        res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
        return;
      }
      throw err;
    }
    res.status(401).json({ reason: "invalid_credentials", message: "username or password is incorrect" });
    return;
  }

  try {
    await writeAuditLog({ eventType: "login", outcome: "allowed", actor: user.fabricIdentity, module, ipAddress });
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    throw err;
  }

  const token = issueToken(user);
  res.json({ token, role: user.role, expires_at: expiryFromNow().toISOString() });
});
