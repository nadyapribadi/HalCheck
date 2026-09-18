import React from "react";
import { api } from "../../api/client";
import { navigate } from "../../app/router";
import { useAsync } from "../../lib/useAsync";

const CATEGORIES: Array<{ type: string; label: string }> = [
  { type: "ingredient", label: "Ingredients" },
  { type: "supplier", label: "Suppliers" },
  { type: "standard", label: "Standards" },
  { type: "fail_reason", label: "Fail Reasons" },
];

interface Entry {
  value: string;
  status: "active" | "deprecated";
}

export function ReferenceDataOverviewScreen(): React.ReactElement {
  const state = useAsync(async () => {
    const lists = await Promise.all(CATEGORIES.map((category) => api<Entry[]>(`/reference-data/${category.type}`)));
    return lists.map((list) => list.filter((entry) => entry.status === "active").length);
  }, []);

  return (
    <div className="page stack">
      <div className="row-between">
        <h1>Reference data</h1>
        <button type="button" onClick={() => navigate("/admin/audit-log")}>View audit log</button>
      </div>
      <p className="muted">
        What the system considers valid. Changes here are what make a new ingredient, supplier or standard usable in the
        operational shell.
      </p>

      {state.loading ? <p className="muted">Loading…</p> : null}
      {state.error ? <div className="feedback feedback-error">{state.error.message}</div> : null}

      {state.data ? (
        state.data.every((count) => count === 0) ? (
          <div className="card muted">No reference data configured yet.</div>
        ) : (
          <div className="tiles">
            {CATEGORIES.map((category, index) => (
              <button
                key={category.type}
                className="tile"
                type="button"
                onClick={() => navigate(`/admin/reference-data/${category.type}`)}
              >
                <div className="tile-count">{state.data?.[index] ?? 0}</div>
                <div>{category.label}</div>
                <div className="muted">active entries</div>
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
