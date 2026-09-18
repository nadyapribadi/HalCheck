import React from "react";
import { navigate } from "../app/router";
import {
  ProofBundleFormatError,
  verifyProofBundle,
  type ProofVerificationReport,
} from "../../../src/proof/verifyProofBundle";

// ADR-CT-034, docs/11 §14. Deliberately reachable without a session: the
// person who needs to check someone else's claim is the person least likely
// to have an account here. Everything below runs in this browser tab -- the
// bundle is never uploaded anywhere to be checked, which is what makes the
// answer independent of the system that produced it.
export function VerifyBundleScreen(): React.ReactElement {
  const [text, setText] = React.useState("");
  const [report, setReport] = React.useState<ProofVerificationReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function verify(raw: string): Promise<void> {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const parsed: unknown = JSON.parse(raw);
      setReport(await verifyProofBundle(parsed));
    } catch (err) {
      if (err instanceof ProofBundleFormatError) setError(err.message);
      else if (err instanceof SyntaxError) setError(`This is not valid JSON: ${err.message}`);
      else setError(err instanceof Error ? err.message : "Could not verify this bundle.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <div className="row-between">
        <h1>Verify a proof bundle</h1>
        <button type="button" onClick={() => navigate("/login")}>Sign in</button>
      </div>

      <p className="muted">
        A proof bundle carries a batch's records, the digest they produce and the signed verdict that was recorded
        against them. Pasting one here re-hashes the records, recomputes the batch digest and checks the verdict
        signature — in this browser, with no account and nothing sent to the server.
      </p>

      <div className="card stack">
        <TextField label="Bundle JSON" value={text} onChange={setText} multiline />
        <div className="row">
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Load a proof bundle file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((contents) => {
                setText(contents);
                void verify(contents);
              });
            }}
          />
          <button className="primary" type="button" disabled={busy || text.trim().length === 0} onClick={() => void verify(text)}>
            Verify
          </button>
        </div>
        {error ? <div className="feedback feedback-error">{error}</div> : null}
      </div>

      {report ? <VerificationReport report={report} /> : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}): React.ReactElement {
  return (
    <div className="field">
      <label>
        {label}
        {multiline ? (
          <textarea rows={8} value={value} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input value={value} onChange={(event) => onChange(event.target.value)} />
        )}
      </label>
    </div>
  );
}

export function VerificationReport({ report }: { report: ProofVerificationReport }): React.ReactElement {
  const failures = report.checks.filter((check) => check.status === "fail");
  return (
    <div className="stack">
      <div className={`feedback ${report.ok ? "feedback-ok" : "feedback-error"}`}>
        {report.ok
          ? `Verified — batch ${report.batchId}: every record matches its hash, the digest recomputes, and the signed verdict checks out.`
          : `Not verified — batch ${report.batchId}: ${failures.length} of ${report.checks.length} checks failed. Do not treat this bundle as evidence.`}
      </div>
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Result</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {report.checks.map((check) => (
            <tr key={check.id}>
              <td>{check.label}</td>
              <td>
                <span
                  className={`status ${
                    check.status === "pass" ? "status-pass" : check.status === "fail" ? "status-fail" : "status-pending"
                  }`}
                >
                  {check.status === "pass" ? "Pass" : check.status === "fail" ? "Fail" : "Note"}
                </span>
              </td>
              <td className="muted">{check.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
