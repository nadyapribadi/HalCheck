# HALCHECK — Roadmap

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## Roadmap Principles

- Prove chaincode enforcement before building UI on top of it.
- Prove one batch lifecycle end-to-end before adding governance/admin layers.
- Prove the mechanism locally before ever considering real hosting.
- Every version stays honest about what's demonstrated versus what's real infrastructure.
- No version ships a claim it can't survive being directly questioned about.

## v0.0 — Design Baseline

Status: complete.

Deliverables: full 24-document set (Charter, BRD, PRD, FRD, TRD, Architecture, ERD, Security Threat Model, Test Strategy, UI Specification, UI Flow & Navigation, Screen Requirements, Seed Data Specification, Implementation Plan, Developer Setup, Config Reference, Risk Register, API Reference, Vibe-Coding Guardrails, Repository Structure Guide, Glossary, Decision Log, Requirements Traceability Matrix, Roadmap), plus eight independent expert review passes with every finding closed or explicitly accepted. The pre-build authority closure lives in TRD §23 and hygiene acceptance in Repository Structure Guide §11.

Exit criteria: Build can begin against a fully specified, internally consistent, reviewed design — met.

## v0.1 — Chaincode Foundation (Implementation Plan P0–P3)

Goal: a real local Fabric network with enforced, tested chaincode — no UI yet.

Deliverables: local network running (P0); 6 role identities issued (P1); the four Chaincode Design Gate decisions resolved (P1.5); batch and refdata chaincode modules, independently deployable (P2); full negative-test coverage (P3).

Exit criteria: happy-path batch lifecycle completes end-to-end via direct chaincode invocation; every enforcement rule has a passing bypass-attempt test.

## v0.2 — Backend and Data Layer (P4–P5)

Goal: a real API sits between a future frontend and the working chaincode.

Deliverables: backend API with field-level RBAC, SDK timeout handling, idempotency; PostgreSQL cache and audit log (insert-only, DB-grant enforced); MinIO file storage with the resolved object-key convention.

Exit criteria: all chaincode functions callable through the API; field-level responses verified by inspecting actual payloads; audit log confirmed tamper-resistant at the database level.

## v0.3 — Operational Shell (P6) — Milestone 1

Goal: the 5 operational roles can use the system through a real UI, and it can be recorded.

Deliverables: role-based frontend views; Fail-correction routing fix; notification indicator; all 4 core user journeys (happy path, failure path, recognition-edge case, attempted bypass) completable through the UI.

Exit criteria: **walkthrough-recordable** — this is the version the demonstration video is built from.

## v0.4 — Governance Shell (P7)

Goal: System Admin can safely evolve what the system considers valid, accountably.

Deliverables: Reference Data Overview, List, Add/Deprecate screens; Audit Log Viewer with repeated-denial highlighting; two-shell navigation enforced.

Exit criteria: reference-data change journey and audit review journey both completable end-to-end.

## v0.5 — AI Integration (P8)

Goal: plain-language trail explanation, strictly grounded, clearly non-authoritative.

Deliverables: actual system prompt implemented; model selected against the stated reliability-over-capability criterion; 5-case evaluation set passing.

Exit criteria: all 5 evaluation cases pass; every response visibly labeled AI-generated on every render.

## v0.6 — Remote Access and Hardening (P9–P10)

Goal: the system can be safely shown to someone without carrying a laptop to them.

Deliverables: Cloudflare Tunnel scoped to frontend/API only, negative-tested; all default credentials rotated; full security gate checklist passing, including dependency scanning, audit alerting, and JWT rotation documentation.

Exit criteria: full Pre-Demo Checklist passes, including the backup and health-check scripts.

## v0.7 — Documentation Consolidation (P11) — Milestone 2

Status: full-scope-ready.

Deliverables: every remaining Medium/Low finding from the eight-review process closed; final Requirements Traceability Matrix sync.

Exit criteria: no open finding above Low severity remains anywhere in the document set.

## v1.0 — Demonstrated, Not Deployed

Goal: a complete, honest, working proof of the governance mechanism — explicitly not a production product.

Deliverables: recorded walkthrough (raw + edited); optional plain-language companion write-up, in the same spirit as the parent product's own pending case-study material.

Exit criteria: the system can be recommended as a portfolio artifact with documented, stated limitations — not oversold, not undersold.

## Later Roadmap (explicitly deferred, not committed)

- Independent multi-organization hosting (each role's organization running its own peer) — the genuine "enterprise production grade" version this project's early scoping conversations first explored.
- Real cloud deployment (AWS Managed Blockchain or self-hosted Kubernetes), per the Enterprise Stack variant already scoped in the technology review.
- PDF/document export of the compliance trail.
- Mobile data entry (currently view-only by design, except AI Explanation).
- Payment/financial settlement flow — explicitly excluded from every version above, not just deferred casually.
- Bulk/multi-batch operations — explicitly excluded on accountability grounds, not a scalability afterthought.
- Multiple System Admin identities / multi-party reference-data governance (BRD's still-open question).
- Real-time push notifications, replacing the current request-driven badge.
- Reporting/aggregation layer (fail-rate by supplier, time-to-verdict, etc.).
