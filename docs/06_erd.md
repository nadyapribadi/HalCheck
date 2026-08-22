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
        string superseded_by FK "nullable, self-referencing"
        json metadata "type-specific, e.g. default_halal_risk for ingredient type"
        datetime timestamp
        string added_by FK
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
