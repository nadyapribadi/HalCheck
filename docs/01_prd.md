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
