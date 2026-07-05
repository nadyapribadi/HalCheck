# Product Requirements Document

## 1. Overview

HALCHECK compares halal supply chain rules for cosmetics (BPJPH vs JAKIM) and screens a supply chain against those rules. It runs fully in the browser. There is no login and no server database.

The app must feel like an instrument, not a document library. Pick a standard, describe the chain, see which step fails which rule, export the gap list.

## 2. Problem

- "Our supply chain is halal compliant" means nothing until you name the standard. BPJPH and JAKIM rules differ.
- The rules live in scattered documents in three languages. Nobody tracks what was true on which date.
- Checks are usually chain-level opinions ("looks fine"). Useful checks are step-level ("this shared truck fails this JAKIM clause").
- Cosmetics is urgent: mandatory halal certification in Indonesia starts 17 October 2026.

## 3. Product Thesis

A screening verdict is only useful if it names the standard, cites the rule, points to the failing step, and says what fixes it. Everything in HALCHECK exists to produce that sentence.

## 4. Users

| Persona | Who | Needs |
| --- | --- | --- |
| Analyst (the app's role) | A supply chain professional doing a halal compliance check | Fast, source-backed, step-level results |
| Demo visitor | Recruiter, client, or peer opening the live demo | Understand the app in 3 minutes without reading standards |
| Future builder (Nadya) | Extends the app later (more bodies, more sectors) | Clear schema, clear docs, repeatable pipeline |

## 5. User Journeys

### A. Look up a rule
1. Open Reference, see the matrix: 8 criteria rows, 2 body columns.
2. Click the JAKIM transport cell.
3. See the rule summary, the source document, clause, dates, and the original-language text.

### B. Try the demo client (main demo path)
1. Open the pre-loaded fictional client: an Indonesian skincare brand.
2. See its chain: suppliers, contract factory (maklon), packaging, warehouses, transport, distribution, retail.
3. Run screening against BPJPH. See all four verdict types appear.
4. Add JAKIM. See two steps that pass BPJPH but fail JAKIM.
5. Open the gap report and print it.

### C. Build your own profile
1. Answer the intake questionnaire (generated from the rules, so nothing important is forgotten).
2. The wizard turns answers into chain steps.
3. Run screening. Unknown answers show as "insufficient info" with a list of what to ask the company.

### D. Compare dataset versions (later demo of honesty)
1. When a new dataset version ships (new body or updated rule), old runs stay pinned to the old version.
2. A new run on the same profile shows what changed.

## 6. MVP Scope

### In (v0.1 - Reference)
- Dataset v1.0.0: BPJPH + JAKIM, 8 criteria, cosmetics. 16 cells, each a sourced rule or an explicit "standard is silent" mark.
- Matrix, rule detail, recognition view, strictness notes.

### In (v0.2 - Screening)
- Intake questionnaire and profile wizard (localStorage).
- Rules engine, four verdicts, runs pinned to dataset version.
- Overrides with reason. Gap items. Data-request list.

### In (v0.3 - Demo polish)
- BPJPH vs JAKIM delta view.
- Print-ready gap report with disclaimer.
- Seeded demo client, demo banner, reset button.
- README with 5-step demo script.

### Out
- Other sectors and bodies (come as later dataset versions).
- Ingredient and formula rules (marked out of scope in the UI).
- Accounts, sharing, AI chat, live regulation alerts, mobile app.

## 7. Product Requirements

| ID | Requirement |
| --- | --- |
| PRD-001 | Every rule shows source document, clause (when available), publication date, and retrieval date. |
| PRD-002 | Dataset versions never change after release. Fixes create a new version. |
| PRD-003 | Verdicts come from fixed rules in code. No AI call in the verdict path. |
| PRD-004 | Every run stores which dataset version and which standards it used. |
| PRD-005 | Only four verdicts exist: compliant, conditional, non_compliant, insufficient_info. |
| PRD-006 | Missing data always gives insufficient_info, never a guessed verdict. |
| PRD-007 | A finding points to one chain step, or to the whole chain for chain-wide rules (like a traceability system). |
| PRD-008 | Certificates are checked with recognition rules. Example: a JAKIM certificate counts for a BPJPH rule only if BPJPH recognizes JAKIM for that scope. Recognition is one-way data. |
| PRD-009 | Multi-standard results show side by side, never merged. |
| PRD-010 | Overrides need a written reason. The engine verdict stays visible everywhere, including exports. |
| PRD-011 | Every export carries the fixed disclaimer: screening opinion, not certification, not religious ruling. |
| PRD-012 | v1 covers cosmetics only, and the UI says so. |
| PRD-013 | Original-language source text is kept and shown next to the English summary. |
| PRD-014 | The intake questionnaire is generated from the rules of the selected standards, before the first run. |
| PRD-015 | All demo data is fictional and labeled as fictional. |
| PRD-016 | Runs cannot be edited or deleted. The visitor can reset all their own browser data with one clear action. |

## 8. Performance Targets

| Metric | Target |
| --- | --- |
| First page load | Under 2 s on normal broadband |
| Screening run (30 steps, 2 standards) | Under 1 s, in the browser |
| Rule detail open | Under 300 ms |
| Print view | Under 3 s |
| Demo uptime | Always on (static hosting, nothing to sleep) |

## 9. Release Criteria

**v0.1**: matrix renders 16 resolved cells; every rule shows a full citation; silence cells look different from empty cells.

**v0.2**: questionnaire, wizard, engine, overrides, and gap items work end to end on a hand-made profile.

**v0.3**: demo client seeded; full journey B works in under 3 minutes; delta view shows at least two divergent steps; print report carries disclaimer and versions; deployed on Cloudflare Pages.

## 10. Dependencies

- Claude (Fable 5) with web search for the research runs.
- Human review time for every rule before release.
- Source documents: UU 33/2014, PP 42/2024, BPJPH regulations and cosmetics guidance; MS 2634:2019, MS 2400 series, MPPHM 2020. Some are paywalled or print-only. Those rules get document-level citations and a "source access limited" flag instead of fake clause precision.

## 11. Open Questions

- BPJPH cosmetics-specific guidance is new and may still change in 2026. The dataset handles this with retrieval dates and version bumps. Decide refresh timing after v1 release.
- Report PDF: browser print in v0.3. A rendered PDF pipeline only if print quality fails.
