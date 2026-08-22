# HALCHECK — Entity-Relationship Diagram (ERD)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.3.0-planning

## Changelog

- **v0.2.0:** Added `BATCH.intended_market` (captures destination at creation, resolves recognition-directionality sequencing). Added `VERDICT_RECORD.flagged_record_id` (points to the specific record that caused a Fail). Added `INGREDIENT_RECORD.supersedes_record_id` (correction now supersedes one flagged record, not the whole ingredient set).
- **v0.3.0:** Added verifiable engine-attestation fields, versioned reference snapshots, audit outcome fields, and production-record correction linkage.

## 1. Purpose

Formal, complete entity definitions for every data structure in the system — ledger-authoritative and cache/off-chain alike — so Build has an actual schema to implement against rather than inferring one from prose. Referenced by `04_trd.md` Section 4 as the authoritative version.

## 2. Full Diagram

```mermaid
erDiagram
    BATCH ||--o{ INGREDIENT_RECORD : has
    BATCH ||--o{ PRODUCTION_RECORD : has
    BATCH ||--o{ VERDICT_RECORD : has
    BATCH ||--o{ EXPORT_RECORD : has
    UPLOAD_SESSION ||--o{ INGREDIENT_RECORD : groups
    PRODUCTION_RECORD }o--|| INGREDIENT_RECORD : "requires prior"
    VERDICT_RECORD }o--|| PRODUCTION_RECORD : "requires prior"
    VERDICT_RECORD }o--o| INGREDIENT_RECORD : "flags, if Fail"
    EXPORT_RECORD }o--|| VERDICT_RECORD : "requires Pass"
    INGREDIENT_RECORD }o--o| INGREDIENT_RECORD : "supersedes, if correction"
    PRODUCTION_RECORD }o--o| PRODUCTION_RECORD : "supersedes, if correction"
    REFERENCE_ENTRY ||--o{ REFERENCE_ENTRY : supersedes
    IDENTITY ||--o{ INGREDIENT_RECORD : submits
    IDENTITY ||--o{ PRODUCTION_RECORD : submits
    IDENTITY ||--o{ VERDICT_RECORD : submits
    IDENTITY ||--o{ EXPORT_RECORD : submits
    IDENTITY ||--o{ REFERENCE_ENTRY : adds
    IDENTITY ||--o{ AUDIT_LOG_ENTRY : generates

    BATCH {
        string batch_id PK "format SL-YYYY-NNN"
        datetime created_at "system-generated, immutable"
        string intended_market "NEW: captured at creation by Ingredient QA, immutable thereafter"
    }

    IDENTITY {
        string identity_id PK
        string role "enum: ingredient_qa | production_qa | compliance_officer | export_officer | brand_owner | system_admin"
        string persona_name
        string fabric_cert_fingerprint
    }

    UPLOAD_SESSION {
        string session_id PK
        string batch_id FK
        datetime timestamp
        string submitted_by FK
    }

    INGREDIENT_RECORD {
        string record_id PK
        string batch_id FK
        string upload_session_id FK
        string ingredient_name_snapshot "denormalized, not live FK"
        string ingredient_reference_entry_id
        string ingredient_reference_version
        string source_snapshot "denormalized, not live FK"
        string supplier_reference_entry_id
        string supplier_reference_version
        boolean halal_risk_flag
        string override_reason "nullable, required only if flag overridden"
        string supersedes_record_id FK "NEW: nullable, set only when this record corrects a prior flagged record"
        datetime timestamp
        string submitted_by FK
    }

    PRODUCTION_RECORD {
        string record_id PK
        string batch_id FK
        datetime batch_date "system-populated, not editable"
        boolean line_segregation_confirmed
        string standard_snapshot "denormalized, e.g. CPKB / BPOM Reg 33/2021"
        string standard_reference_entry_id
        string standard_reference_version
        string supersedes_record_id FK "nullable, set only when correcting a prior flagged production record"
        datetime timestamp
        string submitted_by FK
    }

    VERDICT_RECORD {
        string record_id PK
        string batch_id FK
        string status "enum: pass | fail"
        string regulation_snapshot "denormalized, e.g. PP 42/2024"
        string regulation_reference_entry_id
        string regulation_reference_version
        string fail_reason_snapshot "nullable, from Fail Reason catalog, denormalized"
        string fail_reason_reference_entry_id
        string fail_reason_reference_version
        string flagged_record_id FK "NEW: nullable, points to the specific INGREDIENT_RECORD (or PRODUCTION_RECORD) that caused a Fail"
        string engine_attestation_digest
        string engine_version
        string rules_release
        json recognition_check "nullable: issuing_body, requiring_body, recognized, as_of_date - evaluated using BATCH.intended_market"
        datetime timestamp
        string submitted_by FK
    }

    EXPORT_RECORD {
        string record_id PK
        string batch_id FK
        string destination_market "denormalized copy of BATCH.intended_market at export time, display-only"
        datetime timestamp
        string submitted_by FK
    }

    REFERENCE_ENTRY {
        string entry_id PK
        string type "enum: ingredient | supplier | standard | fail_reason"
        string value
        string version
        string status "enum: active | deprecated"
        string superseded_by FK "nullable, self-referencing -- no chaincode write path defined yet (see 03_frd.md FRD-CHAIN-REFDATA-002 note); stays empty until a follow-up requirement resolves it"
        json metadata "type-specific, e.g. default_halal_risk for ingredient type"
        datetime timestamp "set at creation, never changes"
        string added_by FK
        string deprecated_by FK "nullable, set only when status = deprecated -- added during P2 chaincode implementation to satisfy FRD-CHAIN-REFDATA-003's requirement that deprecation itself be recorded with its own acting identity and timestamp, which this entity's original single added_by/timestamp pair couldn't express"
        datetime deprecated_at "nullable, set only when status = deprecated"
    }

    AUDIT_LOG_ENTRY {
        string entry_id PK
        string event_type "enum, matches Event Model list"
        string outcome "enum: allowed | denied | attempted"
        string module
        datetime timestamp
        string actor FK
        string ip_address "nullable"
    }

    FILE_OBJECT {
        string object_key PK "format batchId/recordType/hash.ext"
        string sha256_hash
        string related_record_id FK
    }
```

## 3. Entity Dictionary

### `BATCH`
Deliberately minimal, with one addition: `intended_market` is now captured at creation time (not at export), because the compliance engine's recognition-directionality check depends on which jurisdiction the batch is headed to — that value must exist before the verdict is computed, not after. `batch_id` is the business key (not an internal surrogate), matching the human-readable `SL-YYYY-NNN` format. Status is never stored here — it's derived from the latest child record present, computed by the backend and cached in PostgreSQL.

### `IDENTITY`
Represents any of the 6 roles' real Fabric identities. `role` is a fixed enum of exactly 6 values; no seventh value should ever be possible given the closed role model this project holds throughout.

### `UPLOAD_SESSION`
Exists purely to group ingredient records visually — no independent business meaning beyond that grouping.

### `INGREDIENT_RECORD`
`ingredient_name_snapshot` and `source_snapshot` are the literal resolved text plus version from the Reference Lists at submission time — not live foreign keys. `override_reason` is nullable, populated only when the Halal Risk Flag is manually overridden. `supersedes_record_id` is set only for a correction of the specific flagged ingredient record. All other ingredient records are untouched and never resubmitted.

### `PRODUCTION_RECORD`
`batch_date` is explicitly system-populated. `supersedes_record_id` follows the same append-only correction rule as ingredient records when a Fail flags production.

### `VERDICT_RECORD`
`recognition_check` is stored as a JSON blob evaluated using `BATCH.intended_market`. When `status = fail`, `flagged_record_id` points to the specific ingredient or production record that caused the failure. `engine_attestation_digest`, `engine_version`, and `rules_release` make the binding engine result verifiable and historically attributable. `status` remains a strict two-value enum.

### `EXPORT_RECORD`
`destination_market` is now a denormalized copy of `BATCH.intended_market`, captured for the export record's own historical snapshot — it is no longer a value chosen at export time; the Export Request Form displays it read-only.

### `REFERENCE_ENTRY`
The one entity with a genuine self-referencing relationship (`superseded_by`) — makes the supersede-never-delete pattern queryable.

### `AUDIT_LOG_ENTRY`
`event_type` and `outcome` are closed database-enforced enums, matching the Event Model in the Architecture document; neither is free text.

### `FILE_OBJECT`
Not a full entity in the traditional sense — more a lookup convention than a table with independent lifecycle.

## 4. Cardinality Notes

- One `BATCH` has zero-or-one of each child record type at any given point in its lifecycle, but potentially many over time through corrections — the `||--o{` notation reflects the cumulative relationship across the batch's full history.
- `VERDICT_RECORD` to `INGREDIENT_RECORD` (via `flagged_record_id`) is optional (zero-or-one) — only populated for Fail verdicts.
- `INGREDIENT_RECORD` and `PRODUCTION_RECORD` each self-reference through `supersedes_record_id` only for correction submissions. Superseded status is derived from the linked successor; prior ledger records are never updated.
- `IDENTITY` to every record type is one-to-many — one identity submits many records over time.
- `REFERENCE_ENTRY` to itself is the only other reflexive relationship in the model, capturing version history without a separate history table.

## 5. What's Deliberately Not Modeled

- No `USER_SESSION` entity — session state lives entirely in the JWT itself.
- No `NOTIFICATION` entity — the "N batches awaiting your action" indicator is computed on read from existing Batch List filtering logic.
- No separate `HASH_LOG` or blockchain-internal structures — those are Fabric's own internal ledger mechanics.
- No correction record type beyond ingredients and production is modeled; a Fail must identify one of those concrete upstream record types.

---

## Core Screening App Data Model

*The following section covers HALCHECK's other module — the Core Screening App, the engine Compliance Trail wraps. Module: Core Screening App. Status: Design in progress.*

### 6. Purpose

Defines every entity `src/engine/types.ts` needs, and the exact shape of the engine's output — deliberately matched field-for-field to the `VERDICT_RECORD` entity above, so its assumption of "the existing compliance engine" has a concrete contract behind it.

### 7. Diagram

```mermaid
erDiagram
    DATASET_RELEASE ||--o{ STANDARD_RULE : contains
    DATASET_RELEASE ||--o{ INGREDIENT_ENTRY : contains
    DATASET_RELEASE ||--o{ SUPPLIER_ENTRY : contains
    DATASET_RELEASE ||--o{ RECOGNITION_AGREEMENT : contains
    SCREENING_PROFILE ||--o{ INGREDIENT_RECORD : has
    SCREENING_PROFILE ||--|| SCREENING_RUN : produces
    SCREENING_RUN ||--o{ FINDING : contains
    FINDING }o--|| STANDARD_RULE : evaluates
    FINDING }o--o| INGREDIENT_RECORD : flags
    FINDING }o--o| RECOGNITION_AGREEMENT : "resolved via, if applicable"
    INGREDIENT_RECORD }o--|| INGREDIENT_ENTRY : "resolved from"
    INGREDIENT_RECORD }o--|| SUPPLIER_ENTRY : "resolved from"

    DATASET_RELEASE {
        string release_id PK "e.g. 2026.07"
        datetime frozen_at
        string status "enum: draft | verified | released"
    }

    STANDARD_RULE {
        string rule_id PK
        string standard "enum: BPJPH | JAKIM | CPKB"
        string citation "fictional regulation reference"
        string applies_to_market "enum: indonesia | malaysia"
        string requirement_type "enum: ingredient_source | certificate | line_segregation"
        json condition "structured predicate the engine evaluates"
    }

    INGREDIENT_ENTRY {
        string entry_id PK
        string name
        boolean default_halal_risk
        string risk_note "nullable, e.g. source-ambiguity explanation"
    }

    SUPPLIER_ENTRY {
        string entry_id PK
        string name
        string verification_status "enum: verified | unverified"
    }

    RECOGNITION_AGREEMENT {
        string agreement_id PK
        string issuing_body "enum: BPJPH | JAKIM"
        string requiring_body "enum: BPJPH | JAKIM"
        boolean recognized
        date as_of_date
        string note
    }

    SCREENING_PROFILE {
        string profile_id PK
        string intended_market "enum: indonesia | malaysia"
        string product_type
        datetime created_at
    }

    INGREDIENT_RECORD {
        string record_id PK
        string profile_id FK
        string ingredient_entry_id FK
        string supplier_entry_id FK
        boolean halal_risk_flag
        string override_reason "nullable"
        string certificate_issuing_body "nullable, enum: BPJPH | JAKIM"
    }

    SCREENING_RUN {
        string run_id PK
        string profile_id FK
        string dataset_release_id FK
        string engine_version
        string overall_status "enum: pass | fail"
        datetime run_at
    }

    FINDING {
        string finding_id PK
        string run_id FK
        string rule_id FK
        string result "enum: pass | fail | not_applicable"
        string flagged_record_id FK "nullable, set only on fail"
        string fail_reason "nullable, from the shared Fail Reason catalog"
        string recognition_agreement_id FK "nullable, set only when a recognition check applied"
        string rationale_text "deterministically generated, not free text"
    }
```

### 8. Entity Dictionary

**`DATASET_RELEASE`** — A frozen, versioned snapshot of all reference content — mirrors `dataset/releases/` on disk. `status` tracks its position in the dataset pipeline (briefs → drafts → verified → releases, see `12_seed_data_specification.md`, Core Screening App Dataset Specification section, §1); only `released` content is ever evaluated against by a real screening run.

**`STANDARD_RULE`** — One evaluable unit. `condition` is a structured predicate (not free text or code) the engine interprets — e.g. "ingredient's `default_halal_risk` is true AND matched supplier's `verification_status` is not `verified`" → fail. Keeping conditions structured is what makes `evaluate()` a pure, inspectable function rather than an opaque black box.

**`RECOGNITION_AGREEMENT`** — The entity that makes recognition-directionality concrete and queryable rather than implicit in code. Deliberately not assumed symmetric: `BPJPH → JAKIM` and `JAKIM → BPJPH` are two separate rows, and only one may say `recognized: true` — see `12_seed_data_specification.md`, Core Screening App Dataset Specification section, §5 for the actual synthetic content.

**`SCREENING_PROFILE` / `INGREDIENT_RECORD`** — Local, ephemeral, browser-only — the equivalent of the `BATCH`/`INGREDIENT_RECORD` pair above, but without ledger backing, since this app has no accountability claim of its own (Compliance Trail adds that layer separately, on top of this engine's output).

**`SCREENING_RUN` / `FINDING`** — `SCREENING_RUN.overall_status` and `FINDING[]` together are exactly the payload Compliance Trail's backend turns into a signed engine attestation (TRD §23.2) before `batch.RecordVerdict` verifies it. `FINDING.flagged_record_id`, `fail_reason`, and `recognition_agreement_id` map directly onto `VERDICT_RECORD.flagged_record_id`, `fail_reason_snapshot`, and `recognition_check` respectively (see §10 below).

### 9. Cardinality Notes

- One `SCREENING_PROFILE` produces exactly one `SCREENING_RUN` at a time; a changed profile after a run exists is a new profile (FRD-CORE-PROFILE-002), not a mutation.
- `FINDING` to `RECOGNITION_AGREEMENT` is optional — populated only when `STANDARD_RULE.requirement_type = certificate` and the target's certificate issuing body differs from the rule's own standard body.
- `FINDING` to `INGREDIENT_RECORD` (via `flagged_record_id`) is optional — populated only on `fail`.

### 10. Output Contract for Compliance Trail

| Core Screening App field | Compliance Trail `VERDICT_RECORD` field |
|---|---|
| `SCREENING_RUN.overall_status` | `status` |
| `STANDARD_RULE.citation` (of the governing rule) | `regulation_snapshot` |
| `SCREENING_RUN.dataset_release_id` | `rules_release` |
| `SCREENING_RUN.engine_version` | `engine_version` |
| `FINDING.fail_reason` (first fail, if any) | `fail_reason_snapshot` |
| `FINDING.flagged_record_id` | `flagged_record_id` |
| `RECOGNITION_AGREEMENT` fields on the resolving Finding | `recognition_check` (`issuing_body`, `requiring_body`, `recognized`, `as_of_date`) |

### 11. What's Deliberately Not Modeled

- No user/session entity — this app has no login (matches the HALCHECK README's existing runtime principle).
- No cross-run history entity — each run is independent; comparing runs is a report-layer concern, not a data-model one, in v1.
- No live foreign key from `INGREDIENT_RECORD` to `INGREDIENT_ENTRY` across dataset releases — a record always resolves against the release active at intake time, matching the snapshot-not-live-reference principle above (TRD §5).
