// Profile Setup -> Ingredient Intake -> Screening Results -> Report, plus a
// Reference Browser reachable at any point (FRD-CORE-REF-001: viewable
// "before or after running a screening"). All 5 screens from docs/09's Core
// Screening App UI section are now wired to the real engine and storage layer.

import { useEffect, useState } from "react";
import { activeDatasetRelease } from "../data/loadDatasetRelease";
import { runScreening } from "../engine/run";
import type { IngredientRecord, ScreeningProfile, ScreeningRun } from "../engine/types";
import { IngredientIntakeScreen } from "../features/intake/IngredientIntakeScreen";
import { ProfileSetupScreen } from "../features/profiles/ProfileSetupScreen";
import { ReferenceBrowserScreen } from "../features/reference/ReferenceBrowserScreen";
import { ReportScreen } from "../features/report/ReportScreen";
import { ScreeningResultsScreen } from "../features/screening/ScreeningResultsScreen";
import { listStoredProfileIds, loadScreeningState, saveScreeningState, type LoadResult } from "../storage";

type Screen = "profile" | "intake" | "results" | "report";

function isFound(result: LoadResult): result is Extract<LoadResult, { status: "found" }> {
  return result.status === "found";
}

export function App() {
  const [screen, setScreen] = useState<Screen>("profile");
  const [profile, setProfile] = useState<ScreeningProfile | null>(null);
  const [ingredientRecords, setIngredientRecords] = useState<IngredientRecord[]>([]);
  const [run, setRun] = useState<ScreeningRun | null>(null);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);

  // Resume the most recently saved profile, if any (FRD-CORE-STORAGE-001).
  useEffect(() => {
    const loaded = listStoredProfileIds()
      .map((id) => loadScreeningState(id))
      .filter(isFound)
      .map((result) => result.state)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

    const mostRecent = loaded[0];
    if (mostRecent) {
      setProfile(mostRecent.profile);
      setIngredientRecords(mostRecent.ingredientRecords);
      setRun(mostRecent.run);
      setScreen(mostRecent.run ? "results" : "intake");
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    saveScreeningState(profile, ingredientRecords, run);
  }, [profile, ingredientRecords, run]);

  function handleCreateProfile(newProfile: ScreeningProfile) {
    setProfile(newProfile);
    setIngredientRecords([]);
    setRun(null);
    setScreen("intake");
  }

  function handleAddIngredient(record: IngredientRecord) {
    setIngredientRecords((records) => [...records, record]);
  }

  function handleRemoveIngredient(recordId: string) {
    setIngredientRecords((records) => records.filter((record) => record.recordId !== recordId));
  }

  function handleRunScreening() {
    if (!profile) return;
    setRun(runScreening(profile, ingredientRecords, activeDatasetRelease));
    setScreen("results");
  }

  function handleStartNewProfile() {
    setProfile(null);
    setIngredientRecords([]);
    setRun(null);
    setScreen("profile");
  }

  if (isReferenceOpen) {
    return (
      <main>
        <ReferenceBrowserScreen onClose={() => setIsReferenceOpen(false)} />
      </main>
    );
  }

  return (
    <main>
      <div className="app-nav">
        <span className="app-title">HALCHECK — Core Screening App</span>
        <button type="button" onClick={() => setIsReferenceOpen(true)}>
          Reference Data
        </button>
      </div>

      {screen === "profile" && <ProfileSetupScreen onCreate={handleCreateProfile} />}

      {screen === "intake" && profile && (
        <IngredientIntakeScreen
          profile={profile}
          ingredientRecords={ingredientRecords}
          onAdd={handleAddIngredient}
          onRemove={handleRemoveIngredient}
          onRunScreening={handleRunScreening}
        />
      )}

      {screen === "results" && run && (
        <ScreeningResultsScreen
          run={run}
          ingredientRecords={ingredientRecords}
          onViewReport={() => setScreen("report")}
          onStartNewProfile={handleStartNewProfile}
        />
      )}

      {screen === "report" && run && (
        <ReportScreen
          run={run}
          ingredientRecords={ingredientRecords}
          onStartNewProfile={handleStartNewProfile}
        />
      )}
    </main>
  );
}
