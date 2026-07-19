# HALCHECK — Entity-Relationship Diagram (ERD)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

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
    EXPORT_RECORD }o--|| VERDICT_RECORD : "requires Pass"
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
        string source_snapshot "denormalized, not live FK"
        boolean halal_risk_flag
        string override_reason "nullable, required only if flag overridden"
        datetime timestamp
        string submitted_by FK
    }

    PRODUCTION_RECORD {
        string record_id PK
        string batch_id FK
        datetime batch_date "system-populated, not editable"
        boolean line_segregation_confirmed
        string standard_snapshot "denormalized, e.g. CPKB / BPOM Reg 33/2021"
        datetime timestamp
        string submitted_by FK
    }

    VERDICT_RECORD {
        string record_id PK
        string batch_id FK
        string status "enum: pass | fail"
        string regulation_snapshot "denormalized, e.g. PP 42/2024"
        string fail_reason_snapshot "nullable, from Fail Reason catalog, denormalized"
        json recognition_check "nullable: issuing_body, requiring_body, recognized, as_of_date"
        datetime timestamp
        string submitted_by FK
    }

    EXPORT_RECORD {
        string record_id PK
        string batch_id FK
        string destination_market
        datetime timestamp
        string submitted_by FK
    }

    REFERENCE_ENTRY {
        string entry_id PK
        string type "enum: ingredient | supplier | standard | fail_reason"
        string value
        string status "enum: active | deprecated"
        string superseded_by FK "nullable, self-referencing"
        json metadata "type-specific, e.g. default_halal_risk for ingredient type"
        datetime timestamp
        string added_by FK
    }

    AUDIT_LOG_ENTRY {
        string entry_id PK
        string action "enum, matches Event Model list"
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
Deliberately minimal — the batch itself carries almost no data; everything meaningful is in its child records. `batch_id` is the business key (not an internal surrogate), matching the human-readable `SL-YYYY-NNN` format established in the Seed Data Specification. Status is never stored here — it's derived from the latest child record present, computed by the backend and cached in PostgreSQL.

### `IDENTITY`
Represents any of the 6 roles' real Fabric identities. Not ledger data itself — this is the identity layer the ledger's `submitted_by` fields reference. `role` is a fixed enum of exactly 6 values; no seventh value should ever be possible given the closed role model this project holds throughout.

### `UPLOAD_SESSION`
Exists purely to group ingredient records visually — no independent business meaning beyond that grouping.

### `INGREDIENT_RECORD`
`ingredient_name_snapshot` and `source_snapshot` are the literal resolved text from the Reference Lists at submission time — not foreign keys, per the resolved snapshot decision. `override_reason` is nullable, populated only when the Halal Risk Flag is manually overridden from the reference list's default.

### `PRODUCTION_RECORD`
`batch_date` is explicitly system-populated — this field closes the backdating risk named as a real governance weakness in the underlying research this project is based on.

### `VERDICT_RECORD`
`recognition_check` is stored as a JSON blob rather than a separate table — a small, fixed-shape structure that only ever belongs to one verdict, doesn't need independent querying. `status` is a strict two-value enum, reflecting the binding, non-discretionary verdict rule — no "pending" or "under review" state, since the engine's determination is immediate and final.

### `EXPORT_RECORD`
The simplest record type — its only real constraint (must reference a Pass verdict) is enforced by chaincode sequencing logic, not anything structural in this table.

### `REFERENCE_ENTRY`
The one entity with a genuine self-referencing relationship (`superseded_by`) — makes the supersede-never-delete pattern queryable: following the chain from any deprecated entry to its replacement, or querying only `status = active` for current-state views.

### `AUDIT_LOG_ENTRY`
`action` is a closed enum, matching the Event Model list in the Architecture document exactly, not free text. Lives in a separate PostgreSQL schema with INSERT-only grants — the ERD shows its logical shape; its actual database-level protection is a permissions concern, not a structural one this diagram expresses.

### `FILE_OBJECT`
Not a full entity in the traditional sense — more a lookup convention than a table with independent lifecycle. `object_key`'s format is what makes `related_record_id` resolvable back to a specific ledger record without a separate mapping table.

## 4. Cardinality Notes

- One `BATCH` has zero-or-one of each child record type at any given point in its lifecycle, but potentially many over time through corrections (a batch can have multiple `VERDICT_RECORD` rows if a Fail was corrected and re-verdicted) — the `||--o{` notation reflects the cumulative relationship across the batch's full history, not a single-snapshot view.
- `IDENTITY` to every record type is one-to-many — one identity submits many records over time.
- `REFERENCE_ENTRY` to itself is the only reflexive relationship in the model, capturing version history without a separate history table.

## 5. What's Deliberately Not Modeled

- No `USER_SESSION` entity — session state lives entirely in the JWT itself, nothing session-related is persisted server-side.
- No `NOTIFICATION` entity — the "N batches awaiting your action" indicator is computed on read from existing Batch List filtering logic, not a stored notification record.
- No separate `HASH_LOG` or blockchain-internal structures — those are Fabric's own internal ledger mechanics; the application only interacts with them through the chaincode function interface.
