# HALCHECK — API / Protocol Reference

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: P4 complete (AI explanation live as an honest placeholder, pending an LLM provider/key decision). P5's MinIO file storage live-proven; cached trail views deliberately skipped (superseded by P4's `GetBatchTrail`/`ListBatches`).
- Version: 0.12.0

## Changelog

- **v0.2.0:** Added batch creation with Intended Market, fail `flaggedRecordId`, correction `supersedesRecordId`, read-only export destination, and Integrity Sandbox endpoints.
- **v0.3.0:** Replaced client verdict payload fields with a signed engine-attestation contract and added `audit_unavailable`.
- **v0.4.0:** Added `invalid_entry_type`, `duplicate_entry`, `already_deprecated`, and `invalid_market` to §14, surfaced by the P2 `refdata`/`batch` chaincode implementation.
- **v0.5.0:** Replaced client-supplied `supersedesRecordId` (§5, §6) with dedicated `/ingredients/correct` and `/production/correct` endpoints that accept no such field at all -- the chaincode-level correction design (`batch.CorrectIngredient`/`CorrectProduction`, built and reviewed during P2) derives the flagged record from the batch's own latest verdict, never from client input. This doc's v0.2.0 `supersedesRecordId` field predated that design and never matched it.
- **v0.6.0:** Corrected §4-6, §8's success response shapes to match the P4 backend implementation: every write route returns the full, RBAC-serialized record chaincode actually returns (`recordId`, `batchId`, every snapshot/reference/timestamp/identity field), not the thin `{recordId, status: "committed", txId}` summary this doc previously showed. A thin wrapper is exactly the screen-shaped response §1's resource-oriented principle rules out; the backend was built against the principle, this doc's examples were not, and the code is authoritative. `txId` (the real ledger transaction ID, captured via the Gateway SDK's fine-grained submit flow) is still present on every write response, now alongside the full record rather than instead of it. Batch creation (§4) is the one response that also carries a `status` field -- a fixed, unconditional fact about a freshly-created batch (`awaiting_ingredients`), not a general per-batch status computation; no other write route computes or returns `status`.
- **v0.7.0:** §7 rewritten to match the real, live-proven verdict flow: `chaincode/batch` gained a read-only `GetBatchTrail` function (no chaincode function previously existed to read a batch back at all) backing both this and a new `GET /batches/:batchId/trail` (§9). The backend maps a batch's trail into the Core Screening App engine's shapes, runs it, and signs the result with the backend's own ECDSA key -- `chaincode/batch`'s compiled-in verification key was regenerated as part of this (its previous private half never left the earlier session that generated it and was never recoverable). Added `engine_dataset_mismatch` to §14.
- **v0.8.0:** Added `GET /batches` (§9, `batch.ListBatches`), `POST /sandbox/integrity/*` (§10, live-proven -- always reject, no chaincode call), and `GET /audit-log` (§12, live-proven, System Admin only) as real, implemented endpoints. `flagged` is computed with a Postgres window function over each actor's full history (3+ `denied` outcomes in the trailing hour ending at that row's own timestamp), not just the rows a `from`/`to` filter happens to return.
- **v0.9.0:** §5's bulk upload variant is now implemented and live-proven -- this doc's existing example shape (`uploadSessionId`, per-row `{row, status, recordId}` or `{row, status, reason, field}`) needed no correction, only a `message` alongside `reason` on rejected rows, matching every other rejection shape in this doc. Accepts CSV only (header `name,source,halalRiskFlag,overrideReason`; the last two optional) -- `file` field, `multipart/form-data`. `uploadSessionId` is a fresh backend-generated id per request, not persisted on any ledger record.
- **v0.10.0:** §11 rewritten -- it said "System Admin only" for all three reference-data endpoints, which never matched the chaincode (only the two writes are; both reads are open to any role, same divergence already fixed for §3's endpoint summary back in P4). Added `GET /reference-data/:type/:value/history` (`refdata.GetReferenceEntryHistory`), the last P2 chaincode function that had no route -- closes `13_implementation_plan.md` P4's "all P2 chaincode functions callable through the API" exit criterion. `:entryId` corrected to `:value` throughout (the deprecate route already took `value` in the real implementation; this doc's example just hadn't been updated to match).
- **v0.11.0:** §13's route is live as a placeholder, deliberately deferred pending an LLM provider/key decision -- always returns the documented "unavailable" response (never a fabricated answer), audited (`ai_explanation_request`), input-validated. `docs/17`'s own §7/§9/§11 corrections this session are exactly why: build the honest shape now, correct docs as reality diverges, never leave an undocumented or fabricated stand-in.
- **v0.12.0 (P5):** §5 corrected -- `coaFileHash` was documented as client-submitted; it's chaincode-accepted (`IngredientRecord.CoaFileHash`, threaded through `SubmitIngredient`/`CorrectIngredient`, batch redeployed to sequence 5) but must be server-computed from real uploaded bytes, never a client claim (T-006). No route accepts the file yet, so it's always empty for now -- that's the one open piece, not this doc drifting from the code again. `backend/src/storage/minio.ts` implements TRD §11's object-key convention, live-proven against a real running MinIO instance (upload, retrieve, and a genuine hash-mismatch rejection) -- closes P5's "file hash verified against actual retrieved content" exit criterion. P5's other named piece, a Postgres cached-trail-view layer, is skipped: it was scoped before `GetBatchTrail`/`ListBatches` existed as a direct, fast, already-correct read path; those already solve what the cache was meant to.

## 1. Purpose

Defines the typed contract between the frontend and the backend API — the only path by which the frontend may cause any ledger write. No endpoint here executes chaincode logic directly; every endpoint is a thin translation to a Fabric Gateway SDK call, with identity verification and field-level RBAC serialization in between.

Every route below is resource-oriented, not screen-oriented (`04_trd.md` §8): it models a ledger resource and an action on it, never one specific frontend screen's data shape. Adding a new screen, or redesigning an existing one, should be satisfiable by composing calls to the routes already listed here — that's the test for whether a genuinely new endpoint is warranted, versus a frontend change that needs nothing added here at all.

## 2. Authentication

Every request except login requires a bearer JWT:

```text
Authorization: Bearer <token>
```

```json
POST /api/v1/auth/login
{
  "username": "...",
  "password": "..."
}
```

Response:
```json
{
  "token": "<jwt>",
  "role": "ingredient_qa",
  "expires_at": "2026-..."
}
```

The backend verifies, on every subsequent request, that the JWT's associated identity matches the Fabric identity used for the chaincode call.

## 3. Endpoint Summary

```text
POST   /api/v1/auth/login
GET    /api/v1/batches
POST   /api/v1/batches
GET    /api/v1/batches/:batchId/trail
POST   /api/v1/batches/:batchId/ingredients
POST   /api/v1/batches/:batchId/ingredients/correct
POST   /api/v1/batches/:batchId/ingredients/upload
POST   /api/v1/batches/:batchId/production
POST   /api/v1/batches/:batchId/production/correct
POST   /api/v1/batches/:batchId/verdict
POST   /api/v1/batches/:batchId/export
POST   /api/v1/batches/:batchId/explain
POST   /api/v1/sandbox/integrity/alter-attempt
POST   /api/v1/sandbox/integrity/unlisted-value-attempt
GET    /api/v1/reference-data/:type
GET    /api/v1/reference-data/:type/:value/history
POST   /api/v1/reference-data/:type
POST   /api/v1/reference-data/:type/:value/deprecate
GET    /api/v1/audit-log
```

## 4. Batch Creation

```json
POST /api/v1/batches
{
  "intendedMarket": "Malaysia"
}
```

Response:
```json
{
  "batchId": "SL-2026-001",
  "intendedMarket": "Malaysia",
  "status": "awaiting_ingredients"
}
```

`intendedMarket` is immutable after creation and is used by the compliance verdict flow before export.

## 5. Ingredient Submission

```json
POST /api/v1/batches/:batchId/ingredients
{
  "name": "Aqua",
  "source": "PT Sumber Alam Nusantara",
  "halalRiskFlag": false,
  "overrideReason": null
}
```

`coaFileHash` is deliberately not a field a client can set here. `chaincode/batch`'s `IngredientRecord.CoaFileHash` exists and is wired end-to-end (`SubmitIngredient`/`CorrectIngredient` accept it, `GetBatchTrail` returns it), but the value must be the backend's own sha256 of file bytes it actually received and stored, never a client-asserted string -- a client-supplied hash could claim any content matched it, defeating Security Threat Model T-006's mitigation entirely (`backend/src/storage/minio.ts`, object key `{batchId}/{recordType}/{sha256hash}.{ext}` per `docs/04_trd.md` §11). This route doesn't yet accept a file upload to compute one from -- that's the one piece still open; until then every submission's `coaFileHash` is empty.

Correction submissions use a dedicated endpoint, not a field on this one:

```json
POST /api/v1/batches/:batchId/ingredients/correct
{
  "name": "Aqua",
  "source": "PT Sumber Alam Nusantara",
  "halalRiskFlag": false,
  "overrideReason": null
}
```

`coaFileHash` is deliberately not a field a client can set here. `chaincode/batch`'s `IngredientRecord.CoaFileHash` exists and is wired end-to-end (`SubmitIngredient`/`CorrectIngredient` accept it, `GetBatchTrail` returns it), but the value must be the backend's own sha256 of file bytes it actually received and stored, never a client-asserted string -- a client-supplied hash could claim any content matched it, defeating Security Threat Model T-006's mitigation entirely (`backend/src/storage/minio.ts`, object key `{batchId}/{recordType}/{sha256hash}.{ext}` per `docs/04_trd.md` §11). This route doesn't yet accept a file upload to compute one from -- that's the one piece still open; until then every submission's `coaFileHash` is empty.

There is deliberately no field anywhere in either request for the client to name which record is being corrected. `batch.CorrectIngredient` derives it itself from the batch's own latest verdict (must be Fail; the flagged record must exist and not already be corrected) -- matching Screen Requirements §6 ("shows only the single flagged ... record, identified via the Fail verdict's flagged_record_id") and closing a real gap: an earlier version of this doc specified a client-supplied `supersedesRecordId`, which would have let a caller name the wrong record to correct. The chaincode-level design (reviewed and built first) is authoritative; this doc follows it.

Response (success) -- the full record `batch.SubmitIngredient` writes, RBAC-serialized and camelCased, plus the ledger transaction ID. `supersedesRecordId` is absent here (empty on the ledger record for a plain submission) and present on `/ingredients/correct`'s response instead, pointing at the flagged record it replaces:
```json
{
  "recordId": "...",
  "batchId": "SL-2026-001",
  "ingredientNameSnapshot": "Aqua",
  "ingredientReferenceEntryId": "...",
  "ingredientReferenceVersion": "1",
  "sourceSnapshot": "PT Sumber Alam Nusantara",
  "supplierReferenceEntryId": "...",
  "supplierReferenceVersion": "1",
  "supplierVerificationStatus": "verified",
  "halalRiskFlag": false,
  "timestamp": "2026-...",
  "submittedBy": { "role": "ingredient_qa", "personaName": "..." },
  "txId": "<ledger transaction id>"
}
```

Response (rejected — not a recognized value), no `status` field: the HTTP status code (404 for this reason -- `gateway.ts`'s `reasonToHttpStatus`) already carries that:
```json
{
  "reason": "not_a_recognized_value",
  "message": "not_a_recognized_value: ..."
}
```

Response (rejected — supplier entry carries no verification status), HTTP 400:
```json
{
  "reason": "missing_reference_metadata",
  "message": "missing_reference_metadata: supplier \"...\" has no verificationStatus in its reference metadata, ..."
}
```
The submitted `source` resolves against the governed reference list, but the fact the verdict engine needs from it (`metadata.verificationStatus`, ADR-CT-033) is absent — so the record is refused rather than written with an empty status that a signed attestation would later read as unverified. Nothing is written: the batch's trail is unchanged. The remedy is a System Admin adding the status as a new version of that supplier entry, not a retry.

### Bulk upload variant

```json
POST /api/v1/batches/:batchId/ingredients/upload
Content-Type: multipart/form-data

file: <spreadsheet>
```

Response, per-row results:
```json
{
  "uploadSessionId": "...",
  "results": [
    { "row": 1, "status": "committed", "recordId": "..." },
    { "row": 2, "status": "rejected", "reason": "not_a_recognized_value", "field": "source" }
  ]
}
```

## 6. Production Confirmation

```json
POST /api/v1/batches/:batchId/production
{
  "lineSegregationConfirmed": true
}
```

`batchDate` and `standardsAnchor` are server-populated, not accepted from the request body. Correction submissions use `POST /api/v1/batches/:batchId/production/correct`, same body shape, same "no client-named record" rule as ingredient corrections above (`batch.CorrectProduction`).

Response (success) -- the full `ProductionRecord`, same pattern as ingredient submission above:
```json
{
  "recordId": "...",
  "batchId": "SL-2026-001",
  "batchDate": "2026-...",
  "lineSegregationConfirmed": true,
  "standardSnapshot": "CPKB",
  "standardReferenceEntryId": "...",
  "standardReferenceVersion": "1",
  "timestamp": "2026-...",
  "submittedBy": { "role": "production_qa", "personaName": "..." },
  "txId": "<ledger transaction id>"
}
```

Rejected if no ingredient record exists yet:
```json
{
  "reason": "sequencing_violation",
  "message": "sequencing_violation: batch \"SL-2026-001\" has no ingredient record yet"
}
```

Rejected if a production record already exists (use `/production/correct` instead):
```json
{
  "reason": "duplicate_entry",
  "message": "duplicate_entry: batch \"SL-2026-001\" already has a production record; submit a correction instead"
}
```

## 7. Compliance Verdict

```json
POST /api/v1/batches/:batchId/verdict
{}
```

The backend re-reads the batch's own current trail (`batch.GetBatchTrail`), maps it into the Core Screening App engine's shapes (`backend/src/verdict/build.ts`), runs `runScreening()`, and signs the result with the backend's ECDSA key (`backend/src/verdict/sign.ts`) before submitting. `batch.RecordVerdict` verifies the signature and bindings; clients never submit an attestation, verdict, regulation, recognition result, Fail reason, or flagged record directly -- proven live both ways, not just designed this way.

Response (Pass) -- the full `VerdictRecord`, same full-record pattern as every other write route:
```json
{
  "recordId": "...",
  "batchId": "SL-2026-001",
  "status": "pass",
  "regulationSnapshot": "JAKIM HC-2024",
  "regulationReferenceEntryId": "...",
  "regulationReferenceVersion": "1",
  "engineAttestationDigest": "<sha256 of the batch's effective ledger inputs>",
  "engineVersion": "0.1.0",
  "rulesRelease": "2026.07",
  "timestamp": "2026-...",
  "submittedBy": { "role": "compliance_officer", "personaName": "..." },
  "txId": "<ledger transaction id>"
}
```

Response (Fail) -- adds the controlled Fail reason and the exact flagged record:
```json
{
  "recordId": "...",
  "batchId": "SL-2026-002",
  "status": "fail",
  "regulationSnapshot": "JAKIM HC-2024",
  "failReasonSnapshot": "Unverified ingredient source",
  "flaggedRecordId": "...",
  "engineAttestationDigest": "...",
  "engineVersion": "0.1.0",
  "rulesRelease": "2026.07",
  "timestamp": "2026-...",
  "submittedBy": { "role": "compliance_officer", "personaName": "..." },
  "txId": "..."
}
```

Rejected if the batch's ledger snapshot (ingredient/supplier names) doesn't match any entry in the engine's active dataset release -- a real data-integrity gap between Compliance Trail's refdata and the Core Screening App's own dataset, not a client error:
```json
{
  "reason": "engine_dataset_mismatch",
  "message": "ledger ingredient/supplier (\"...\"/\"...\") not found in the active dataset release -- refdata and the engine dataset have drifted apart"
}
```

## 8. Export Release

```json
POST /api/v1/batches/:batchId/export
{}
```

Destination is copied from the batch's immutable `intendedMarket`; clients must not submit a destination market at export time.

Response (success) -- the full `ExportRecord`:
```json
{
  "recordId": "...",
  "batchId": "SL-2026-001",
  "destinationMarket": "Malaysia",
  "timestamp": "2026-...",
  "submittedBy": { "role": "export_officer", "personaName": "..." },
  "txId": "<ledger transaction id>",
  "status": "exported"
}
```

Rejected without a Pass verdict:
```json
{
  "reason": "no_valid_verdict",
  "message": "no_valid_verdict: batch \"SL-2026-001\" has no recorded verdict"
}
```

Rejected on concurrency conflict:
```json
{
  "reason": "concurrent_modification",
  "message": "concurrent modification detected"
}
```

## 9. Batch List and Trail Retrieval (read-only)

```json
GET /api/v1/batches
```

Response -- every batch on the ledger (`batch.ListBatches`), lightweight: just the batch record, not each one's full trail:
```json
[
  { "batchId": "SL-2026-001", "createdAt": "2026-...", "intendedMarket": "Malaysia" },
  { "batchId": "SL-2026-002", "createdAt": "2026-...", "intendedMarket": "Indonesia" }
]
```

```json
GET /api/v1/batches/:batchId/trail
```

Response -- everything recorded for one batch (`batch.GetBatchTrail`), which also supplies `effectiveInputDigest`, the same digest `POST .../verdict` binds an attestation to:
```json
{
  "batch": { "batchId": "SL-2026-001", "createdAt": "2026-...", "intendedMarket": "Malaysia" },
  "ingredientRecords": [ { "recordId": "...", "ingredientNameSnapshot": "Aqua", "submittedBy": { "role": "ingredient_qa", "personaName": "..." }, "...": "..." } ],
  "productionRecords": [ { "recordId": "...", "lineSegregationConfirmed": true, "...": "..." } ],
  "verdictRecords": [ { "recordId": "...", "status": "pass", "...": "..." } ],
  "exportRecords": [],
  "effectiveInputDigest": "<sha256>"
}
```

Every record list is always present as `[]`, never omitted, even when empty. Response fields are filtered per the requesting role's Field-Level RBAC matrix before being returned. Neither endpoint restricts by role -- any operational role may see what batches exist and read a batch's own trail (TRD §23.4).

## 10. Integrity Sandbox Endpoints (demonstration only)

```json
POST /api/v1/sandbox/integrity/alter-attempt
{
  "recordId": "...",
  "attemptedChange": {}
}
```

Always returns rejection by design:
```json
{
  "status": "rejected",
  "reason": "immutable_record",
  "message": "This record cannot be altered. A new linked record may be submitted instead."
}
```

```json
POST /api/v1/sandbox/integrity/unlisted-value-attempt
{
  "field": "ingredient",
  "value": "Unlisted Demo Ingredient"
}
```

Always returns rejection by design:
```json
{
  "status": "rejected",
  "reason": "not_a_recognized_value",
  "message": "This value is not in the current reference list."
}
```

## 11. Reference Data Endpoints

Reads are open to any authenticated role (`refdata.ListReferenceEntries`/`GetReferenceEntryHistory` carry no role check: any operational role may need to validate its own submission, or see an entry's full history, independently of the UI). Only the two writes below are System Admin only, rejecting with `reason: "role_scope_violation"` for any other caller -- an earlier version of this doc said all endpoints were System Admin only, which never matched the chaincode.

```json
GET /api/v1/reference-data/ingredient
```

Response -- every entry of this type, active and deprecated together (deprecated ones always included, never filtered out):
```json
[
  { "entryId": "...", "type": "ingredient", "value": "Aqua", "version": "1", "status": "active", "timestamp": "...", "addedBy": { "role": "system_admin", "personaName": "..." } }
]
```

```json
GET /api/v1/reference-data/ingredient/Aqua/history
```

Response -- every recorded write across every version of this value's full supersession chain, oldest first (FRD-CHAIN-REFDATA-004: deprecated entries must remain visible in history, not hidden):
```json
[
  { "txId": "...", "timestamp": "...", "isDelete": false, "entry": { "entryId": "...", "version": "1", "status": "active", "...": "..." } },
  { "txId": "...", "timestamp": "...", "isDelete": false, "entry": { "entryId": "...", "version": "1", "status": "deprecated", "...": "..." } }
]
```

```json
POST /api/v1/reference-data/ingredient
{
  "value": "New Ingredient Name",
  "metadata": { "defaultHalalRisk": false }
}
```

System Admin only. `value` is the human-readable name a `POST .../ingredients` submission's `name`/`source` fields are validated against, not a raw ledger id.

```json
POST /api/v1/reference-data/ingredient/Aqua/deprecate
```

System Admin only. Takes the human-readable `value` in the path, not `entry_id` -- the ledger's own entry id is a raw composite key (contains NUL-byte separators, unusable as a URL segment) and unnecessary anyway, since at most one version of a `(type, value)` is ever active.

## 12. Audit Log Endpoint (System Admin only)

```json
GET /api/v1/audit-log?from=...&to=...&identity=...
```

Response includes a computed `flagged: true` field on any identity entry matching the 3+ denied-attempts-per-hour rule.

## 13. AI Trail Explanation

```json
POST /api/v1/batches/:batchId/explain
{
  "question": "Why was this batch blocked?"
}
```

Response:
```json
{
  "answer": "...",
  "source": "ai_generated",
  "batchId": "..."
}
```

Response (unavailable):
```json
{
  "status": "unavailable",
  "message": "Explanation service is temporarily unavailable."
}
```

## 14. Standard Rejection Reasons

```text
role_scope_violation
sequencing_violation
no_valid_verdict
immutable_record
missing_field
missing_reference_metadata
identity_mismatch
record_not_found
no_evidence
evidence_missing
evidence_hash_mismatch
not_a_recognized_value
concurrent_modification
ledger_unavailable
audit_unavailable
invalid_entry_type
duplicate_entry
already_deprecated
invalid_market
engine_dataset_mismatch
```

Every rejection returns a stable `reason` code plus a human-readable `message`. Clients key off `reason`, never parse `message` for logic.

**Added during P4 verdict integration, narrowed by ADR-CT-033:** `engine_dataset_mismatch` covers `POST /batches/:batchId/verdict` when a batch's own ingredient/supplier snapshot names don't resolve against the Core Screening App engine's active dataset release (`backend/src/verdict/build.ts`). Since ADR-CT-033 the release is only consulted for records written before supplier verification status was snapshotted (2026-09-18), and only for that one fact — verdict inputs otherwise come from the batch's own records. It now means "a pre-existing record and the frozen release disagree, and nothing owns that fact any more": a data-integrity gap between Compliance Trail's ledger and the engine's own dataset that chaincode cannot detect (it never sees the engine dataset), and one no record written since this change can reach.

**Added with ADR-CT-033:** `missing_reference_metadata` covers an ingredient submission (`SubmitIngredient`/`CorrectIngredient`) whose supplier reference entry carries no `verificationStatus`. It is an expected, actionable refusal on governed data, not a fault — mapped to 400 with the other business rejections (ADR-CT-031) — and it is the only reason code in this list a System Admin can create and clear on their own.

**Added during P2 chaincode implementation** (`chaincode/refdata`, `chaincode/batch`): `invalid_entry_type` and `invalid_market` cover a controlled-enum parameter that doesn't match any allowed value; `duplicate_entry` covers `AddReferenceEntry` rejecting a `(type, value)` pair that already has an *active* version — re-adding a value whose existing versions are all deprecated instead succeeds as the next version (`refdata`'s versioning redesign, `docs/14_developer_setup.md` §1.7); `already_deprecated` covers `DeprecateReferenceEntry` rejecting a second deprecation of the same still-current version. None of these are reachable through the normal UI (all four fields are dropdown-constrained per `11_screen_requirements.md`), but they're real chaincode-level rejections a direct/bypassing request can trigger — the same defense-in-depth discipline the Integrity Sandbox demonstrates elsewhere.

## 15. Compatibility Rules

- All endpoints versioned under `/api/v1/`; breaking changes require a version bump.
- Unknown `reason` codes must be treated as generic failures by clients, not crash the UI.
- Debug/example payloads kept in this document and in test fixtures, never invented ad hoc in frontend code.

## 16. Transport

- HTTPS only, even for local development (self-signed cert acceptable locally).
- No WebSocket/streaming layer in this version — all interactions are request/response; the trail view re-fetches rather than subscribing to live updates.

## 17. Integrity read (ADR-CT-034)

```json
GET /api/v1/batches/:batchId/integrity
```

The raw material behind `effective_input_digest`: every ingredient and production record's own stored bytes (base64) and their sha256, in the order the digest hashed them (`ingredient records in ledger key order, then production records in ledger key order`), plus the batch's `effective_input_digest` itself. Any authenticated role — it exposes exactly what `GET /batches/:id/trail` already exposes, in a form that can be hashed. Audited as `view` / `batch.integrity`.

```json
{
  "batchId": "SL-2026-026",
  "algorithm": "sha256",
  "digestOrder": "ingredient records in ledger key order, then production records in ledger key order",
  "records": [
    { "recordId": "c204…", "objectType": "ingredientRecord", "sha256": "68aa…", "storedBytesBase64": "eyJy…" }
  ],
  "effectiveInputDigest": "01a4…"
}
```

The bytes are returned verbatim, never a re-serialization: a struct round-trip would drop fields this chaincode version doesn't know about and change the hash of a record nobody touched.

## 18. Evidence retrieval (ADR-CT-034)

```json
GET /api/v1/batches/:batchId/ingredients/:recordId/coa
```

Returns the stored certificate of analysis the record's `coaFileHash` names, as the file itself (`content-type` derived from the stored object), with the ledger's own hash in the `x-evidence-sha256` header so the caller can re-check it independently. The bytes are re-hashed against that hash on **every** retrieval (`storage/minio.ts` `downloadAndVerify`) — threat model T-006's enforcement point, which had no caller until this route existed. Audited as `view` / `batch.coa`.

Rejections: `record_not_found` (no such ingredient record on the batch), `no_evidence` (the record names no certificate), `evidence_missing` (the record names one, but nothing is stored under that hash), and `evidence_hash_mismatch` — HTTP 409, meaning the stored object no longer hashes to the value on the immutable record. The last one is the whole point: it is served as a refusal, not as a file.

## 19. Proof bundle (ADR-CT-034)

```json
GET /api/v1/batches/:batchId/proof-bundle
```

One self-contained artifact: the integrity material from §17, every verdict that carries a stored attestation (with the attestation JSON and its ECDSA signature), and the public key the signature is checked against. Fetching it needs a session — it is this system's data — but **verifying it does not** (§20). Verdicts recorded before attestation storage existed are omitted rather than included unchecked. Audited as `view` / `batch.proof_bundle`.

## 20. Independent verification (ADR-CT-034)

The bundle is verified by `src/proof/verifyProofBundle.ts` — no application, no Fabric client, no network, no login. Two consumers share it:

```bash
# offline, from a file, gate-able by exit code (0 verified, 1 not, 2 unreadable)
cd backend && npm run verify:proof -- SL-2026-026-proof-bundle.json
```

and the public `#/verify` screen, which runs the same module in the browser against a pasted or uploaded bundle (reachable from the sign-in screen; no session required, by design — the person checking someone else's claim is the person least likely to have an account).

Checks, each reported `pass` / `fail` / `note`:

1. every record's bytes hash to the `sha256` the bundle states;
2. the records concatenated in order recompute to `effectiveInputDigest`;
3. the published key parses as a P-256 SPKI key;
4. each verdict's DER signature verifies over its attestation (SHA-256, ECDSA);
5. each attestation names this batch;
6. a Fail attestation's `flagged_record_id` exists among the bundle's records;
7. — as `note`, never `fail` — whether the attested digest is the digest the records currently produce. A Fail that a correction later superseded legitimately cites an older digest; that is history, not tampering, and the signature check is what detects real tampering.
