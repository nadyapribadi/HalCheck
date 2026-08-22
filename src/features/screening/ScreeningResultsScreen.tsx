// docs/09_ui_specification.md, Core Screening App UI section, §25.
// Every Finding is shown inline, not collapsed by default -- Fail states
// stay as legible as Pass.

import type { IngredientRecord, ScreeningRun } from "../../engine/types";
import { FindingList } from "./FindingList";

interface ScreeningResultsScreenProps {
  run: ScreeningRun;
  ingredientRecords: IngredientRecord[];
  onViewReport: () => void;
  onStartNewProfile: () => void;
}

export function ScreeningResultsScreen({
  run,
  ingredientRecords,
  onViewReport,
  onStartNewProfile,
}: ScreeningResultsScreenProps) {
  return (
    <section className="screen">
      <h1>Screening results</h1>
      <p className={`overall-status status-${run.overallStatus}`}>
        Overall: {run.overallStatus === "pass" ? "Pass" : "Fail"}
      </p>
      <p className="meta">
        Dataset release {run.datasetReleaseId} · Engine {run.engineVersion} · Run at{" "}
        {new Date(run.runAt).toLocaleString()}
      </p>

      <FindingList findings={run.findings} ingredientRecords={ingredientRecords} />

      <p className="disclaimer">
        This is a screening opinion, not a certification, and not a religious ruling.
      </p>

      <div className="screen-actions">
        <button type="button" onClick={onViewReport}>
          View Report
        </button>
        <button type="button" onClick={onStartNewProfile}>
          Start New Profile
        </button>
      </div>
    </section>
  );
}
