# HALCHECK

HALCHECK is a halal supply chain compliance screening project for cosmetics. Its core screening app compares BPJPH and JAKIM rules, checks a fictional supply chain against those standards, and produces sourced, step-level gap findings.

The project is currently in planning/specification. The core screening app remains a static React 19 + TypeScript build with versioned JSON data, local browser storage, and a pure rules engine.

## Project Scope

HALCHECK is organized as one product with two bounded parts:

- **Core Screening App** — browser-only screening workflow, no login, backend, or server database in v1.
- **Compliance Trail** — planned accountability module that adds role-based, tamper-evident batch records through a real local Hyperledger Fabric/backend stack. Build has not started.

## Documentation

The numbered planning suite lives in [`docs/`](docs/):

| Doc | Purpose |
| --- | --- |
| [`00_project_charter.md`](docs/00_project_charter.md) | Scope, goals, non-goals, and planning frame — Compliance Trail, plus a Core Screening App charter section |
| [`01_prd.md`](docs/01_prd.md) | Product requirements and user journeys — Compliance Trail, plus a Core Screening App PRD section |
| [`02_brd.md`](docs/02_brd.md) | Portfolio/business objectives and constraints |
| [`03_frd.md`](docs/03_frd.md) | Functional requirements by subsystem — Compliance Trail, plus a Core Screening App FRD section |
| [`04_trd.md`](docs/04_trd.md) | Technical requirements, stack, and repo structure |
| [`05_architecture.md`](docs/05_architecture.md) | System architecture and data/runtime boundaries |
| [`06_erd.md`](docs/06_erd.md) | Entity model and cardinality — Compliance Trail, plus the Core Screening App data model and engine output contract |
| [`07_test_strategy.md`](docs/07_test_strategy.md) | Test layers, enforcement matrix, and release gates |
| [`08_security_threat_model.md`](docs/08_security_threat_model.md) | Security assets, threats, mitigations, and gates |
| [`09_ui_specification.md`](docs/09_ui_specification.md) | Visual direction, tokens, components, and interaction rules — Compliance Trail, plus a Core Screening App UI section |
| [`10_ui_flow_navigation.md`](docs/10_ui_flow_navigation.md) | Routes, shells, and navigation behavior |
| [`11_screen_requirements.md`](docs/11_screen_requirements.md) | Field-level screen requirements |
| [`12_seed_data_specification.md`](docs/12_seed_data_specification.md) | Synthetic demo personas, batches, and reference data — Compliance Trail, plus the Core Screening App's dataset pipeline and synthetic BPJPH/JAKIM rule content |
| [`13_implementation_plan.md`](docs/13_implementation_plan.md) | Build phases and milestones |
| [`14_developer_setup.md`](docs/14_developer_setup.md) | Local setup guidance for the later build phase |
| [`15_config_reference.md`](docs/15_config_reference.md) | Environment variables and secret rules |
| [`16_risk_register.md`](docs/16_risk_register.md) | Risks, mitigations, and review cadence |
| [`17_api_reference.md`](docs/17_api_reference.md) | API contract |
| [`18_vibe_coding_guardrails.md`](docs/18_vibe_coding_guardrails.md) | AI-assisted development guardrails |
| [`19_repository_structure.md`](docs/19_repository_structure.md) | Repository layout and git hygiene |
| [`20_glossary.md`](docs/20_glossary.md) | Plain-language terminology |
| [`21_decisions.md`](docs/21_decisions.md) | Accepted decision records |
| [`22_requirements_traceability.md`](docs/22_requirements_traceability.md) | Requirement-to-test traceability |
| [`23_roadmap.md`](docs/23_roadmap.md) | Version roadmap and deferred scope |

Six of these documents (00, 01, 03, 06, 09, 12) cover both modules in one file: the Compliance Trail content as originally written, plus a later section specifying the Core Screening App — the actual BPJPH/JAKIM rules engine Compliance Trail wraps, which previously had no design documentation of its own.

## Repository Structure

```text
halcheck/
|-- src/          # core screening app, features, engine, storage, config
|-- dataset/      # briefs, drafts, verified data, frozen releases
|-- docs/         # planning and specification suite
|-- public/       # static assets
|-- chaincode/    # planned Compliance Trail Fabric chaincode
|-- backend/      # planned Compliance Trail API
|-- frontend/     # planned Compliance Trail UI shell, if separated from src
|-- network/      # planned local Fabric network config
`-- README.md
```

## Runtime Principles

- HALCHECK Core has no login, backend, or server database in v1.
- Compliance Trail infrastructure is planned but not yet run.
- No AI call in the verdict path.
- Dataset releases are frozen and versioned.
- Screening runs store the dataset version and engine version used.
- Exports include the fixed disclaimer: screening opinion, not certification, not religious ruling.
