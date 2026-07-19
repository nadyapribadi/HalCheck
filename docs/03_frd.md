# HALCHECK — Functional Requirements Document (FRD)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Scope

Defines functional requirements for the Compliance Trail feature, covering identity, role/access control, sequencing, ledger immutability, controlled vocabulary, standards anchoring, verdict/recognition handling, read-only access, remote access, reference data management, the System Admin role, audit logging, field-level access control, AI trail explanation, and concurrency handling.

## 2. Identity and Authentication

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-IDENTITY-001 | Each role must be issued a unique Fabric CA certificate before submitting any data. | PRD-CT-001 | P0 |
| FRD-CHAIN-IDENTITY-002 | Backend must verify JWT-authenticated identity matches the Fabric identity used for each chaincode call. | PRD-CT-001 | P0 |
| FRD-CHAIN-IDENTITY-003 | Client-supplied role strings must never be trusted for authorization decisions. | PRD-CT-002 | P0 |
| FRD-CHAIN-IDENTITY-004 | Identity mismatch must be rejected before reaching chaincode, not after. | PRD-CT-002 | P0 |

## 3. Role and Access Control

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-ROLE-001 | Ingredient QA may submit ingredient records only. | PRD-CT-002 | P0 |
| FRD-CHAIN-ROLE-002 | Production QA may submit production records only, and may not edit ingredient records. | PRD-CT-002 | P0 |
| FRD-CHAIN-ROLE-003 | Compliance Officer may submit verdict records only, and may not alter upstream submissions. | PRD-CT-002 | P0 |
| FRD-CHAIN-ROLE-004 | Export/Logistics Officer may submit export requests only. | PRD-CT-002 | P0 |
| FRD-CHAIN-ROLE-005 | Any role attempting an action outside its permitted set must be rejected at the chaincode level, not merely hidden in the UI. | PRD-CT-002 | P0 |
| FRD-CHAIN-ROLE-006 | System Admin may not submit, correct, or approve any batch-lifecycle record. | PRD-CT-016 | P0 |

## 4. Sequencing

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-SEQUENCE-001 | Production record submission requires a prior ingredient record for the same batch. | PRD-CT-002 | P0 |
| FRD-CHAIN-SEQUENCE-002 | Verdict record submission requires a prior production record for the same batch. | PRD-CT-002 | P0 |
| FRD-CHAIN-SEQUENCE-003 | Export request requires a prior verdict record with status Pass for the same batch. | PRD-CT-004 | P0 |
| FRD-CHAIN-SEQUENCE-004 | Out-of-sequence submission attempts must return a distinguishable rejection reason, not a generic error. | PRD-CT-002 | P1 |

## 5. Ledger and Immutability

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-LEDGER-001 | No chaincode function may update or delete an existing submitted record. | PRD-CT-006 | P0 |
| FRD-CHAIN-LEDGER-002 | Corrections must be submitted as new records, linked to the original. | PRD-CT-006 | P0 |
| FRD-CHAIN-LEDGER-003 | Superseded records must remain queryable and visible, not hidden after correction. | PRD-CT-006, PRD-CT-010 | P0 |
| FRD-CHAIN-LEDGER-004 | Fail verdicts must be recorded with identical permanence guarantees as Pass verdicts. | PRD-CT-005 | P0 |

## 6. Ingredient Submission and Controlled Vocabulary

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-UPLOAD-001 | System must accept bulk ingredient upload via spreadsheet. | PRD-CT-007 | P1 |
| FRD-CHAIN-UPLOAD-002 | Each ingredient in a bulk upload must be recorded as an individually hashed, separately traceable record. | PRD-CT-007 | P1 |
| FRD-CHAIN-UPLOAD-003 | Bulk upload records must be grouped under a shared upload-session identifier for display purposes. | PRD-CT-007 | P1 |
| FRD-CHAIN-UPLOAD-004 | Manual single-ingredient addition must be supported, append-only. | PRD-CT-007 | P1 |
| FRD-CHAIN-UPLOAD-005 | Upload validation errors must be reported per-row, not as a single blocking failure. | PRD-CT-007 | P1 |
| FRD-CHAIN-UPLOAD-006 | Ingredient Name and Source fields must be selected from the current Ingredient/Supplier Reference Lists, not freely typed. | PRD-CT-013 | P0 |
| FRD-CHAIN-UPLOAD-007 | A bulk upload row whose ingredient or supplier value does not match the reference list must be rejected at that row, with a specific "not a recognized value" error, not treated as valid free text. | PRD-CT-013 | P0 |
| FRD-CHAIN-UPLOAD-008 | Halal Risk Flag must auto-populate from the matched Ingredient Reference List entry's default classification; the submitting role may override only with an explicit, recorded reason. | PRD-CT-013 | P1 |
| FRD-CHAIN-UPLOAD-009 | Backend must validate Ingredient Name and Source values against the current Reference Lists on every submission path (manual entry, bulk upload, and direct API call), independent of whether the request originated from the reference-list UI component. A value not present in the reference list must be rejected with `reason: "not_a_recognized_value"`, regardless of how the request was constructed. | PRD-CT-013 | P0 |

## 7. Production Confirmation

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-PROD-001 | Production record requires line-segregation confirmation (Yes/No). | PRD-CT-003 | P0 |
| FRD-CHAIN-PROD-002 | Batch Date must be system-populated from the actual submission timestamp and must not be manually editable by any role. | PRD-CT-014 | P0 |

## 8. Standards Anchoring

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-STANDARDS-001 | Each production record must reference its governing manufacturing standard. | PRD-CT-008 | P1 |
| FRD-CHAIN-STANDARDS-002 | Each verdict record must reference its governing compliance regulation. | PRD-CT-008 | P1 |
| FRD-CHAIN-STANDARDS-003 | Standards references must only be included where they govern an actually-modeled step — no decorative or unrelated citations. | PRD-CT-008 | P2 |
| FRD-CHAIN-STANDARDS-004 | Each record must reference the specific version of the standard active in the Reference Data set at the time of submission, immutably. | PRD-CT-019 | P0 |

## 9. Verdict and Recognition

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-VERDICT-001 | Compliance verdict logic must wrap the existing compliance engine without duplicating its rules. | PRD-CT-005 | P0 |
| FRD-CHAIN-VERDICT-002 | Recognition-directionality outcome must be recorded as part of the verdict record. | PRD-CT-009 | P1 |
| FRD-CHAIN-VERDICT-003 | Recognition-directionality outcome must be visibly and explicitly labeled in the verdict detail view, not folded into generic metadata. | PRD-CT-009 | P1 |
| FRD-CHAIN-VERDICT-004 | A Fail verdict's reason must be selected from the controlled Fail Reason catalog, not freely typed. | PRD-CT-015 | P1 |
| FRD-CHAIN-VERDICT-005 | The compliance engine's Pass/Fail output is binding. The Compliance Officer role has no override capability — the verdict record submitted to the ledger must exactly match the engine's determination, with no discretionary field permitting a different outcome to be recorded. | PRD-CT-005 | P0 |
| FRD-CHAIN-VERDICT-006 | Because the verdict is engine-determined and non-discretionary (per FRD-CHAIN-VERDICT-005), no second-party review/counter-signature is required on the verdict-recording action — the check in this step is the deterministic engine output itself, not a second human. | PRD-CT-005 | P1 |

## 10. Read-Only Access

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-READONLY-001 | The Brand Owner role must be able to retrieve the full trail for any batch at any time. | PRD-CT-010 | P1 |
| FRD-CHAIN-READONLY-002 | The Brand Owner role must have no write, correction, or approval capability anywhere in the system. | PRD-CT-010 | P0 |
| FRD-CHAIN-READONLY-003 | No write-affordance UI element may render for the Brand Owner role, regardless of backend enforcement. | PRD-CT-010 | P1 |
| FRD-CHAIN-READONLY-004 | Any write attempt made under a Brand Owner identity must be rejected at the chaincode level as a defense-in-depth measure. | PRD-CT-010 | P0 |
| FRD-CHAIN-READONLY-005 | Read-only access must include superseded/corrected records, not only current-state records. | PRD-CT-010 | P1 |

## 11. Remote Access

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-ACCESS-001 | The application must be reachable via a Cloudflare Tunnel while the host machine is running. | PRD-CT-011 | P2 |
| FRD-CHAIN-ACCESS-002 | Tunnel configuration must expose only frontend and backend API ports. | PRD-CT-011 | P0 |
| FRD-CHAIN-ACCESS-003 | Ledger, CouchDB, Fabric CA admin, and storage admin interfaces must be confirmed unreachable through the tunnel via explicit negative test. | PRD-CT-011 | P0 |

## 12. Reference Data Management

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-REFDATA-001 | System Admin may add new entries to the Ingredient, Supplier, Standards, and Fail Reason reference lists. | PRD-CT-017 | P0 |
| FRD-CHAIN-REFDATA-002 | System Admin may deprecate an existing reference-data entry; deprecation must never delete or overwrite the entry. | PRD-CT-017 | P0 |
| FRD-CHAIN-REFDATA-003 | Every reference-data addition or deprecation must be recorded with the acting identity and timestamp, with the same permanence guarantee as batch records. | PRD-CT-018 | P0 |
| FRD-CHAIN-REFDATA-004 | Deprecated reference-data entries must remain visible in reference-data history, not hidden. | PRD-CT-017 | P1 |
| FRD-CHAIN-REFDATA-005 | A batch record must retain the reference-data version in effect at its creation time, unaffected by later reference-data changes. | PRD-CT-019 | P0 |
| FRD-CHAIN-REFDATA-006 | Only the System Admin role may write to reference data; all other roles have read access only. | PRD-CT-016 | P0 |

## 13. System Admin Role

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-ADMIN-001 | System Admin must be a distinct role, issued its own Fabric identity, separate from the 5 operational roles. | PRD-CT-016 | P0 |
| FRD-CHAIN-ADMIN-002 | System Admin must have no access to submit, correct, or approve any batch-lifecycle record (see FRD-CHAIN-ROLE-006). | PRD-CT-016 | P0 |
| FRD-CHAIN-ADMIN-003 | System Admin's permitted actions are limited to Reference Data Management (Section 12) and Audit Log review (Section 14). | PRD-CT-016 | P0 |

## 14. Audit Log

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-AUDIT-001 | All logins, views, and failed access attempts must be recorded in a centralized System Audit Log, separate from the business-event ledger. | PRD-CT-020 | P0 |
| FRD-CHAIN-AUDIT-002 | The System Audit Log must be insert-only; no update or delete operation may exist for audit log entries at the database permission level. | PRD-CT-021 | P0 |
| FRD-CHAIN-AUDIT-003 | The System Audit Log must be accessible only to the System Admin role; no operational role may view it. | PRD-CT-022 | P0 |
| FRD-CHAIN-AUDIT-004 | Each audit log entry must capture identity, action, module/screen, and timestamp at minimum. | PRD-CT-020 | P1 |

## 15. Field-Level Access Control

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-RBAC-001 | API responses must omit any field a given role is not authorized to view, enforced server-side, regardless of what the frontend chooses to render. | PRD-CT-023 | P0 |
| FRD-CHAIN-RBAC-002 | A Role × Field × Access (Hidden/Read/Write) matrix must be defined and enforced for every data type exposed by the system. | PRD-CT-023 | P0 |
| FRD-CHAIN-RBAC-003 | Field-level access violations (a role attempting to read or write a restricted field) must be logged to the System Audit Log. | PRD-CT-020, PRD-CT-023 | P1 |

## 16. AI Trail Explanation

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-AI-001 | Any role may request a plain-language explanation of a specific batch's trail. | PRD-CT-012 | P1 |
| FRD-CHAIN-AI-002 | The explanation must be generated strictly from that batch's own recorded ledger data, with no external or general knowledge introduced. | PRD-CT-012 | P0 |
| FRD-CHAIN-AI-003 | Every AI-generated explanation must be visibly labeled as AI-generated and non-authoritative, on every surface where it appears. | PRD-CT-012 | P0 |
| FRD-CHAIN-AI-004 | The AI explanation feature must have no write access of any kind — read-only, informational only. | PRD-CT-012 | P0 |
| FRD-CHAIN-AI-005 | The system must not present an AI-generated explanation as, or allow it to be mistaken for, a compliance verdict. | PRD-CT-012 | P0 |

## 17. Concurrency and Conflict Handling

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-CONCURRENCY-001 | Simultaneous submission attempts against the same batch must be detected and resolved via the ledger's native read-write conflict detection — no custom application-level locking mechanism may be introduced. | PRD-CT-003 | P0 |
| FRD-CHAIN-CONCURRENCY-002 | When a submission is rejected due to a detected conflict, the system must return a distinguishable rejection reason (`reason: "concurrent_modification"`) rather than a generic error, and the affected screen must prompt the user to refresh before retrying. | PRD-CT-003 | P1 |
| FRD-CHAIN-CONCURRENCY-003 | A conflict-triggered rejection must never partially apply — the ledger state before the conflicting attempt must be unchanged, verifiable by re-reading the batch trail after the rejection. | PRD-CT-003 | P0 |
