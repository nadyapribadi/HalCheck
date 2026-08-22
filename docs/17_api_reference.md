# HALCHECK — API / Protocol Reference

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.2.0:** Added batch creation with Intended Market, fail `flaggedRecordId`, correction `supersedesRecordId`, read-only export destination, and Integrity Sandbox endpoints.
- **v0.3.0:** Replaced client verdict payload fields with a signed engine-attestation contract and added `audit_unavailable`.

## 1. Purpose

Defines the typed contract between the frontend and the backend API — the only path by which the frontend may cause any ledger write. No endpoint here executes chaincode logic directly; every endpoint is a thin translation to a Fabric Gateway SDK call, with identity verification and field-level RBAC serialization in between.

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
POST   /api/v1/batches/:batchId/ingredients/upload
POST   /api/v1/batches/:batchId/production
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
  "coaFileHash": "<sha256>",
  "supersedesRecordId": null
}
```

For correction submissions, `supersedesRecordId` must identify the single flagged record being corrected.

Response (success):
```json
{
  "recordId": "...",
  "status": "committed",
  "txId": "<ledger transaction id>"
}
```

Response (rejected — not a recognized value):
```json
{
  "status": "rejected",
  "reason": "not_a_recognized_value",
  "message": "This ingredient or supplier is not in the current reference list."
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

`batchDate` and `standardsAnchor` are server-populated, not accepted from the request body.

Rejected if no ingredient record exists yet:
```json
{
  "status": "rejected",
  "reason": "sequencing_violation",
  "message": "No ingredient record found for this batch."
}
```

## 7. Compliance Verdict

```json
POST /api/v1/batches/:batchId/verdict
{}
```

The backend obtains the attestation from the existing engine. `batch` chaincode verifies its signature and bindings; clients never submit an attestation, verdict, regulation, recognition result, Fail reason, or flagged record directly. A valid Fail attestation records the controlled Fail reason and triggering ingredient or production record.

Fail response shape:
```json
{
  "verdict": "fail",
  "governingRegulation": "PP 42/2024",
  "failReason": "Unverified ingredient source",
  "flaggedRecordId": "..."
}
```

## 8. Export Release

```json
POST /api/v1/batches/:batchId/export
{}
```

Destination is copied from the batch's immutable `intendedMarket`; clients must not submit a destination market at export time.

Rejected without a Pass verdict:
```json
{
  "status": "rejected",
  "reason": "no_valid_verdict",
  "message": "Export requires a recorded Pass verdict for this batch."
}
```

Rejected on concurrency conflict:
```json
{
  "status": "rejected",
  "reason": "concurrent_modification",
  "message": "This batch was just updated by another action. Please refresh and try again."
}
```

## 9. Trail Retrieval (read-only)

```json
GET /api/v1/batches/:batchId/trail
```

Response:
```json
{
  "batchId": "...",
  "intendedMarket": "Malaysia",
  "computedStatus": "awaiting_correction",
  "records": [
    { "type": "ingredient", "role": "...", "timestamp": "...", "status": "committed" },
    { "type": "production", "role": "...", "timestamp": "...", "status": "committed" },
    { "type": "verdict", "role": "...", "timestamp": "...", "status": "fail" }
  ]
}
```

Response fields are filtered per the requesting role's Field-Level RBAC matrix before being returned.

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
```

Every rejection returns a stable `reason` code plus a human-readable `message`. Clients key off `reason`, never parse `message` for logic.

## 15. Compatibility Rules

- All endpoints versioned under `/api/v1/`; breaking changes require a version bump.
- Unknown `reason` codes must be treated as generic failures by clients, not crash the UI.
- Debug/example payloads kept in this document and in test fixtures, never invented ad hoc in frontend code.

## 16. Transport

- HTTPS only, even for local development (self-signed cert acceptable locally).
- No WebSocket/streaming layer in this version — all interactions are request/response; the trail view re-fetches rather than subscribing to live updates.
