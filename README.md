# HALCHECK

HALCHECK is a browser-only halal supply chain screening demo for cosmetics. It compares BPJPH and JAKIM rules, checks a fictional supply chain against those standards, and produces sourced, step-level gap findings.

The project is currently in planning/specification. The app will be a static React 19 + TypeScript build with versioned JSON data, local browser storage, and a pure rules engine.

## Documentation

The numbered planning suite lives in [`docs/`](docs/):

| Doc | Purpose |
| --- | --- |
| [`00_PROJECT_CHARTER.md`](docs/00_PROJECT_CHARTER.md) | Scope, goals, non-goals, and planning frame |
| [`01_PRD.md`](docs/01_PRD.md) | Product requirements and user journeys |
| [`02_BRD.md`](docs/02_BRD.md) | Portfolio/business objectives and constraints |
| [`03_FRD.md`](docs/03_FRD.md) | Functional requirements by subsystem |
| [`04_TRD.md`](docs/04_TRD.md) | Technical requirements, stack, and repo structure |
| [`05_ARCHITECTURE.md`](docs/05_ARCHITECTURE.md) | System architecture and data/runtime boundaries |
| [`06_UI_DESIGN_SYSTEM.md`](docs/06_UI_DESIGN_SYSTEM.md) | Visual direction, tokens, components, and interaction rules |

## Repository Structure

```text
halcheck/
|-- src/          # React app, features, engine, storage, config
|-- dataset/      # briefs, drafts, verified data, frozen releases
|-- docs/         # planning and specification suite
|-- public/       # static assets
`-- README.md
```

## Runtime Principles

- No login, backend, or server database in v1.
- No AI call in the verdict path.
- Dataset releases are frozen and versioned.
- Screening runs store the dataset version and engine version used.
- Exports include the fixed disclaimer: screening opinion, not certification, not religious ruling.
