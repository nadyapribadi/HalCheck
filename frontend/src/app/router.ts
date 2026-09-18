import React from "react";

// The route table in docs/10_ui_flow_navigation.md §6, expressed as a hash
// router. Hash routing keeps the walkthrough honest with no server rewrite
// rules: every route in that table is reachable by URL, which is what the
// tunnel-exposure negative test (docs/08 §6) needs to point at.
export interface Route {
  name:
    | "login"
    | "batches"
    | "batch"
    | "ingredients"
    | "production"
    | "verdict"
    | "export"
    | "sandbox"
    | "integrity"
    | "verify"
    | "admin"
    | "admin-reference-data"
    | "admin-audit-log"
    | "not-found";
  batchId?: string;
  refType?: string;
}

export function parseRoute(hash: string): Route {
  const path = (hash.replace(/^#/, "") || "/login").split("?")[0]!;
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0 || parts[0] === "login") return { name: "login" };
  // ADR-CT-034: the proof-bundle verifier is deliberately outside the
  // authenticated shells -- the person checking someone else's claim is
  // exactly the person who does not have a login here.
  if (parts[0] === "verify") return { name: "verify" };
  if (parts[0] === "admin") {
    if (parts[1] === "reference-data" && parts[2]) {
      return { name: "admin-reference-data", refType: parts[2] };
    }
    if (parts[1] === "audit-log") return { name: "admin-audit-log" };
    return { name: "admin" };
  }
  if (parts[0] === "batches") {
    if (parts.length === 1) return { name: "batches" };
    const batchId = parts[1]!;
    const sub = parts[2];
    if (!sub) return { name: "batch", batchId };
    if (sub === "ingredients") return { name: "ingredients", batchId };
    if (sub === "production") return { name: "production", batchId };
    if (sub === "verdict") return { name: "verdict", batchId };
    if (sub === "export") return { name: "export", batchId };
    if (sub === "integrity-sandbox") return { name: "sandbox", batchId };
    if (sub === "integrity") return { name: "integrity", batchId };
    return { name: "not-found" };
  }
  return { name: "not-found" };
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

export function useRoute(): Route {
  const [hash, setHash] = React.useState(() => window.location.hash);
  React.useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return parseRoute(hash);
}
