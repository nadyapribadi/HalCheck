import React from "react";
import { api } from "../api/client";
import { session } from "../auth/session";
import { navigate } from "../app/router";
import { deriveStatus, formatDate, type BatchTrail } from "../lib/batchStatus";
import { useAsync } from "../lib/useAsync";
import { BatchTrailView } from "../components/BatchTrailView";
import { StatusBadge } from "../components/StatusBadge";
import { AIExplanationPanel } from "../components/AIExplanationPanel";
import { ExportModal, ProductionModal, SandboxModal, VerdictModal } from "./BatchActionModals";

export type BatchModal = "production" | "verdict" | "export" | "sandbox";

export function BatchDetailScreen({
  batchId,
  modal,
  onChanged,
}: {
  batchId: string;
  modal: BatchModal | null;
  onChanged: () => void;
}): React.ReactElement {
  const role = session.get()?.role ?? "brand_owner";
  const [showAI, setShowAI] = React.useState(false);
  const trail = useAsync(() => api<BatchTrail>(`/batches/${encodeURIComponent(batchId)}/trail`), [batchId]);

  if (trail.loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (trail.error || !trail.data) {
    return (
      <div className="page">
        <div className="feedback feedback-error">{trail.error?.message ?? "Batch not found."}</div>
        <p><button type="button" onClick={() => navigate("/batches")}>Back to batches</button></p>
      </div>
    );
  }

  const data = trail.data;
  const status = deriveStatus(data);
  const recordCount =
    data.ingredientRecords.length + data.productionRecords.length + data.verdictRecords.length + data.exportRecords.length;

  function done(): void {
    trail.reload();
    onChanged();
  }

  return (
    <div className="page stack">
      <div className="row-between">
        <div>
          <h1 className="mono">{data.batch.batchId}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Intended market: {data.batch.intendedMarket} · created {formatDate(data.batch.createdAt)}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="row">
        <button type="button" onClick={() => navigate("/batches")}>Back to batches</button>
        {role === "ingredient_qa" && status === "awaiting_correction" ? (
          <button className="primary" type="button" onClick={() => navigate(`/batches/${batchId}/ingredients`)}>
            Correct flagged ingredient
          </button>
        ) : null}
        {role === "production_qa" && status === "awaiting_production" ? (
          <button className="primary" type="button" onClick={() => navigate(`/batches/${batchId}/production`)}>
            Confirm Production
          </button>
        ) : null}
        {role === "compliance_officer" && status === "awaiting_verdict" ? (
          <button className="primary" type="button" onClick={() => navigate(`/batches/${batchId}/verdict`)}>
            Record Verdict
          </button>
        ) : null}
        {role === "export_officer" ? (
          <>
            <button
              className={status === "awaiting_export" ? "primary" : undefined}
              type="button"
              disabled={status !== "awaiting_export"}
              onClick={() => navigate(`/batches/${batchId}/export`)}
            >
              Request Export
            </button>
            {status !== "awaiting_export" ? (
              <span className="muted">No valid compliance verdict on record.</span>
            ) : null}
          </>
        ) : null}
      </div>

      <section className="card">
        <h2>Recorded trail</h2>
        <BatchTrailView trail={data} />
      </section>

      <div className="row">
        <button type="button" onClick={() => navigate(`/batches/${batchId}/integrity`)}>
          Verify integrity
        </button>
        {recordCount > 0 ? (
          <button type="button" onClick={() => navigate(`/batches/${batchId}/integrity-sandbox`)}>
            Try the Integrity Sandbox
          </button>
        ) : null}
        <button type="button" onClick={() => setShowAI((value) => !value)}>
          {showAI ? "Hide AI explanation" : "Ask about this batch"}
        </button>
      </div>

      {showAI ? <AIExplanationPanel batchId={batchId} /> : null}

      {modal === "production" ? <ProductionModal trail={data} onClose={() => navigate(`/batches/${batchId}`)} onDone={done} /> : null}
      {modal === "verdict" ? <VerdictModal trail={data} onClose={() => navigate(`/batches/${batchId}`)} onDone={done} /> : null}
      {modal === "export" ? <ExportModal trail={data} onClose={() => navigate(`/batches/${batchId}`)} onDone={done} /> : null}
      {modal === "sandbox" ? <SandboxModal trail={data} onClose={() => navigate(`/batches/${batchId}`)} /> : null}
    </div>
  );
}
