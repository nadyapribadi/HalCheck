# HALCHECK Project Charter

## Document Control

- Project: HALCHECK
- Full name: Halal Supply Chain Standards Comparison and Compliance Screening
- Repository: `halcheck` (private, GitHub)
- Live demo: halcheck.pages.dev (public, Cloudflare Pages)
- Status: Planning baseline
- Version: 0.2.0-planning
- Date: 2026-07-05

## What HALCHECK Is

HALCHECK is a web app with two layers.

**Layer 1: Reference.** A structured comparison of halal certification rules for the supply chain of cosmetic products. Version 1 covers two bodies: BPJPH (Indonesia) and JAKIM (Malaysia). Every rule in the app has a source, a clause reference where possible, and dates.

**Layer 2: Screening.** The user describes a company's supply chain step by step (suppliers, factory, warehouses, transport, distribution). The app checks every step against the selected standard. It shows exactly which step fails which rule, and produces a gap report.

## Why It Exists

This is a **portfolio project**. It is not for sale and has no login. The goals are:

1. Show a working, useful app built solo with AI assistance.
2. Prove the spec-driven build method (this document suite is part of the portfolio).
3. Reuse the pattern for more portfolio apps later.

The topic is real and current. From 17 October 2026, cosmetics sold in Indonesia must have halal certification (PP 42/2024). The demo tells that story.

## Why AI Only at Research Time

Claude (Fable 5) does the research that fills the reference layer. A human review checks every source before the data is released. After release, all screening verdicts come from simple, fixed rules in code. **No AI runs when a verdict is made.** This makes every verdict repeatable and explainable.

## Guiding Rules

1. No verdict without a named standard.
2. No rule in the dataset without a source and dates.
3. AI researches; code decides.
4. Missing data means "insufficient info", never "assumed compliant".
5. Findings point to a specific chain step (or the whole chain), never vague.
6. Released datasets never change. Fixes create a new version.
7. Cosmetics only in v1. No other product types.
8. Every screening run remembers which dataset version it used, forever.
9. Manual overrides need a written reason. The original verdict stays visible.
10. All demo data is fictional and labeled as fictional.

## Goals

- Dataset v1.0.0: BPJPH + JAKIM, 8 criteria, cosmetics, fully sourced (16 cells, each filled or marked "standard is silent").
- Full demo journey works: comparison matrix, chain profile, screening run, BPJPH-vs-JAKIM delta, gap report export.
- One pre-loaded fictional demo client so a visitor sees results in under 3 minutes.
- App loads fast, never sleeps, needs no account.

## Non-Goals

- No money. No accounts. No client logins.
- No food, pharma, or other sectors in v1.
- No ingredient/formula rules (alcohol content, animal-derived ingredients). These get an "out of scope" marker, not a verdict.
- No live monitoring of regulation changes.
- No AI chat inside the app.
- No claim of certification or religious authority. Every export carries a fixed disclaimer.

## Core Decisions

| Area | Decision |
| --- | --- |
| Sector v1 | Cosmetics (skincare and makeup) |
| Bodies v1 | BPJPH, JAKIM. MUI, GSO, SMIIC come later as new dataset versions |
| Source documents | A body can have several documents. BPJPH: UU 33/2014, PP 42/2024, BPJPH regulations. JAKIM: MS 2634:2019, MS 2400 series, MPPHM 2020 |
| Criteria | 8: segregation, transportation, traceability, control points, contamination tolerance, third-party certification, audit cycle, mutual recognition |
| App type | Static web app. No backend. No database server |
| User data | Stays in the visitor's browser (localStorage) |
| Dataset | Versioned JSON files shipped with the app |
| Verdicts | compliant / conditional / non_compliant / insufficient_info |
| Stack | React 19 + TypeScript + Vite + Tailwind |
| Build tools | VS Code + Kilo Code, GitHub |
| Hosting | Cloudflare Pages, from private repo |
| Demo client | Fictional Indonesian skincare brand, made by a contract manufacturer (maklon), racing the Oct 2026 deadline, exporting to Malaysia |
| Deletes | Runs are never edited or deleted. Visitor can reset their own browser data |

## Build Order

```text
schema -> engine + tests -> research spike (BPJPH, 2 criteria)
-> freeze schema -> full research (2 bodies) -> reference UI
-> intake questionnaire -> profile wizard -> screening run
-> delta view -> gap report -> demo seed -> deploy
```

The engine is locked with tests before any UI exists. After that, UI can be vibe-coded freely without breaking correctness.

## Documentation Map

- `01_PRD.md` - what the app must do
- `02_BRD.md` - why it exists and how success is measured
- `03_FRD.md` - detailed requirements with IDs
- `04_TRD.md` - technical rules
- `05_ARCHITECTURE.md` - structure, flows, research pipeline
- `06_UI_DESIGN_SYSTEM.md` - visual rules and components
- `07_IMPLEMENTATION_PLAN.md` - step-by-step build guide
- `08_DATA_AND_STATE_CONTRACT.md` - file formats and storage keys
- `09_TEST_STRATEGY.md` - what to test and when
- `10_SECURITY_THREAT_MODEL.md` - risks and protections
- `11_SETUP_AND_DEPLOY.md` - local setup and Cloudflare deploy
- `12_V2_BACKEND_CONCEPT.md` - future Supabase idea (not v1)
- `13_GLOSSARY.md` - plain definitions of all terms
