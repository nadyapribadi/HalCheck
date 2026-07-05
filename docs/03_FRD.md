# Functional Requirements Document

## 1. Scope

Functional requirements for HALCHECK v0.1 to v0.3. Grouped by subsystem, with stable IDs. Priorities: P0 = v0.1, P1 = v0.2, P2 = v0.3, P3 = later.

## 2. Dataset (Reference Data)

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-DATA-001 | Model certification bodies as records. v1: BPJPH, JAKIM. | P0 |
| FRD-DATA-002 | A body can have several source documents (example JAKIM: MS 2634:2019, MS 2400 series, MPPHM 2020). Each document has an identifier, title, publication date, and status. | P0 |
| FRD-DATA-003 | The 8 criteria are a fixed list: segregation, transportation, traceability_documentation, critical_control_points, contamination_tolerance, third_party_certification, audit_cycle, mutual_recognition. | P0 |
| FRD-DATA-004 | A rule record = body + criterion + sector. It holds: English summary, original-language quote, structured attributes, which step types it applies to, scope (step or chain), and a citation block. | P0 |
| FRD-DATA-005 | Citation block = source document, clause reference when available, source URL or identifier, publication date, retrieval date. A release with a missing citation is blocked. | P0 |
| FRD-DATA-006 | If a body has no published rule for a criterion, the cell gets an explicit "standard is silent" record. Empty cells are invalid. | P0 |
| FRD-DATA-007 | Paywalled or print-only sources get a `source_access_limited` flag: document-level citation plus a human-verified summary. | P0 |
| FRD-DATA-008 | Structured attributes per criterion follow the fixed contracts in `05_ARCHITECTURE.md` section 8. | P0 |
| FRD-DATA-009 | Recognition records are one-way: body A recognizes body B, with a level (full / conditional / none / unverified), a scope note, and a citation. | P0 |
| FRD-DATA-010 | A dataset release is a frozen, versioned snapshot (SemVer). Release v1.0.0 must resolve 16 cells (2 bodies x 8 criteria): each cell is a verified rule or a silence record. The gate scales when bodies are added. | P0 |
| FRD-DATA-011 | Strictness notes: per criterion, mark which body is stricter, with a short reason. | P1 |
| FRD-DATA-012 | Conflict flags: mark cases where the two bodies cannot both be satisfied by the same setup. | P1 |
| FRD-DATA-013 | Errata: a release can list corrections and which new version fixes them. | P2 |
| FRD-DATA-014 | Sector is a data field, fixed to `cosmetics` in v1. The schema must not hardcode cosmetics, so later sectors are additive. | P0 |

## 3. Research Pipeline

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-RSCH-001 | One research brief file per body, version-controlled, containing the exact output JSON schema. | P0 |
| FRD-RSCH-002 | Research output is committed as-is to `dataset/drafts/`. | P0 |
| FRD-RSCH-003 | Every researched rule starts as `draft`. Human review promotes it to `verified` with reviewer and date. | P0 |
| FRD-RSCH-004 | Only `verified` rules can enter a release. | P0 |
| FRD-RSCH-005 | Review checks each citation against the source. Model translation is a draft, never truth. | P0 |
| FRD-RSCH-006 | Original-language quotes are kept word-for-word next to the English summary. | P0 |
| FRD-RSCH-007 | A single body can be re-researched alone, producing a minor version release. | P1 |
| FRD-RSCH-008 | Each research run records date, model name, and brief version. | P1 |

## 4. Reference UI

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-REF-001 | Matrix: 8 criteria rows x body columns, cells show short attribute chips. | P0 |
| FRD-REF-002 | Silence cells and source-limited cells look clearly different from normal cells. | P0 |
| FRD-REF-003 | Clicking a cell opens the rule detail: summary, attributes, original quote (expandable), full citation. | P0 |
| FRD-REF-004 | Recognition view: one-way grid with level marks and citations. | P0 |
| FRD-REF-005 | Strictness and conflict notes are visible per criterion. | P1 |
| FRD-REF-006 | The active dataset version is always shown. | P0 |
| FRD-REF-007 | Sector banner: "Cosmetics, v1" visible on the reference layer. | P0 |
| FRD-REF-008 | Staleness badge per body: days since retrieval date, warning past 180 days. | P2 |

## 5. Intake Questionnaire

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-INTAKE-001 | The app generates a questionnaire from the rules of the selected standards, before any run. | P1 |
| FRD-INTAKE-002 | Questions are grouped by chain stage and written in plain language (example: "Does the warehouse store only halal-certified goods, or mixed goods?"). | P1 |
| FRD-INTAKE-003 | Answers map directly to step attributes. "I don't know" is always an option and maps to `unknown`. | P1 |
| FRD-INTAKE-004 | The questionnaire can be exported as a checklist (copy or print) to send to a company. | P2 |

## 6. Profiles and Chain Steps

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-PROF-001 | A profile = one company: name, segment, target markets, note. Stored in the browser (localStorage). | P1 |
| FRD-PROF-002 | Step types: supplier, processing_site, packaging, warehouse, transport_leg, distribution_point, retail_point. | P1 |
| FRD-PROF-003 | Common step attributes: label, country, dedicated or shared, cleaning protocol type, operator certificate (body + reference + expiry, or none), documentation coverage, notes. | P1 |
| FRD-PROF-004 | Processing sites record the operator model: own factory or contract manufacturer (maklon). | P1 |
| FRD-PROF-005 | Transport legs also record: from step, to step, mode, vehicle/container dedication, operator (own or 3PL). | P1 |
| FRD-PROF-006 | Warehouses also record: segregation setup (dedicated facility / dedicated zone / shared racking) and what else is stored there. | P1 |
| FRD-PROF-007 | Suppliers also record: material category, supplier certificate status, and an ingredient-sensitivity flag (animal-derived or alcohol-based input). The flag routes to an out-of-scope marker, not a verdict. | P1 |
| FRD-PROF-008 | The profile itself has chain-level attributes (example: traceability system in place, record retention), used by chain-scope rules. | P1 |
| FRD-PROF-009 | Any attribute can be `unknown`. Unknown feeds the engine as missing data. | P1 |
| FRD-PROF-010 | A run snapshots the profile at run time. Later edits never change old runs. | P1 |

## 7. Rules Engine and Runs

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-RUN-001 | A run = one profile snapshot + one dataset version + one or more standards. | P1 |
| FRD-RUN-002 | The engine checks every step against every rule that applies to its step type, plus chain-scope rules against the profile attributes. | P1 |
| FRD-RUN-003 | Verdicts: compliant, conditional, non_compliant, insufficient_info. Nothing else. | P1 |
| FRD-RUN-004 | The engine is a pure function: same inputs, same outputs, no AI, no randomness. | P1 |
| FRD-RUN-005 | Any check that touches an `unknown` attribute returns insufficient_info and names the missing attribute. | P1 |
| FRD-RUN-006 | Certificate checks use recognition data. A certificate from body X satisfies a rule of body Y only if Y recognizes X at level `full` (pass) or `conditional` (verdict: conditional). Level `none` fails. Level `unverified` returns insufficient_info. | P1 |
| FRD-RUN-007 | Every finding stores: step (or "chain"), rule, standard, verdict, and a machine rationale (checked / matched / failed / missing). | P1 |
| FRD-RUN-008 | Runs are frozen after completion. Re-checking is a new run. | P1 |
| FRD-RUN-009 | Multi-standard runs keep per-standard findings separate and show them side by side. Divergent steps (pass one, fail the other) are highlighted first. | P2 |

## 8. Overrides

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-OVR-001 | The user can override any finding's verdict. | P1 |
| FRD-OVR-002 | An override needs a written reason. Empty reasons are rejected. | P1 |
| FRD-OVR-003 | The engine verdict stays visible next to the override, everywhere, including exports. | P1 |
| FRD-OVR-004 | Overrides are separate records with a timestamp. The finding itself never changes. | P1 |
| FRD-OVR-005 | The run header and the report show an override count and list. | P2 |

## 9. Gap Items and Report

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-GAP-001 | Every non_compliant and conditional finding creates a gap item. | P1 |
| FRD-GAP-002 | A gap item holds: the finding, the step, the citation, an editable fix text (template pre-filled), priority, and status. | P1 |
| FRD-GAP-003 | insufficient_info findings create a separate data-request list (questions for the company). | P1 |
| FRD-GAP-004 | The report includes: client name, run data (dataset version, standards, date), summary, gap items by chain stage, data-request list, override list, and the fixed disclaimer footer. | P2 |
| FRD-GAP-005 | Export = print-optimized view (browser print to PDF). | P2 |
| FRD-GAP-006 | Multi-standard runs add an export-readiness section from the delta view. | P2 |

## 10. Demo Mode

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-DEMO-001 | No login anywhere. The app opens straight into content. | P0 |
| FRD-DEMO-002 | One fictional demo client ships pre-loaded: an Indonesian skincare brand using a contract manufacturer, targeting Malaysia export before the Oct 2026 deadline. | P2 |
| FRD-DEMO-003 | The demo chain is designed so all four verdicts appear, and at least two steps pass BPJPH but fail JAKIM. | P2 |
| FRD-DEMO-004 | A visible "fictional data" label appears on the demo client and its reports. | P2 |
| FRD-DEMO-005 | "Reset demo data" restores the seeded demo and clears visitor data, with a confirm step. | P2 |
| FRD-DEMO-006 | Visitor profiles and runs can be exported and imported as a JSON file (their own backup; there is no server). | P2 |

## 11. Integrity

| ID | Requirement | Priority |
| --- | --- | --- |
| FRD-INT-001 | Rules in a released dataset are read-only in the app. | P0 |
| FRD-INT-002 | Findings and runs are read-only after completion. Rationale is stored, not recomputed, so old runs always render the same. | P1 |
| FRD-INT-003 | Profiles and runs are archived, never hard-deleted, except by the visitor's explicit reset. | P1 |
| FRD-INT-004 | The disclaimer text lives in one config file and is injected into every export. | P0 |
| FRD-INT-005 | The engine version is stored on every run. | P1 |

## 12. Explicit Non-Requirements (v1)

- No verdicts on ingredient or formula rules (alcohol, animal-derived materials). Flagged steps get an out-of-scope marker.
- No production ritual rules. HALCHECK covers supply chain and logistics only.
- No accounts, no sharing links, no server storage.
- No automated monitoring of regulation changes.
- No AI-written verdicts or fix texts (templates only; the user edits).
