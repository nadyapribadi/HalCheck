import React from "react";
import { api } from "../../api/client";
import { navigate } from "../../app/router";
import { formatDate } from "../../lib/batchStatus";
import { useAsync } from "../../lib/useAsync";

interface AuditRow {
  id: number;
  eventType: string;
  outcome: "allowed" | "denied" | "attempted";
  // Either a resolved identity object (once the route resolves it, matching
  // TRD §23.4's identity rule) or the raw actor string from older rows.
  actor: string | { role: string; personaName?: string };
  module: string;
  ipAddress?: string | null;
  timestamp: string;
  flagged: boolean;
}

function actorLabel(actor: AuditRow["actor"]): string {
  if (typeof actor === "string") return actor;
  return actor.personaName ? `${actor.personaName} (${actor.role})` : actor.role;
}

export function AuditLogScreen(): React.ReactElement {
  const [identity, setIdentity] = React.useState("");
  const state = useAsync(
    () => api<AuditRow[]>(`/audit-log${identity ? `?identity=${encodeURIComponent(identity)}` : ""}`),
    [identity],
  );

  const rows = state.data ?? [];
  const identities = Array.from(
    new Set(rows.map((row) => (typeof row.actor === "string" ? row.actor : actorLabel(row.actor)))),
  ).sort();

  return (
    <div className="page stack">
      <div className="row-between">
        <h1>Audit log</h1>
        <button type="button" onClick={() => navigate("/admin")}>Back</button>
      </div>
      <p className="muted">
        System-level activity, separate from the business records on the ledger. Rows are insert-only at the database
        grant level — the application cannot edit or delete them.
      </p>

      <div className="row">
        <div style={{ minWidth: 260 }}>
          <label>
            Identity
            <select value={identity} onChange={(event) => setIdentity(event.target.value)}>
              <option value="">All identities</option>
              {identities.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {state.loading ? <p className="muted">Loading…</p> : null}
      {state.error ? <div className="feedback feedback-error">{state.error.message}</div> : null}

      {rows.length === 0 && !state.loading ? (
        <div className="card muted">No audit entries yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Identity</th>
              <th>Action</th>
              <th>Module</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((row) => (
              <tr key={row.id} className={row.flagged ? "flagged" : undefined}>
                <td>{formatDate(row.timestamp)}</td>
                <td>
                  {actorLabel(row.actor)}
                  {row.flagged ? <div className="muted">Repeated denied attempts</div> : null}
                </td>
                <td>
                  <span className={`status ${row.outcome === "allowed" ? "status-pass" : row.outcome === "denied" ? "status-fail" : "status-pending"}`}>
                    {row.outcome}
                  </span>{" "}
                  {row.eventType}
                </td>
                <td className="mono">{row.module}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
