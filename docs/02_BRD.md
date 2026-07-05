# Business Requirements Document

## 1. Context

HALCHECK is not a business. It is a portfolio and learning project. "Business requirements" here means: what the project must achieve to be worth the build time.

The builder combines two rare things: real supply chain implementation experience (TMS/WMS, warehouses, 3PL across countries) and structured halal certification knowledge. HALCHECK turns that combination into something a visitor can click, not just read about.

The topic is timely. Cosmetics sold in Indonesia must be halal certified from 17 October 2026 (PP 42/2024). The demo launches into that moment.

## 2. Objectives

| ID | Objective | Measure |
| --- | --- | --- |
| BRD-001 | A live, always-on demo | halcheck.pages.dev loads in under 2 s, never sleeps, no login |
| BRD-002 | A 3-minute story | A visitor completes the demo journey (matrix, screening, delta, report) in under 3 minutes |
| BRD-003 | Proof of method | The full spec suite (14 docs) sits in the repo and matches the built app |
| BRD-004 | Defensible content | 100% of rules in the dataset carry sources and dates |
| BRD-005 | A repeatable pattern | The repo skeleton, doc suite, and demo conventions can start portfolio app #3 in under a day |
| BRD-006 | Learning value | The dataset research pipeline is documented well enough to teach (possible ai-builders-id material) |

## 3. Value

For a portfolio visitor: a real, niche, working tool, not a todo app. It shows domain knowledge, data discipline, and a full build from spec to deploy.

For the builder: a second proven app after IMTRACK, this time with a different architecture (static data-engine app, no backend), which widens the portfolio.

## 4. Audience

- Recruiters, clients, and peers who open the live demo link.
- The ai-builders-id community, if the pipeline becomes teaching material.
- Future collaborators, if the project later grows past portfolio use.

The repo is private. The audience sees the live demo only. LinkedIn posting is decided later.

## 5. Distribution

- Demo: public at halcheck.pages.dev, deployed from the private GitHub repo.
- No sale, no subscription, no accounts.
- Important: even with a private repo, the dataset (rule texts, citations) ships inside the public app bundle. Anyone can read it in the browser. So citation discipline is the same as for a public repo.

## 6. Constraints

- One builder, part-time. Scope is capped at 2 bodies and 1 sector in v1 for this reason.
- HALCHECK must never look like a certification authority or a religious ruling. The disclaimer is fixed and appears on every export.
- Source documents may be copyrighted. The dataset stores structured attributes, short cited quotes, and clause references. Never full document text.
- Some sources are paywalled or print-only. Those rules degrade honestly to document-level citations with a visible flag.
- All company data in the app is fictional. Real client data never enters this project.

## 7. Success Metrics

- Demo live and stable for 90+ days without maintenance.
- Full journey demoable in under 3 minutes by someone who never saw the app.
- Dataset v1.0.0 released with 16/16 cells resolved and cited.
- At least one later dataset release (v1.1.0, new body) published, proving the versioning works in public.
- The skeleton reused for the next portfolio app.

## 8. Assumptions

- The Oct 2026 cosmetics deadline stays in force (verified July 2026; PP 42/2024).
- BPJPH + JAKIM sources are accessible enough for clause-level citations on most criteria.
- A static app with browser storage is enough for a demo; no visitor expects accounts.
- The builder's existing stack (React 19, Vite, GitHub, Cloudflare) transfers directly; no new platform learning blocks the build.

## 9. Risks

| Risk | Response |
| --- | --- |
| BPJPH cosmetics guidance changes after release | Retrieval dates on every rule; staleness badge; new dataset version when needed |
| Research finds rules that do not fit the schema | Research spike (2 criteria, 1 body) runs before the schema freezes |
| Scope creep into food/pharma or more bodies | Charter non-goals; new sectors are v2 decisions, not tickets |
| A rule in the dataset misstates the source | Human review gate; draft vs verified status; errata note in the next version |
| Demo breaks or sleeps | Static hosting only; no external services in the runtime path |

## 10. Exit Criteria for Planning

- All 14 documents exist and agree with each other.
- The schema is final enough that the research brief can run without changes.
- Phase 1 of the implementation plan can start in VS Code without redesign.
