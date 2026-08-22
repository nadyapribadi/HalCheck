// docs/09_ui_specification.md, Core Screening App UI section, §23.
//
// Ingredient Name and Source are native <select> elements sourced from the
// active dataset release's reference lists -- no free-text option, matching
// FRD-CORE-INTAKE-001. A dedicated SearchableSelect component (with
// type-ahead filtering) is deferred to a later pass; the underlying
// controlled-vocabulary requirement is already fully satisfied without it.
// Halal Risk override UI (FRD-CORE-INTAKE-004) is also deferred -- every
// ingredient added here uses the reference list's default classification.

import { useState, type FormEvent } from "react";
import { activeDatasetRelease } from "../../data/loadDatasetRelease";
import type { CertifyingBody, IngredientRecord, ScreeningProfile } from "../../engine/types";

interface IngredientIntakeScreenProps {
  profile: ScreeningProfile;
  ingredientRecords: IngredientRecord[];
  onAdd: (record: IngredientRecord) => void;
  onRemove: (recordId: string) => void;
  onRunScreening: () => void;
}

const CERTIFICATE_OPTIONS: { value: CertifyingBody | ""; label: string }[] = [
  { value: "", label: "No certificate" },
  { value: "BPJPH", label: "BPJPH" },
  { value: "JAKIM", label: "JAKIM" },
];

export function IngredientIntakeScreen({
  profile,
  ingredientRecords,
  onAdd,
  onRemove,
  onRunScreening,
}: IngredientIntakeScreenProps) {
  const [ingredientEntryId, setIngredientEntryId] = useState("");
  const [supplierEntryId, setSupplierEntryId] = useState("");
  const [certificateIssuingBody, setCertificateIssuingBody] = useState<CertifyingBody | "">("");

  const selectedIngredient = activeDatasetRelease.ingredients.find(
    (ingredient) => ingredient.entryId === ingredientEntryId,
  );
  const canAdd = ingredientEntryId !== "" && supplierEntryId !== "" && selectedIngredient !== undefined;

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!canAdd || !selectedIngredient) return;

    onAdd({
      recordId: crypto.randomUUID(),
      profileId: profile.profileId,
      ingredientEntryId,
      supplierEntryId,
      halalRiskFlag: selectedIngredient.defaultHalalRisk,
      certificateIssuingBody: certificateIssuingBody || undefined,
    });

    setIngredientEntryId("");
    setSupplierEntryId("");
    setCertificateIssuingBody("");
  }

  return (
    <section className="screen">
      <h1>Ingredient intake</h1>
      <p className="meta">
        Intended market: {profile.intendedMarket} · Dataset release {activeDatasetRelease.releaseId}
      </p>

      <table className="record-table">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Source</th>
            <th>Halal Risk</th>
            <th>Certificate</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ingredientRecords.map((record) => {
            const ingredient = activeDatasetRelease.ingredients.find(
              (entry) => entry.entryId === record.ingredientEntryId,
            );
            const supplier = activeDatasetRelease.suppliers.find(
              (entry) => entry.entryId === record.supplierEntryId,
            );
            return (
              <tr key={record.recordId}>
                <td>{ingredient?.name ?? record.ingredientEntryId}</td>
                <td>{supplier?.name ?? record.supplierEntryId}</td>
                <td>{record.halalRiskFlag ? "Yes" : "No"}</td>
                <td>{record.certificateIssuingBody ?? "—"}</td>
                <td>
                  <button type="button" onClick={() => onRemove(record.recordId)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
          {ingredientRecords.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                No ingredients added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={handleAdd} className="add-ingredient-form">
        <label htmlFor="ingredient-name">
          Ingredient Name
          <select
            id="ingredient-name"
            value={ingredientEntryId}
            onChange={(event) => setIngredientEntryId(event.target.value)}
          >
            <option value="" disabled>
              Select an ingredient
            </option>
            {activeDatasetRelease.ingredients.map((ingredient) => (
              <option key={ingredient.entryId} value={ingredient.entryId}>
                {ingredient.name}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="ingredient-source">
          Source
          <select
            id="ingredient-source"
            value={supplierEntryId}
            onChange={(event) => setSupplierEntryId(event.target.value)}
          >
            <option value="" disabled>
              Select a supplier
            </option>
            {activeDatasetRelease.suppliers.map((supplier) => (
              <option key={supplier.entryId} value={supplier.entryId}>
                {supplier.name} ({supplier.verificationStatus})
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="certificate-issuing-body">
          Certificate Issuing Body
          <select
            id="certificate-issuing-body"
            value={certificateIssuingBody}
            onChange={(event) => setCertificateIssuingBody(event.target.value as CertifyingBody | "")}
          >
            {CERTIFICATE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {selectedIngredient && (
          <p className="meta">
            Halal Risk Flag (auto): {selectedIngredient.defaultHalalRisk ? "Yes" : "No"}
            {selectedIngredient.riskNote ? ` — ${selectedIngredient.riskNote}` : ""}
          </p>
        )}

        <button type="submit" disabled={!canAdd}>
          Add Ingredient
        </button>
      </form>

      <button type="button" disabled={ingredientRecords.length === 0} onClick={onRunScreening}>
        Run Screening
      </button>
    </section>
  );
}
