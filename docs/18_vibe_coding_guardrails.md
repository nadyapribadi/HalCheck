# HALCHECK — Vibe-Coding Guardrails

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Purpose and Philosophy

AI-assisted development is well-suited to this project's frontend, API scaffolding, and test-writing. It is poorly suited, unsupervised, to anything where a plausible-looking but subtly wrong answer is indistinguishable from a correct one until exploited. This document exists because this project's entire value proposition — provable accountability — is destroyed by exactly one category of mistake: a rule that looks enforced but isn't. Every rule below exists to catch that category specifically.

**Governing principle:** if a piece of generated code cannot be explained, line by line, by the person accepting it, it does not get accepted into the chaincode, identity, or authorization layers — no exception for "it passed the test," because a passing happy-path test proves nothing about a missing rejection.

## 2. Risk Tiering

| Tier | Layers | Rule |
|---|---|---|
| Critical | Chaincode (batch and refdata), Fabric CA/identity config, Audit Log DB-grant configuration | Every function/config requires human line-by-line understanding before acceptance, regardless of test results |
| Elevated | Backend API auth/identity matching, Docker/secrets, public tunnel config | Requires the specific checklist for that layer before merge |
| Standard | Frontend, general backend CRUD, database queries | Normal code review sufficient; standard hygiene rules still apply |

## 3. Chaincode Rules (Critical Tier)

1. Identity checks must read real Fabric certificate attributes (`cid.GetAttributeValue`, or equivalent) — never a role string passed in the transaction payload.
2. Every state-changing function requires two tests minimum: the allowed path succeeds, and the disallowed path is explicitly attempted and asserted to fail.
3. No function may call another function's write logic indirectly in a way that bypasses that function's own checks — each entry point re-validates independently.
4. No update or delete operation exists for any submitted record type, ever — if generated code includes an `UpdateX` or `DeleteX` function for ledger records, that is a defect, not a feature.
5. Chaincode must never call out to external services (no HTTP calls, no file I/O beyond the ledger).

## 3a. Reference-Data Chaincode Rules (Critical Tier)

1. No update or delete function may exist for reference-data entries, ever — same standard as batch records.
2. Identity checks in `refdata` chaincode must independently verify System Admin identity via certificate attributes — never assume a caller is authorized just because a request reached this chaincode module at all.
3. Every add/deprecate function requires a negative test: attempt the action as a non-System-Admin identity, confirm rejection (T-015).
4. Snapshot-vs-live-reference discipline (per `04_trd.md` Section 5) must be respected in any code touching batch records that reference standards/ingredients — generated code must never introduce a live foreign-key lookup against `REFERENCE_ENTRY` where a denormalized snapshot was the specified design.

## 4. Identity / Fabric CA Rules (Critical Tier)

1. `crypto-config.yaml` and `configtx.yaml` — read every line before use. Confirm which organizations and roles are granted read vs. write vs. admin on each channel.
2. Default Fabric CA admin credentials must never persist past initial local setup.
3. Certificate attributes used for role identification must be set at enrollment time by a trusted process, never derived from user-editable fields.

## 5. Backend API Rules (Elevated Tier)

1. Every endpoint that forwards to chaincode must verify JWT identity matches the Fabric identity used for that specific call — checked in code, not assumed.
2. No endpoint may implement a business rule that isn't also enforced in chaincode.
3. Input validation on every endpoint — reject malformed requests before they reach the SDK layer.
4. CORS explicitly scoped to the deployed frontend origin (and tunnel URL, when active) — never `*`, even temporarily.

## 6. Database and Storage Rules (Standard/Elevated Tier)

1. Parameterized queries or an ORM only — no string-concatenated SQL, ever.
2. Every database and storage service's default credential must be rotated before any Docker Compose stack is run against a configuration that will later be tunnel-exposed.
3. File storage buckets default to private; any generated configuration setting public-read access must be treated as a defect requiring explicit justification.
4. File hash verification happens on retrieval, not only at upload.

## 7. Docker / Secrets Rules (Elevated Tier)

1. `.env` is gitignored from the first commit.
2. Only `.env.example` with obviously-fake placeholder values is committed.
3. Run a secret scan against both history and working tree before any push to a remote, and again before any tunnel activation.
4. No secret value ever appears in an error message returned to the client.

## 8. Public Tunnel Rules (Critical Tier)

1. Tunnel ingress configuration must use an explicit allow-list (frontend + backend API ports only) with a catch-all deny rule.
2. Before every single activation, run the negative-exposure test: attempt to reach the ledger port, CouchDB, Fabric CA admin endpoint, and storage admin console from outside the tunnel, and confirm all fail.
3. Tunnel runs only during active demo use — treat "I'll just leave it running" as a defect in operational discipline.

## 9. Structural / Scalability Guardrails

1. Keep chaincode pure — business rules only, no logging frameworks, no formatting logic.
2. Keep the backend stateless — no server-side session storage; JWT carries everything needed per-request.
3. Don't let generated code collapse structure into one file — split along the boundaries defined in `04_trd.md` Section 3's directory structure.
4. No hardcoded values that should be config — batch limits, timeout values, thresholds belong in the Configuration Reference.
5. API responses should not leak Fabric-specific shapes directly to the frontend — the backend must translate, not forward raw SDK response objects.
6. Chaincode upgrades follow Fabric's formal lifecycle (approve, then commit) — never ad hoc redeployment.

## 10. Audit Log Database-Grant Rules (Critical Tier)

1. The application's database role must have `INSERT` privilege only on the audit log table/schema — never `UPDATE` or `DELETE`, enforced at the PostgreSQL grant level. Verify this directly after any migration or schema change.
2. If a migration tool is used, generated migrations must be manually reviewed for this specific detail — ORM tooling commonly grants full CRUD by default.
3. The `action` field's enum constraint must be enforced at the database level (a `CHECK` constraint or native enum type), not only validated in application code.

## 11. Acceptance Checklist

Run before accepting any AI-generated code in Critical or Elevated tiers:

- [ ] Can I explain what this code does, line by line, without the AI's explanation?
- [ ] Does this duplicate a rule that should live in chaincode instead?
- [ ] Is there a negative test, and does it actually fail the way I expect (run it, don't assume)?
- [ ] Are there any credentials, even placeholder-looking ones, that need rotating before this goes further?
- [ ] Does this hardcode anything that should be configuration?
- [ ] If this is chaincode: does it call anything external? (Should always be no.)
- [ ] If this touches the tunnel: did I run the negative-exposure test after this change, not just before?
- [ ] If this touches reference-data chaincode: does it independently verify System Admin identity, not inherit trust from elsewhere?
- [ ] If this touches the audit log schema/migrations: did I verify the database grant is still INSERT-only after this change?

## 12. Cross-References

This document is referenced by, not duplicated in:
- `04_trd.md` Sections 5-6 (chaincode/backend requirements) — Section 3a and 10 above specifically govern reference-data chaincode and audit log schema changes.
- `08_security_threat_model.md` Section 5 — T-016/T-017 governed by Section 3a; T-018 governed by Section 10.
- `07_test_strategy.md` Section 3 — reference-data negative tests follow Section 3a Rule 3; audit log grant verification follows Section 10 Rule 1.
- `13_implementation_plan.md` — P2's task list requires Section 3a satisfied before P3 negative testing begins; P5's task list requires Section 10 satisfied before P5 is considered complete.
- `14_developer_setup.md` Section 19 — review Section 3a/10 before working on `chaincode/refdata/` or the audit log schema specifically.
