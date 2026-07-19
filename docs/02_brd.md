# HALCHECK — Business Requirements Document (BRD)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Business Objective

Add a verifiable, tamper-evident record of who submitted what information, when, for a product batch moving through contract manufacturing (maklon) — so compliance accountability can be demonstrated, not just claimed. Extended to ensure the underlying data itself is trustworthy at the point of entry, that the rules governing validity are themselves accountable to change, and that the resulting record is understandable without specialist knowledge.

## 2. Business Problem

Compliance record-keeping in contract manufacturing has known failure points: ingredients substituted without detection, shared production lines not properly segregated, approvals granted before verification actually completed, records altered after the fact. A less obvious but equally real failure point: records populated with inconsistent, fabricated, or unverifiable free-text data — a system can be perfectly tamper-evident and still be useless if what was entered in the first place was never checked against anything real. Standard record-keeping doesn't prevent any of these — it only documents them after the damage is done, if at all.

## 3. Business Scope

### In Scope
- Role-based submission tracking across the batch lifecycle (sourcing → production → compliance check → export release)
- Tamper-evident recording of all submissions and verdicts
- Enforcement of submission sequencing (no step can be skipped or reordered)
- Controlled-vocabulary data entry, minimizing free-text input wherever a bounded, known set exists
- Governed maintenance of reference data (standards, ingredients, suppliers, fail-reason catalog) as regulations or sourcing relationships change
- Centralized, restricted-access logging of system-level activity, separate from business-event records
- Field-level access control, not only screen-level
- Plain-language explanation of a batch's trail, clearly distinguished from authoritative compliance status

### Out of Scope
- Payment or financial settlement
- Multi-organization independent hosting
- Permanent public infrastructure
- Any change to existing compliance rule logic
- AI involvement in generating or influencing compliance verdicts
- Bulk/multi-batch operations

**AI exclusion clarified:** No AI involvement in generating compliance verdicts, or in any capacity where its output determines, gates, or overrides a system action. Explanatory, read-only AI features that summarize already-recorded data — and carry no decisional authority — are explicitly permitted and are not considered a violation of this exclusion, provided they meet the labeling and grounding requirements defined in FRD-CHAIN-AI-001–005.

## 4. Stakeholders

| Stakeholder | Interest |
|---|---|
| Product owner | Feature demonstrates provable accountability without expanding product scope beyond compliance screening |
| Compliance Officer role (in-app) | Verdict authority remains unchanged; feature wraps existing logic without altering it |
| Brand Owner role (in-app) | Full visibility into batch history, without edit/delete capability; plain-language access to understand outcomes |
| System Admin role (in-app) | Authority to maintain what the system considers valid reference data, without any operational submission capability; sole access to system-level audit information |
| External reviewer/evaluator | Needs to independently verify tamper-evidence and access-control claims, not just be told they're true |

## 5. Business Constraints

- Must not require ongoing paid infrastructure at this stage.
- Must not duplicate or reimplement existing compliance rule logic.
- Must remain legible as *part of* the existing product, not a separate or rebranded offering.
- Development and testing must be achievable on standard consumer hardware.
- Any AI component must remain strictly explanatory, never decisional, and must be clearly distinguishable from authoritative system output.

## 6. Business Rules

1. No role may perform an action outside its defined permitted scope, down to the level of individual data fields.
2. A submission, once recorded, cannot be edited or deleted — only superseded by a new, linked submission.
3. Export release cannot occur without a recorded compliance Pass.
4. Compliance Fail outcomes must be recorded with the same permanence as Pass outcomes, using a defined, non-arbitrary set of reasons.
5. The compliance verdict authority remains the existing rule engine; this feature does not introduce a second source of truth for compliance status. The engine's output is binding — no role has override discretion.
6. Data entry must draw from controlled reference sets wherever a bounded set of valid values exists; free-text entry is the exception, not the default.
7. Reference data (what the system considers a valid ingredient, supplier, standard, or fail reason) may only be changed by the System Admin role, and every such change is itself a permanently recorded, attributable event.
8. A batch's historical record always reflects the reference-data version in effect at the time it was created — later changes to reference data do not retroactively alter past records.
9. System-level activity (logins, views, access attempts) is centrally logged, separate from business records, and accessible only to System Admin.
10. Any AI-generated explanation must be drawn strictly from the specific batch's own recorded data and must be visibly labeled as non-authoritative wherever it appears.

## 7. Monetization

None. This is a demonstration capability, not a revenue feature.

## 8. Operational Requirements

- Must run without dependency on continuously paid infrastructure.
- Must be independently testable (a reviewer can validate rule enforcement and access boundaries, not just observe a UI).
- Remote accessibility (via shareable link) is a secondary requirement, dependent on host availability — not a guarantee of permanent uptime.
- Any external service dependency (an LLM API, for the explanation feature) must remain viable at negligible cost given the system's demo-scale usage.

## 9. Compliance and Standards Alignment

- Business process anchors to real, named regulatory/industry standards at each step, rather than generic or invented checkpoints.
- No claim of endorsement by, or integration with, any actual regulatory body's systems.
- Reference-data governance mirrors real-world regulatory update practice: a defined authority maintains what's current, prior versions remain part of the historical record rather than being erased.

## 10. Business Success Metrics

- All defined user journeys (happy path, failure path, edge case, attempted-bypass, reference-data change, audit review, plain-language explanation) function end-to-end.
- Rule enforcement, including field-level access, can be independently verified by a third party, not only asserted.
- No business rule (Section 6) is enforced solely at the interface level without a matching backend/ledger-level check.
- AI-generated explanations, when tested against edge-case questions, never assert a compliance status not directly present in the underlying data.

## 11. Assumptions

- Audience evaluating this feature has either domain familiarity or access to a plain-language explanation of the mechanism.
- Feature is evaluated as a governance/accountability demonstration, not as a deployed production compliance system.
- A single administrative authority (System Admin) is sufficient to represent reference-data governance for demonstration purposes, without modeling multi-party regulatory consensus.

## 12. Business Risks

| Risk | Mitigation |
|---|---|
| Feature is perceived as overclaiming (e.g., "prevents fraud") | Positioning is explicitly scoped to "demonstrates accountability mechanism," stated plainly wherever the feature is presented |
| Feature dilutes the core product's identity as a compliance screening tool | Kept bounded — folded into existing structure, not elevated to a headline capability |
| Reliance on host-machine availability undermines credibility of "always accessible" expectations | Access limitations stated plainly rather than implied as permanent |
| AI explanation is mistaken for authoritative compliance output | Consistent, unavoidable visual labeling wherever the feature appears; explanation strictly grounded in provided data only |
| System Admin becomes a de facto bypass role over time (scope creep) | Explicitly and permanently excluded from any batch-submission capability by business rule, not merely by current UI design |

## 13. Open Questions

- Should operational availability (Section 8) be formalized as a measurable SLA-style statement, or remain a stated limitation only?
- Does the business rule set (Section 6) need sign-off as a checklist before FRD/TRD implementation proceeds, or is this BRD itself the sign-off point? (Effectively addressed by the completed independent review process — see Decision Log.)
- Should reference-data governance eventually model more than one administrative authority, or does a single System Admin role remain sufficient indefinitely for a demonstration-scale system?

## 14. Traceability to Product Requirements

| BRD Rule | Rule Summary | Implementing PRD-CT ID(s) |
|---|---|---|
| Rule 1 | No role acts outside defined scope, field-level | PRD-CT-002, PRD-CT-023 |
| Rule 2 | Submissions cannot be edited/deleted, only superseded | PRD-CT-006 |
| Rule 3 | Export requires recorded Pass | PRD-CT-004 |
| Rule 4 | Fail recorded with equal permanence, defined reason set | PRD-CT-005, PRD-CT-015 |
| Rule 5 | Engine remains sole verdict authority, no second source of truth | PRD-CT-005 |
| Rule 6 | Controlled reference sets over free text | PRD-CT-013 |
| Rule 7 | Reference-data changes are attributable, System-Admin-only | PRD-CT-016, PRD-CT-017, PRD-CT-018 |
| Rule 8 | Historical records retain version at creation time | PRD-CT-019 |
| Rule 9 | System-level activity centrally logged, System-Admin-only access | PRD-CT-020, PRD-CT-021, PRD-CT-022 |
| Rule 10 | AI explanations grounded, labeled non-authoritative | PRD-CT-012 |

**Gap check:** every business rule has at least one implementing requirement — no orphaned rule found. PRD-CT-003, 007, 008, 009, 010, and 011 trace to the Business Problem (Section 2) and stakeholder needs directly rather than a single numbered rule — not every product requirement needs to originate from a formal business rule specifically.
