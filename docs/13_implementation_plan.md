# HALCHECK — Implementation Plan

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete, re-baselined
- Version: 0.1.0-planning

## 1. Build Strategy

Build from the inside out — enforcement logic first, interface last:

```text
foundation -> [chaincode design gate] -> chaincode -> backend/data
-> frontend (operational) -> frontend (governance) -> AI -> access
-> hardening -> documentation closure
```

Phases are grouped by cognitive context to minimize costly context-switching for a solo builder: all chaincode-adjacent work consecutive, all backend/data work consecutive, all frontend work consecutive, AI work isolated as its own block.

## 2. Phase Summary

| Phase | Name | Outcome |
|---|---|---|
| P0 | Foundation + Ops Hygiene | Working Fabric network + baseline operational discipline in place from day one |
| P1 | Identity Setup (6 roles) | Real certificates issued for all 5 operational roles plus System Admin |
| P1.5 | Chaincode Design Gate | The four highest-cost-to-reverse decisions resolved before any chaincode is written |
| P2 | Chaincode Core Rules | Batch and reference-data sequencing/role rules enforced on-chain |
| P3 | Chaincode Negative Testing | Every rule has a passing bypass-attempt test |
| P4 | Backend API | Translation layer functioning, including field-level RBAC and timeout handling |
| P5 | Off-Chain Storage | PostgreSQL cache, audit log, file storage wired in |
| P6 | Frontend — Operational Shell | All 5 operational roles functional end-to-end — **Milestone 1: walkthrough-ready** |
| P7 | Frontend — Governance Shell | System Admin module (reference data, audit log) functional |
| P8 | AI Integration | Trail explanation feature functional, grounded, evaluated |
| P9 | Remote Access | Tunnel configured, scoped, tested |
| P10 | Hardening | Security gates, credential rotation, demo-readiness |
| P11 | Documentation Consolidation Gate | Remaining review findings closed — **Milestone 2: full-scope-ready** |

## 3. Phase Detail

### P0 — Foundation + Ops Hygiene
- Confirm the accepted pre-build authority closure (TRD §23) is synchronized before infrastructure work begins.
- Install Docker, Go, Node.js, clone `fabric-samples`; bring up the unmodified sample test-network.
- Confirm basic chaincode install/invoke works using sample chaincode before writing custom logic.
- Add Docker Compose health checks and `depends_on: condition: service_healthy`.
- Configure log rotation (`max-size`/`max-file` limits) on all containers.
- Set up dependency scanning (`npm audit`, Go module vulnerability check) as a standing practice from the first dependency added.
- Write the volume backup script — used before every future demo/recording session.

**Exit criteria:** network starts cleanly with health-check-gated startup order; sample transaction succeeds; backup script tested once against an empty state.

### P1 — Identity Setup (6 roles)
- Issue Fabric CA identities for all 5 operational roles and System Admin.
- Confirm each identity's certificate attributes are readable from chaincode context.

**Exit criteria:** six distinct, verifiable identities exist and can be used to submit test transactions.

### P1.5 — Chaincode Design Gate (critical path, hard blocker)
This phase produces decisions, not code. Nothing in P2 begins until the four original decisions and the pre-build authority closure are resolved and documented:

1. **Verdict authority — RESOLVED: binding.** The compliance engine's Pass/Fail output is final; the Compliance Officer has no override capability (FRD-CHAIN-VERDICT-005).
2. **Concurrency handling — RESOLVED: native MVCC.** Rely on Fabric's native read-write conflict detection; backend catches the resulting error and returns a clear "please refresh" response — no custom locking layer.
3. **Chaincode bundling — RESOLVED: two independent deployments.** `batch` and `refdata` as separate chaincode definitions on the same channel, independently upgradable.
4. **Data model — RESOLVED: denormalized snapshot.** Each batch record stores the standard's citation text and version identifier directly at submission time, not a live foreign key. Full entity detail in `06_erd.md`.
5. **Authority closure — RESOLVED.** Reference snapshots are chaincode-resolved; verdicts use verified engine attestations; audit delivery fails closed; the canonical RBAC matrix and production-correction model are defined in TRD §23.

**Exit criteria:** all decisions documented and synchronized in `03_frd.md`, `04_trd.md`, `05_architecture.md`, and `06_erd.md` before a single line of chaincode is written for P2.

### P2 — Chaincode Core Rules
- Define ledger record types per the ERD (ingredient, production, verdict, export, reference data).
- Implement role-scope checks, sequencing checks, append-only behavior — for both batch and reference-data chaincode.
- Implement reference-data add/deprecate functions with no update/delete function existing at all.

**Exit criteria:** happy-path batch completes end-to-end via direct chaincode invocation; reference-data add/deprecate cycle completes and confirms old version remains queryable.

### P3 — Chaincode Negative Testing
- Negative test per P2 rule, including System Admin boundary tests, reference-data immutability tests, and version-snapshot tests.

**Exit criteria:** every rule in the Enforcement Test Matrix (`07_test_strategy.md`) has a passing negative test.

### P4 — Backend API
- Node.js/Express server with Fabric Gateway SDK integration.
- JWT authentication; identity-match verification.
- Field-level RBAC serializer implemented as one shared utility.
- Explicit SDK call timeout with a clean, labeled failure response.
- Idempotency-key handling on submit endpoints.
- AI usage soft cap implemented at the endpoint level.

**Exit criteria:** all P2 chaincode functions callable through the API; field-level responses verified by inspecting actual payloads; a simulated network drop during submit doesn't create a duplicate record.

### P5 — Off-Chain Storage
- PostgreSQL: user accounts, cached trail views.
- System Audit Log as a separate schema/table, `action` field as a defined enum, INSERT-only at the database grant level.
- Indexes on `batch_id`, `timestamp`, `status`.
- MinIO: file upload handling, explicit object-key convention.
- Cache reconciliation behavior: on cache-write failure after a successful ledger commit, mark the row stale and trigger re-fetch on next read.

**Exit criteria:** cached views stay consistent with ledger state; audit log confirmed insert-only via direct database-level test; file hash verified against actual retrieved content.

### P6 — Frontend — Operational Shell (Milestone 1)
- Role-based views for the 5 operational roles.
- Fail-correction routing fix: a corrected batch reappears in Ingredient QA's filtered queue as "Awaiting Correction."
- "N batches awaiting your action" indicator on login.
- Per-row removal in ingredient upload preview before submit.
- Language decision (English) applied consistently across all copy.

**Exit criteria:** all 4 key user journeys (happy path, failure path, recognition-edge case, attempted bypass) completable through the UI. **Milestone 1 reached: system is walkthrough-recordable.**

### P7 — Frontend — Governance Shell
- Reference Data Overview, Reference Data List, Add/Deprecate Entry modals.
- Audit Log Viewer, including the threshold-highlight for repeated denied attempts.
- Two-shell navigation enforced.

**Exit criteria:** System Admin journey (reference-data change, audit review) completable end-to-end.

### P8 — AI Integration
- Insert the actual system prompt (specified in `04_trd.md` Section 15).
- Finalize model selection against the stated criterion — prioritize instruction-following/refusal reliability over raw capability.
- Build the 5-case evaluation set (`07_test_strategy.md` Section 5).
- AI Explanation Panel wired into Batch Detail.

**Exit criteria:** all 5 evaluation cases pass; response correctly labeled non-authoritative on every render.

### P9 — Remote Access
- Configure Cloudflare Tunnel, scoped to frontend + backend API ports only.
- Negative-test that ledger, CouchDB, CA admin, MinIO console, PostgreSQL, and audit log admin routes are unreachable externally.

**Exit criteria:** public link works for intended routes; direct attempts to reach internal services fail as expected.

### P10 — Hardening
- Rotate all default credentials.
- Confirm CORS, rate limiting (AI endpoint's distinct cap already in place from P4).
- Document JWT rotation blast radius (all active sessions invalidated immediately).
- Document chaincode rollback procedure (forward-fix via new committed version).
- Pre-demo health-check script.
- Run full Security Threat Model gate checklist, including T-023 through T-025.

**Exit criteria:** full Pre-Demo Checklist passes, including the audit-log-populated check and the health-check script.

### P11 — Documentation Consolidation Gate (Milestone 2)
- Close remaining Medium/Low findings not already resolved in earlier phases.
- Final Requirements Traceability Matrix sync across all 23 requirements and every document touched.

**Exit criteria:** no open finding above Low severity remains. **Milestone 2 reached: full-scope-ready.**

## 4. Suggested Sprint Sequencing

```text
Sprints 1-2:  P0, P1, P1.5   (foundation + the one hard decision gate)
Sprints 3-4:  P2, P3          (all chaincode work, consecutive)
Sprints 5-6:  P4, P5          (all backend/data work, consecutive)
Sprints 7-8:  P6, P7          (all frontend work, consecutive)
Sprint 9:     P8               (AI, isolated cognitive context)
Sprint 10:    P9, P10, P11    (access, hardening, documentation closure)
```

**10 sprints.** Re-estimated from an original 5-sprint plan after scope grew from 11 to 23 requirements — see Decision Log ADR-CT-020.

## 5. MVP Scope

**True MVP = P0 through P6.** The five operational roles, real chaincode enforcement, the core batch lifecycle, and the five signature walkthrough moments (happy path, Fail+correction, Integrity Sandbox, recognition edge case) are all achievable without System Admin, Audit Log, or AI Explanation. P7 and P8 are genuinely deferrable to a second milestone without weakening the core "proof over assertion" narrative.

## 6. Implementation Rules

- No chaincode rule ships without its paired negative test in the same work session.
- No frontend or backend enforcement of a rule chaincode doesn't also enforce.
- No default credential survives past P0 into any phase involving external reachability.
- No tunnel activation before P10's security gate checklist passes.
- No scope addition without a new ADR entry first.
- P1.5 may not be skipped or deferred — no chaincode work in P2 begins until the original four decisions and the pre-build authority closure are documented, regardless of schedule pressure.
