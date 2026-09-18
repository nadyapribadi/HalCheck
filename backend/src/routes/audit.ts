// docs/17_api_reference.md §12. System Admin only (TRD §23.4: audit-log
// entries, IP/device, subject hints are H for every operational role, R
// for System Admin). Not a chaincode call -- a direct query against
// audit_log, so this doesn't go through helpers.ts's chaincode-oriented
// handlers, and `actor` is left as-is rather than run through the RBAC
// serializer's identity resolution: audit_log.actor stores
// users.fabric_identity (or a raw attempted username for a denied login),
// not the raw cid.GetID() blob resolveSubmitter() expects -- forcing it
// through that path would silently null out every real actor.
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AuditUnavailableError, writeAuditLog } from "../audit/log.js";
import { pool } from "../db/pool.js";

export const auditRoutes = Router();

auditRoutes.use(requireAuth, requireRole("system_admin"));

interface AuditRow {
  id: string;
  event_type: string;
  outcome: string;
  actor: string;
  module: string;
  ip_address: string | null;
  timestamp: string;
  flagged: boolean;
}

auditRoutes.get("/", async (req, res) => {
  const { from, to, identity } = req.query as { from?: string; to?: string; identity?: string };

  for (const [name, value] of [["from", from], ["to", to]] as const) {
    if (value !== undefined && Number.isNaN(Date.parse(value))) {
      res.status(400).json({ reason: "missing_field", message: `${name} must be a valid ISO date` });
      return;
    }
  }

  try {
    await writeAuditLog({
      eventType: "audit_log_view",
      outcome: "allowed",
      actor: req.user!.fabricIdentity,
      module: "audit.view",
      ipAddress: req.ip,
    });
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      res.status(503).json({ reason: "audit_unavailable", message: "audit log unavailable, request denied" });
      return;
    }
    throw err;
  }

  // The flagged window is computed over full actor history (the inner
  // query, unfiltered), then from/to/identity narrow what's displayed --
  // otherwise a denied streak that started just before `from` would be
  // undercounted for rows right at the filter boundary.
  const result = await pool.query<AuditRow>(
    `SELECT * FROM (
       SELECT id, event_type, outcome, actor, module, ip_address, timestamp,
         (COUNT(*) FILTER (WHERE outcome = 'denied') OVER (
            PARTITION BY actor ORDER BY timestamp
            RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
          )) >= 3 AS flagged
       FROM audit_log
     ) sub
     WHERE ($1::timestamptz IS NULL OR timestamp >= $1)
       AND ($2::timestamptz IS NULL OR timestamp <= $2)
       AND ($3::text IS NULL OR actor = $3)
     ORDER BY timestamp DESC`,
    [from ?? null, to ?? null, identity ?? null],
  );

  res.json(
    result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      outcome: row.outcome,
      actor: row.actor,
      module: row.module,
      ipAddress: row.ip_address,
      timestamp: row.timestamp,
      flagged: row.flagged,
    })),
  );
});
