import React from "react";
import { ROLE_LABELS, session, type Role } from "../auth/session";
import { navigate } from "../app/router";

interface Props {
  role: Role;
  awaitingCount: number | null;
  onNavigateHome: () => void;
  showBadge: boolean;
}

// docs/11 §4: the badge is not rendered at all at zero, states the exact
// count, and clicking it just goes to the already-filtered batch list.
export function RoleContextBar({ role, awaitingCount, onNavigateHome, showBadge }: Props): React.ReactElement {
  const count = awaitingCount ?? 0;
  return (
    <header className="context-bar">
      <div className="context-bar-inner">
        <div className="row">
          <span className="brand" onClick={onNavigateHome} style={{ cursor: "pointer" }}>
            HALCHECK<span>Compliance Trail</span>
          </span>
        </div>
        <div className="row">
          {showBadge && count > 0 ? (
            <button className="badge" onClick={() => navigate("/batches")} type="button">
              {count === 1 ? "1 batch awaiting your action" : `${count} batches awaiting your action`}
            </button>
          ) : null}
          <span className="muted">{ROLE_LABELS[role]}</span>
          <button
            type="button"
            onClick={() => {
              session.clear();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
