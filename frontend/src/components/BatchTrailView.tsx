import React from "react";
import {
  formatDate,
  type BatchTrail,
  type ExportRecord,
  type IngredientRecord,
  type ProductionRecord,
  type VerdictRecord,
} from "../lib/batchStatus";
import { VerdictBadge } from "./StatusBadge";

type Block =
  | { kind: "ingredient"; record: IngredientRecord }
  | { kind: "production"; record: ProductionRecord }
  | { kind: "verdict"; record: VerdictRecord }
  | { kind: "export"; record: ExportRecord };

function blocks(trail: BatchTrail): Block[] {
  return [
    ...trail.ingredientRecords.map((record) => ({ kind: "ingredient" as const, record })),
    ...trail.productionRecords.map((record) => ({ kind: "production" as const, record })),
    ...trail.verdictRecords.map((record) => ({ kind: "verdict" as const, record })),
    ...trail.exportRecords.map((record) => ({ kind: "export" as const, record })),
  ].sort((a, b) => Date.parse(a.record.timestamp) - Date.parse(b.record.timestamp));
}

function submitters(record: { submittedBy?: { role: string; personaName?: string } | null }): string {
  if (!record.submittedBy) return "unknown identity";
  const { role, personaName } = record.submittedBy;
  return personaName ? `${personaName} (${role})` : role;
}

// docs/09 §6 BatchTrailView: one connected vertical timeline, not a flat
// stacked list -- the connector line is what makes "these are the same
// batch's records, in order" visible at a glance.
export function BatchTrailView({ trail }: { trail: BatchTrail }): React.ReactElement {
  const all = blocks(trail);
  if (all.length === 0) {
    return <p className="muted">No records on this batch yet.</p>;
  }

  return (
    <ol className="timeline">
      {all.map((block, index) => (
        <li className="timeline-item" key={`${block.kind}-${block.record.recordId}`}>
          <span
            className={`timeline-dot ${
              block.kind === "verdict"
                ? block.record.status === "pass"
                  ? "timeline-dot-pass"
                  : "timeline-dot-fail"
                : "timeline-dot-pending"
            }`}
            aria-hidden="true"
          />
          <div className="timeline-head">
            <span className="timeline-title">
              {block.kind === "ingredient" && "Ingredient record"}
              {block.kind === "production" && "Production record"}
              {block.kind === "verdict" && "Compliance verdict"}
              {block.kind === "export" && "Export release"}
            </span>
            {block.kind === "verdict" ? <VerdictBadge status={block.record.status} /> : null}
            {"supersedesRecordId" in block.record && block.record.supersedesRecordId ? (
              <span className="status status-superseded">Correction</span>
            ) : null}
            <span className="muted">{formatDate(block.record.timestamp)}</span>
            <span className="muted">· block {index + 1}</span>
          </div>

          <dl className="kv">
            {block.kind === "ingredient" ? (
              <>
                <dt>Ingredient</dt>
                <dd>
                  {block.record.ingredientNameSnapshot}{" "}
                  <span className="muted">(reference v{block.record.ingredientReferenceVersion ?? "1"})</span>
                </dd>
                <dt>Source</dt>
                <dd>{block.record.sourceSnapshot}</dd>
                <dt>Halal risk classification</dt>
                <dd>
                  {block.record.halalRiskFlag ? "Halal risk — flagged by reference data" : "No halal risk on record"}
                  {block.record.overrideReason ? ` · override: ${block.record.overrideReason}` : ""}
                </dd>
                {block.record.coaFileHash ? (
                  <>
                    <dt>Certificate of analysis</dt>
                    <dd className="hash">sha256:{block.record.coaFileHash}</dd>
                  </>
                ) : null}
              </>
            ) : null}

            {block.kind === "production" ? (
              <>
                <dt>Line segregation confirmed</dt>
                <dd>{block.record.lineSegregationConfirmed ? "Yes" : "No"}</dd>
                <dt>Standard</dt>
                <dd>
                  {block.record.standardSnapshot ?? "—"}{" "}
                  <span className="muted">(reference v{block.record.standardReferenceVersion ?? "—"})</span>
                </dd>
              </>
            ) : null}

            {block.kind === "verdict" ? (
              <>
                <dt>Governing regulation</dt>
                <dd>{block.record.regulationSnapshot ?? "—"}</dd>
                {block.record.recognitionCheck ? (
                  <>
                    <dt>Recognition check</dt>
                    <dd>
                      Issuing: {block.record.recognitionCheck.issuingBody} · Requiring:{" "}
                      {block.record.recognitionCheck.requiringBody} · Recognized:{" "}
                      <strong>{block.record.recognitionCheck.recognized ? "Yes" : "No"}</strong> · as of{" "}
                      {formatDate(block.record.recognitionCheck.asOfDate)}
                    </dd>
                  </>
                ) : null}
                {block.record.status === "fail" ? (
                  <>
                    <dt>Flagged record</dt>
                    <dd className="mono">{block.record.flaggedRecordId ?? "—"}</dd>
                    <dt>Fail reason</dt>
                    <dd>{block.record.failReasonSnapshot ?? "—"}</dd>
                  </>
                ) : null}
                <dt>Engine</dt>
                <dd>
                  v{block.record.engineVersion ?? "—"} · rules release {block.record.rulesRelease ?? "—"}
                </dd>
                {block.record.engineAttestationDigest ? (
                  <>
                    <dt>Attestation digest</dt>
                    <dd className="hash">{block.record.engineAttestationDigest}</dd>
                  </>
                ) : null}
              </>
            ) : null}

            {block.kind === "export" ? (
              <>
                <dt>Destination</dt>
                <dd>{block.record.destinationMarket}</dd>
              </>
            ) : null}

            <dt>Submitted by</dt>
            <dd>{submitters(block.record)}</dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}
