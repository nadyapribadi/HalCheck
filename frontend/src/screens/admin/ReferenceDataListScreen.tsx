import React from "react";
import { ApiError, api } from "../../api/client";
import { navigate } from "../../app/router";
import { formatDate } from "../../lib/batchStatus";
import { useAsync } from "../../lib/useAsync";
import { Modal } from "../../components/Modal";
import { SelectField, TextField } from "../../components/Field";
import { useToast } from "../../components/useToast";

interface ReferenceEntry {
  entryId: string;
  value: string;
  version: string;
  status: "active" | "deprecated";
  supersededBy?: string;
  metadata?: string;
  timestamp: string;
  addedBy?: { role: string; personaName?: string } | null;
}

const TITLES: Record<string, string> = {
  ingredient: "Ingredients",
  supplier: "Suppliers",
  standard: "Standards",
  fail_reason: "Fail reasons",
};

// A supplier's verification status is a governance fact the verdict engine
// judges a rule on (ADR-CT-033), so the System Admin who sets it has to be
// able to see it -- and see plainly when it is missing, which is exactly the
// state that blocks ingredient submissions until it is filled in. Entries
// added before ADR-CT-033 have no metadata at all, hence "not set" rather
// than an implied "unverified".
function supplierVerificationStatus(entry: ReferenceEntry): string | null {
  if (!entry.metadata) return null;
  try {
    const parsed = JSON.parse(entry.metadata) as { verificationStatus?: unknown };
    return typeof parsed.verificationStatus === "string" && parsed.verificationStatus !== ""
      ? parsed.verificationStatus
      : null;
  } catch {
    return null;
  }
}

export function ReferenceDataListScreen({ type }: { type: string }): React.ReactElement {
  const state = useAsync(() => api<ReferenceEntry[]>(`/reference-data/${encodeURIComponent(type)}`), [type]);
  const [adding, setAdding] = React.useState(false);
  const [deprecating, setDeprecating] = React.useState<ReferenceEntry | null>(null);
  const { show, element } = useToast();

  const entries = [...(state.data ?? [])].sort((a, b) =>
    a.value === b.value ? Number(a.version) - Number(b.version) : a.value.localeCompare(b.value),
  );
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));

  return (
    <div className="page stack">
      {element}
      <div className="row-between">
        <h1>{TITLES[type] ?? type}</h1>
        <div className="row">
          <button type="button" onClick={() => navigate("/admin")}>Back</button>
          <button className="primary" type="button" onClick={() => setAdding(true)}>Add New Entry</button>
        </div>
      </div>

      {state.loading ? <p className="muted">Loading…</p> : null}
      {state.error ? <div className="feedback feedback-error">{state.error.message}</div> : null}

      {entries.length === 0 && !state.loading ? (
        <div className="card muted">No entries in this category yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Entry</th>
              <th>Status</th>
              {type === "supplier" ? <th>Verification</th> : null}
              <th>Version / added</th>
              <th>Added by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.entryId} className={entry.status === "deprecated" ? "superseded" : undefined}>
                <td>
                  {entry.value}
                  {entry.status === "deprecated" && entry.supersededBy ? (
                    <div className="muted">
                      → superseded by {byId.get(entry.supersededBy)?.value ?? "a newer version"}
                    </div>
                  ) : null}
                </td>
                <td>
                  <span className={`status ${entry.status === "active" ? "status-pass" : "status-superseded"}`}>
                    {entry.status === "active" ? "Active" : "Deprecated"}
                  </span>
                </td>
                {type === "supplier" ? (
                  <td>
                    {supplierVerificationStatus(entry) ?? <span className="muted">not set</span>}
                  </td>
                ) : null}
                <td>
                  v{entry.version} · {formatDate(entry.timestamp)}
                </td>
                <td>
                  {entry.addedBy?.personaName
                    ? `${entry.addedBy.personaName} (${entry.addedBy.role})`
                    : (entry.addedBy?.role ?? "—")}
                </td>
                <td style={{ textAlign: "right" }}>
                  {entry.status === "active" ? (
                    <button className="danger" type="button" onClick={() => setDeprecating(entry)}>
                      Deprecate
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding ? (
        <AddEntryModal
          type={type}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            state.reload();
            show("Reference entry added.");
          }}
        />
      ) : null}
      {deprecating ? (
        <DeprecateModal
          type={type}
          entry={deprecating}
          onClose={() => setDeprecating(null)}
          onDone={() => {
            setDeprecating(null);
            state.reload();
            show("Reference entry deprecated.");
          }}
        />
      ) : null}
    </div>
  );
}

function AddEntryModal({
  type,
  onClose,
  onDone,
}: {
  type: string;
  onClose: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [value, setValue] = React.useState("");
  const [risk, setRisk] = React.useState("No");
  const [citation, setCitation] = React.useState("");
  const [verification, setVerification] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const metadata =
        type === "ingredient"
          ? { defaultHalalRisk: risk === "Yes" }
          : type === "supplier" && verification
            ? { verificationStatus: verification }
            : type === "standard" && citation
              ? { citation }
              : undefined;
      await api(`/reference-data/${type}`, {
        method: "POST",
        body: { value, ...(metadata ? { metadata } : {}) },
        idempotencyKey: `ui-refdata-${crypto.randomUUID()}`,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add New Entry" onClose={onClose}>
      <p className="muted">
        Re-adding a name whose only existing entries are deprecated is not a duplicate — it becomes the next version,
        chained to the one it replaces.
      </p>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      <TextField label="Entry name / value" value={value} onChange={setValue} hint="Free text is the System Admin's job: this defines the vocabulary everything else must match." />
      {type === "ingredient" ? (
        <TextField
          label="Default Halal Risk classification"
          value={risk}
          onChange={(next) => setRisk(next === "Yes" ? "Yes" : "No")}
          hint='Type "Yes" to classify this ingredient as halal-risk by default. The ledger applies this on submission.'
        />
      ) : null}
      {type === "standard" ? <TextField label="Citation" value={citation} onChange={setCitation} /> : null}
      {type === "supplier" ? (
        <SelectField
          label="Verification status"
          value={verification}
          options={["verified", "unverified"]}
          onChange={setVerification}
          hint="Required: every ingredient record sourced from this supplier snapshots this value, and the ledger refuses a submission from a supplier with no status (ADR-CT-033)."
        />
      ) : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button
          className="primary"
          type="button"
          disabled={busy || value.trim().length === 0 || (type === "supplier" && verification === "")}
          onClick={() => void submit()}
        >
          Submit
        </button>
      </div>
    </Modal>
  );
}

function DeprecateModal({
  type,
  entry,
  onClose,
  onDone,
}: {
  type: string;
  entry: ReferenceEntry;
  onClose: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  return (
    <Modal title="Deprecate Reference Entry" onClose={onClose}>
      <p>
        Mark <strong>{entry.value}</strong> (v{entry.version}) as deprecated? This does not delete it — it stays
        queryable, and a verdict recorded while it was active keeps citing it.
      </p>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button
          className="danger"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/reference-data/${type}/${encodeURIComponent(entry.value)}/deprecate`, {
                method: "POST",
                body: {},
                idempotencyKey: `ui-deprecate-${crypto.randomUUID()}`,
              });
              onDone();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Could not deprecate the entry.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm Deprecate
        </button>
      </div>
    </Modal>
  );
}
