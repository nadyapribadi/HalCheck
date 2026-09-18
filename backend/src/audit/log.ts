// Writes to audit_log through the halcheck_app role, which only ever has
// INSERT+SELECT on this table (db/init/002_app_role.sh) -- the insert-only
// guarantee holds at the database grant level even if this file has a bug
// (docs/04_trd.md §13). Matches db/init/001_schema.sql's audit_event_type
// and audit_outcome enums exactly.
import { pool } from "../db/pool.js";

export type AuditEventType =
  | "login"
  | "view"
  | "denied"
  | "batch_create"
  | "ingredient_submit"
  | "ingredient_correct"
  | "production_confirm"
  | "production_correct"
  | "verdict_record"
  | "export_request"
  | "reference_data_add"
  | "reference_data_deprecate"
  | "audit_log_view"
  | "ai_explanation_request"
  | "sandbox_attempt";

export type AuditOutcome = "allowed" | "denied" | "attempted";

export interface AuditEvent {
  eventType: AuditEventType;
  outcome: AuditOutcome;
  actor: string; // fabric_identity, or a privacy-safe subject hint pre-login
  module: string; // route this event occurred on
  ipAddress?: string;
}

// Thrown when the insert itself fails -- callers must treat this as fatal
// to the request (TRD §9: "a successful audit insert is a precondition...
// if it cannot commit, the backend returns audit_unavailable and does not
// call chaincode or return protected data"), never swallowed.
export class AuditUnavailableError extends Error {
  constructor(cause: unknown) {
    super("audit log insert failed");
    this.cause = cause;
  }
}

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (event_type, outcome, actor, module, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.eventType, event.outcome, event.actor, event.module, event.ipAddress ?? null],
    );
  } catch (err) {
    throw new AuditUnavailableError(err);
  }
}
