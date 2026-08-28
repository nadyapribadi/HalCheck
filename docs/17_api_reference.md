# HALCHECK — API / Protocol Reference

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: P4 in progress, batch lifecycle proven live end-to-end
- Version: 0.7.0

## Changelog

- **v0.2.0:** Added batch creation with Intended Market, fail `flaggedRecordId`, correction `supersedesRecordId`, read-only export destination, and Integrity Sandbox endpoints.
- **v0.3.0:** Replaced client verdict payload fields with a signed engine-attestation contract and added `audit_unavailable`.
- **v0.4.0:** Added `invalid_entry_type`, `duplicate_entry`, `already_deprecated`, and `invalid_market` to §14, surfaced by the P2 `refdata`/`batch` chaincode implementation.
- **v0.5.0:** Replaced client-supplied `supersedesRecordId` (§5, §6) with dedicated `/ingredients/correct` and `/production/correct` endpoints that accept no such field at all -- the chaincode-level correction design (`batch.CorrectIngredient`/`CorrectProduction`, built and reviewed during P2) derives the flagged record from the batch's own latest verdict, never from client input. This doc's v0.2.0 `supersedesRecordId` field predated that design and never matched it.
- **v0.6.0:** Corrected §4-6, §8's success response shapes to match the P4 backend implementation: every write route returns the full, RBAC-serialized record chaincode actually returns (`recordId`, `batchId`, every snapshot/reference/timestamp/identity field), not the thin `{recordId, status: "committed", txId}` summary this doc previously showed. A thin wrapper is exactly the screen-shaped response §1's resource-oriented principle rules out; the backend was built against the principle, this doc's examples were not, and the code is authoritative. `txId` (the real ledger transaction ID, captured via the Gateway SDK's fine-grained submit flow) is still present on every write response, now alongside the full record rather than instead of it. Batch creation (§4) is the one response that also carries a `status` field -- a fixed, unconditional fact about a freshly-created batch (`awaiting_ingredients`), not a general per-batch status computation; no other write route computes or returns `status`.
- **v0.7.0:** §7 rewritten to match the real, live-proven verdict flow: `chaincode/batch` gained a read-only `GetBatchTrail` function (no chaincode function previously existed to read a batch back at all) backing both this and a new `GET /batches/:batchId/trail` (§9). The backend maps a batch's trail into the Core Screening App engine's shapes, runs it, and signs the result with the backend's own ECDSA key -- `chaincode/batch`'s compiled-in verification key was regenerated as part of this (its previous private half never left the earlier session that generated it and was never recoverable). Added `engine_dataset_mismatch` to §14.

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
POST   /api/v1/reference-data/:type
POST   /api/v1/reference-data/:type/:entryId/deprecate
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
  "overrideReason": null,
  "coaFileHash": "<sha256>"
}
```

Correction submissions use a dedicated endpoint, not a field on this one:

```json
POST /api/v1/batches/:batchId/ingredients/correct
{
  "name": "Aqua",
  "source": "PT Sumber Alam Nusantara",
  "halalRiskFlag": false,
  "overrideReason": null,
  "coaFileHash": "<sha256>"
}
```

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

## 11. Reference Data Endpoints (System Admin only)

```json
GET /api/v1/reference-data/ingredient
```

```json
POST /api/v1/reference-data/ingredient
{
  "value": "New Ingredient Name",
  "metadata": { "defaultHalalRisk": false }
}
```

```json
POST /api/v1/reference-data/ingredient/:entryId/deprecate
```

All three endpoints reject with `reason: "role_scope_violation"` for any non-System-Admin caller.

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
identity_mismatch
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

**Added during P4 verdict integration:** `engine_dataset_mismatch` covers `POST /batches/:batchId/verdict` when a batch's own ingredient/supplier snapshot names don't resolve against the Core Screening App engine's active dataset release (`backend/src/verdict/build.ts`) -- a data-integrity gap between Compliance Trail's refdata and the engine's own dataset, not something chaincode itself can detect (it never sees the engine dataset).

**Added during P2 chaincode implementation** (`chaincode/refdata`, `chaincode/batch`): `invalid_entry_type` and `invalid_market` cover a controlled-enum parameter that doesn't match any allowed value; `duplicate_entry` covers `AddReferenceEntry` rejecting a `(type, value)` pair that already has an *active* version — re-adding a value whose existing versions are all deprecated instead succeeds as the next version (`refdata`'s versioning redesign, `docs/14_developer_setup.md` §1.7); `already_deprecated` covers `DeprecateReferenceEntry` rejecting a second deprecation of the same still-current version. None of these are reachable through the normal UI (all four fields are dropdown-constrained per `11_screen_requirements.md`), but they're real chaincode-level rejections a direct/bypassing request can trigger — the same defense-in-depth discipline the Integrity Sandbox demonstrates elsewhere.

## 15. Compatibility Rules

- All endpoints versioned under `/api/v1/`; breaking changes require a version bump.
- Unknown `reason` codes must be treated as generic failures by clients, not crash the UI.
- Debug/example payloads kept in this document and in test fixtures, never invented ad hoc in frontend code.

## 16. Transport

- HTTPS only, even for local development (self-signed cert acceptable locally).
- No WebSocket/streaming layer in this version — all interactions are request/response; the trail view re-fetches rather than subscribing to live updates.
