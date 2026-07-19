# HALCHECK — Decision Log (ADR)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

Each entry: Status / Decision / Reason / Consequence, matching the reference decision-log format used across this project's documentation.

---

## ADR-CT-000: V1 redefined — real Hyperledger Fabric, not simulated

**Status:** Accepted

**Decision:** V1 uses a real, self-hosted Hyperledger Fabric network rather than a browser-only simulated hash-chain.

**Reason:** A genuine tamper-evidence claim requires a real enforcing mechanism; a simulated version could only ever claim tamper-evidence within the app's own UI, not against direct data tampering.

**Consequence:** V1 is a real infrastructure build (Docker, Fabric network, backend API), not a static-only deliverable. Deploy/Production remains explicitly out of scope; Design, Build, and Test are the actual boundary.

## ADR-CT-001: Feature folded into existing documentation structure

**Status:** Accepted

**Decision:** Compliance Trail's documentation follows the same document-suite structure as its parent product, rather than a bespoke format.

**Reason:** Keeps documentation portable and consistent across related projects.

## ADR-CT-002: Four write-roles + one read-only role

**Status:** Accepted

**Decision:** Ingredient QA, Production QA, Compliance Officer, Export/Logistics Officer (write); Brand Owner (read-only).

**Reason:** Mirrors a separation-of-duties governance pattern scaled to a single-brand contract-manufacturing flow.

## ADR-CT-003: Business process = sourcing → production → compliance → export

**Status:** Accepted

**Decision:** Four-step batch lifecycle, starting at ingredient sourcing and ending at export release request.

**Reason:** Keeps the product a B2B compliance tool; matches its existing scope boundary.

## ADR-CT-004: Chain is authoritative for sequencing only

**Status:** Accepted

**Decision:** The ledger gates actions but does not reimplement the compliance engine's rule logic.

**Reason:** Avoids duplicating already-locked engine rules; keeps a clean separation between "who did what, in what order" and "is this halal-compliant."

## ADR-CT-005: Ingredient input via bulk upload, granular recording

**Status:** Accepted

**Decision:** Spreadsheet upload; one record per ingredient, grouped under a shared upload-session identifier. Manual single-ingredient add allowed, append-only.

**Reason:** Matches real industry documentation practice; granular recording preserves traceability to one ingredient.

## ADR-CT-006: Fail verdicts create a visible, permanent record

**Status:** Accepted

**Decision:** A compliance Fail is recorded with the same permanence as a Pass.

**Reason:** Demonstrates governance value and matches real audit-trail practice.

## ADR-CT-007: Real identity per role

**Status:** Accepted

**Decision:** Each role is issued a real cryptographic identity via the certificate authority.

**Reason:** Under the real-Fabric architecture, this identity is the accountability mechanism itself.

**Consequence:** Identity issuance is planned as part of Build (Implementation Plan P1), not treated as trivial seed data.

## ADR-CT-008: Corrections are new records, never edits

**Status:** Accepted

**Decision:** A corrected Fail creates a new linked record; the original remains visible.

**Reason:** Consistent with the "nothing is silently altered" principle; structurally enforced — no update/delete function exists in chaincode for submitted records.

## ADR-CT-009: Recognition-directionality is a labeled field within the verdict record

**Status:** Accepted

**Decision:** Not a separate record type; explicitly labeled within the compliance verdict detail view.

**Reason:** Preserves visibility of a distinctive rule mechanic without fragmenting the record model.

## ADR-CT-010: Trail export/print deferred past this release

**Status:** Accepted

**Decision:** In-app viewing only for now.

**Reason:** Scope discipline, while explicitly named as a likely near-term ask rather than silently dropped.

## ADR-CT-011: Persist in localStorage — SUPERSEDED

**Status:** Superseded by ADR-CT-000

**Replaced by:** PostgreSQL (off-chain cache) + Hyperledger Fabric ledger (authoritative state).

## ADR-CT-012: Hand-rolled SHA-256 hash-chaining — SUPERSEDED

**Status:** Superseded by ADR-CT-000

**Replaced by:** Fabric's native ledger tamper-evidence — no custom hashing logic needed for chain integrity itself.

## ADR-CT-013a: Known limitation is single-host, not tamper-evidence

**Status:** Accepted

**Decision:** The tamper-evidence claim is now genuinely real and does not need a caveat. The actual limitation to disclose is architectural: single-network, single-host deployment with no independent multi-organization redundancy.

**Reason:** Accuracy — the honest caveat moved when the underlying mechanism changed.

## ADR-CT-014: Hyperledger Fabric selected as the platform

**Status:** Accepted

**Decision:** Real implementation uses Hyperledger Fabric, a permissioned open-source blockchain framework.

**Reason:** Fits a small number of known, non-anonymous participants; supports channel-based data segregation; free and open source.

## ADR-CT-015: Local-only build (Phase 0–2), no hosted deployment

**Status:** Accepted

**Decision:** Design, Build, and Test happen entirely on local hardware, at no cost. Deploy/Production is explicitly out of scope for this release.

**Reason:** Matches available resources and honest scope discipline.

## ADR-CT-016: Remote access via Cloudflare Tunnel, not permanent hosting

**Status:** Accepted

**Decision:** A shareable public link is provided via tunnel, routing to the local host machine. Availability is explicitly host-dependent.

**Reason:** Enables demoing without carrying hardware to a location, without taking on Deploy/Production's cost/complexity.

**Consequence:** Tunnel must expose only frontend and backend API ports; all other services must remain unreachable externally (Security Threat Model T-005).

## ADR-CT-017: Vibe-coding guardrails apply with extra weight to chaincode and identity layers

**Status:** Accepted

**Decision:** Every enforcement rule requires a chaincode-level negative test; no rule may be enforced only in frontend or backend.

**Reason:** A silent enforcement gap in this specific project defeats its entire stated purpose.

## ADR-CT-018: Documentation kept agnostic — no personal or source-research attribution

**Status:** Accepted

**Decision:** All project documentation omits personal names and specific source-research references.

**Reason:** Keeps documentation portable and independently defensible on its own reasoning.

## ADR-CT-019: Same HALCHECK repository, bounded module

**Status:** Accepted

**Decision:** Compliance Trail lives in the `halcheck` repository as a bounded HALCHECK module.

**Reason:** HALCHECK is the product identity. The core screening app can remain browser-only while Compliance Trail is documented and built as a distinct infrastructure module in the same repository. This avoids maintaining two repos while preserving the architectural boundary through naming, directory structure, README language, and implementation phases.

**Consequence:** The README and repository docs must clearly distinguish HALCHECK Core from Compliance Trail. Build paths for `chaincode/`, `backend/`, `frontend/`, and `network/` belong to the Compliance Trail module and must not be used to imply the core screening app has a backend in v1.

## ADR-CT-020: Cumulative scope growth acknowledged and re-baselined

**Status:** Accepted

**Decision:** This project's actual scope grew substantially beyond its original V1 definition through a series of individually well-reasoned additions — System Admin role, reference data governance, centralized audit log, field-level RBAC, and AI trail explanation — none wrong in isolation, but never checked against the original plan's assumptions until an independent eight-review process surfaced this explicitly.

**Reason:** Each addition was proposed and accepted for a real, articulated reason. The gap was the absence of a checkpoint asking whether the aggregate still matched what "V1" was supposed to mean.

**Consequence:** Implementation Plan re-baselined from 5 sprints to 10 sprints, formally superseding the original estimate. Risk Register gained R-017 as a standing, permanent risk. Going forward, any new scope addition's ADR must explicitly answer whether it triggers another Implementation Plan re-baseline. This entry does not reverse or reduce any of the five additions — all remain in scope, all are now fully specified and traced.

## ADR-CT-021: Verdict authority is binding, not discretionary

**Status:** Accepted

**Decision:** The compliance engine's Pass/Fail output is final. The Compliance Officer role has no override capability.

**Reason:** Simpler than an advisory model, avoids a second layer of maker-checker complexity, and matches the existing principle that the engine is the sole compliance authority.

**Consequence:** FRD-CHAIN-VERDICT-005/006 formalize this; the verdict-recording action requires no second-party review, since the check is the deterministic engine output itself.

## ADR-CT-022: Concurrency handled via native Fabric MVCC, no custom locking

**Status:** Accepted

**Decision:** Simultaneous submission attempts against the same batch are resolved via Fabric's native read-write conflict detection.

**Reason:** Uses what the platform already provides rather than adding a new lock-management component that would itself need threat-modeling.

## ADR-CT-023: Chaincode deployed as two independent modules

**Status:** Accepted

**Decision:** `batch` and `refdata` chaincode deploy as two separate, independently upgradable definitions on the same channel.

**Reason:** They change for different reasons and at different times — a bug fix to reference-data logic shouldn't require redeploying batch logic, and vice versa.

## ADR-CT-024: Reference data linkage uses denormalized snapshots, not live foreign keys

**Status:** Accepted

**Decision:** Every record referencing standards, ingredients, or suppliers stores the literal resolved value as text at submission time.

**Reason:** Matches the ledger's event-sourced nature; avoids a subtle bug class where a live-referenced version could be edited instead of superseded.

## ADR-CT-025: UI copy language is English

**Status:** Accepted

**Decision:** All UI copy across every screen is in English.

**Reason:** Portfolio-audience-first framing, given this project's primary purpose as a demonstration piece.
