# HALCHECK — Project Charter

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Full name: HALCHECK Compliance Trail
- Repository: `halcheck`
- Status: Design complete, Build not started
- Version: 0.1.0-planning
- Primary target: macOS (Apple Silicon), local-first
- Later targets: none formally planned — see `23_roadmap.md` for deferred scope

## Executive Summary

Compliance Trail is HALCHECK's planned real, self-hosted Hyperledger Fabric implementation of a role-based accountability mechanism for halal compliance in contract manufacturing (maklon). It extends the core HALCHECK screening workflow with a tamper-evident record of who submitted what, when, across the batch lifecycle from ingredient sourcing through export release.

The project began as a static, mocked-chain demo concept and, through extensive design-phase work, evolved into a genuinely working blockchain implementation with real chaincode enforcement, a governance layer, centralized audit logging, and a narrowly-scoped AI explanation feature — a scope evolution formally acknowledged in ADR-CT-000 and ADR-CT-020, not left implicit.

## Mission

Demonstrate, with working evidence rather than assertion, that a governance framework originating in academic supply-chain research can be re-applied to a second, unrelated domain — and that AI-assisted development can build genuinely enforced, auditable systems when given explicit guardrails rather than left to generate plausible-looking code unsupervised.

## Product Statement

```text
One real permissioned blockchain.
Six accountable roles.
Zero silent edits.
Every rule enforced twice — once for convenience, once for real.
Proof over assertion, everywhere.
```

## Strategic Reset

This project underwent one significant reset, formally documented as ADR-CT-000.

### Original Direction
- Static site, no backend.
- Mocked hash-chain in browser storage, simulating blockchain behavior.
- Tamper-evidence claim true only within the app's own UI.

### Revised Direction
- Real Hyperledger Fabric network, genuinely enforced.
- Real cryptographic identity per role.
- Self-hosted, reachable via tunnel rather than permanently deployed.
- Tamper-evidence claim genuinely true, not simulated.

## Guiding Principles

1. Enforcement lives in chaincode, never in the UI alone.
2. Nothing is ever silently edited — correction means a new, linked record, always.
3. Every claim made about this system must survive being directly questioned.
4. Free-text input is the exception, not the default, wherever a bounded, known set exists.
5. AI assists, never decides — explanatory only, no write access, ever.
6. Every scope addition requires a documented decision, not silent accretion.
7. Name limitations plainly rather than let them go unstated.
8. Use what the platform already provides before reaching for a new dependency.
9. Cost stays at $0 through Design, Build, and Test — Deploy/Production explicitly deferred.
10. Documentation is the primary mitigation against solo-developer continuity risk.

## Goals

- Prove a real, working permissioned-blockchain governance mechanism, not a simulated one.
- Keep the entire Build/Test cycle free and achievable on consumer hardware.
- Produce a fully specified, internally consistent, independently-reviewed design before any code is written.
- Demonstrate the mechanism through a recordable walkthrough, without requiring permanent hosting.

## Non-Goals

- No payment or financial settlement flow.
- No independent multi-organization hosting in this version.
- No permanent public infrastructure — reachable only while the host machine is running.
- No AI involvement in generating or gating compliance verdicts.
- No native mobile application; mobile web is view-only, with one narrow exception (AI Explanation Panel).
- No bulk/multi-batch operations — one action, one batch, always.
- No changes to HALCHECK's existing BPJPH/JAKIM compliance engine logic.

## Stakeholders

| Stakeholder | Need |
|---|---|
| Product owner | A working demonstration that stays legible as part of HALCHECK, not a scope-diluting rebrand |
| Ingredient QA / Production QA / Compliance Officer / Export Officer (in-app roles) | Clear, bounded, accountable actions — nothing they can't verify was actually theirs |
| Brand Owner (in-app role) | Full visibility, zero write capability |
| System Admin (in-app role) | Safe, accountable authority to evolve reference data as regulations change |
| External reviewer/evaluator | A system whose tamper-evidence and access-control claims can be independently verified, not just asserted |
| Solo developer (project owner) | A design thorough enough to survive gaps in personal availability or memory |

## Success Criteria

### Design Success
- All 24 documents in the suite exist and are internally consistent.
- Eight independent expert review passes (Business Analysis, UX/Process, Data Architecture, Enterprise/Solution Architecture, Technology Stack, Security, Cloud/DevOps, AI Systems) completed, with every finding either closed or explicitly accepted as a named limitation.

### Build Success (Milestone 1 — Implementation Plan P6)
- Local Fabric network runs with two independently-deployable chaincode modules (batch, refdata).
- All 5 operational roles functional end-to-end through the real UI.
- Happy path, failure/correction path, recognition-edge case, and Integrity Sandbox demonstration all completable and recordable.

### Full-Scope Success (Milestone 2 — Implementation Plan P11)
- System Admin governance shell, centralized audit log, field-level RBAC, and AI trail explanation all functional.
- Every finding from the eight-review process closed.

## Core Decisions

| Area | Decision |
|---|---|
| Repository | Same `halcheck` repository, as a bounded Compliance Trail module |
| Ledger platform | Hyperledger Fabric, permissioned |
| Chaincode language | Go, two independent modules (batch, refdata) |
| Backend | Node.js/Express, thin translation layer only |
| Frontend | React (Vite) |
| Off-chain database | PostgreSQL — cache and audit log, non-authoritative except the audit log's own insert-only guarantee |
| File storage | MinIO, S3-compatible |
| Remote access | Cloudflare Tunnel, active only during demo use |
| Hosting | Self-hosted, local — Deploy/Production explicitly out of scope |
| AI integration | One narrowly-scoped, stateless, read-only trail-explanation feature |
| Verdict authority | Engine output is binding; no human override capability |
| Concurrency handling | Native Fabric MVCC conflict detection; no custom locking |
| Reference data linkage | Denormalized snapshot, not a live foreign key |
| UI language | English |

## Delivery Philosophy

Design comes first, completely, before Build begins — the opposite emphasis of many projects, deliberately chosen given this project's dual purpose as both a working system and a demonstration of disciplined AI-assisted development. The recommended order:

```text
design -> chaincode design gate (P1.5) -> chaincode -> backend/data
-> frontend (operational) -> frontend (governance) -> AI -> remote access
-> hardening -> documentation consolidation
```

## Documentation Map

- `01_prd.md` — what the feature must do and for whom
- `02_brd.md` — why it exists, business rules, upward traceability
- `03_frd.md` — detailed functional requirements, 6 roles, 17 sections
- `04_trd.md` — technical specification, resolved data model and chaincode split
- `05_architecture.md` — system structure, diagrams, failure-mode table
- `06_erd.md` — full entity-relationship diagram
- `07_test_strategy.md` — test layers, enforcement/security matrices, AI evaluation set
- `08_security_threat_model.md` — 25 threats, trust boundaries, security gates
- `09_ui_specification.md` — design tokens, components, device tiers, interaction patterns
- `10_ui_flow_navigation.md` — routes, information architecture, notification indicator
- `11_screen_requirements.md` — field-by-field, action-by-action screen content
- `12_seed_data_specification.md` — personas, batches, reference data content
- `13_implementation_plan.md` — P0–P11 phased build plan, 10-sprint estimate
- `14_developer_setup.md` — install steps, operational scripts
- `15_config_reference.md` — environment variables, secrets discipline
- `16_risk_register.md` — 17 tracked risks
- `17_api_reference.md` — endpoint specifications
- `18_vibe_coding_guardrails.md` — AI-assisted development discipline
- `19_repository_structure.md` — repo layout, `.gitignore`, branch strategy
- `20_glossary.md` — plain-language term reference
- `21_decisions.md` — 25 ADR entries
- `22_requirements_traceability.md` — full PRD-to-implementation matrix
- `23_roadmap.md` — versioned build path and deferred scope
