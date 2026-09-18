import React from "react";
import { ApiError, api } from "../api/client";
import { navigate } from "../app/router";
import { deriveStatus, latestVerdict, type BatchTrail, type IngredientRecord } from "../lib/batchStatus";
import { useAsync } from "../lib/useAsync";
import { SelectField, TextField } from "../components/Field";
import { useToast } from "../components/useToast";

interface ReferenceEntry {
  value: string;
  status: "active" | "deprecated";
}

interface PreviewRow {
  key: string;
  name: string;
  source: string;
  override: boolean;
  overrideValue: boolean;
  overrideReason: string;
}

export function IngredientPanelScreen({ batchId, onChanged }: { batchId: string; onChanged: () => void }): React.ReactElement {
  const trail = useAsync(() => api<BatchTrail>(`/batches/${encodeURIComponent(batchId)}/trail`), [batchId]);
  const ingredients = useAsync(
    () => api<ReferenceEntry[]>("/reference-data/ingredient"),
    [],
  );
  const suppliers = useAsync(() => api<ReferenceEntry[]>("/reference-data/supplier"), []);

  const [rows, setRows] = React.useState<PreviewRow[]>([]);
  const [name, setName] = React.useState("");
  const [source, setSource] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [overrideValue, setOverrideValue] = React.useState("Halal risk");
  const [overrideReason, setOverrideReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [csvResult, setCsvResult] = React.useState<string[] | null>(null);
  const { show, element } = useToast();

  if (trail.loading || ingredients.loading || suppliers.loading) {
    return <div className="page"><p className="muted">Loading…</p></div>;
  }
  if (trail.error || !trail.data) {
    return <div className="page"><div className="feedback feedback-error">{trail.error?.message ?? "Batch not found."}</div></div>;
  }

  const data = trail.data;
  const status = deriveStatus(data);
  const correctionMode = status === "awaiting_correction";
  const verdict = latestVerdict(data);
  const flagged: IngredientRecord | undefined = correctionMode
    ? data.ingredientRecords.find((record) => record.recordId === verdict?.flaggedRecordId)
    : undefined;

  const activeIngredients = (ingredients.data ?? []).filter((entry) => entry.status === "active").map((entry) => entry.value);
  const activeSuppliers = (suppliers.data ?? []).filter((entry) => entry.status === "active").map((entry) => entry.value);

  function addRow(): void {
    setError(null);
    if (!name || !source) {
      setError("Select both an ingredient and a supplier before adding the row.");
      return;
    }
    if (override && overrideReason.trim().length === 0) {
      setError("An override reason is required when overriding the risk classification.");
      return;
    }
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        name,
        source,
        override,
        overrideValue: overrideValue === "Halal risk",
        overrideReason: overrideReason.trim(),
      },
    ]);
    setName("");
    setSource("");
    setOverride(false);
    setOverrideReason("");
  }

  async function submitRows(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      for (const row of rows) {
        await api(`/batches/${batchId}/ingredients`, {
          method: "POST",
          body: {
            name: row.name,
            source: row.source,
            ...(row.override ? { halalRiskFlag: row.overrideValue, overrideReason: row.overrideReason } : {}),
          },
          idempotencyKey: `ui-ingredient-${row.key}`,
        });
      }
      setRows([]);
      show(rows.length === 1 ? "Ingredient record submitted." : `${rows.length} ingredient records submitted.`);
      trail.reload();
      onChanged();
      navigate(`/batches/${batchId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(): Promise<void> {
    if (!flagged) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/batches/${batchId}/ingredients/correct`, {
        method: "POST",
        body: {
          name,
          source,
          ...(override ? { halalRiskFlag: overrideValue === "Halal risk", overrideReason } : {}),
        },
        idempotencyKey: `ui-ingredient-correct-${crypto.randomUUID()}`,
      });
      show("Correction submitted.");
      trail.reload();
      onChanged();
      navigate(`/batches/${batchId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Correction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCsv(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setCsvResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ results: Array<{ row: number; status: string; message?: string }> }>(
        `/batches/${batchId}/ingredients/upload`,
        { method: "POST", formData: form, idempotencyKey: `ui-upload-${crypto.randomUUID()}` },
      );
      setCsvResult(
        result.results.map((row) =>
          row.status === "committed" ? `Row ${row.row}: submitted` : `Row ${row.row}: ${row.message ?? "rejected"}`,
        ),
      );
      trail.reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      {element}
      <h1>{correctionMode ? `Correcting: ${flagged?.ingredientNameSnapshot ?? "flagged record"}` : "Ingredient records"}</h1>
      <p className="muted">
        Batch <span className="mono">{batchId}</span> · {data.batch.intendedMarket}
      </p>

      {error ? <div className="feedback feedback-error">{error}</div> : null}

      {correctionMode ? (
        <section className="card">
          <p className="muted">
            Only the flagged record can be corrected here. The batch's other records stay untouched — corrections are new
            linked records, never edits, and the ledger derives which record to replace from the Fail verdict itself.
          </p>
          <dl className="kv">
            <dt>Flagged record</dt>
            <dd className="mono">{flagged?.recordId ?? "—"}</dd>
            <dt>Flagged values</dt>
            <dd>
              {flagged?.ingredientNameSnapshot} · source {flagged?.sourceSnapshot}
            </dd>
          </dl>
          <SelectField
            label="Corrected ingredient"
            value={name || (flagged?.ingredientNameSnapshot ?? "")}
            options={activeIngredients}
            onChange={setName}
          />
          <SelectField
            label="Corrected source"
            value={source || (flagged?.sourceSnapshot ?? "")}
            options={activeSuppliers}
            onChange={setSource}
          />
          <div className="row">
            <label className="row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
                style={{ width: "auto" }}
              />
              Override the reference classification
            </label>
          </div>
          {override ? (
            <>
              <SelectField
                label="Overridden classification"
                value={overrideValue}
                options={["Halal risk", "No halal risk"]}
                onChange={setOverrideValue}
              />
              <TextField
                label="Override reason"
                value={overrideReason}
                onChange={setOverrideReason}
                hint="Recorded on the ledger next to the overridden classification."
              />
            </>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" onClick={() => navigate(`/batches/${batchId}`)}>Cancel</button>
            <button className="primary" type="button" disabled={busy} onClick={() => void submitCorrection()}>
              Submit correction
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Add an ingredient record</h2>
            <p className="muted">
              Ingredient and source are chosen from the governed reference lists — there is no free-text path, because the
              ledger resolves both values against reference data on submission.
            </p>
            <SelectField label="Ingredient name" value={name} options={activeIngredients} onChange={setName} />
            <SelectField label="Source" value={source} options={activeSuppliers} onChange={setSource} />
            <div className="row">
              <label className="row" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(event) => setOverride(event.target.checked)}
                  style={{ width: "auto" }}
                />
                Override the reference risk classification
              </label>
            </div>
            {override ? (
              <>
                <SelectField
                  label="Overridden classification"
                  value={overrideValue}
                  options={["Halal risk", "No halal risk"]}
                  onChange={setOverrideValue}
                />
                <TextField
                  label="Override reason"
                  value={overrideReason}
                  onChange={setOverrideReason}
                  hint="Required, and recorded on the ledger beside the overridden classification."
                />
              </>
            ) : (
              <p className="field-hint">
                Halal risk is classified by the ingredient's own reference entry, not by this screen.
              </p>
            )}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={addRow}>Add another ingredient</button>
            </div>
          </section>

          <section className="card">
            <h2>Preview before submit</h2>
            {rows.length === 0 ? (
              <p className="muted">No rows staged yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Source</th>
                    <th>Validation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td>{row.source}</td>
                      <td>
                        {row.override ? <span className="status status-pending">Override: {row.overrideReason}</span> : <span className="status status-pass">Ready</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => navigate(`/batches/${batchId}`)}>Cancel</button>
              <button className="primary" type="button" disabled={busy || rows.length === 0} onClick={() => void submitRows()}>
                Submit {rows.length > 1 ? `${rows.length} records` : "record"}
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Bulk upload</h2>
            <p className="muted">
              Spreadsheet rows are validated against both reference lists; a row whose ingredient or supplier is not
              recognised is rejected at that row, leaving the rest to commit.
            </p>
            <input
              type="file"
              accept=".csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadCsv(file);
              }}
            />
            {csvResult ? (
              <ul>
                {csvResult.map((line) => (
                  <li key={line} className="muted">{line}</li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
