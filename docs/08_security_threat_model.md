# HALCHECK — Security Threat Model

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Scope

Covers chaincode (business rule enforcement), Fabric network (peers, ordering service, CA), backend API, off-chain storage (PostgreSQL, file storage), authentication layer, public tunnel exposure, reference data write path, System Admin role, centralized audit log, field-level API serialization, and the external LLM API integration.

## 2. Assets

| Asset | Why it matters |
|---|---|
| Ledger records | The entire accountability claim of the system rests on these being genuine and unaltered |
| Role identity certificates | Compromise here means fabricated accountability |
| Chaincode logic | The actual enforcement mechanism; a bug here is a silent governance failure, not a crash |
| Uploaded files (ingredient sheets, COAs) | Referenced by hash on-chain; if the file is swapped without detection, the hash reference becomes misleading |
| Fabric CA admin credentials | Full identity-issuance compromise if exposed |
| Backend JWT signing secret | Compromise allows identity impersonation at the API layer |
| PostgreSQL / MinIO admin credentials | Non-authoritative data, but still a real exposure if left at default values |
| Public tunnel endpoint | The only deliberately internet-facing surface; misconfiguration here exposes everything behind it |
| Reference data (ingredient/supplier/standards/fail-reason lists) | Compromise means the system's own definition of "valid" is corrupted — could affect every future submission |
| System Admin identity certificate | The most powerful identity in the system by scope, even with zero batch-submission rights |
| System Audit Log | The record of record for detecting misuse of everything else |
| LLM API context payload | Contains real (if fictional-demo) batch data sent to a third-party service |

## 3. Trust Boundaries

```text
Public internet (via tunnel)
  -> Frontend
  -> Backend API
     -> JWT verification
     -> Fabric identity verification
     -> Field-level RBAC serializer (enforced before response leaves this boundary)
  -> Fabric Gateway SDK
  -> Chaincode (final enforcement point - batch AND refdata functions)
  -> Ledger / CouchDB

Separately:
  -> System Audit Log (Postgres, DB-grant-enforced insert-only - no adapter has UPDATE/DELETE regardless of code correctness)

Separately:
  -> LLM API (outbound-only boundary; receives pre-filtered context, no path back into the system beyond its text response)

Separately (correctness, not access-control):
  -> MVCC Conflict Boundary - chaincode's native conflict detection is the sole mechanism
     preventing two simultaneous writes from corrupting batch state; no adapter may implement
     its own locking that could create a false sense of protection outside this boundary
```

**Boundary principle:** System Admin is a distinct trust boundary from all 5 operational roles — not "more trusted" or "less trusted," but differently scoped. It must never cross into operational actions, and operational roles must never cross into reference-data writes.

## 4. Threats

| ID | Threat | Mitigation |
|---|---|---|
| T-001 | Role claims a permission it doesn't have via a client-supplied role string | Chaincode reads real certificate attributes only, never trusts client-asserted role |
| T-002 | Backend enforces a rule that chaincode doesn't independently enforce, creating a bypass path | Every rule required to exist at chaincode level; backend-only enforcement treated as a defect |
| T-003 | JWT identity and Fabric identity used for a request don't actually match | Backend explicitly verifies correspondence before forwarding any chaincode call |
| T-004 | Default credentials (CA admin, PostgreSQL, MinIO) left unchanged before public exposure | Credential rotation required and checked before any tunnel is enabled |
| T-005 | Tunnel exposes ledger, CouchDB, CA admin, or storage admin interfaces | Tunnel ingress rules explicitly scoped to frontend + backend API ports only; tested negatively |
| T-006 | Uploaded file is swapped after its hash was recorded on-chain | Hash verified against file content on every retrieval, not only at upload time |
| T-007 | Ledger record is altered or deleted through a path other than chaincode | Ledger/CouchDB never directly reachable by any adapter; only chaincode may write |
| T-008 | Correction flow used to quietly overwrite history instead of creating a new linked record | Chaincode enforces append-only semantics; no update/delete function exists |
| T-009 | Chaincode upgraded ad hoc, breaking the audit trail of what logic applied when | Formal Fabric chaincode lifecycle (approve, then commit) required |
| T-010 | Secrets committed to version control | `.env` gitignored; only placeholder `.env.example` tracked; secret-scan check before any push |
| T-011 | Public tunnel left running unattended, expanding the exposure window unnecessarily | Tunnel activated only during active demo use |
| T-012 | Cross-origin requests to backend API from an untrusted origin | CORS restricted to the deployed frontend origin only |
| T-013 | Automated traffic overwhelms the host machine once a public link exists | Basic rate limiting on backend API |
| T-014 | Generated Fabric network config grants broader access than intended | Manual review of actual granted permissions required before use |
| T-015 | System Admin identity used to attempt a batch-submission action | Explicitly rejected at chaincode level, same as any other out-of-scope action |
| T-016 | Reference data entry deleted or overwritten instead of superseded | No update/delete chaincode function exists — structurally impossible, not just policy-forbidden |
| T-017 | A batch record's standards reference silently resolves to a later version instead of the version active at submission | Batch records store an immutable snapshot reference, not a live pointer |
| T-018 | System Audit Log entry altered or deleted after the fact | Database grant enforcement — application's DB role has INSERT only, holds even against an application bug |
| T-019 | Operational role gains read access to the System Audit Log | Route-level authorization restricted to System Admin only, tested explicitly |
| T-020 | API response includes a field a role isn't authorized to view | Field-level serialization enforced server-side, independent of frontend rendering |
| T-021 | AI explanation fabricates a compliance status not present in the actual batch data | Strict context-grounding in the system prompt; response carries explicit `source: ai_generated` flag; UI labeling mandatory |
| T-022 | LLM API provider receives more data than intended in the context payload | Backend retrieves and passes only the specific requested batch's records |
| T-023 | A third-party dependency contains a known vulnerability, introduced without detection | Dependency scanning required before any dependency addition is committed |
| T-024 | Repeated failed/denied access attempts go unnoticed because the audit log is purely passive | Audit Log Viewer highlights any identity with 3+ denied attempts within an hour |
| T-025 | JWT secret rotation performed without understanding its blast radius | Documented: rotation invalidates all active sessions immediately — accepted behavior, not an incident |

## 5. Security Requirements

- Deny by default: an action with no matching chaincode rule is rejected, not silently allowed.
- Every enforcement rule has a paired negative test before it's considered implemented.
- No adapter is ever treated as an authoritative source for anything ledger-related.
- Identity verification happens at both API and chaincode layers.
- All default credentials rotated before first public-reachable use.
- Reference-data write access enforced identically to batch-record writes.
- Audit log integrity treated as Critical tier, equivalent to chaincode and identity config.
- Any outbound call to a third-party service is treated as leaving the trust boundary entirely — data minimized to exactly what's needed.
- Field-level access rules live in one shared, auditable configuration.
- Dependency hygiene: no new dependency added without a scan pass.
- Concurrency correctness treated as security-adjacent: native MVCC is the accepted mitigation, no custom locking permitted.

## 6. Security Gates by Phase

### Build phase
- Chaincode identity checks use certificate attributes, confirmed not client-supplied strings.
- No default credentials remain in any component's configuration.
- System Admin identity confirmed structurally incapable of batch actions.
- Dependency scan passes cleanly at setup, re-run before hardening.

### Test phase
- Full enforcement test matrix passes.
- Tunnel negative-exposure test passes.
- Secret-scan check passes on the full repository.
- T-016 through T-020 all have passing negative tests.
- T-021 tested with deliberately adversarial questions.
- T-022 verified by inspecting the actual payload sent to the LLM API.
- T-024's highlight rule verified with seeded repeated-denial data.
- T-025 verified: rotate the JWT secret in a test environment, confirm sessions invalidate as documented.

### Pre-demo gate (required every time before sharing a link)
- Tunnel ingress rules re-confirmed.
- Fresh credentials confirmed still in place.
- Demo dataset confirmed clean of test-run debris.
- Audit log contains expected entries from the test run itself.

## 7. Known Limitations

- Single-host deployment means a compromise of that host compromises the whole system — no independent-organization redundancy at this stage.
- Tunnel-based exposure is inherently less hardened than a properly firewalled production deployment; acceptable for demo purposes given non-sensitive, synthetic data.
- No formal third-party security audit has been performed; this threat model is a design-time analysis, not a penetration-test result.
- The LLM API is a genuine external dependency with its own data-handling practices — this project doesn't control what the provider does with the payload beyond this system's own boundary.
- A single System Admin identity means no separation of duties within reference-data governance itself.
- Encryption at rest not configured for local Docker volumes — acceptable given synthetic demo data.
- Audit log alerting is display-layer only, not a real-time push notification — requires someone to open the Audit Log Viewer to see it.
