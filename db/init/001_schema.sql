-- HALCHECK Compliance Trail -- minimal off-chain schema (P4/P5).
-- Runs automatically on first Postgres container start via
-- docker-entrypoint-initdb.d. Not authoritative for anything
-- accountability-relevant -- the ledger is (docs/04_trd.md §9) -- except
-- the audit log, which is authoritative for system-level events
-- specifically (FRD-CHAIN-AUDIT-001/002).

-- users: login + the mapping from a login identity to the Fabric wallet
-- identity the backend acts as for that user's chaincode calls
-- (FRD-CHAIN-IDENTITY-002: backend must verify JWT identity matches the
-- Fabric identity used per call). One row per demo persona, one Fabric
-- identity per role (docs/14_developer_setup.md §1.2).
CREATE TABLE users (
    id               BIGSERIAL PRIMARY KEY,
    username         TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    role             TEXT NOT NULL CHECK (role IN (
                         'ingredient_qa', 'production_qa', 'compliance_officer',
                         'export_officer', 'brand_owner', 'system_admin'
                     )),
    persona_name     TEXT NOT NULL,
    fabric_identity   TEXT NOT NULL, -- wallet label, e.g. "ingredient-qa"
    -- cid.GetID()'s exact base64 output for this identity, as it appears
    -- verbatim in every submitted_by/added_by field chaincode ever writes
    -- for this user. Captured live (backend/scripts/capture-identity-cids.ts),
    -- never derived/guessed -- the RBAC serializer uses this to resolve a
    -- raw ledger identity string back to a role/persona for display,
    -- without ever returning the raw string itself (TRD §23.4: cert
    -- fingerprints are H for every role, submitter role/persona is R).
    -- NULL for brand_owner, which never submits anything and so never
    -- appears in a submitted_by field to resolve.
    fabric_cid       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- audit_log: insert-only at the grant level (FRD-CHAIN-AUDIT-002), not
-- just application discipline -- see the halcheck_app role grants below,
-- which physically omit UPDATE/DELETE. event_type and outcome are
-- database-enforced enums (docs/04_trd.md §13).
CREATE TYPE audit_event_type AS ENUM (
    'login', 'view', 'denied', 'batch_create', 'ingredient_submit',
    'ingredient_correct', 'production_confirm', 'production_correct',
    'verdict_record', 'export_request', 'reference_data_add',
    'reference_data_deprecate', 'audit_log_view', 'ai_explanation_request',
    -- ADR-CT-034: the Integrity Sandbox used to return canned rejections and
    -- leave no trace at all. Its attempts are now real ledger calls, and a
    -- deliberate attempt to break the record is exactly the kind of event an
    -- operator should be able to find afterwards.
    'sandbox_attempt'
);

CREATE TYPE audit_outcome AS ENUM ('allowed', 'denied', 'attempted');

CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    event_type   audit_event_type NOT NULL,
    outcome      audit_outcome NOT NULL,
    actor        TEXT NOT NULL, -- fabric_identity or a privacy-safe subject hint pre-login
    module       TEXT NOT NULL, -- route/screen this event occurred on
    ip_address   TEXT,
    "timestamp"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- idempotency_keys: TRD §8's "submission endpoints accept an optional
-- client-generated idempotency key; a retried request with the same key
-- returns the original result rather than creating a duplicate ledger
-- entry." Scoped per user, not globally, so one user's key can never replay
-- another's cached response even in the (astronomically unlikely) event of
-- a collision. Purely an operational cache, not accountability-relevant --
-- unlike audit_log, no insert-only restriction applies here.
CREATE TABLE idempotency_keys (
    user_id          BIGINT NOT NULL REFERENCES users (id),
    idempotency_key  TEXT NOT NULL,
    route            TEXT NOT NULL,
    response_status  INTEGER NOT NULL,
    -- TEXT, not JSONB: a stored submission response carries its batch's
    -- reference-entry snapshot keys, and those keys use \u0000 as the
    -- separator between type, value and version (chaincode/refdata
    -- referenceEntryKey). Postgres' JSON parser rejects \u0000 outright
    -- ("unsupported Unicode escape sequence", SQLSTATE 22P05), so a JSONB
    -- column here made every idempotent submission that returned an
    -- ingredient/production/verdict/export record fail. This column is an
    -- opaque cached payload -- never queried by field -- so JSONB bought
    -- nothing and cost correctness. Round-tripped through JSON.parse on read.
    response_body    TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX idx_audit_log_timestamp ON audit_log ("timestamp");
CREATE INDEX idx_users_username ON users (username);

-- The halcheck_app role itself (with its real, non-committed password) is
-- created by 002_app_role.sh, which runs immediately after this file and
-- injects HALCHECK_APP_DB_PASSWORD from the environment -- never hardcoded
-- here, per this project's own secret-handling discipline (docs/15
-- §8: "no default credential survives... rotate before any tunnel
-- activation").
