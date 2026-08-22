// docs/09_ui_specification.md, Core Screening App UI section, §24.
// Read-only, always available -- no write action anywhere on this screen,
// since this app never writes reference data itself.

import { useState } from "react";
import { activeDatasetRelease } from "../../data/loadDatasetRelease";

type Tab = "standards" | "ingredients" | "suppliers" | "recognition";

const TABS: { id: Tab; label: string }[] = [
  { id: "standards", label: "Standards" },
  { id: "ingredients", label: "Ingredients" },
  { id: "suppliers", label: "Suppliers" },
  { id: "recognition", label: "Recognition Agreements" },
];

interface ReferenceBrowserScreenProps {
  onClose: () => void;
}

export function ReferenceBrowserScreen({ onClose }: ReferenceBrowserScreenProps) {
  const [tab, setTab] = useState<Tab>("standards");

  return (
    <section className="screen">
      <h1>Reference data</h1>
      <p className="meta">
        Dataset release {activeDatasetRelease.releaseId} ({activeDatasetRelease.status})
      </p>

      <div className="tab-bar">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={tab === option.id ? "tab-active" : ""}
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "standards" && (
        <table className="record-table">
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Standard</th>
              <th>Citation</th>
              <th>Market</th>
              <th>Requirement</th>
            </tr>
          </thead>
          <tbody>
            {activeDatasetRelease.standards.map((rule) => (
              <tr key={rule.ruleId}>
                <td>{rule.ruleId}</td>
                <td>{rule.standard}</td>
                <td>{rule.citation}</td>
                <td>{rule.appliesToMarket}</td>
                <td>{rule.requirementType.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "ingredients" && (
        <table className="record-table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Default Halal Risk</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {activeDatasetRelease.ingredients.map((ingredient) => (
              <tr key={ingredient.entryId}>
                <td>{ingredient.name}</td>
                <td>{ingredient.defaultHalalRisk ? "Yes" : "No"}</td>
                <td>{ingredient.riskNote ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "suppliers" && (
        <table className="record-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Verification Status</th>
            </tr>
          </thead>
          <tbody>
            {activeDatasetRelease.suppliers.map((supplier) => (
              <tr key={supplier.entryId}>
                <td>{supplier.name}</td>
                <td>{supplier.verificationStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "recognition" && (
        <table className="record-table">
          <thead>
            <tr>
              <th>Issuing Body</th>
              <th>Requiring Body</th>
              <th>Recognized</th>
              <th>As of</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {activeDatasetRelease.recognitionAgreements.map((agreement) => (
              <tr key={agreement.agreementId}>
                <td>{agreement.issuingBody}</td>
                <td>{agreement.requiringBody}</td>
                <td>{agreement.recognized ? "Yes" : "No"}</td>
                <td>{agreement.asOfDate}</td>
                <td>{agreement.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
