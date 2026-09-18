import React from "react";
import { ApiError, api } from "../api/client";
import { session } from "../auth/session";
import { navigate } from "../app/router";
import { formatDate, type BatchSummary } from "../lib/batchStatus";
import type { BatchesState } from "../lib/useBatches";
import { StatusBadge } from "../components/StatusBadge";
import { Modal } from "../components/Modal";
import { SelectField, TextField } from "../components/Field";

const EMPTY_STATE: Record<string, string> = {
  ingredient_qa: "No batches are waiting for ingredient records. Start a new batch when you are ready.",
  production_qa: "No batches are waiting for a production record.",
  compliance_officer: "No batches are waiting for a verdict.",
  export_officer: "No Pass-verdict batches are waiting for export.",
  brand_owner: "No batches have been created yet.",
};

export function BatchListScreen({ state }: { state: BatchesState }): React.ReactElement {
  const role = session.get()?.role ?? "brand_owner";
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<"updated" | "id">("updated");
  const [creating, setCreating] = React.useState(false);

  // docs/10 §3's per-role filter comes from the hook; this screen only adds
  // the Batch-ID search box and the sort choice (docs/11 §3).
  const rowsToRender = React.useMemo(() => {
    const searched = query
      ? state.visibleRows.filter((row) => row.summary.batchId.toLowerCase().includes(query.trim().toLowerCase()))
      : state.visibleRows;
    return [...searched].sort((a, b) =>
      sort === "id"
        ? a.summary.batchId.localeCompare(b.summary.batchId)
        : Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated),
    );
  }, [state.visibleRows, query, sort]);

  return (
    <div className="page stack">
      <div className="row-between">
        <h1>Batches</h1>
        {role === "ingredient_qa" ? (
          <button className="primary" onClick={() => setCreating(true)} type="button">
            Start New Batch
          </button>
        ) : null}
      </div>

      <div className="row">
        <div style={{ flex: "1 1 240px" }}>
          <TextField label="Search by Batch ID" value={query} onChange={setQuery} />
        </div>
        <div style={{ minWidth: 200 }}>
          <SelectField
            label="Sort"
            value={sort === "updated" ? "Last Updated" : "Batch ID"}
            options={["Last Updated", "Batch ID"]}
            onChange={(value) => setSort(value === "Batch ID" ? "id" : "updated")}
          />
        </div>
      </div>

      {state.loading ? <p className="muted">Loading…</p> : null}
      {state.error ? <div className="feedback feedback-error">{state.error.message}</div> : null}

      {!state.loading && !state.error ? (
        rowsToRender.length === 0 ? (
          <div className="card muted">{EMPTY_STATE[role] ?? "No batches to show."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rowsToRender.map((row) => (
                <tr key={row.summary.batchId}>
                  <td className="mono">{row.summary.batchId}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{formatDate(row.lastUpdated)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" onClick={() => navigate(`/batches/${row.summary.batchId}`)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {creating ? <NewBatchModal onClose={() => setCreating(false)} onCreated={state.reload} /> : null}
    </div>
  );
}

function NewBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): React.ReactElement {
  const [market, setMarket] = React.useState("Malaysia");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const created = await api<BatchSummary>("/batches", {
        method: "POST",
        body: { intendedMarket: market },
        idempotencyKey: `ui-create-${crypto.randomUUID()}`,
      });
      onCreated();
      // docs/10 §8: creation moves straight into the ingredient panel scoped
      // to the new batch, rather than back to a list the user must re-find it in.
      navigate(`/batches/${created.batchId}/ingredients`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the batch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Start New Batch" onClose={onClose}>
      <p className="muted">
        Intended market is captured once here and cannot be changed afterwards — the export destination is copied from it.
      </p>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      <SelectField
        label="Intended Market"
        value={market}
        options={["Indonesia", "Malaysia"]}
        onChange={setMarket}
      />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" type="button" disabled={busy || !market} onClick={submit}>
          Create batch
        </button>
      </div>
    </Modal>
  );
}
