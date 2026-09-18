import React from "react";
import { api } from "../api/client";
import { session, type Role } from "../auth/session";
import {
  deriveStatus,
  statusesForRole,
  type BatchStatus,
  type BatchSummary,
  type BatchTrail,
} from "./batchStatus";

export interface BatchRow {
  summary: BatchSummary;
  trail: BatchTrail;
  status: BatchStatus;
  lastUpdated: string;
}

export interface BatchesState {
  rows: BatchRow[];
  /** Rows the current role's landing filter allows (docs/10 §3). */
  visibleRows: BatchRow[];
  awaitingCount: number;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

// The chaincode keeps no batch status (it derives from the records a batch
// holds), and GET /batches deliberately returns only the batch resource, so
// the derivation happens once here for every screen that needs it: the list,
// the notification badge, and the role filters all read the same rows.
export function useBatches(enabled = true): BatchesState {
  const [rows, setRows] = React.useState<BatchRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const role = session.get()?.role ?? "brand_owner";

  React.useEffect(() => {
    // Never call the API before there is a session: an anonymous fetch would
    // 401 and clear the very session the login screen is about to create.
    if (!enabled) {
      setLoading(false);
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const summaries = await api<BatchSummary[]>("/batches");
      const trails = await Promise.all(
        summaries.map((summary) => api<BatchTrail>(`/batches/${encodeURIComponent(summary.batchId)}/trail`)),
      );
      return summaries.map((summary, index) => {
        const trail = trails[index]!;
        const timestamps = [
          summary.createdAt,
          ...trail.ingredientRecords.map((r) => r.timestamp),
          ...trail.productionRecords.map((r) => r.timestamp),
          ...trail.verdictRecords.map((r) => r.timestamp),
          ...trail.exportRecords.map((r) => r.timestamp),
        ];
        return {
          summary,
          trail,
          status: deriveStatus(trail),
          lastUpdated: timestamps.sort().at(-1) ?? summary.createdAt,
        };
      });
    })()
      .then((value) => {
        if (!cancelled) setRows(value);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce, enabled]);

  const allowed = statusesForRole(role);
  const visible = allowed === null ? rows : rows.filter((row) => allowed.includes(row.status));

  return {
    rows,
    visibleRows: visible,
    awaitingCount: role === "system_admin" || role === "brand_owner" ? 0 : visible.length,
    loading,
    error,
    reload: () => setNonce((value) => value + 1),
  };
}

export function roleLandingPath(role: Role): string {
  return role === "system_admin" ? "/admin" : "/batches";
}
