# HALCHECK — Product Requirements Document (PRD)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.2.0:** Closed the recognition-edge sequencing open question by capturing Intended Market at batch creation and tracing it through FRD-CHAIN-BATCH-001.

## 1. Purpose / Vision

Give the product a real, cryptographically enforced record of who submitted what, when, for a product batch moving through contract manufacturing (maklon) — so compliance accountability is provable, not just claimed. Extended to ensure the data entered is itself trustworthy (controlled vocabularies, not free text), that changes to what the system considers valid are themselves accountable, and that the resulting trail is understandable to a non-technical reviewer.

## 2. Problem Statement

Contract manufacturing has documented failure points that plain record-keeping doesn't prevent: ingredients substituted unnoticed, shared production lines not properly segregated, exports approved before compliance actually passed, records altered after the fact — and, just as often, records populated with inconsistent or fabricated free-text data that no one can validate later. The existing compliance engine determines *whether* a product passes; this feature makes it provable *who* attested to each fact, ensures what's entered is checkable against known-good data, and makes the resulting trail legible to someone without technical or regulatory background.

## 3. Goals

1. Every submission is attributable to a real, cryptographically verified role identity.
2. No role can perform an action outside its permitted scope — enforced by the system, down to the field level, not just hidden by the UI.
3. Records, once submitted, cannot be silently altered — provably, not just by policy.
4. Data entered is validated against controlled reference sets wherever a bounded set exists, minimizing free-text input.
5. Changes to reference data (standards, ingredients, suppliers) are themselves accountable events, not silent configuration edits.
6. All system-level activity (not just business events) is centrally logged and restricted to authorized review.
7. The trail is explainable in plain language, without misrepresenting AI explanation as compliance authority.
8. The existing compliance engine remains the sole authority on halal verdicts; this feature wraps it, never duplicates or reimplements it.

## 4. Non-Goals

- No payment/financial settlement flow.
- No PDF/document export of the trail in this version.
- No independent multi-organization hosting — single-network, self-hosted for now.
- No permanent public hosting — reachable only while the host machine is on.
- No changes to existing compliance rule logic.
- No AI involvement in generating or influencing compliance verdicts — AI is explanatory only, never decisional.
- No bulk/multi-batch operations — one action, one batch, always.
- No native mobile app; mobile web is view-only.

## 5. Target Users / Personas

| Role | Core need |
|---|---|
| Ingredient QA | Fast, validated way to submit sourcing data from known reference sets, not free typing |
| Production QA | Simple confirmation of batch + line-segregation status, auto-populated date |
| Compliance Officer | Uses the existing engine; needs the verdict recorded immutably, with structured fail reasons |
| Export/Logistics Officer | Needs to *know*, not just be told, that a batch is actually clear to export |
| Brand Owner | Needs full visibility with zero ability to alter history, and a plain-language way to understand what happened |
| System Admin | Needs to maintain reference data (ingredients, suppliers, standards, fail reasons) as regulations change, and review the centralized audit log — with no involvement in batch submissions itself |

## 6. Product Requirements

| ID | Requirement | Priority |
|---|---|---|
| PRD-CT-001 | Each role must authenticate via a unique, verifiable identity before submitting data. | P0 |
| PRD-CT-002 | System must reject any submission attempted outside a role's permitted action set. | P0 |
| PRD-CT-003 | Every submission must be recorded on an immutable, tamper-evident ledger. | P0 |
| PRD-CT-004 | Export release must be technically blocked, not just visually disabled, without a recorded Pass verdict. | P0 |
| PRD-CT-005 | Compliance Fail verdicts must be recorded with the same permanence as Pass verdicts. | P0 |
| PRD-CT-006 | Corrections must create new records; existing records must never be edited or deleted. | P0 |
| PRD-CT-007 | Ingredient data must support bulk upload (spreadsheet), not only single-item entry. | P1 |
| PRD-CT-008 | Each production and compliance record must reference its governing real-world standard. | P1 |
| PRD-CT-009 | Recognition-directionality outcome must be visibly labeled within the compliance verdict record. | P1 |
| PRD-CT-010 | The full trail must be viewable (read-only) by the Brand Owner role at any time, including superseded records. | P1 |
| PRD-CT-011 | The application must be reachable via a shareable link while the host machine is running. | P2 |
| PRD-CT-012 | Users must be able to request a plain-language explanation of a batch's trail, generated strictly from that batch's recorded data, visibly labeled as AI-generated and non-authoritative. | P1 |
| PRD-CT-013 | Ingredient and supplier fields must be selected from controlled reference lists, not freely typed, wherever a bounded set exists. | P0 |
| PRD-CT-014 | Batch date fields must be system-populated from the actual submission timestamp, not manually editable. | P0 |
| PRD-CT-015 | Compliance Fail reasons must be selected from a controlled catalog, not freely typed. | P1 |
| PRD-CT-016 | A System Admin role must exist, separate from all operational roles, with no batch-submission capability. | P0 |
| PRD-CT-017 | System Admin must be able to add new reference-data entries and deprecate outdated ones; existing entries must never be overwritten or deleted. | P0 |
| PRD-CT-018 | Reference-data changes must be recorded with the same accountability guarantees (identity, timestamp, immutability) as batch records. | P0 |
| PRD-CT-019 | Historical batch records must retain the reference-data version active at the time of their creation, unaffected by later reference-data changes. | P0 |
| PRD-CT-020 | A centralized System Audit Log must record all system-level activity (logins, views, failed access attempts), separate from the business-event ledger. | P0 |
| PRD-CT-021 | The System Audit Log must be insert-only, enforced at the database permission level, not merely by application logic. | P0 |
| PRD-CT-022 | The System Audit Log must be visible only to the System Admin role; no operational role may access it. | P0 |
| PRD-CT-023 | Field-level access control must be enforced per role — a role must never receive fields in an API response that it is not authorized to view, regardless of frontend display logic. | P0 |

## 7. Key User Journeys

1. **Happy path** — batch moves sourcing → production → compliance Pass → export, fully attributable at each step, ingredients selected from reference lists.
2. **Failure path** — compliance Fail (structured reason) is recorded, export stays blocked, resubmission creates a new linked record without erasing the original.
3. **Recognition-edge case** — a cross-jurisdiction certificate is evaluated against a differing rule; the recognition outcome is visible in the verdict detail, not hidden.
4. **Attempted bypass** — any role attempts an action outside its scope, including a field it shouldn't see; system rejects it at the enforcement layer, not merely the UI layer.
5. **Reference-data change** — System Admin deprecates an outdated standard and adds its replacement; existing batches keep referencing the version active when they were created; the change itself is recorded, attributable, and visible in reference-data history.
6. **Audit review** — System Admin reviews the centralized System Audit Log; confirms it contains no gaps and cannot be edited retroactively.
7. **Plain-language explanation** — any role asks "why is this batch blocked," receives an answer generated strictly from that batch's own recorded data, clearly labeled as AI-generated.

## 8. Success Metrics

- All 7 scenarios in Section 7 demonstrably work end-to-end.
- A reviewer can independently verify tamper-evidence by attempting an edit and observing the failure — for both batch records and reference data.
- No requirement in Section 6 is enforced only in the frontend without a matching backend/ledger-level check, including field-level visibility.
- AI explanations never state a compliance status not directly present in the underlying trail data, verified by deliberate testing against edge-case questions.

## 9. Release Criteria

| Phase | Criteria |
|---|---|
| Design | This PRD + FRD/TRD/RBAC & Audit Trail content + decision log complete |
| Build | Local network running; all 6 roles (5 operational + System Admin) functional end-to-end |
| Test | All 7 user journeys pass, including negative/bypass-attempt and field-level access tests |
| Deploy/Production | Explicitly not in scope for this release |

## 10. Dependencies

- Existing compliance engine (unchanged, reused).
- Blockchain platform, container runtime, backend and chaincode language toolchains.
- Tunneling solution for the shareable-link requirement (PRD-CT-011).
- LLM API access for PRD-CT-012 (Trail Explanation) — a small, narrowly-scoped model call, not a general-purpose chat integration.

## 11. Assumptions

- Reviewer/demo audience has basic familiarity with supply chain compliance concepts, or access to a plain-language companion explanation.
- Host machine is available at demo time.
- LLM API usage at this scale (single-batch context, occasional queries) remains effectively free or negligible cost.

## 12. Risks

- Positioning risk: must stay framed as a governance-mechanism demonstration, never as a fraud-prevention claim.
- Scope-dilution risk: must stay legible as part of the existing product, not read as a separate or rebranded offering.
- AI-specific risk: a generated explanation could be misread as an authoritative compliance statement if labeling (PRD-CT-012) is not consistently enforced across every surface where it appears.
- New-role risk: System Admin, if not carefully bounded, could become a de facto bypass role — mitigated by PRD-CT-016's explicit exclusion from any submission capability.

## 13. Open Questions

- Should PRD-CT-011 (shareable link) need its own acceptance test, or is it validated informally at demo time?
- LLM provider selection: criterion is stated in TRD (instruction-following/refusal reliability over raw capability); specific provider left to Build-time selection.

**Resolved in v0.2.0:** the recognition-edge-case journey now has a concrete supporting FRD requirement via FRD-CHAIN-BATCH-001, because Intended Market must exist before verdict computation.

---

## Core Screening App PRD

*The following section covers HALCHECK's other module — the Core Screening App, the engine Compliance Trail wraps. Module: Core Screening App. Status: Design in progress.*

### 1. Purpose / Vision

Let a user describe a fictional product's supply chain once, then see — rule by rule, ingredient by ingredient — where it stands against BPJPH and JAKIM's cosmetics-halal requirements, with every finding traceable to a specific rule and a specific supply-chain fact.

### 2. Problem Statement

A halal compliance comparison across two standards bodies is normally a manual cross-referencing exercise: someone has to know both rule sets, know which one governs which market, know when a certificate from one body satisfies — or doesn't — a requirement owned by the other, and do this consistently across every ingredient in a formulation. Manual review is slow, inconsistent between reviewers, and rarely records *why* a particular ingredient was flagged — only that it was.

### 3. Goals

1. Accept a fictional product's ingredient list and sourcing detail as structured input (no free text where a bounded set exists).
2. Evaluate that input against a versioned set of BPJPH and JAKIM rules for a selected intended market.
3. Apply recognition-directionality explicitly wherever a certificate crosses a body boundary — never assume symmetric recognition.
4. Produce a Finding per rule, each citing the specific rule and the specific ingredient/sourcing fact responsible.
5. Let a user export a report carrying the fixed disclaimer (screening opinion, not certification, not religious ruling) and the dataset/engine version used.
6. Run entirely in the browser — no account, no server round-trip, no persistence beyond local storage.

### 4. Non-Goals

- No real regulatory authority or endorsement claim.
- No login/accounts/multi-user state.
- No bulk/multi-product screening in one run.
- No AI-generated content anywhere in the evaluation or report path.
- No edit of a completed run's findings — a new input produces a new run.

### 5. Target Users / Personas

| User | Core need |
|---|---|
| Brand/QA reviewer (fictional persona, reused from Compliance Trail: Siti Rahayu) | Enter a product's ingredients and sourcing, get a clear, sourced pass/fail per rule |
| Compliance reviewer (fictional persona: Nurul Aisyah) | Confirm which specific rule and ingredient triggered any fail, before recording a downstream decision |
| Demo viewer / evaluator | See that a finding is traceable to an actual rule and fact, not an opaque score |

### 6. Product Requirements

| ID | Requirement | Priority |
|---|---|---|
| PRD-CORE-001 | User can define a screening profile: intended market (Indonesia/BPJPH, Malaysia/JAKIM), product type. | P0 |
| PRD-CORE-002 | User can add ingredients to a profile from the active dataset release's ingredient reference list, with source/supplier selected from a controlled list, not free text. | P0 |
| PRD-CORE-003 | System evaluates every applicable rule in the active dataset release against the profile's ingredients and produces one Finding per rule. | P0 |
| PRD-CORE-004 | Each Finding states: rule ID and citation, result (pass/fail/not-applicable), the specific ingredient/sourcing record responsible (if fail), and a plain-language rationale. | P0 |
| PRD-CORE-005 | Where a rule's satisfaction depends on a certificate issued by a different certifying body than the one governing the intended market, the system evaluates recognition explicitly (issuing body, requiring body, recognized yes/no, as-of date) rather than assuming it. | P0 |
| PRD-CORE-006 | A completed screening run records the dataset release version and engine version used, immutably. | P0 |
| PRD-CORE-007 | User can view the full reference content (standards, ingredient risk classifications, recognition agreements) the active dataset release evaluates against, before or after running a screening. | P1 |
| PRD-CORE-008 | User can export a screening report; every export carries the fixed disclaimer: screening opinion, not certification, not religious ruling. | P0 |
| PRD-CORE-009 | A screening run persists to local browser storage only; no server round-trip at any point in the intake → screening → report flow. | P0 |
| PRD-CORE-010 | All domain content (standards, ingredients, recognition agreements) is visibly labeled as fictional/demonstration content, not real regulatory guidance. | P0 |

### 7. Key User Journeys

1. **Happy path** — user builds a profile (Malaysia market), adds 6 known-clear ingredients from the reference list, runs screening, sees all rules pass, exports a clean report.
2. **Gap-finding path** — user adds an ingredient with an unverified-source supplier; the relevant rule fails; the report shows exactly which ingredient/supplier combination and which rule caused it.
3. **Recognition-edge path** — user selects Indonesia as the intended market for a product whose only certificate was issued by JAKIM, not BPJPH; the engine evaluates the JAKIM→BPJPH recognition explicitly and the report shows the recognition outcome as its own labeled finding, not folded into a generic fail reason.
4. **Reference browse** — user inspects the active dataset release's ingredient list and recognition agreements before adding anything, to understand what the engine will check against.

### 8. Success Metrics

- All 4 journeys in Section 7 complete end-to-end without a server dependency.
- Every Finding shown in the UI is reproducible by calling `evaluate()` directly with the same inputs — used as the engine's own test oracle.
- A reviewer can trace any Fail finding back to one specific rule ID and one specific ingredient/sourcing record, without reading engine source code.

### 9. Release Criteria

| Phase | Criteria |
|---|---|
| Design | This PRD section + FRD/ERD/UI-spec/dataset-spec sections complete |
| Build | `evaluate()`/`rationale()` implemented and unit-tested against the seeded SL-2026-00x scenarios; intake/profile/reference/screening/report screens functional |
| Test | All journeys in Section 7 pass; engine output matches Compliance Trail's expected `VERDICT_RECORD` shape for the same seeded batches |

### 10. Dependencies

- None external — this app has no backend, no third-party API, no AI call.
- Downstream: Compliance Trail's verdict-attestation flow (TRD §23.2) depends on this engine's output shape being stable — see `06_erd.md`, Core Screening App Data Model section, §5.

### 11. Assumptions

- All domain content is synthetic; no claim of real regulatory accuracy is made or implied anywhere in the product.
- A single local user per session; no concurrent-editing or multi-user conflict handling is needed, since there is no backend to arbitrate it.

### 12. Open Questions

- Should a screening run be shareable (exportable/importable as a file) across browser sessions, or is local-storage-only sufficient for v1? Left to Build-time UX decision; doesn't block engine design.
- Should the recognition-agreement table support more than two certifying bodies in a future version? Out of scope for v1 (BPJPH/JAKIM only).
