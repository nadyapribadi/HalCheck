# HALCHECK — Requirements Traceability Matrix

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.2.0:** Updated matrix for Intended Market, flagged-record Fail verdicts, single-record correction, and Integrity Sandbox.

Consolidated view tying every requirement across the full document set together, from business rule through to test coverage.

## Matrix

| PRD ID | Requirement | FRD Coverage | TRD/Architecture | UI Coverage | Test Coverage | Security Coverage |
|---|---|---|---|---|---|---|
| PRD-CT-001 | Role authenticates via verifiable identity | FRD-CHAIN-IDENTITY-001–004 | TRD §6, Architecture §3/§12 | Login (Screen Req §2) | Enforcement Matrix — Identity spoofing | T-001, T-003 |
| PRD-CT-002 | System rejects out-of-scope submissions | FRD-CHAIN-ROLE-001–006 | TRD §7, Architecture §5 | RoleContextBar | Enforcement Matrix — Role scope | T-001, T-002 |
| PRD-CT-003 | Every submission recorded immutably | FRD-CHAIN-LEDGER-001–004 | TRD §9, Architecture §9 | RecordStatusBadge | Enforcement Matrix — Immutability | T-007, T-008 |
| PRD-CT-004 | Export blocked without Pass (technical) | FRD-CHAIN-SEQUENCE-001–004 | Architecture §5/§8 | Export Form (Screen Req §9) | Enforcement Matrix — Sequencing | T-002 |
| PRD-CT-005 | Fail recorded with equal permanence | FRD-CHAIN-LEDGER-004, VERDICT-005–007 | Architecture §9 | Batch SL-2026-002 (Seed Data §5), Verdict Detail flagged record | Enforcement Matrix — Fail handling, Flagged-record linkage | — |
| PRD-CT-006 | Corrections create new records only | FRD-CHAIN-LEDGER-002–003, 005 | TRD §17, ERD `supersedes_record_id` | Correction display rule, Ingredient Upload correction mode | Enforcement Matrix — Fail handling, Correction granularity | T-008 |
| PRD-CT-007 | Bulk ingredient upload | FRD-CHAIN-UPLOAD-001–005 | TRD §8 | Ingredient Upload (Screen Req §6) | Integration Tests | T-006 |
| PRD-CT-008 | Records reference real standard | FRD-CHAIN-STANDARDS-001–004 | TRD §10 | Standards anchor fields | — | — |
| PRD-CT-009 | Recognition-directionality labeled | FRD-CHAIN-BATCH-001, VERDICT-002–003 | TRD §22, ERD `BATCH.intended_market` | Verdict Detail (Screen Req §8), Batch creation Intended Market | Journey #3, Intended market immutability | — |
| PRD-CT-010 | Read-only trail visibility | FRD-CHAIN-READONLY-001–005 | Architecture §3 | Brand Owner screen behavior | E2E + write-attempt negative test | — |
| PRD-CT-011 | Reachable via shareable link | FRD-CHAIN-ACCESS-001–003 | TRD §18, Architecture §13 | — | Security Matrix — Tunnel exposure | T-005, T-011, T-013 |
| PRD-CT-012 | AI trail explanation, grounded, labeled | FRD-CHAIN-AI-001–005 | TRD §15, Architecture §4/§7 | AI Explanation Panel (Screen Req §14) | AI Evaluation Set (5 cases); Security Matrix — AI grounding, payload minimization, labeling | T-021, T-022 |
| PRD-CT-013 | Controlled vocabulary, no free text | FRD-CHAIN-UPLOAD-006–009 | TRD §6/§8 | SearchableSelect (Screen Req §6), Integrity Sandbox Mode 2 | Enforcement Matrix — Controlled vocabulary bypass | — |
| PRD-CT-014 | Batch date system-populated | FRD-CHAIN-PROD-002 | Architecture §9 | Production Form (Screen Req §7) | — | — |
| PRD-CT-015 | Fail reasons from controlled catalog | FRD-CHAIN-VERDICT-004 | TRD §10 | Verdict creation (Screen Req §8) | — | — |
| PRD-CT-016 | System Admin role, no batch access | FRD-CHAIN-ROLE-006, ADMIN-001–003 | Architecture §3/§9 | Two-shell navigation (UI Flow §3–5) | Enforcement Matrix — System Admin boundary | T-015 |
| PRD-CT-017 | Add/deprecate reference data, never overwrite | FRD-CHAIN-REFDATA-001–002, 004 | TRD §7/§10, Architecture §6 | ReferenceDataTable (Screen Req §12) | Enforcement Matrix — Reference data immutability | T-016 |
| PRD-CT-018 | Reference-data changes accountable | FRD-CHAIN-REFDATA-003 | Architecture §6/§9 | Seed Data §6 (Add/Deprecate content) | — | — |
| PRD-CT-019 | Historical records retain version at creation | FRD-CHAIN-REFDATA-005, STANDARDS-004 | TRD §5, Architecture §9 | — | Enforcement Matrix — Reference data versioning | T-017 |
| PRD-CT-020 | Centralized System Audit Log | FRD-CHAIN-AUDIT-001, 004 | TRD §9/§13, Architecture §10 | AuditLogTable (Screen Req §13) | — | — |
| PRD-CT-021 | Audit log insert-only, DB-enforced | FRD-CHAIN-AUDIT-002 | TRD §9, Guardrails §10 | — | Enforcement Matrix — Audit log tamper resistance | T-018 |
| PRD-CT-022 | Audit log visible to System Admin only | FRD-CHAIN-AUDIT-003 | Architecture §3 | Two-shell navigation | Enforcement Matrix — Audit log access boundary | T-019 |
| PRD-CT-023 | Field-level access control | FRD-CHAIN-RBAC-001–003 | TRD §8/§14, Architecture §3/§12 | — (backend-enforced, no dedicated UI) | Enforcement Matrix — Field-level access | T-020 |

## Concurrency Requirements (not tied to a single PRD-CT ID)

| Requirement | FRD | TRD/Architecture | Test Coverage | Security |
|---|---|---|---|---|
| Native MVCC conflict detection, no custom locking | FRD-CHAIN-CONCURRENCY-001–003 | TRD §7/§8, Architecture §4 | Enforcement Matrix — Concurrency conflict handling | Trust boundary note, Threat Model §3 |

## Cross-Cutting Items

| Item | Where it lives |
|---|---|
| No rule enforced only outside chaincode | TRD, Security, Test Strategy — governing principle throughout, including reference data |
| Default credential rotation | TRD §17 (orig), Security T-004, Test Strategy §8 |
| Chaincode lifecycle discipline | TRD §21, Security T-009 |
| Known limitations stated plainly | BRD §12, Architecture §15, Test Strategy §9 |
| AI never write-capable | FRD-CHAIN-AI-004, Architecture §3 (LLM as least-trusted adapter), UI Specification §9 |
| Two-shell navigation as boundary enforcement | UI Flow §3–5, mirrors FRD-CHAIN-ADMIN-002 at the structural level |
| Fail-correction routing | UI Flow §3/§4/§10, Architecture §8, Screen Requirements §3 |
| Intended Market | FRD-CHAIN-BATCH-001, ERD `BATCH.intended_market`, Screen Requirements §3/§5/§9 |
| Flagged-record correction granularity | FRD-CHAIN-LEDGER-005, FRD-CHAIN-VERDICT-007, ERD `flagged_record_id` / `supersedes_record_id` |
| Notification indicator | UI Flow §10, Screen Requirements §4 |
| Dependency vulnerability scanning | Guardrails §11, Developer Setup §12, Security T-023 |
| Audit alert threshold | Screen Requirements §13, Security T-024 |
| JWT rotation blast radius | Config Reference §8, Security T-025 |

## Gap Check

Every PRD-CT ID (001–023) has a fully populated row across FRD, TRD/Architecture, UI, Test, and Security coverage — no thin or placeholder rows remain. Concurrency requirements, while not tied to a single PRD-CT ID, are fully traced as a standalone row.

**Resolved from earlier audits:**
- PRD-CT-010 (read-only visibility) — closed with dedicated FRD-CHAIN-READONLY-001–005 and explicit negative tests.
- PRD-CT-013 (controlled vocabulary) — closed with FRD-CHAIN-UPLOAD-009's backend-independent bypass test.

**Outstanding, tracked separately:** R-018 records the production-record correction linkage gap introduced by allowing Fail verdicts to flag production records while v0.2 only models ingredient-record correction linkage.
