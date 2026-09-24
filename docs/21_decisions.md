# HALCHECK — Decision Log (ADR)

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

Each entry: Status / Decision / Reason / Consequence, matching the reference decision-log format used across this project's documentation.

---

## ADR-CT-000: V1 redefined — real Hyperledger Fabric, not simulated

**Status:** Accepted

**Decision:** V1 uses a real, self-hosted Hyperledger Fabric network rather than a browser-only simulated hash-chain.

**Reason:** A genuine tamper-evidence claim requires a real enforcing mechanism; a simulated version could only ever claim tamper-evidence within the app's own UI, not against direct data tampering.

**Consequence:** V1 is a real infrastructure build (Docker, Fabric network, backend API), not a static-only deliverable. Deploy/Production remains explicitly out of scope; Design, Build, and Test are the actual boundary.

## ADR-CT-001: Feature folded into existing documentation structure

**Status:** Accepted

**Decision:** Compliance Trail's documentation follows the same document-suite structure as its parent product, rather than a bespoke format.

**Reason:** Keeps documentation portable and consistent across related projects.

## ADR-CT-002: Four write-roles + one read-only role

**Status:** Accepted

**Decision:** Ingredient QA, Production QA, Compliance Officer, Export/Logistics Officer (write); Brand Owner (read-only).

**Reason:** Mirrors a separation-of-duties governance pattern scaled to a single-brand contract-manufacturing flow.

## ADR-CT-003: Business process = sourcing → production → compliance → export

**Status:** Accepted

**Decision:** Four-step batch lifecycle, starting at ingredient sourcing and ending at export release request.

**Reason:** Keeps the product a B2B compliance tool; matches its existing scope boundary.

## ADR-CT-004: Chain is authoritative for sequencing only

**Status:** Accepted

**Decision:** The ledger gates actions but does not reimplement the compliance engine's rule logic.

**Reason:** Avoids duplicating already-locked engine rules; keeps a clean separation between "who did what, in what order" and "is this halal-compliant."

## ADR-CT-005: Ingredient input via bulk upload, granular recording

**Status:** Accepted

**Decision:** Spreadsheet upload; one record per ingredient, grouped under a shared upload-session identifier. Manual single-ingredient add allowed, append-only.

**Reason:** Matches real industry documentation practice; granular recording preserves traceability to one ingredient.

## ADR-CT-006: Fail verdicts create a visible, permanent record

**Status:** Accepted

**Decision:** A compliance Fail is recorded with the same permanence as a Pass.

**Reason:** Demonstrates governance value and matches real audit-trail practice.

## ADR-CT-007: Real identity per role

**Status:** Accepted

**Decision:** Each role is issued a real cryptographic identity via the certificate authority.

**Reason:** Under the real-Fabric architecture, this identity is the accountability mechanism itself.

**Consequence:** Identity issuance is planned as part of Build (Implementation Plan P1), not treated as trivial seed data.

## ADR-CT-008: Corrections are new records, never edits

**Status:** Accepted

**Decision:** A corrected Fail creates a new linked record; the original remains visible.

**Reason:** Consistent with the "nothing is silently altered" principle; structurally enforced — no update/delete function exists in chaincode for submitted records.

## ADR-CT-009: Recognition-directionality is a labeled field within the verdict record

**Status:** Accepted

**Decision:** Not a separate record type; explicitly labeled within the compliance verdict detail view.

**Reason:** Preserves visibility of a distinctive rule mechanic without fragmenting the record model.

## ADR-CT-010: Trail export/print deferred past this release

**Status:** Accepted

**Decision:** In-app viewing only for now.

**Reason:** Scope discipline, while explicitly named as a likely near-term ask rather than silently dropped.

## ADR-CT-011: Persist in localStorage — SUPERSEDED

**Status:** Superseded by ADR-CT-000

**Replaced by:** PostgreSQL (off-chain cache) + Hyperledger Fabric ledger (authoritative state).

## ADR-CT-012: Hand-rolled SHA-256 hash-chaining — SUPERSEDED

**Status:** Superseded by ADR-CT-000

**Replaced by:** Fabric's native ledger tamper-evidence — no custom hashing logic needed for chain integrity itself.

## ADR-CT-013a: Known limitation is single-host, not tamper-evidence

**Status:** Accepted

**Decision:** The tamper-evidence claim is now genuinely real and does not need a caveat. The actual limitation to disclose is architectural: single-network, single-host deployment with no independent multi-organization redundancy.

**Reason:** Accuracy — the honest caveat moved when the underlying mechanism changed.

## ADR-CT-014: Hyperledger Fabric selected as the platform

**Status:** Accepted

**Decision:** Real implementation uses Hyperledger Fabric, a permissioned open-source blockchain framework.

**Reason:** Fits a small number of known, non-anonymous participants; supports channel-based data segregation; free and open source.

## ADR-CT-015: Local-only build (Phase 0–2), no hosted deployment

**Status:** Accepted

**Decision:** Design, Build, and Test happen entirely on local hardware, at no cost. Deploy/Production is explicitly out of scope for this release.

**Reason:** Matches available resources and honest scope discipline.

## ADR-CT-016: Remote access via Cloudflare Tunnel, not permanent hosting

**Status:** Accepted

**Decision:** A shareable public link is provided via tunnel, routing to the local host machine. Availability is explicitly host-dependent.

**Reason:** Enables demoing without carrying hardware to a location, without taking on Deploy/Production's cost/complexity.

**Consequence:** Tunnel must expose only frontend and backend API ports; all other services must remain unreachable externally (Security Threat Model T-005).

## ADR-CT-017: Vibe-coding guardrails apply with extra weight to chaincode and identity layers

**Status:** Accepted

**Decision:** Every enforcement rule requires a chaincode-level negative test; no rule may be enforced only in frontend or backend.

**Reason:** A silent enforcement gap in this specific project defeats its entire stated purpose.

## ADR-CT-018: Documentation kept agnostic — no personal or source-research attribution

**Status:** Accepted

**Decision:** All project documentation omits personal names and specific source-research references.

**Reason:** Keeps documentation portable and independently defensible on its own reasoning.

## ADR-CT-019: Same HALCHECK repository, bounded module

**Status:** Accepted

**Decision:** Compliance Trail lives in the `halcheck` repository as a bounded HALCHECK module.

**Reason:** HALCHECK is the product identity. The core screening app can remain browser-only while Compliance Trail is documented and built as a distinct infrastructure module in the same repository. This avoids maintaining two repos while preserving the architectural boundary through naming, directory structure, README language, and implementation phases.

**Consequence:** The README and repository docs must clearly distinguish HALCHECK Core from Compliance Trail. Build paths for `chaincode/`, `backend/`, `frontend/`, and `network/` belong to the Compliance Trail module and must not be used to imply the core screening app has a backend in v1.

## ADR-CT-020: Cumulative scope growth acknowledged and re-baselined

**Status:** Accepted

**Decision:** This project's actual scope grew substantially beyond its original V1 definition through a series of individually well-reasoned additions — System Admin role, reference data governance, centralized audit log, field-level RBAC, and AI trail explanation — none wrong in isolation, but never checked against the original plan's assumptions until an independent eight-review process surfaced this explicitly.

**Reason:** Each addition was proposed and accepted for a real, articulated reason. The gap was the absence of a checkpoint asking whether the aggregate still matched what "V1" was supposed to mean.

**Consequence:** Implementation Plan re-baselined from 5 sprints to 10 sprints, formally superseding the original estimate. Risk Register gained R-017 as a standing, permanent risk. Going forward, any new scope addition's ADR must explicitly answer whether it triggers another Implementation Plan re-baseline. This entry does not reverse or reduce any of the five additions — all remain in scope, all are now fully specified and traced.

## ADR-CT-021: Verdict authority is binding, not discretionary

**Status:** Accepted

**Decision:** The compliance engine's Pass/Fail output is final. The Compliance Officer role has no override capability.

**Reason:** Simpler than an advisory model, avoids a second layer of maker-checker complexity, and matches the existing principle that the engine is the sole compliance authority.

**Consequence:** FRD-CHAIN-VERDICT-005/006 formalize this; the verdict-recording action requires no second-party review, since the check is the deterministic engine output itself.

## ADR-CT-022: Concurrency handled via native Fabric MVCC, no custom locking

**Status:** Accepted

**Decision:** Simultaneous submission attempts against the same batch are resolved via Fabric's native read-write conflict detection.

**Reason:** Uses what the platform already provides rather than adding a new lock-management component that would itself need threat-modeling.

## ADR-CT-023: Chaincode deployed as two independent modules

**Status:** Accepted

**Decision:** `batch` and `refdata` chaincode deploy as two separate, independently upgradable definitions on the same channel.

**Reason:** They change for different reasons and at different times — a bug fix to reference-data logic shouldn't require redeploying batch logic, and vice versa.

## ADR-CT-024: Reference data linkage uses denormalized snapshots, not live foreign keys

**Status:** Accepted

**Decision:** Every record referencing standards, ingredients, or suppliers stores the literal resolved value as text at submission time.

**Reason:** Matches the ledger's event-sourced nature; avoids a subtle bug class where a live-referenced version could be edited instead of superseded.

## ADR-CT-025: UI copy language is English

**Status:** Accepted

**Decision:** All UI copy across every screen is in English.

**Reason:** Portfolio-audience-first framing, given this project's primary purpose as a demonstration piece.

## ADR-CT-026: Pre-build authority closure

**Status:** Accepted

**Decision:** Before P0, resolve the five authority and data-model gaps in TRD §23: chaincode-owned reference-data validation, signed verdict attestations, fail-closed audit delivery, a canonical Role × Field × Access matrix, and uniform ingredient/production correction linkage.

**Reason:** Each gap could otherwise make a backend behavior appear authoritative without a matching enforceable ledger rule, undermining the project's central proof claim.

**Consequence:** TRD §23 is a P0 prerequisite and its acceptance tests block P2 completion until implemented.

## ADR-CT-027: No cached trail views — the ledger stays the only read path

**Status:** Accepted (2026-09-18, during P5 closure)

**Decision:** Do not build the PostgreSQL trail cache that `13_implementation_plan.md` P5 specifies. `GET /batches`, `GET /batches/:batchId/trail`, and every reference-data read continue to query chaincode directly (off-chain storage keeps only what it legitimately owns: user accounts, the System Audit Log, idempotency keys, and MinIO evidence files).

**Reason:** P5's own exit criterion is "cached views stay consistent with ledger state" — a cache creates the divergence failure mode it then has to defend against. The project's first architectural rule is ledger-first: frontend and backend are clients of the ledger, never sources of truth. A cache buys read latency this system does not need (a single demo user, tens of batches, sub-second ledger reads measured live) at the cost of a second copy that can be stale after a correction, an export, or a verdict — precisely the records whose *current* value decides whether an action is allowed. The P5 index list ("`batch_id`, `timestamp`, `status`") describes indexes on that cache table; with no cache, it has no subject. `audit_log` keeps its `timestamp` index, which the one real off-chain query pattern (time-range scan plus the trailing-hour flagged window) actually uses.

**Consequence:** `13_implementation_plan.md` P5's cache and reconciliation bullets are superseded by this entry rather than silently dropped; the remaining P5 deliverables (audit log insert-only at grant level, MinIO evidence with server-computed hashes, indexes that match real query patterns) are implemented and proven live. Revisit only against a measured read-latency problem or a multi-user load where ledger reads demonstrably dominate — and if revisited, the cache must carry an explicit staleness marker and a re-fetch-on-read rule, never a silent mirror.

## ADR-CT-028: Idempotency responses are stored as TEXT, not JSONB

**Status:** Accepted (2026-09-18, found live during P4 verification)

**Decision:** `idempotency_keys.response_body` is `TEXT` and is round-tripped through `JSON.parse` on read, rather than `JSONB`.

**Reason:** Every submission response carries its record's reference-entry snapshot key, and those keys use `\u0000` as the separator between type, value and version (`chaincode/refdata` `referenceEntryKey`). Postgres' JSON parser rejects `\u0000` outright (`unsupported Unicode escape sequence`, SQLSTATE 22P05), so the placeholder-update after a successful chaincode call failed — and because that throw was unhandled, the first ingredient submission carrying an `Idempotency-Key` killed the backend process. The column is an opaque cached payload that is never queried by field, so JSONB bought nothing and cost correctness.

**Consequence:** `db/init/001_schema.sql` declares TEXT; the running database was migrated with `ALTER TABLE ... ALTER TYPE TEXT USING response_body::text`. A regression test (`idempotency/index.test.ts`, "round-trips a response body containing NUL characters") pins the behaviour, and every batch/refdata route now translates an unexpected error into a 500 response instead of letting it escape an async handler (which Express 4 does not forward, making any such throw fatal to the process).

## ADR-CT-029: The engine evaluates effective records, not every record present

**Status:** Accepted (2026-09-18, found live during P4 verification)

**Decision:** `backend/src/verdict/build.ts` excludes records that another record supersedes from the set it hands to the screening engine. The signed attestation's `input_digest` is unchanged by this — it still covers the batch's full record set, superseded records included.

**Reason:** TRD §23.5 makes corrections new, linked records; nothing is ever deleted. Without this filter the corrected record passed its rules while the original it replaced kept failing on every subsequent run, so a corrected batch could never clear its Fail — exactly what happened live on SL-2026-009 (correction recorded, re-recorded verdict still Fail against the superseded record's ID, export still blocked). The digest deliberately keeps covering everything the ledger holds, so the attestation still binds to the complete state rather than only the effective slice.

**Consequence:** Three tests in `backend/src/verdict/build.test.ts` cover the fail case, the corrected-pass case, and the full-state digest binding. The failure-lifecycle recovery arc (Fail → blocked export → correction → fresh Pass → export) is proven end-to-end through the API on SL-2026-010.

## ADR-CT-030: COA hashes are computed server-side only, and the upload route accepts a file

**Status:** Accepted (2026-09-18, found live during P5 closure)

**Decision:** `POST /batches/:batchId/ingredients` and `/ingredients/correct` accept an optional `multipart/form-data` file field. The hash recorded on the ledger is always this backend's own sha256 of the bytes it received and stored (`storage/coa.ts`); any `coaFileHash` present in a request body is dropped before the chaincode call.

**Reason:** The route previously passed `body.coaFileHash ?? ""` straight through, while its own comment and `docs/17_api_reference.md` §5 both stated the value was server-computed — a documented control with no enforcement behind it, which is the exact defect class `docs/18_vibe_coding_guardrails.md` §3 forbids. A caller could assert a hash for content that was never uploaded or verified, defeating Security Threat Model T-006's mitigation outright.

**Consequence:** `IngredientBody` no longer declares the field, `normalizeIngredientBody` deletes it defensively, and a file that arrives must be stored before the chaincode call runs — if storage is unavailable the submission fails closed with `storage_unavailable` rather than silently recording an empty hash. Proven live: a multipart upload's ledger hash matched the file's local sha256; a JSON body carrying a fake hash stored empty; an `.exe` was rejected. CSV bulk upload intentionally sends no COA hash, since one file cannot be attributed to one row.

## ADR-CT-031: Expected business rejections map to 4xx, never 500

**Status:** Accepted (2026-09-18, found live during P4 verification)

**Decision:** `no_valid_verdict` maps to HTTP 400 in `gateway.ts`'s `reasonToHttpStatus`, alongside `duplicate_entry`, `already_deprecated` and `sequencing_violation`.

**Reason:** Requesting export without a current Pass verdict is a correct, expected refusal, but the reason had no case in the mapping and fell through to 500 — so the UI would have presented a business rule as "the system is broken". Grouping it with the other state rejections keeps the project's existing convention rather than introducing a one-off 409.

**Consequence:** The recovery arc now returns 400 with `no_valid_verdict` at the blocked-export step, verified live on SL-2026-010. Any future chaincode reason code must be added here deliberately; the default remains 500 so a genuinely unexpected failure is never disguised as a client error.

## ADR-CT-032: A ledger interruption requires restarting the backend (known limitation)

**Status:** Accepted as a documented limitation (2026-09-18, found live during P4 verification)

**Decision:** Do not treat backend recovery from a ledger interruption as automatic. Document the operational step: after the orderer or peers are restarted, restart the backend process too.

**Reason:** When the orderer was stopped mid-submission, the backend correctly refused to report success and wrote no record — but once the ledger was healthy again, the long-running process kept returning `ledger_unavailable` while a fresh process running identical code and configuration succeeded immediately. The captured cause was `UNAVAILABLE: no orderers could successfully process transaction — dial tcp: lookup orderer.example.com on 127.0.0.11:53: no such host`, i.e. a connection poisoned by the interruption that the process never rebuilt. Making the peer connection per-request rather than process-wide removed one class of stale state but did not close this one; the remaining state lives inside the SDK's own orderer channel.

**Consequence:** `docs/24_demo_runbook.md` lists the restart as step one of recovery, and the underlying error is now logged with its gRPC code and detail instead of collapsing to a bare reason code. Duplicate-safety is unaffected and separately proven: a submission interrupted by the outage left zero records, and a retry with the same idempotency key produced exactly one. Replacing this workaround with a real reconnection strategy is an open follow-up, not a claim.

## ADR-CT-033: Compliance facts are snapshotted at submission; the verdict engine stops using the dataset as its vocabulary

**Status:** Accepted and implemented, proven live (2026-09-18) — Critical tier

**Context:** On SL-2026-021 a System Admin added an ingredient and supplier through the governance shell, Ingredient QA submitted them, and the Compliance Officer's verdict then failed with `ledger ingredient/supplier ("Test1"/"PT Test1") not found in the active dataset release`. The ledger accepted the values — they were valid reference data — while the engine's vocabulary lived in a frozen JSON release, so one compliance fact had two owners and only one of them could change at runtime. The failure landed on the one role with no remedy.

**Decision:** Two changes, both required.

1. **Chaincode, at submission** (`batch.go`'s shared ingredient writer, so `SubmitIngredient` and `CorrectIngredient` both get it): alongside the already-snapshotted halal risk classification, read the supplier reference entry's `verificationStatus` from its metadata and store it on the `IngredientRecord`.
2. **Verdict bridge** (`backend/src/verdict/build.ts`): build each evaluation target from the batch's own records — entries, versions, classification and verification status — instead of looking ingredient and supplier names up in `activeDatasetRelease`. The release keeps two jobs only: the rules/standards and recognition agreements, and a fallback for records written before this field existed.

**Reason:** The decisive constraint is the attestation binding. `input_digest` is computed over the batch's records, so any evaluation input held outside them means the signature attests to an incomplete input set — which is precisely the claim this system exists to make. ADR-CT-024 already settled the same question for standards ("denormalized snapshot, not a live foreign key"); this extends that decision to the facts the rules consume. It also keeps reference data where the project's own rules put it: changeable only by System Admin, and never refused by a downstream component.

**Alternatives considered:**

- *Reject at reference-add time if the value is absent from the engine dataset.* Rejected: it inverts authority, making a frozen file the gatekeeper over the governed reference list, and it would refuse a System Admin action the chaincode is supposed to enforce.
- *Engine reads reference data live at verdict time.* Rejected on three counts: it leaks the metadata/storage shape into the engine (Ousterhout's information leakage), it creates a derived copy with no propagation or repair path (Kleppmann's derived-data rule), and it moves evaluation inputs outside the digested record set.
- *Generate the dataset release from reference data at build time.* Rejected: it keeps two copies and adds a sync step that can be forgotten, without removing the failure mode at runtime.

**Consequence:** This is a chaincode change, so it is Critical tier per `docs/18_vibe_coding_guardrails.md` §2: paired negative tests, line-by-line human review, and deployment through the formal Fabric lifecycle (approve then commit) rather than an ad hoc redeploy. The compatibility path for pre-existing records must be invisible behind one contract — Ousterhout's rule from the review: a "which generation is this record?" mode flag in the verdict path would be exactly the temporal coupling the snapshot is meant to remove. One intended, documented behaviour follows: changing a supplier's verification status later does **not** change an already-recorded verdict for a past batch, because that batch's facts were locked when they were recorded. Verdicts remain reproducible, and a System Admin can add any ingredient or supplier with no developer involvement and no file edit.

**Implemented (2026-09-18).** As described, plus four things the implementation forced into the open. Full deploy/proof record: `docs/14_developer_setup.md` §1.10.

1. **A supplier entry with no verification status is refused at submission, not guessed at.** `batch.recordIngredient` — the shared writer, so `SubmitIngredient` and `CorrectIngredient` behave identically — rejects with `missing_reference_metadata` (HTTP 400, ADR-CT-031's rule) rather than recording an empty value. The alternative ("no metadata means unverified") would have let a verified supplier be silently written into a signed attestation as unverified; refusing instead mirrors ADR-CT-030's `storage_unavailable`, which already settled that a missing input to a legality-relevant field fails the submission rather than being fabricated. The refusal is deliberately *not* enforced in `refdata.AddReferenceEntry`: this ADR's own rejected alternative is a service refusing a System Admin's governance action. The consumer refuses to record what it cannot bind; the governor's authority is untouched.
2. **The live reference data had to be completed, because the fact had no owner there at all.** All three supplier entries on the ledger predated this change and carried no metadata, so every ingredient submission from them would have been refused. Each was deprecated and re-added as version 2 with its status, through the governed API as the System Admin (`PT Sumber Alam Nusantara` → verified, `PT Distribusi Kosmetik Prima` → unverified, `PT Test1` → verified). This is a one-time data completion, not a migration mechanism: nothing that already exists on the ledger is rewritten or backfilled, and records that cited version 1 keep citing version 1.
3. **The dataset workaround entries stay.** `Test1` and `PT Test1` were added to the frozen 2026.07 release on 2026-09-18 to work around this defect. They are now unnecessary for any *new* record — but a pre-existing record whose supplier is in neither the record nor the release has no remaining owner for that fact, and the close of that hole is exactly what those two entries provide for SL-2026-021's already-written record. A frozen release is not edited to tidy up a workaround that still has a live job; removing them is a decision for the next release, not this one.
4. **An unrecognized status value is not a rejection.** The chaincode stores whatever `verificationStatus` the governed entry carries, verbatim, and the engine's own rule ("anything other than `verified` is not verified") means an unknown value fails closed rather than being coerced or refused — the chaincode stays out of a vocabulary `refdata` owns (this ADR's rejected alternative, applied one level down).

**Proven live, on the real network** (deployed as `batch` v1.1, sequence 6): a System Admin added a brand-new ingredient and supplier through the governance shell; Ingredient QA submitted them on a fresh batch; the Compliance Officer's signed verdict came back **Fail / Unverified ingredient source** — the exact SL-2026-021 path, which previously could not produce a verdict at all. Export was then blocked (`no_valid_verdict`), the flagged record was corrected to a verified supplier, the re-recorded verdict was **Pass** (digest recomputed over the corrected and original records), and export succeeded. The paired negative test ran live too: a submission against a supplier entry with no status was refused as `missing_reference_metadata` leaving the batch's trail completely empty. The documented immutability behaviour was confirmed the hard way: verifying that supplier afterwards left the batch's verdict at Fail with an unchanged digest, while a record written after the change resolved the new version and snapshotted `verified`. Pre-existing records were re-verified through the release fallback unchanged (`SL-2026-003` → Fail, `SL-2026-021` → Pass).

**Open, honestly:** the fallback keeps one failure mode alive — a pre-existing record (written before this field existed) whose supplier is in neither the record nor the release makes `buildAttestation` throw `engine_dataset_mismatch` (500). No new record can reach it, since the chaincode now refuses that submission, and no runtime remedy exists for the old ones (the ledger cannot be rewritten). It is a defect report about two governance sources having drifted, not an expected refusal, which is why it stays a 500 rather than being softened into a guess.

## ADR-CT-034: The ledger's guarantees are demonstrated by the ledger, and verification needs no account

**Status:** Accepted and implemented, proven live (2026-09-18) — Critical tier

**Context:** A product review asked the question every evaluator eventually asks — *if one operator runs all six roles on one machine, and the app says "stored", what has actually been proven?* The answer at the time was: not enough, and in three specific ways that were verifiable in the code rather than a matter of taste.

1. The **Integrity Sandbox**, the demo's headline "the system refuses" moment, returned canned responses. Its own comment said so: *"Both modes always reject by design -- no chaincode call, nothing to submit or evaluate."* Nothing reached the ledger, and (found in the same review) nothing reached the audit log either.
2. The **evidence-verification path** was dead code. `storage/minio.ts`'s `downloadAndVerify` — the actual enforcement point for threat T-006, re-hashing a retrieved certificate against the hash on its immutable record — had no caller anywhere in the running product, so the mitigation the threat model rests on had never executed.
3. The **verdict attestation was unverifiable by design**. `RecordVerdict` verified the officer's ECDSA signature and then discarded both the signature and the signed payload, keeping only the digest. That proves what was evaluated, not who attested to it — and made the system's strongest claim impossible for anyone else to check.

This matters because the project's own documents already promised otherwise. The charter's strategic reset (ADR-CT-000) explicitly rejected *"Mocked hash-chain in browser storage, simulating blockchain behavior"* in favour of *"Tamper-evidence claim genuinely true, not simulated"*; its third guiding principle is *"Every claim made about this system must survive being directly questioned"*; and the PRD's success metric is that *"a reviewer can independently verify tamper-evidence by attempting an edit and observing the failure."* The canned sandbox was the rejected original direction, relocated from the browser into the backend.

**Decision:** Four changes, each making an existing claim checkable rather than adding a new claim.

1. **The sandbox talks to the ledger.** Mode 1 submits a real update transaction to the deployed contract — which has no update function, so the refusal (`Function UpdateIngredientRecord not found in contract BatchContract`) is the chaincode's own — and, alongside it, alters one byte of the record's *actual stored bytes* and re-hashes, so the digest rule is exercised rather than asserted. Mode 2 resolves the typed value through `refdata.ResolveActiveReference` on the live ledger, and only for a value the ledger genuinely does not recognize — and only for `ingredient_qa` — also attempts a real submission, so the rejection the user sees is the chaincode's. Neither mode can write: there is no update function, and the submission path resolves reference data before it writes. Attempts are now audited (`sandbox_attempt`).
2. **`GetBatchIntegrity`** returns each ingredient/production record's stored bytes and hash, in digest order, plus the batch's own `effective_input_digest` — the raw material for recomputing the digest instead of trusting a field that says it is fine. It returns the bytes verbatim, never a re-serialization: a struct round-trip would drop fields this contract does not know about and change the hash of a record nobody touched.
3. **The attestation and its signature are stored** on the `VerdictRecord` (both optional, since verdicts recorded before this change have neither), and `GetAttestationPublicKey` publishes the key signatures are verified against. The evidence route (`GET /batches/:id/ingredients/:recordId/coa`) gives `downloadAndVerify` its first caller, re-hashing on every retrieval.
4. **A proof bundle and an account-free verifier.** `GET /batches/:id/proof-bundle` emits a self-contained artifact (records + hashes + digest + signed verdicts + public key). `src/proof/verifyProofBundle.ts` checks it with no application, no Fabric client, no network and no login — the same module behind the CLI (`npm run verify:proof`, exit 0/1 so it can gate CI) and the public `/verify` screen.

**Alternatives considered:**

- *Return a boolean from the chaincode (`VerifyBatchDigest`) and display it.* Rejected: a verifier that asks the system under scrutiny whether it is honest has verified nothing. The bundle exists so the check can happen somewhere that is not this system.
- *Verify the signature in the backend and label it "verified" in the UI.* Rejected for the same reason, and because it would have kept the browser's verification dependent on the API it is supposed to be checking.
- *Leave the sandbox as a demonstration, documented as simulated.* Rejected: the charter already rejected exactly that, and a demo that asserts refusals it never makes is the failure mode this project exists to argue against.
- *Add a `verifier` role.* Rejected (YAGNI, and a role is a weaker claim than no account at all): the bundle is portable, so verification needs no seat in this system.
- *Expose enrichment of the digest for every role including reference entries' raw bytes.* Rejected: reference entries carry admin-only `metadata` (TRD §23.4), so the integrity surface is scoped to batch records, which carry none.

**Consequence:** `batch` deployed as **v1.2, sequence 7** through the full formal lifecycle (package, install on both peers, approve both orgs, commit). New chaincode read functions (`GetBatchIntegrity`, `GetAttestationPublicKey`) carry no role restriction, matching `GetBatchTrail`: they expose what the trail already exposes, in hashable form. A new audit event type (`sandbox_attempt`) required both a schema edit and a live `ALTER TYPE` on the running database — the pattern ADR-CT-028 established. Verdicts recorded before this change carry no attestation and are reported as such by the verifier (`info`, never `fail`) rather than being presented as checked. `docs/17` §17-20 documents the endpoints, `docs/11` §10/§16/§17 the screens, `docs/14` §1.11 the deploy and its live proof. Two integration assumptions were caught only by running it against the live network: contractapi returns a bare string as raw bytes (not JSON), and raw chaincode responses are snake_case where the RBAC-serialized ones are camelCase — both fixed and commented.

**Proven live:** batch `SL-2026-026` — ingredient with a real certificate of assurance uploaded, production confirmed, verdict recorded with its attestation and signature stored; `GET /proof-bundle` → the CLI verifier reports **7 checks, 0 failures, exit 0**; one byte of a record flipped in the bundle → **2 checks fail, exit 1**; the fetched certificate re-hashes to the same value as the ledger record and the file's own sha256; sandbox mode 1 returns the contract's own `Function UpdateIngredientRecord not found` with two differing hashes, and mode 2 the ledger's own `not_a_recognized_value` twice (resolve, then submission) with the batch's trail unchanged afterwards.

## ADR-CT-035: `ALLOWED_ORIGIN` is a list, and the local origin always stays on it

**Status:** Accepted and implemented (2026-09-19)

**Context:** The first attempt to drive the product through a real browser (rather than curl) could not log in at all. Two leftovers from the tunnel work were responsible, and neither was visible to any API-level check:

1. `frontend/.env.local` still pointed `VITE_API_BASE_URL` at a quick-tunnel host that had died with its `cloudflared` process, so the browser called a host that no longer existed.
2. The backend's `ALLOWED_ORIGIN` named only that same dead tunnel URL, so even with the right API base the browser's `Origin: http://localhost:5173` would have been refused.

Every `curl`-based verification in this project passes straight through both: curl does not enforce CORS and does not read Vite's environment. The failure therefore existed for as long as the tunnels had been down, in the one configuration the runbook tells an operator to use.

**Decision:** `ALLOWED_ORIGIN` takes a comma-separated list (`parseAllowedOrigins` in `backend/src/index.ts`), and the local origin is one of the entries whenever the app is also reachable through a tunnel. `backend/.env.example`, `docs/15` and `docs/25` show the list form; `.gitignore` covers `.env.local.disabled-*` so a disabled tunnel env file can be kept rather than deleted.

**Reason:** A single-value origin makes the two ways of reaching the same app mutually exclusive, and it fails *silently in the browser only* — the exact class of defect this project's "prove it live" discipline exists to catch, which is also why it survived a dozen passing curl checks.

**Consequence:** Locally, `frontend/.env.local` is now renamed to `.env.local.disabled-stale-tunnel` (recoverable, gitignored) and the frontend dev server reads the `http://localhost:3001/api/v1` default again; the backend lists both origins. `backend/src/index.test.ts` pins the parsing (default, single, list with whitespace). The symptom is recorded in `docs/24` §5's breakage table, because "the UI says the backend is unreachable while curl is fine" is now a known, one-minute fix rather than a mystery.

## ADR-CT-036: Pre-snapshot compatibility data is its own file, not part of the release's vocabulary

**Status:** Accepted and implemented (2026-09-24)

**Context:** ADR-CT-033 removed the engine's dependence on a frozen dataset for the facts it evaluates, but left one shim in place: records written before supplier verification status was snapshotted have none, so the bridge falls back to looking the supplier up *in the release*. To keep one such batch evaluable, the release's `suppliers.json` and `ingredients.json` each gained an entry that came from the **ledger's governed reference list**, not from the screening vocabulary — and because the release is also what the screening app offers in its dropdowns, those entries showed up as selectable demo data. A public demo screenshot promptly contained `Test1`, a value whose only reason to exist is a single pre-2026-09-18 ledger record.

That is the original defect of ADR-CT-033 in miniature: one file, three jobs (rules, screening vocabulary, compatibility shim), and the job with the weakest claim to the data winning the display.

**Decision:** Move the shim into `dataset/releases/2026.07/legacy-record-facts.json`, a file that says what it is for, why it exists and when it can be deleted; remove those entries from `ingredients.json` and `suppliers.json`; and point `resolveSupplierVerificationStatus` at the new file. The release keeps the rules, the screening vocabulary and the recognition agreements. The two files may legitimately overlap (a canonical supplier can also be a pre-snapshot fact) but must never disagree, and a unit test now pins exactly that.

**Alternatives considered:**

- *Delete the entries.* Rejected: the pre-snapshot record they exist for is real and immutable, and without them its batch stops being evaluable — turning ADR-CT-033's one documented residual failure mode from theoretical into actual.
- *Keep them in the release and hide them in the app's dropdowns.* Rejected on the project's own rule: this repository does not put a rule in the UI that has no home underneath it. A `demoVisible: false` flag would also have added a per-entry concept to the vocabulary for one old record's sake.
- *Rename the entries to something presentable.* Impossible, and instructively so: the fallback matches a record's `source_snapshot` **by name**, so the name is the join key. Renaming would silently stop matching.
- *Move the shim into chaincode as a fallback for records without a snapshot.* Rejected: it would put screening data in the ledger's authoritative module, and the ledger has no business knowing what a frozen release once said.

**Reason:** The two files are frozen together but answer different questions — "what may this app offer, and what does the engine resolve?" versus "what did the governed list say on the day the snapshot rule took effect?". Separating them by purpose means the shim can be deleted in one step when the last pre-snapshot record stops mattering, and nothing else has to change.

**Consequence:** The screening vocabulary no longer contains `Test1` or `PT Test1`; a live re-check confirmed the bridge still evaluates the pre-snapshot batch that needed them (via the new file), and `src/data/__tests__/datasetVocabulary.test.ts` fails if either file drifts — either by a compatibility-only value appearing in the vocabulary, or by the two disagreeing about a supplier they both name.
