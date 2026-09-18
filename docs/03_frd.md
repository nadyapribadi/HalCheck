# HALCHECK — Functional Requirements Document (FRD)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.2.0:** Added Section 2a (Batch Creation) with FRD-CHAIN-BATCH-001, resolving the destination/verdict sequencing gap. Added FRD-CHAIN-VERDICT-007 (Fail verdicts must reference the specific flagged record). Added FRD-CHAIN-LEDGER-005 (corrections supersede only the flagged record, not the whole ingredient set).
- **v0.3.0:** Made controlled-value and verdict authority chaincode-verifiable; defined fail-closed audit delivery and the canonical RBAC matrix reference.
- **v0.4.0:** Added FRD-CHAIN-UPLOAD-010, from ADR-CT-033: a compliance fact the verdict consumes must be captured on the record at submission, and a governed reference entry that cannot supply it must not silently produce one.
- **v0.5.0:** Added FRD-CHAIN-VERIFY-001–004, from ADR-CT-034: a reviewer must be able to check the recorded evidence without this application, its API, or an account.

## 1. Scope

Defines functional requirements for the Compliance Trail feature, covering batch creation, identity, role/access control, sequencing, ledger immutability, controlled vocabulary, standards anchoring, verdict/recognition handling, read-only access, remote access, reference data management, the System Admin role, audit logging, field-level access control, AI trail explanation, and concurrency handling.

## 2. Identity and Authentication

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-IDENTITY-001 | Each role must be issued a unique Fabric CA certificate before submitting any data. | PRD-CT-001 | P0 |
| FRD-CHAIN-IDENTITY-002 | Backend must verify JWT-authenticated identity matches the Fabric identity used for each chaincode call. | PRD-CT-001 | P0 |
| FRD-CHAIN-IDENTITY-003 | Client-supplied role strings must never be trusted for authorization decisions. | PRD-CT-002 | P0 |
| FRD-CHAIN-IDENTITY-004 | Identity mismatch must be rejected before reaching chaincode, not after. | PRD-CT-002 | P0 |

## 2a. Batch Creation (NEW)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-BATCH-001 | A batch's intended market must be captured at creation time by Ingredient QA and is immutable thereafter. The compliance engine's recognition-directionality check must use this value, not a value entered later at export. | PRD-CT-009 | P0 |

**Resolution note:** this closes a real sequencing gap — the recognition-directionality check depends on the destination market, but destination was previously only captured at Export, after the verdict was already recorded. Capturing it at batch creation instead means the engine always has the value it needs before computing the verdict.

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
| FRD-CHAIN-LEDGER-005 | A correction submission must reference the single flagged record it supersedes. Only that record is marked superseded — all other records in the batch remain untouched and are not resubmitted. | PRD-CT-006 | P0 |

**Resolution note:** this closes the correction-granularity gap — corrections previously implied resubmitting the whole ingredient set, contradicting the per-ingredient hashing already required by FRD-CHAIN-UPLOAD-002.

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
| FRD-CHAIN-UPLOAD-009 | `batch` chaincode must validate Ingredient Name and Source through the on-ledger `refdata.ResolveActiveReference` contract on every submission path. Backend validation is permitted only as UX pre-validation. A value not present in the current reference list must be rejected with `reason: "not_a_recognized_value"`, regardless of how the request was constructed. | PRD-CT-013 | P0 |
| FRD-CHAIN-UPLOAD-010 | The supplier's verification status must be captured on each ingredient record at submission (from the resolved supplier entry's own metadata), so the verdict engine evaluates the batch's own records rather than a second source that can drift from them. A supplier entry that carries no verification status must be rejected with `reason: "missing_reference_metadata"` on every submission path (`SubmitIngredient` and `CorrectIngredient` alike), writing nothing. | PRD-CT-013 | P0 |

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
| FRD-CHAIN-VERDICT-005 | The compliance engine's Pass/Fail output is binding. `batch` chaincode must verify a signed, versioned engine attestation bound to the batch, effective-input digest, intended market, engine/rules release, result, and Fail details before recording a verdict. The Compliance Officer has no override capability. | PRD-CT-005 | P0 |
| FRD-CHAIN-VERDICT-006 | Because the verdict is engine-determined and non-discretionary (per FRD-CHAIN-VERDICT-005), no second-party review/counter-signature is required on the verdict-recording action — the check in this step is the deterministic engine output itself, not a second human. | PRD-CT-005 | P1 |
| FRD-CHAIN-VERDICT-007 | A Fail verdict must record the specific ingredient (or production) record ID that triggered the failure, not just a textual reason. | PRD-CT-005, PRD-CT-006 | P0 |

## 10. Read-Only Access

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-READONLY-001 | The Brand Owner role must be able to retrieve the full trail for any batch at any time. | PRD-CT-010 | P1 |
| FRD-CHAIN-READONLY-002 | The Brand Owner role must have no write, correction, or approval capability anywhere in the system. | PRD-CT-010 | P0 |
| FRD-CHAIN-READONLY-003 | No write-affordance UI element may render for the Brand Owner role, regardless of backend enforcement. | PRD-CT-010 | P1 |
| FRD-CHAIN-READONLY-004 | Any write attempt made under a Brand Owner identity must be rejected at the chaincode level as a defense-in-depth measure. | PRD-CT-010 | P0 |
| FRD-CHAIN-READONLY-005 | Read-only access must include superseded/corrected records, not only current-state records. | PRD-CT-010 | P1 |

## 10a. Verifiability (NEW, ADR-CT-034)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-VERIFY-001 | A batch's recorded evidence must be checkable by a party with no account in this system, no access to its API, and no Fabric client: records, the digest they produce, and the signed verdict must travel in one portable artifact. | PRD-CT-020 | P1 |
| FRD-CHAIN-VERIFY-002 | The verdict attestation and its ECDSA signature must be retained on the immutable verdict record, and the verification key published by chaincode, so a signature can be re-verified after the fact rather than only at recording time. | PRD-CT-020 | P1 |
| FRD-CHAIN-VERIFY-003 | The batch digest must be reproducible from the records' own stored bytes — returned verbatim, never re-serialized — so a verifier can recompute it instead of trusting a field that asserts it. | PRD-CT-020 | P1 |
| FRD-CHAIN-VERIFY-004 | Attempting to alter a recorded fact must be shown to fail against the ledger itself: the refusal comes from the deployed chaincode, and a one-byte alteration of a record's stored bytes must be detectable from the recorded hash. No demonstration may be simulated. | PRD-CT-020 | P0 |

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
| FRD-CHAIN-AUDIT-001 | All logins, views, denied access attempts, and state-changing attempts must be recorded in a centralized System Audit Log before the protected response or ledger submission is issued; audit-store failure must deny the covered request with `reason: "audit_unavailable"`. | PRD-CT-020 | P0 |
| FRD-CHAIN-AUDIT-002 | The System Audit Log must be insert-only; no update or delete operation may exist for audit log entries at the database permission level. | PRD-CT-021 | P0 |
| FRD-CHAIN-AUDIT-003 | The System Audit Log must be accessible only to the System Admin role; no operational role may view it. | PRD-CT-022 | P0 |
| FRD-CHAIN-AUDIT-004 | Each audit log entry must capture event type, outcome, identity or privacy-safe subject hint, module/route, and timestamp at minimum; IP/device is captured where available. | PRD-CT-020 | P1 |

## 15. Field-Level Access Control

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CHAIN-RBAC-001 | API responses must omit any field a given role is not authorized to view, enforced server-side, regardless of what the frontend chooses to render. | PRD-CT-023 | P0 |
| FRD-CHAIN-RBAC-002 | The canonical Role × Field × Access matrix in TRD §23.4 must be enforced for every data type exposed by the system. | PRD-CT-023 | P0 |
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

---

## Core Screening App FRD

*The following section covers HALCHECK's other module — the Core Screening App, the engine Compliance Trail wraps. Module: Core Screening App. Status: Design in progress.*

### 18. Scope (Core Screening App)

Defines functional requirements for the five modules already implied by the existing `src/features/` scaffold — intake, profiles, reference, screening, report — plus the pure rules engine (`src/engine/`) that screening and report both depend on.

### 19. Screening Profile (`src/features/profiles`)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CORE-PROFILE-001 | A profile captures exactly one Intended Market: Indonesia (BPJPH) or Malaysia (JAKIM). Screening a product against both markets runs as two independent profiles/evaluations, never blended into one combined verdict. | PRD-CORE-001 | P0 |
| FRD-CORE-PROFILE-002 | Intended Market, once a profile's screening run has started, is not editable on that run — changing it starts a new profile. | PRD-CORE-001 | P1 |
| FRD-CORE-PROFILE-003 | Product type is selected from a controlled list in the active dataset release, not free text. | PRD-CORE-001 | P1 |

### 20. Intake (`src/features/intake`)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CORE-INTAKE-001 | Ingredient Name and Supplier/Source fields are selected from the active dataset release's Ingredient and Supplier reference lists — no free-text option, matching Compliance Trail's controlled-vocabulary principle (BRD Rule 6). | PRD-CORE-002 | P0 |
| FRD-CORE-INTAKE-002 | A value typed that doesn't match the reference list is rejected at entry with "Not a recognized ingredient/supplier," never silently accepted as free text. | PRD-CORE-002 | P0 |
| FRD-CORE-INTAKE-003 | Bulk ingredient entry (paste/import a list) is supported; each row is validated independently and reported per-row, not as a single blocking failure. | PRD-CORE-002 | P1 |
| FRD-CORE-INTAKE-004 | An ingredient's Halal Risk classification auto-populates from the matched reference entry; the user may override only with an explicit reason recorded alongside the override. | PRD-CORE-002 | P1 |

### 21. Reference Browser (`src/features/reference`)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CORE-REF-001 | User can view the active dataset release's full Standards list, Ingredient list (with risk classification), Supplier list (with verification status), and Recognition Agreement table, read-only. | PRD-CORE-007 | P1 |
| FRD-CORE-REF-002 | Reference content displays which dataset release version is active; no reference content is editable from this app — dataset releases are authored and frozen out-of-band, per `12_seed_data_specification.md`, Core Screening App Dataset Specification section. | PRD-CORE-006 | P0 |

### 22. Screening Engine (`src/engine`)

This section is the functional contract for `evaluate()` and `rationale()` — the two files already scaffolded with their intended purpose stated as one-line comments (`src/engine/evaluate.ts`, `src/engine/rationale.ts`, `src/engine/types.ts`).

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CORE-ENGINE-001 | `evaluate(target, rule, recognitions)` is a pure function: given the same `target` (an ingredient/sourcing record), `rule` (a single Standard Rule from the active release), and `recognitions` (the release's Recognition Agreement table), it returns the same `Finding` every time. No network call, no wall-clock read, no random value anywhere in its call path. | PRD-CORE-003 | P0 |
| FRD-CORE-ENGINE-002 | A screening run calls `evaluate()` once per applicable rule in the active dataset release against every ingredient/sourcing record in the profile, and collects the results into an ordered `Finding[]`. A rule not applicable to the profile's product type or Intended Market is recorded as `not_applicable`, not silently omitted. | PRD-CORE-003 | P0 |
| FRD-CORE-ENGINE-003 | Where a rule requires a certificate and the target's certificate was issued by a body other than the rule's own requiring body, `evaluate()` must resolve the pair against the Recognition Agreement table before returning a result — it must never assume recognition holds, and must never assume it fails, without an explicit table lookup. | PRD-CORE-005 | P0 |
| FRD-CORE-ENGINE-004 | If no Recognition Agreement entry exists for a given issuing/requiring body pair, the result is `fail`, reason `recognition_requirement_not_satisfied` — absence of an explicit agreement is never treated as implicit recognition. | PRD-CORE-005 | P0 |
| FRD-CORE-ENGINE-005 | A `Finding` with result `fail` must carry: the specific rule ID and citation, the specific ingredient/sourcing record ID that triggered it, a fail reason drawn from the same closed catalog Compliance Trail's `VERDICT_RECORD.fail_reason_snapshot` uses (see `12_seed_data_specification.md` §4), and — if the fail stems from a recognition check — the issuing body, requiring body, and as-of date. | PRD-CORE-004 | P0 |
| FRD-CORE-ENGINE-006 | `rationale()` builds the plain-language sentence shown alongside each Finding, generated deterministically from the Finding's own structured fields — never free-form or model-generated text. | PRD-CORE-004 | P0 |
| FRD-CORE-ENGINE-007 | A profile's overall status is `pass` only if every applicable rule's Finding is `pass`; any single `fail` makes the run's overall status `fail`, and the report lists all fail Findings, not just the first. | PRD-CORE-003 | P0 |
| FRD-CORE-ENGINE-008 | The engine records its own semantic version and the dataset release version it ran against as part of every screening run's output — this is the exact pair Compliance Trail's `VERDICT_RECORD.engine_version`/`rules_release` fields expect (TRD §23.2). | PRD-CORE-006 | P0 |

### 23. Report (`src/features/report`)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CORE-REPORT-001 | A report renders every Finding — pass, fail, and not-applicable — grouped by rule, not filtered to failures only. | PRD-CORE-004 | P0 |
| FRD-CORE-REPORT-002 | Every report, on-screen and exported, carries the fixed disclaimer: "This is a screening opinion, not a certification, and not a religious ruling." | PRD-CORE-008 | P0 |
| FRD-CORE-REPORT-003 | Every report states the dataset release version and engine version used to produce it. | PRD-CORE-006 | P0 |
| FRD-CORE-REPORT-004 | Export format is a static, shareable artifact (e.g., print-to-PDF via browser, or a plain HTML/JSON export) — no server-side rendering, consistent with the no-backend constraint. | PRD-CORE-009 | P1 |

### 24. Storage (`src/storage`)

| ID | Requirement | Traces to | Priority |
|---|---|---|---|
| FRD-CORE-STORAGE-001 | A screening run (profile, ingredient records, Findings, dataset/engine version) persists to browser local storage only. | PRD-CORE-009 | P0 |
| FRD-CORE-STORAGE-002 | Local storage schema is versioned; a stored run from an older schema version is either migrated or explicitly flagged unreadable, never silently misread. | PRD-CORE-009 | P2 |
| FRD-CORE-STORAGE-003 | Nothing entered during intake is transmitted off-device at any point. | PRD-CORE-009 | P0 |

### 25. What This Section Deliberately Excludes

- No BRD-equivalent: business rationale is covered in this document's Charter section (`00_project_charter.md`) and PRD section (`01_prd.md`), proportionate to a backend-free local tool with no monetization, staffing, or infrastructure decisions of its own.
- No dedicated Test Strategy or Security Threat Model section: a pure client-side function with no network surface and no credentials carries a materially smaller risk profile than Compliance Trail's ledger/identity/audit stack. Engine testability requirements are captured inline (FRD-CORE-ENGINE-001) rather than in a separate document.
