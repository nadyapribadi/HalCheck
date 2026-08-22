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
- `16_risk_register.md` — 18 tracked risks (including one closed design-gap record)
- `17_api_reference.md` — endpoint specifications
- `18_vibe_coding_guardrails.md` — AI-assisted development discipline
- `19_repository_structure.md` — repo layout, `.gitignore`, branch strategy
- `20_glossary.md` — plain-language term reference
- `21_decisions.md` — 26 ADR entries
- `22_requirements_traceability.md` — full PRD-to-implementation matrix
- `23_roadmap.md` — versioned build path and deferred scope

---

## Core Screening App Charter

*The following section is a charter for HALCHECK's other module — the Core Screening App — merged here rather than kept as a separate document. Module: Core Screening App. Status: Design in progress.*

### Relationship to Compliance Trail

The Core Screening App is the product HALCHECK actually screens with. Compliance Trail (this document, and the rest of the suite above) is a planned accountability wrapper around this engine's output — it does not reimplement or duplicate the screening logic (BRD Rule 5, ADR-CT-004). Every reference elsewhere in this suite to "the existing compliance engine," or to "the engine's Pass/Fail output is binding" (FRD-CHAIN-VERDICT-001/005), refers to this app's `evaluate()` function specifically.

### Executive Summary

A fast, sourced, step-level comparison of a product's ingredient sourcing against two national halal certification standards — BPJPH (Indonesia) and JAKIM (Malaysia) — for a fictional cosmetics supply chain. Rather than a single opaque pass/fail, the engine produces one Finding per rule, each citing the specific rule and the specific supply-chain fact responsible.

### Mission

Give a contract manufacturer or brand owner a legible answer to "where does this product's sourcing fall short, against which rule, and why" — deterministically, explainably, and without assuming that recognition between two certifying bodies is ever automatic or symmetric.

### Product Statement

```text
Two standards. One supply chain.
Every finding traces to a rule and a fact, not a guess.
Screening opinion, not certification, not religious ruling — stated on every export.
```

### Guiding Principles

1. The engine is pure — same inputs always produce the same outputs, no network calls, no hidden state.
2. Every finding cites the specific rule and the specific supply-chain fact that produced it.
3. Recognition between certifying bodies is never assumed symmetric — checked explicitly, in both directions, every time.
4. Reference data (standards, ingredient risk classifications, recognition agreements) is versioned and frozen at release; a screening run always records which version it used.
5. No AI in the verdict path — the rules engine is deterministic and fully inspectable.
6. All domain content (standards, ingredients, certificates) is fictional and clearly labeled as such; this is a demonstration engine, not a source of real regulatory guidance.

### Goals

- Produce a deterministic, explainable Pass/Fail-per-rule evaluation for a synthetic product/supply-chain profile against BPJPH and JAKIM rule sets.
- Support the recognition-directionality mechanic concretely — a certificate issued under one body doesn't automatically satisfy a rule owned by another.
- Ship as a static, backend-free, browser-only app with versioned JSON reference data and local-only storage.
- Produce output in the exact shape Compliance Trail's `VERDICT_RECORD` expects (status, governing regulation, fail reason, flagged record, recognition check, engine version, rules release), so Compliance Trail can wrap this engine's output without a translation-layer guess.

### Non-Goals

- No real regulatory claim — standards, ingredient risk classifications, and recognition agreements in this repository are fictional, for demonstration only.
- No login, backend, or server database (matches the existing HALCHECK README runtime principle).
- No AI involvement anywhere in the evaluation path.
- No bulk/multi-profile batch screening in v1 — one profile, one run.
- No edit-in-place of a completed screening run — a changed profile is a new run.

### Stakeholders

| Stakeholder | Need |
|---|---|
| Brand/contract-manufacturer user | A fast, legible answer to "where does this product's sourcing fall short, against which rule, and why" |
| Compliance Trail (downstream consumer) | A stable, versioned Pass/Fail + rationale contract to wrap with attestation, per TRD §23.2 |
| External reviewer/evaluator | Confidence that findings are traceable to specific rules and facts, not black-box output |
| Solo developer | A spec thorough enough that the engine's behavior doesn't have to be re-derived from memory |

### Success Criteria

- `evaluate(target, rule, recognitions)` produces a `Finding` for every rule in the active dataset release applicable to a given screening profile.
- Every `Finding` cites: the rule ID, the specific ingredient/supply-chain record that produced it, and — if a recognition check applied — the issuing/requiring body pair and result.
- Given the same dataset release version and profile input, the same output is produced every time (pure function: no side effects, no network calls, no timestamp-dependent logic beyond what's supplied as input).
- The synthetic Selara/SL-2026-00x scenarios already defined in `12_seed_data_specification.md` evaluate correctly under this engine, without requiring that document's stated outcomes to change.

### Core Decisions

| Area | Decision |
|---|---|
| Runtime | Static React 19 + TypeScript, no backend, no server database (per README) |
| Data | Versioned JSON dataset releases (`dataset/releases/`), frozen once published |
| Storage | Browser local storage only, per-session/profile |
| Engine | Pure function core (`src/engine/`), no I/O, fully unit-testable |
| Rule content | Fictional/synthetic, explicitly labeled, aligned with the Selara/SL-2026-00x seed data in `12_seed_data_specification.md` |
| Output contract | Matches Compliance Trail's `VERDICT_RECORD` shape exactly (see `06_erd.md`, Core Screening App Data Model section, §5) |

### Why This Section Is Shorter Than the Compliance Trail Suite Above

Compliance Trail's documentation exists at this depth because it makes an accountability claim (tamper-evidence, role enforcement) that only holds if implementation matches design exactly, across a ledger, an identity layer, and a public tunnel. The Core Screening App is a pure client-side function with no network surface, no credentials, and no multi-party trust boundary — a materially smaller risk profile. Its documentation, folded into this same suite below, is scoped accordingly: no separate BRD (business rationale sits here and in the PRD section), no Security Threat Model or Test Strategy section (engine testability is a single inline requirement, not a document's worth of matrices).
