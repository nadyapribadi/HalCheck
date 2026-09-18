import React from "react";
import { ApiError, api, apiBytes } from "../api/client";
import { navigate } from "../app/router";
import { useAsync } from "../lib/useAsync";
import type { BatchTrail } from "../lib/batchStatus";
import { VerificationReport } from "./VerifyBundleScreen";
import {
  verifyProofBundle,
  type ProofBundle,
  type ProofVerificationReport,
} from "../../../src/proof/verifyProofBundle";

// ADR-CT-034, docs/11 §13. The screen that answers "why should I believe any
// of this?" on the batch itself: it pulls the batch's proof bundle, checks it
// in the browser, then lets the reader try to break it -- altering a record's
// bytes in memory and watching the checks fail is the same arithmetic an
// attacker would have to beat, run live.
export function IntegrityPanelScreen({ batchId }: { batchId: string }): React.ReactElement {
  const bundle = useAsync(() => api<ProofBundle>(`/batches/${encodeURIComponent(batchId)}/proof-bundle`), [batchId]);
  const trail = useAsync(() => api<BatchTrail>(`/batches/${encodeURIComponent(batchId)}/trail`), [batchId]);

  const [report, setReport] = React.useState<ProofVerificationReport | null>(null);
  const [tampered, setTampered] = React.useState<ProofVerificationReport | null>(null);
  const [evidence, setEvidence] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const data = bundle.data;

  React.useEffect(() => {
    if (!data) return;
    void verifyProofBundle(data).then(setReport);
  }, [data]);

  async function runTamperTest(): Promise<void> {
    if (!data) return;
    setBusy(true);
    try {
      const copy = structuredClone(data) as ProofBundle;
      const record = copy.integrity.records[0];
      if (record) {
        const bytes = Uint8Array.from(atob(record.storedBytesBase64), (char) => char.charCodeAt(0));
        const last = bytes.length - 1;
        bytes[last] = bytes[last]! ^ 0x01;
        record.storedBytesBase64 = btoa(String.fromCharCode(...bytes));
      }
      setTampered(await verifyProofBundle(copy));
    } finally {
      setBusy(false);
    }
  }

  // T-006 in the browser: fetch the stored certificate with the caller's own
  // token, re-hash the bytes here, and compare against the hash the ledger
  // record carries. The route also re-hashes server-side; doing it again here
  // is what makes the check independent of that route's own answer.
  async function checkEvidence(recordId: string, ledgerHash: string): Promise<void> {
    setBusy(true);
    try {
      const { bytes } = await apiBytes(`/batches/${encodeURIComponent(batchId)}/ingredients/${encodeURIComponent(recordId)}/coa`);
      const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
      const recomputed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      setEvidence((state) => ({
        ...state,
        [recordId]:
          recomputed === ledgerHash
            ? `verified — re-hashed to ${recomputed.slice(0, 16)}…, matching the ledger record`
            : `MISMATCH — the stored file hashes to ${recomputed.slice(0, 16)}…, but the ledger record says ${ledgerHash.slice(0, 16)}…`,
      }));
    } catch (err) {
      setEvidence((state) => ({
        ...state,
        [recordId]: err instanceof ApiError ? `${err.reason}: ${err.message}` : "could not read the stored evidence",
      }));
    } finally {
      setBusy(false);
    }
  }

  function downloadBundle(): void {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${batchId}-proof-bundle.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const evidenceRecords = (trail.data?.ingredientRecords ?? []).filter((record) => record.coaFileHash);

  return (
    <div className="page stack">
      <div className="row-between">
        <h1>Integrity — <span className="mono">{batchId}</span></h1>
        <div className="row">
          <button type="button" onClick={() => navigate(`/batches/${batchId}`)}>Back to batch</button>
          <button type="button" onClick={downloadBundle} disabled={!data}>Download bundle</button>
          <button className="primary" type="button" onClick={() => void runTamperTest()} disabled={busy || !data}>
            Try to alter a record
          </button>
        </div>
      </div>

      <p className="muted">
        Everything here is checked in this browser: each record is re-hashed, the batch digest is recomputed from
        those bytes, and the verdict's ECDSA signature is verified against the key the ledger publishes. The
        downloaded bundle can be verified by anyone else too, with no account — <span className="mono">npm run
        verify:proof -- {batchId}-proof-bundle.json</span>.
      </p>

      {bundle.loading ? <p className="muted">Loading…</p> : null}
      {bundle.error ? <div className="feedback feedback-error">{bundle.error.message}</div> : null}
      {report ? <VerificationReport report={report} /> : null}

      {tampered ? (
        <section className="card stack">
          <h2>Attempt to alter a record</h2>
          <p className="muted">
            One byte of the first record's stored bytes was flipped, in memory only — nothing was written anywhere.
            The checks below are the same ones that passed a moment ago.
          </p>
          <VerificationReport report={tampered} />
        </section>
      ) : null}

      {evidenceRecords.length > 0 ? (
        <section className="card stack">
          <h2>Stored evidence</h2>
          <p className="muted">
            Each certificate of analysis is re-hashed on retrieval and compared with the hash on its ledger record
            (threat model T-006).
          </p>
          <table>
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Ledger hash</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {evidenceRecords.map((record) => (
                <tr key={record.recordId}>
                  <td>{record.ingredientNameSnapshot}</td>
                  <td className="hash">{record.coaFileHash?.slice(0, 24)}…</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void checkEvidence(record.recordId, record.coaFileHash!)}
                    >
                      Fetch &amp; verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {Object.entries(evidence).map(([recordId, message]) => (
            <div key={recordId} className={`feedback ${message.startsWith("verified") ? "feedback-ok" : "feedback-error"}`}>
              {message}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
