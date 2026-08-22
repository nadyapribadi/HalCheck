// docs/09_ui_specification.md, Core Screening App UI section, §26.
// Export is print-to-PDF via the browser (FRD-CORE-REPORT-004) -- no
// server-side rendering, consistent with the no-backend constraint.

import type { IngredientRecord, ScreeningRun } from "../../engine/types";
import { FindingList } from "../screening/FindingList";

interface ReportScreenProps {
  run: ScreeningRun;
  ingredientRecords: IngredientRecord[];
  onStartNewProfile: () => void;
}

export function ReportScreen({ run, ingredientRecords, onStartNewProfile }: ReportScreenProps) {
  return (
    <section className="screen">
      <h1>Screening report</h1>
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
        <button type="button" onClick={() => window.print()}>
          Export (Print / Save as PDF)
        </button>
        <button type="button" onClick={onStartNewProfile}>
          Start New Profile
        </button>
      </div>
    </section>
  );
}
