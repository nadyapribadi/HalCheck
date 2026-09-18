import React from "react";
import { STATUS_LABELS, type BatchStatus } from "../lib/batchStatus";

const TONE: Record<BatchStatus, string> = {
  awaiting_ingredients: "status-pending",
  awaiting_production: "status-pending",
  awaiting_verdict: "status-pending",
  // Docs/11 §3: Awaiting Correction reads with fail-adjacent styling, because
  // it only ever exists downstream of a Fail verdict.
  awaiting_correction: "status-fail",
  awaiting_export: "status-pass",
  exported: "status-superseded",
};

export function StatusBadge({ status }: { status: BatchStatus }): React.ReactElement {
  return <span className={`status ${TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function VerdictBadge({ status }: { status: "pass" | "fail" }): React.ReactElement {
  return <span className={`status ${status === "pass" ? "status-pass" : "status-fail"}`}>{status === "pass" ? "Pass" : "Fail"}</span>;
}
