// Shared between ScreeningResultsScreen and ReportScreen -- both render the
// exact same Finding list (docs/09, Core Screening App UI section, §25/§26).

import { activeDatasetRelease } from "../../data/loadDatasetRelease";
import type { Finding, IngredientRecord } from "../../engine/types";

interface FindingListProps {
  findings: Finding[];
  ingredientRecords: IngredientRecord[];
}

export function FindingList({ findings, ingredientRecords }: FindingListProps) {
  return (
    <ul className="finding-list">
      {findings.map((finding) => (
        <li key={finding.findingId} className={`finding status-${finding.result}`}>
          <FindingRow finding={finding} ingredientRecords={ingredientRecords} />
        </li>
      ))}
    </ul>
  );
}

function FindingRow({
  finding,
  ingredientRecords,
}: {
  finding: Finding;
  ingredientRecords: IngredientRecord[];
}) {
  const rule = activeDatasetRelease.standards.find((candidate) => candidate.ruleId === finding.ruleId);
  const flaggedRecord = ingredientRecords.find((record) => record.recordId === finding.flaggedRecordId);
  const flaggedIngredient = flaggedRecord
    ? activeDatasetRelease.ingredients.find((entry) => entry.entryId === flaggedRecord.ingredientEntryId)
    : undefined;

  const resultLabel =
    finding.result === "pass" ? "Pass" : finding.result === "fail" ? "Fail" : "Not applicable";

  return (
    <div>
      <p className="finding-header">
        {finding.ruleId} — {rule?.citation} — {resultLabel}
      </p>
      <p className="finding-rationale">{finding.rationaleText}</p>
      {flaggedIngredient && <p className="finding-flagged">Flagged: {flaggedIngredient.name}</p>}
    </div>
  );
}
