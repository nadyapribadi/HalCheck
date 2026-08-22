# HALCHECK — Risk Register

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.3.0:** Closed R-018 through the pre-build authority closure: production corrections now use the same append-only linkage as ingredient corrections.

## Risk Summary

This feature carries a different risk profile than a typical UI addition: it makes an accountability claim (tamper-evidence, role enforcement) that only holds if implementation matches design exactly. The core risk strategy is that every enforcement rule must exist at the chaincode level, and every claim made about the system must be defensible under direct questioning. This project's scope has grown substantially since that strategy was first stated (11 requirements → 23, 5 sprints → 10 sprints), and the eight-review process that produced this document set is the primary mitigation against that growth becoming unmanaged — this register explicitly tracks that growth as a risk in its own right, not just its symptoms.

## Register

| ID | Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R-001 | A rule is enforced only in frontend/backend, creating a silent bypass at the chaincode level | Critical | Medium | Every rule requires a paired chaincode-level negative test before being considered complete | Chaincode |
| R-002 | Feature is perceived as overclaiming ("prevents fraud") rather than demonstrating a mechanism | High | Medium | Positioning language fixed in BRD/PRD; consistently restated across all materials | Product |
| R-003 | Feature dilutes the core product's identity as a compliance screening tool | High | Medium | Kept structurally bounded — folded into existing docs, not elevated to a headline capability | Product |
| R-004 | Default credentials (Fabric CA, PostgreSQL, MinIO) survive into a publicly reachable state | Critical | Medium | Pre-demo checklist requires rotation confirmation every time, not just once | Security |
| R-005 | Tunnel exposes an internal service (ledger, CouchDB, admin endpoints) | Critical | Medium | Explicit ingress allow-list with catch-all deny; negative-tested before first public use | Security |
| R-006 | Host machine unavailability is mistaken for a system failure by a viewer | Medium | High | Access limitations stated plainly wherever the link is shared, not implied as permanent | Product |
| R-007 | Chaincode logic changed via ad hoc redeploy, breaking the audit trail of what rule applied when | High | Low | Formal Fabric chaincode lifecycle (approve then commit) required, no shortcuts | Chaincode |
| R-008 | Vibe-coded chaincode/identity logic accepted without review, hiding a subtle governance flaw | Critical | Medium | Guardrails document; negative tests mandatory; generated config files manually reviewed | Chaincode |
| R-009 | Scope creep — payment flow, multi-org hosting, or other deferred items pulled into current build | Medium | Medium | Any scope addition requires a new ADR entry before work starts | Product |
| R-010 | Apple Silicon / Fabric tooling friction stalls Build phase | Medium | Medium | Known caveat documented in Developer Setup; expected, not treated as a blocker if encountered | Developer |
| R-011 | 16GB RAM constraint makes local full-network testing unreliable | Medium | Medium | Minimal single-org topology available as fallback; resource guidance documented | Developer |
| R-012 | Citations/standards references included that aren't structurally tied to an actual modeled step | Low | Medium | Citation discipline rule: only cite what governs a step actually being modeled | Product |
| R-013 | Recognition-directionality mechanic implemented but visually buried, losing its intended demonstration value | Medium | Low | Explicit UI requirement (PRD-CT-009) that it be labeled, not just recorded | UI |
| R-014 | Reviewer cannot independently verify tamper-evidence claim, must take it on faith | High | Low | Tamper-evidence sandbox built specifically to make the claim demonstrable, not just stated | UI/Product |
| R-015 | Documentation drifts from actual implementation as Build proceeds | Medium | Medium | Requirements Traceability Matrix maintained as a living reference, not a one-time artifact | Product |
| R-016 | Solo-developer bandwidth/continuity — the entire project depends on one person's availability, understanding, and context; no bus-factor redundancy exists | High | Medium | The documentation suite itself is the primary mitigation — its thoroughness (23 requirements, full traceability, ADR log, 8 independent review passes) exists specifically to lower this risk | Solo developer |
| R-017 | Cumulative scope growth without a corresponding re-baseline — each individual addition was well-reasoned in isolation, but the aggregate materially changed what "V1" means from its original static-mocked-demo definition | Medium | Realized (already occurred once) | Addressed retroactively via the eight-review process and Implementation Plan re-baseline; any new scope addition requires an explicit ADR and a check against whether it triggers another re-baseline | Solo developer |
| R-018 | Production correction linkage was previously absent while Fail verdicts could flag production records | Medium | Closed | Resolved by DCG-005: production records now carry append-only `supersedes_record_id`, with dedicated negative tests | Product/Chaincode |

## Top Risks to Address Before Build Starts

1. R-001 — enforcement duplication/bypass risk (chaincode discipline must be established from the first line of code).
2. R-008 — vibe-coding review discipline for chaincode/identity specifically.
3. R-009 — scope creep guardrail (ADR-required for any addition).
4. R-017 — explicit acknowledgment that the re-baselined Implementation Plan is the actual reference going forward, not the original 5-sprint version.
5. R-018 — resolved by DCG-005; implement and test the agreed production-correction model before enabling it.

## Top Risks to Address Before Any Public Demo Link Is Shared

1. R-004 — credential rotation.
2. R-005 — tunnel exposure scope.
3. R-006 — availability expectation-setting.
4. R-002 / R-003 — positioning and scope-dilution language, reviewed one final time before sharing.

## Risk Review Cadence

- Review this register at the end of each Implementation Plan phase, not only at project completion.
- Add a new risk entry whenever a new ADR is logged, if the decision introduces any new exposure.
- Treat R-001, R-004, R-005, and R-008 as hard release blockers — Build is not considered complete while any of these remain unmitigated, regardless of how much else is finished.
- R-016 is not closeable — it's a standing, structural risk for any solo project. Reviewed passively: does the documentation suite remain current enough that a gap in developer availability wouldn't strand the project.
- R-017 review trigger: any future scope addition must explicitly answer "does this require another Implementation Plan re-baseline" as part of its ADR — not just "does this require a new requirement ID."
