// Public surface of the screening engine.

export { evaluate } from "./evaluate";
export { buildRationale } from "./rationale";
// runScreeningForTargets/resolveTargets are the same run split in two, for
// callers that assemble their own EvaluationTargets instead of resolving
// them out of a DatasetRelease (Compliance Trail's verdict bridge, where the
// inputs are the batch's own ledger records -- ADR-CT-033).
export { runScreening, runScreeningForTargets, resolveTargets, ENGINE_VERSION } from "./run";
export type * from "./types";
