import React from "react";
import { ApiError, api } from "../api/client";
import { navigate } from "../app/router";
import { formatDate, latestVerdict, type BatchTrail } from "../lib/batchStatus";
import { Modal } from "../components/Modal";
import { SelectField, TextField } from "../components/Field";
import { VerdictBadge } from "../components/StatusBadge";
import { useToast } from "../components/useToast";

interface ModalProps {
  trail: BatchTrail;
  onClose: () => void;
  onDone: () => void;
}

function useAction(
  batchId: string,
  onDone: () => void,
): {
  busy: boolean;
  error: string | null;
  run: (fn: () => Promise<unknown>, successMessage: string) => Promise<void>;
  toast: React.ReactElement | null;
} {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { show, element } = useToast();

  async function run(fn: () => Promise<unknown>, successMessage: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      show(successMessage);
      onDone();
      // docs/10 §4: every action screen returns to Batch Detail on completion.
      navigate(`/batches/${batchId}`);
    } catch (err) {
      // docs/09 §11: rejections stay inline, never a toast.
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run, toast: element };
}

export function ProductionModal({ trail, onClose, onDone }: ModalProps): React.ReactElement {
  const [confirmed, setConfirmed] = React.useState("Yes");
  const { busy, error, run, toast } = useAction(trail.batch.batchId, onDone);

  return (
      <Modal title="Confirm Production" onClose={onClose}>
      {toast}
      <dl className="kv">
        <dt>Batch date</dt>
        <dd>{formatDate(new Date().toISOString())} <span className="muted">(set by the system at submission)</span></dd>
        <dt>Standard</dt>
        <dd>CPKB <span className="muted">(resolved from reference data on submission)</span></dd>
      </dl>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      <SelectField
        label="Line segregation confirmed"
        value={confirmed}
        options={["Yes", "No"]}
        onChange={setConfirmed}
        hint="Sequencing is enforced by the ledger: production cannot be recorded before an ingredient record exists."
      />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                api(`/batches/${trail.batch.batchId}/production`, {
                  method: "POST",
                  body: { lineSegregationConfirmed: confirmed === "Yes" },
                  idempotencyKey: `ui-production-${crypto.randomUUID()}`,
                }),
              "Production record submitted.",
            )
          }
        >
          Submit
        </button>
      </div>
    </Modal>
  );
}

export function VerdictModal({ trail, onClose, onDone }: ModalProps): React.ReactElement {
  const verdict = latestVerdict(trail);
  const { busy, error, run, toast } = useAction(trail.batch.batchId, onDone);
  const previous = trail.verdictRecords.length > 1 ? trail.verdictRecords.at(-2) : null;

  return (
    <Modal title="Compliance Verdict" onClose={onClose}>
      {toast}
      {previous ? (
        // docs/09 §6 VerdictHistoryStrip: plain text, secondary tone, no icons.
        <p className="muted">
          Previous: {previous.status === "fail" ? "Fail" : "Pass"} ({formatDate(previous.timestamp)})
          {previous.flaggedRecordId ? ` — flagged: ${previous.flaggedRecordId.slice(0, 12)}…` : ""}.
          {previous.status === "fail" ? " Correction submitted since." : ""}
        </p>
      ) : null}

      <p className="muted">
        The engine's determination is binding. Recording it is an attestation, not a judgement call — the officer has no
        override.
      </p>

      {verdict ? (
        <dl className="kv">
          <dt>Recorded status</dt>
          <dd><VerdictBadge status={verdict.status} /></dd>
          <dt>Governing regulation</dt>
          <dd>{verdict.regulationSnapshot ?? "—"}</dd>
          <dt>Recorded</dt>
          <dd>{formatDate(verdict.timestamp)}</dd>
        </dl>
      ) : (
        <p>No verdict has been recorded on this batch yet.</p>
      )}

      {error ? <div className="feedback feedback-error">{error}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                api(`/batches/${trail.batch.batchId}/verdict`, {
                  method: "POST",
                  body: {},
                  idempotencyKey: `ui-verdict-${crypto.randomUUID()}`,
                }),
              "Verdict recorded.",
            )
          }
        >
          {verdict ? "Re-record verdict" : "Record Verdict"}
        </button>
      </div>
    </Modal>
  );
}

export function ExportModal({ trail, onClose, onDone }: ModalProps): React.ReactElement {
  const verdict = latestVerdict(trail);
  const canExport = verdict?.status === "pass";
  const { busy, error, run, toast } = useAction(trail.batch.batchId, onDone);

  return (
    <Modal title="Request Export" onClose={onClose}>
      {toast}
      <dl className="kv">
        <dt>Destination</dt>
        <dd>{trail.batch.intendedMarket} <span className="muted">(set at batch creation)</span></dd>
        <dt>Current verdict</dt>
        <dd>{verdict ? <VerdictBadge status={verdict.status} /> : <span className="status status-pending">No verdict</span>}</dd>
      </dl>
      <p className={canExport ? "feedback feedback-ok" : "feedback feedback-info"}>
        {canExport
          ? "Verdict confirmed — export may proceed."
          : "Export unavailable — no valid compliance verdict on record."}
      </p>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button
          className="primary"
          type="button"
          disabled={!canExport || busy}
          onClick={() =>
            void run(
              () =>
                api(`/batches/${trail.batch.batchId}/export`, {
                  method: "POST",
                  body: {},
                  idempotencyKey: `ui-export-${crypto.randomUUID()}`,
                }),
              "Export released.",
            )
          }
        >
          Request Export
        </button>
      </div>
    </Modal>
  );
}

export function SandboxModal({ trail, onClose }: { trail: BatchTrail; onClose: () => void }): React.ReactElement {
  const records = [
    ...trail.ingredientRecords.map((r) => ({ id: r.recordId, label: `Ingredient — ${r.ingredientNameSnapshot}` })),
    ...trail.productionRecords.map((r) => ({ id: r.recordId, label: "Production record" })),
    ...trail.verdictRecords.map((r) => ({ id: r.recordId, label: `Verdict — ${r.status}` })),
  ];
  const [recordId, setRecordId] = React.useState(records[0]?.id ?? "");
  const [rawValue, setRawValue] = React.useState("");
  // One slot per mode: the demo runs both in sequence, and a single shared
  // slot meant Mode 2's answer wiped Mode 1's the moment it was run.
  const [results, setResults] = React.useState<Record<string, { ok: boolean; lines: string[] } | null>>({});
  const [busy, setBusy] = React.useState(false);

  // ADR-CT-034: the responses are now report structures built from a real
  // chaincode answer, so each caller says how to read its own shape rather
  // than this component inventing a sentence from a reason code.
  async function attempt(
    slot: "alter" | "unlisted",
    path: string,
    body: unknown,
    describe: (payload: any) => string[],
  ): Promise<void> {
    setBusy(true);
    setResults((state) => ({ ...state, [slot]: null }));
    try {
      const payload = await api(path, { method: "POST", body });
      setResults((state) => ({ ...state, [slot]: { ok: true, lines: describe(payload) } }));
    } catch (err) {
      setResults((state) => ({
        ...state,
        [slot]: {
          ok: false,
          lines: [err instanceof ApiError ? `${err.message} (${err.reason})` : "Request failed."],
        },
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Integrity Sandbox" onClose={onClose} emphasis>
      <p className="muted">
        Every attempt below is a real call to the deployed chaincode, and every answer is the ledger's own — nothing
        here is a rehearsed response. Neither mode can write anything: there is no update function to call, and a
        value the ledger does not recognize is refused before it is stored.
      </p>

      <div className="card">
        <h3>Mode 1 — Attempt to alter a record</h3>
        <SelectField
          label="Record"
          value={recordId}
          options={records.map((record) => record.id)}
          onChange={setRecordId}
          placeholder={records.length ? "Select a record" : "No records on this batch yet"}
        />
        <div className="row">
          <button
            type="button"
            disabled={busy || !recordId}
            onClick={() =>
              void attempt("alter", "/sandbox/integrity/alter-attempt", {
                recordId,
                batchId: trail.batch.batchId,
                attemptedChange: { halalRiskFlag: false },
              }, (payload) => {
                const lines = [
                  `The ledger's answer: ${payload.ledgerRefusal.refused ? "refused" : "ACCEPTED"} — ${payload.ledgerRefusal.message}`,
                ];
                if (payload.tamper) {
                  lines.push(
                    `Record hash on the ledger: ${payload.tamper.ledgerSha256.slice(0, 32)}…`,
                    `The same record with one byte changed: ${payload.tamper.alteredSha256.slice(0, 32)}…`,
                    payload.tamper.identical
                      ? "The hashes still match — that would be a defect worth investigating."
                      : "The hashes no longer match: the alteration is detectable from the recorded hash alone.",
                  );
                }
                return lines;
              })
            }
          >
            Attempt Change
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Mode 2 — Submit an unlisted value</h3>
        <p className="muted" style={{ marginBottom: 8 }}>
          This field deliberately bypasses the reference-list select, to show the rejection happens server-side.
        </p>
        <TextField label="Ingredient or supplier name" value={rawValue} onChange={setRawValue} placeholder="Type anything" />
        <div className="row">
          <button
            type="button"
            disabled={busy || rawValue.trim().length === 0}
            onClick={() =>
              void attempt("unlisted", "/sandbox/integrity/unlisted-value-attempt", {
                field: "ingredient",
                value: rawValue,
                batchId: trail.batch.batchId,
              }, (payload) => {
                const lines = [`The ledger's answer on the reference list: ${payload.resolution.message}`];
                if (payload.submissionAttempt) {
                  lines.push(`The ledger's answer on the submission itself: ${payload.submissionAttempt.message}`);
                }
                return lines;
              })
            }
          >
            Attempt Submit
          </button>
        </div>
      </div>

      {(["alter", "unlisted"] as const).map((slot) => {
        const result = results[slot];
        if (!result) return null;
        return (
          <div
            key={slot}
            className={`feedback ${result.ok ? "feedback-ok" : "feedback-error"}`}
            style={{ marginTop: 16 }}
          >
            {result.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        );
      })}
    </Modal>
  );
}
