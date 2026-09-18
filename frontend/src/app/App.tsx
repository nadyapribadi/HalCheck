import React from "react";
import { session } from "../auth/session";
import { navigate, useRoute } from "./router";
import { roleLandingPath, useBatches } from "../lib/useBatches";
import { RoleContextBar } from "../components/RoleContextBar";
import { LoginScreen } from "../screens/LoginScreen";
import { BatchListScreen } from "../screens/BatchListScreen";
import { BatchDetailScreen, type BatchModal } from "../screens/BatchDetailScreen";
import { IngredientPanelScreen } from "../screens/IngredientPanelScreen";
import { ReferenceDataOverviewScreen } from "../screens/admin/ReferenceDataOverviewScreen";
import { ReferenceDataListScreen } from "../screens/admin/ReferenceDataListScreen";
import { AuditLogScreen } from "../screens/admin/AuditLogScreen";
import { IntegrityPanelScreen } from "../screens/IntegrityPanelScreen";
import { VerifyBundleScreen } from "../screens/VerifyBundleScreen";

const OPERATIONAL = new Set([
  "batches",
  "batch",
  "ingredients",
  "production",
  "verdict",
  "export",
  "sandbox",
  "integrity",
]);
const GOVERNANCE = new Set(["admin", "admin-reference-data", "admin-audit-log"]);

export function App(): React.ReactElement {
  const route = useRoute();
  const [current, setCurrent] = React.useState(session.get());

  React.useEffect(() => session.subscribe(() => setCurrent(session.get())), []);

  const role = current?.role ?? null;
  const batches = useBatches(Boolean(role) && role !== "system_admin");

  // docs/10 §6's redirect table, enforced in one place: unauthenticated goes
  // to login, System Admin never sees the operational shell, and an
  // operational role never reaches the governance shell.
  React.useEffect(() => {
    if (!role) {
      // /verify is public by design (ADR-CT-034): verification must not
      // require an account, or it is not independent verification.
      if (route.name !== "login" && route.name !== "verify") navigate("/login");
      return;
    }
    if (route.name === "login") {
      navigate(roleLandingPath(role));
      return;
    }
    if (role === "system_admin" && OPERATIONAL.has(route.name)) {
      navigate("/admin");
      return;
    }
    if (role !== "system_admin" && GOVERNANCE.has(route.name)) {
      navigate("/batches");
    }
  }, [role, route.name]);

  if (route.name === "verify") return <VerifyBundleScreen />;

  if (!current || !role) return <LoginScreen />;

  function body(): React.ReactElement {
    if (role === "system_admin") {
      if (route.name === "admin-reference-data" && route.refType) {
        return <ReferenceDataListScreen type={route.refType} />;
      }
      if (route.name === "admin-audit-log") return <AuditLogScreen />;
      return <ReferenceDataOverviewScreen />;
    }

    if (route.name === "ingredients" && route.batchId) {
      return <IngredientPanelScreen batchId={route.batchId} onChanged={batches.reload} />;
    }
    if (route.name === "batch" && route.batchId) {
      return <BatchDetailScreen batchId={route.batchId} modal={null} onChanged={batches.reload} />;
    }
    if (route.name === "integrity" && route.batchId) {
      return <IntegrityPanelScreen batchId={route.batchId} />;
    }
    const modalRoutes: Record<string, BatchModal> = {
      production: "production",
      verdict: "verdict",
      export: "export",
      sandbox: "sandbox",
    };
    if (route.batchId && modalRoutes[route.name]) {
      return <BatchDetailScreen batchId={route.batchId} modal={modalRoutes[route.name]!} onChanged={batches.reload} />;
    }
    return <BatchListScreen state={batches} />;
  }

  return (
    <>
      <RoleContextBar
        role={role}
        awaitingCount={batches.awaitingCount}
        onNavigateHome={() => navigate(roleLandingPath(role))}
        showBadge={role !== "system_admin" && role !== "brand_owner"}
      />
      {body()}
    </>
  );
}
