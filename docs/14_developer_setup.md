# HALCHECK — Developer Setup / Installation Guide

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Status

Design phase complete. Build phase started — P0 (local network foundation) is proven end-to-end as of 2026-08-22. This guide's install steps have now actually been run and verified, not just planned.

### 1.1 P0 — Proven Environment (2026-08-22)

Exact versions confirmed working on the target machine:

```text
Docker:  29.6.2 (build dfc4efb)
Go:      go1.26.5 darwin/arm64
peer:    v2.5.15 (Commit 83c7930, built with go1.26.0), darwin/arm64
Node.js: v26.0.0
npm:     11.12.1
```

`fabric-samples` pinned at commit `05edea0` (checked out to a working directory outside the repo — see `.gitignore` discipline in `19_repository_structure.md`; never commit generated Fabric material).

**Proven end-to-end:**
- `test-network` brought up with the default 2-org topology (Org1, Org2), Raft orderer, CAs for org1/org2/orderer.
- `compliancetrail` channel created; both peers joined.
- Official `basicgo` sample chaincode installed on both peers, approved by both orgs, and **committed** to the channel (sequence 2 — see note below).
- Sample transaction proven both ways: `InitLedger` submitted successfully (endorsed by both orgs, committed VALID), then `GetAllAssets` queried and returned the expected 6 seeded assets.

**Note on sequence 2:** commit readiness initially reported the required sequence as 2, not 1, meaning an earlier approval attempt at sequence 1 had already been made (by a prior session) before this checkpoint. Re-approving at sequence 2 for both orgs and committing at sequence 2 resolved it cleanly — consistent with Fabric's formal lifecycle (approve, then commit; no ad hoc redeployment, per `18_vibe_coding_guardrails.md` §9.6).

### 1.2 P1 — Proven Identity Setup (2026-08-22)

All 6 roles issued real Fabric CA identities against `ca-org1`, each registered as a `client`-type identity carrying a custom `role` attribute (`:ecert` — embedded in the issued certificate, requested again explicitly at enroll time via `--enrollment.attrs "role"`), matching `06_erd.md`'s `IDENTITY.role` enum exactly:

```text
ingredient-qa        -> role=ingredient_qa
production-qa        -> role=production_qa
compliance-officer   -> role=compliance_officer
export-officer       -> role=export_officer
brand-owner          -> role=brand_owner
system-admin         -> role=system_admin
```

Enrolled MSPs live at `organizations/peerOrganizations/org1.example.com/users/<id>@org1.example.com/msp` inside the `fabric-samples` checkout (never committed to this repo — same discipline as any other generated identity material).

**Proven, not just issued:** a throwaway verification chaincode (`identity-probe`, a `WhoAmI` function calling `cid.GetMSPID`/`cid.GetAttributeValue` — kept outside this repo, distinct from the real `chaincode/batch`/`chaincode/refdata` modules P2 will define) was packaged, installed on both peers, approved by both orgs, and committed. Invoked once per identity, it returned each identity's exact `role` value read from live chaincode context — not just confirmed present in the certificate:

```json
{"mspId":"Org1MSP","hasRole":true,"role":"ingredient_qa", ...}
{"mspId":"Org1MSP","hasRole":true,"role":"production_qa", ...}
{"mspId":"Org1MSP","hasRole":true,"role":"compliance_officer", ...}
{"mspId":"Org1MSP","hasRole":true,"role":"export_officer", ...}
{"mspId":"Org1MSP","hasRole":true,"role":"brand_owner", ...}
{"mspId":"Org1MSP","hasRole":true,"role":"system_admin", ...}
```

Submit capability (not just query) proven for two representative identities — `ingredient-qa` and `system-admin` each submitted a `CreateAsset` transaction against `basicgo`, endorsed by both orgs and committed, then read back successfully.

**P1 exit criteria met:** "six distinct, verifiable identities exist and can be used to submit test transactions" (`13_implementation_plan.md` P1).

**Update:** Docker Hub connectivity, unreachable during P0, came back during P2 (confirmed by a successful `alpine` pull). `scripts/backup-volumes.sh` itself still hasn't been run — retry before P0 is considered fully closed.

### 1.3 P2 — Chaincode Core Rules, first slice proven live (2026-08-22)

`refdata` (`AddReferenceEntry`, `DeprecateReferenceEntry`, `ResolveActiveReference`, `GetReferenceEntryHistory`, `ListReferenceEntries`) and `batch` (`CreateBatch`, `SubmitIngredient`) are unit-tested (39 tests total, both modules) and deployed live to the `compliancetrail` channel as independently upgradable chaincode (`ADR-CT-023`).

**Real cross-chaincode invocation proven, not mocked:** `batch.SubmitIngredient` calls `refdata.ResolveActiveReference` via genuine `stub.InvokeChaincode` (TRD §23.1) — proven on the live network as `ingredient-qa`, not just via the isolated-by-design unit test mock (`docs/07_test_strategy.md` §2 deliberately keeps unit tests isolated from the network; this is the network-level counterpart):

```text
CreateBatch("Malaysia")                          -> SL-2026-001
SubmitIngredient(SL-2026-001, "Aqua", "PT Sumber Alam Nusantara", ...)
  -> ingredient_reference_entry_id and supplier_reference_entry_id
     exactly match refdata's real composite keys and versions
  -> halal_risk_flag correctly auto-populated from refdata's metadata
```

Both rejection paths also proven live: an unrecognized ingredient value is rejected with refdata's own `not_a_recognized_value` message, propagated unchanged across the cross-chaincode call; a non-`ingredient_qa` caller (`compliance_officer`) is rejected with `role_scope_violation`.

`ConfirmProduction` (Production QA, `FRD-CHAIN-PROD-001/002`, `FRD-CHAIN-SEQUENCE-001`) was added, unit-tested (22 `batch` tests total), and deployed as v1.2 (sequence 3) with the `metadata` struct tags applied proactively from the start this time -- worked live on the first deployment, no repeat of the v1.1 incident:

```text
AddReferenceEntry("standard", "CPKB", ...)   as system-admin
ConfirmProduction(SL-2026-001, true)         as production-qa
  -> standard_reference_entry_id/version exactly match refdata's real state

ConfirmProduction(SL-2026-002, true) against a batch with no ingredient yet
  -> rejected live: sequencing_violation
```

**A real bug this deployment step caught, that unit tests structurally could not:** contractapi generates its own JSON schema for every transaction's return type and validates the actual response against it. Schema-required vs. optional is driven entirely by a dedicated `metadata:"...,optional"` struct tag — the `json:",omitempty"` tag has no effect on it. `ReferenceEntry`'s `superseded_by`/`deprecated_by`/`deprecated_at` (correctly empty and omitted from the JSON for a freshly-added entry) failed contractapi's schema validation on the very first live invoke, because those fields were schema-required by default. Unit tests never exercised this: they call the Go functions directly, bypassing `contractapi.ContractChaincode.Invoke()`'s dispatch and schema-validation layer entirely. Fixed by adding the missing `metadata` tags to every optional field in both `ReferenceEntry`, `ReferenceEntryHistoryItem`, and `IngredientRecord`; redeployed as v1.1 (sequence 2) on both chaincodes. This is the concrete argument for why `docs/07_test_strategy.md`'s "Chaincode Conformance Tests ... tested against the full local network (not mocked)" layer exists as its own category, not a redundant repeat of unit tests.

A second infrastructure lesson from the same session: a multi-hour-old Docker daemon hiccup left both peers' internal chaincode-container tracking stale (a `basicgo` container had silently exited; new chaincode builds for `refdata`/`batch` never even started). Symptom was `"No such image"` on every invoke with no new build attempt logged. Fix was a plain `docker restart` of both peer containers — safe, no ledger data lost (peers reload existing ledger state from disk) — after which builds proceeded normally.

### 1.4 P2 — Binding verdict attestation, proven live (2026-08-22)

`RecordVerdict` implements TRD §23.2's full signed-attestation scheme: a real ECDSA P-256 keypair was generated for local testing (the private key lives at `/private/tmp/fabric-samples-halcheck-p0/verdict-attestation-key/private.pem`, entirely outside this repository — same discipline as every other piece of generated crypto material; the public key is compiled directly into `chaincode/batch/batch.go`, matching TRD's "a verification-key change requires a reviewed chaincode lifecycle upgrade"). Deployed as `batch` v1.3 (sequence 4), 31 `batch` tests passing.

**What `RecordVerdict` actually checks, in order:** (1) caller is `compliance_officer`; (2) the attestation's ECDSA signature verifies against the compiled-in public key; (3) the referenced batch exists; (4) the attestation's `intended_market` matches the batch's own immutable value; (5) a production record exists for the batch (`FRD-CHAIN-SEQUENCE-002`); (6) the attestation's `input_digest` is independently recomputed from the batch's *actual current* ingredient/production records and compared — a stale attestation (e.g. signed before a correction landed) is rejected, not silently accepted; (7) the governing regulation is resolved through `refdata`, same cross-chaincode pattern as ingredients/suppliers/standards; (8) for a Fail result, `fail_reason` and `flagged_record_id` are both required, the flagged record is verified to actually exist on the batch, and the fail reason is resolved through `refdata`'s catalog.

**Proven live with a genuinely signed attestation, not a test fixture:** the exact JSON bytes `SubmitIngredient`/`ConfirmProduction` had already returned (captured in §1.3) were reused directly — since `contractapi`'s response serialization and `PutState`'s stored value both come from marshaling the same Go struct, those captured bytes are byte-identical to what's on the ledger. A small throwaway Go program (not committed to this repo) reconstructed the two records as real Go structs (so `\x00` composite-key delimiters serialize identically to what the chaincode itself produces), computed the real SHA-256 digest, built the attestation, and signed it with the real private key:

```text
RecordVerdict(attestation, signature) as compliance-officer
  -> status: "pass", regulation_snapshot: "PP 42/2024"
  -> engine_attestation_digest exactly matches the independently-recomputed digest
  -> engine_version/rules_release recorded exactly as attested

RecordVerdict(same attestation) as export-officer (wrong role)
  -> rejected live: role_scope_violation
```

Unit tests additionally cover (all passing, none yet re-proven live beyond the two cases above — the pattern established in §1.3 applies here too): a tampered payload (signature no longer matches), a payload signed by the wrong key entirely, a mismatched `intended_market`, a stale/wrong `input_digest`, a Fail result missing `fail_reason` or `flagged_record_id`, a Fail result whose `flagged_record_id` doesn't exist on the batch, and a `recognition_check` block passed through unchanged.

### 1.5 P2 — Export release, and the full batch lifecycle proven live (2026-08-22)

`RequestExport` closes the batch lifecycle: `CreateBatch -> SubmitIngredient -> ConfirmProduction -> RecordVerdict -> RequestExport`, all five functions now built, unit-tested (38 `batch` tests), and deployed live as v1.4 (sequence 5).

**A design decision worth its own record:** multiple verdicts can legitimately exist for one batch over time (Fail → correction → a fresh Pass, TRD §23.5), and their `record_id`s are transaction IDs, not a sortable sequence. Determining "the current verdict" by comparing `Timestamp` strings was considered and rejected — two verdicts recorded within the same second (a real possibility, and a certainty against a fixed mock timestamp in tests) would tie. Instead, `RecordVerdict` now also writes a single, always-overwritten `latestVerdictPointer` key per batch, updated every time a verdict is recorded. `RequestExport` reads only that pointer. This required touching `RecordVerdict` again after it was already deployed (v1.3 → v1.4) — a legitimate, transparent addition, not a redo of already-accepted work. Proven directly: a unit test (`TestRequestExport_LatestVerdictGovernsNotAnyPass`) records Pass then Fail for the same batch and confirms export is blocked by the *second* verdict, even though a Pass exists earlier in the batch's history.

**A real deployment-only consequence of the same design decision:** the Pass verdict recorded live in §1.4 (under v1.3) predates the pointer-writing logic and therefore has no pointer entry — chaincode upgrades don't retroactively re-execute past transactions. `RequestExport` correctly reported `no_valid_verdict` against it until the *same* signed attestation was resubmitted under v1.4, which populated the pointer for the first time. Not a bug; the expected, correct consequence of adding new write behavior to an already-deployed function.

**Proven live, in full:**

```text
RequestExport(SL-2026-001) as export-officer, after re-recording the Pass verdict under v1.4
  -> destination_market: "Malaysia" -- copied from the batch's own intended_market,
     no parameter accepted for it at all

RequestExport(SL-2026-001) a second time
  -> rejected live: duplicate_entry -- export is one-way, one-time

RequestExport(SL-2026-002) against a batch with no recorded verdict at all
  -> rejected live: no_valid_verdict
```

### 1.6 P2 — Correction-mode ingredient/production submission, proven live (2026-08-22)

`CorrectIngredient`/`CorrectProduction` implement TRD §23.5's uniform correction model, closing out P2's function set: `SubmitIngredient`/`ConfirmProduction` were refactored into thin role/state wrappers plus a shared `recordIngredient`/`recordProduction` writer (`supersedesRecordID == ""` for the plain path, the flagged record's ID for the correction path) -- behavior-preserving, confirmed by all 38 pre-existing `batch` tests passing unchanged before any new test was added. 53 `batch` tests total (a `TestCorrectProduction_PassVerdictRejected` test was added in a subsequent documentation-alignment review, closing a literal gap against TRD §23.6's required-test wording: "reject all incorrect role, record, duplicate, and premature correction attempts" for the Production QA path specifically). Deployed live as v1.5 (sequence 6), then v1.6 (sequence 7) for a same-session error-message wording fix (below).

**What a correction call actually checks, in order:** (1) caller is the record type's owner role (`ingredient_qa`/`production_qa` -- the same role that owns plain submission); (2) the batch exists; (3) a `currentFlaggedRecord` helper derives *which* record to correct from the batch's own ledger state -- the batch's latest verdict (via the existing `latestVerdictPointerKey`) must be Fail, and that Fail's `flagged_record_id` must actually exist as a record of the *matching* type (a Fail that flagged a production record is refused by `CorrectIngredient`, and vice versa -- `sequencing_violation`, not silently accepted against the wrong record); (4) an `isSuperseded` helper checks no correction has already been submitted against that exact flagged record (`duplicate_entry` -- only one correction is ever valid per flagged record). There is deliberately no parameter anywhere for a caller to name which record to correct; it is always derived from the ledger, matching how Screen Requirements §6 describes the correction screen working. The original flagged record is never touched -- the correction is a brand-new record with `supersedes_record_id` set, the same append-only discipline as every other write in this module.

**Caught during live proving, not by unit tests:** the `currentFlaggedRecord` -> "wrong record type flagged" rejection path initially worked correctly but read awkwardly (`"did not flag a ingredientRecord record"` -- the raw internal composite-key object type leaking into a user-facing message). Fixed to `"did not flag any ingredient record"`, unit tests re-run clean, redeployed as v1.6 (sequence 7) and the exact live rejection re-verified. A wording fix only -- no behavior change -- but treated with the same formal lifecycle (package/install/approve/commit) as every other change to this module, per `18_vibe_coding_guardrails.md` §9.6's no-ad-hoc-redeploy rule.

**Proven live, in full**, using two fresh batches (`SL-2026-003`, Malaysia; `SL-2026-004`, Indonesia) each carried through `CreateBatch -> SubmitIngredient -> ConfirmProduction`, then a genuinely signed Fail attestation (same reconstruct-the-real-struct-and-sign approach as §1.4, extended with `fail_reason`/`flagged_record_id`) recorded via `RecordVerdict` -- the first flagging the ingredient record, the second flagging the production record. A `fail_reason` reference entry ("Unverified ingredient source") had to be added live first; no Fail verdict had ever been recorded live before this session:

```text
CorrectIngredient(SL-2026-003, ...) as ingredient-qa, Fail flagged the ingredient record
  -> succeeds: supersedes_record_id exactly matches the flagged ingredient record's ID
  -> new record_id, distinct from the flagged one -- the original is not overwritten

CorrectIngredient(SL-2026-003, ...) a second time
  -> rejected live: duplicate_entry

CorrectIngredient(SL-2026-003, ...) as production-qa (wrong role)
  -> rejected live: role_scope_violation

CorrectProduction(SL-2026-004, ...) as production-qa, Fail flagged the production record
  -> succeeds: supersedes_record_id exactly matches the flagged production record's ID

CorrectIngredient(SL-2026-004, ...) -- same batch, but the Fail flagged production, not ingredient
  -> rejected live: sequencing_violation ("did not flag any ingredient record on this batch")
```

### 1.7 P2 — Reference-data versioning redesign, proven live (2026-08-23 to 2026-08-25)

Scoping P3's Enforcement Test Matrix (`07_test_strategy.md` §3) surfaced a real design gap, not a missing test: `refdata.AddReferenceEntry` hardcoded `Version: "1"` forever, and re-adding a `(type, value)` pair was rejected as `duplicate_entry` even after deprecation -- there was structurally no way to ever create "version 2" of anything, contradicting `04_trd.md` line 156 ("supersede-only, matching the batch-correction pattern") and blocking the matrix's "Reference data versioning" row outright.

**The redesign:** the ledger key for an entry became `(type, value, version)` instead of `(type, value)` -- `referenceEntryKey` gained a `version` parameter, and a new `versionsForValue` range-query helper (plus `activeVersion`) replaces every single-key `GetState` lookup. `AddReferenceEntry` now allows re-adding a value once its only existing version is deprecated (auto-computing the next version number) and backfills `SupersededBy` on the version it replaces -- the write path that field never had. `ResolveActiveReference` and `GetReferenceEntryHistory` were updated to match; `ListReferenceEntries` needed no change at all. `batch` needed no changes -- `resolveReference`'s response shape is unaffected, this is entirely internal to `refdata`. 28 `refdata` tests total (26 after the redesign itself, plus 2 regression tests added below). `docs/06_erd.md`, `docs/11_screen_requirements.md` §12.1, and `docs/17_api_reference.md` §14 updated to match.

**A real bug caught live, not by any unit test:** `DeprecateReferenceEntry`, `GetReferenceEntryHistory`, and `AddReferenceEntry`'s `SupersededBy` backfill all *recomputed* an entry's key from its own `(type, value, version)` fields instead of reusing the key it was actually read from. That's harmless for entries created under the new scheme (key == recomputed key, always), but wrong for the pre-existing 2-component entries already live on the network from earlier in P2 -- `Deprecate` silently wrote its updated copy to a different, brand-new key, leaving the original untouched and still reporting active. Every unit test starts from a fresh mock ledger where every entry is created by the redesigned code itself, so the two key forms always coincided there -- this only surfaces against real pre-existing data, exactly what live testing exists to catch (`07_test_strategy.md` §2's "Chaincode Conformance Tests ... not mocked" layer, same argument as the v1.1 `metadata`-tag incident in §1.3). Fixed by threading each entry's real key through a `versionedEntry{key, entry}` pair everywhere a write-back happens, eliminating every recomputed-key write-back. Two regression tests added: `TestDeprecateReferenceEntry_SucceedsAgainstLegacyKeyFormat` and `TestAddReferenceEntry_NewVersionAfterDeprecatingLegacyEntrySucceeds`, both planting a legacy-format entry directly (bypassing `AddReferenceEntry`) to simulate exactly this scenario. 28 `refdata` tests total, all passing.

**An infrastructure incident along the way, unrelated to the code:** deploying the fix (`refdata` v1.2 through v1.4 across this session) repeatedly hit `"No such image"` on invoke with no build attempt ever logged -- the same class of symptom as the `docs/14` §1.3-era Docker daemon staleness, but this time isolated to Org1's peer specifically (Org2's peer built and ran the identical package successfully throughout). Docker's own build engine was confirmed healthy by a direct `docker build` test outside Fabric. A second `docker restart peer0.org1.example.com` (the first, done immediately after the symptom first appeared, wasn't sufficient) resolved it without a full Docker Desktop restart or any ledger data loss.

**Proven live, in full**, against `standard`/`CPKB` -- a value added earlier in P2, before this redesign existed, making it a genuine pre-existing-data test, not a fresh one:

```text
ResolveActiveReference(standard, CPKB) against the pre-redesign entry
  -> resolves correctly (version "1", active) -- backward compatible, no migration needed

DeprecateReferenceEntry(standard, CPKB) -- first attempt, under the still-buggy v1.3
  -> reports success, but silently wrote to the wrong key; the original stayed active
     (left a permanent, harmless orphaned entry on the ledger -- not cleaned up,
     consistent with this project's own append-only discipline: a bad write, once
     committed, is never silently erased)

DeprecateReferenceEntry(standard, CPKB) -- again, under the fixed v1.4
  -> correctly deprecates the real (legacy-format) entry this time

AddReferenceEntry(standard, CPKB, ...) -- re-add after deprecation
  -> succeeds as version "2", SupersededBy backfilled onto the legacy entry

ResolveActiveReference(standard, CPKB)
  -> now correctly returns version "2"

AddReferenceEntry(standard, CPKB, ...) while version 2 is still active
  -> rejected live: duplicate_entry

DeprecateReferenceEntry(standard, CPKB) with no active version at all
  -> rejected live: already_deprecated
```

Deployed live as `refdata` v1.2 (sequence 3, broken build -- never reachable), v1.3 (sequence 4, same broken-build symptom, ruled out package corruption), v1.4 (sequence 5, the actual fix -- fully proven above).

**P2 is now functionally complete.** All batch lifecycle functions (`CreateBatch`, `SubmitIngredient`, `CorrectIngredient`, `ConfirmProduction`, `CorrectProduction`, `RecordVerdict`, `RequestExport`) and all `refdata` functions (`AddReferenceEntry`, `DeprecateReferenceEntry`, `ResolveActiveReference`, `GetReferenceEntryHistory`, `ListReferenceEntries`, now with real versioning) are built, unit-tested, and deployed live. Next: P3, the formal negative-test-matrix pass per `docs/07_test_strategy.md` §3.

### 1.8 P3 — Chaincode conformance: snapshot immutability and concurrency, proven live (2026-08-25)

Scoping the Enforcement Test Matrix (`07_test_strategy.md` §3) against what's actually built: most rows were already covered by unit tests accumulated across P2 (role scope, sequencing, Fail handling, correction granularity, verdict-attestation tampering, controlled-vocabulary bypass, System Admin boundary — confirmed exhaustive across all 7 `batch` lifecycle functions). The rows genuinely requiring new work were the ones unit tests structurally can't reach: real MVCC conflict detection (the mock has none) and reference-data snapshot immutability across a real version change (which didn't exist as a real mechanism until §1.7). Three matrix rows proven live in this pass; the remainder of the matrix (audit log, identity spoofing, field-level access, idempotency, tunnel exposure) is correctly out of scope until the backend exists (P4/P5).

**Reference-data snapshot immutability (FRD-CHAIN-REFDATA-005 / FRD-CHAIN-STANDARDS-004):** two batches' production records captured `standard`/`CPKB` on either side of a real version bump. Batch `SL-2026-005`'s `ConfirmProduction` resolved `CPKB` at version 3 (`standard_reference_version: "3"`); `CPKB` was then deprecated and re-added as version 4; batch `SL-2026-006`'s `ConfirmProduction` resolved version 4. Since no function in `batch` ever writes to an existing production record's key again (structural, not just tested — confirmed by the earlier chaincode/docs alignment review), batch `SL-2026-005`'s captured snapshot is permanently what's on the ledger; no re-read was needed to prove it stayed at version 3.

**Concurrency conflict handling (FRD-CHAIN-CONCURRENCY-001/003):** two genuinely simultaneous `CreateBatch` calls fired against the same contested `batchCounter` key (the one key the code's own comment already flagged as intentionally contested, ADR-CT-022). Both endorsed successfully — simulation alone can't detect the conflict — but block validation caught it cleanly:

```text
WARN validateKVRead -> Transaction invalidation due to version mismatch,
     key in readset has been updated in a prior transaction in this block
     namespace=batch key="\u0000batchCounter\u00002026\u0000"
WARN validateAndPrepareBatch -> Transaction marked as invalid by state
     validator. Reason code [MVCC_READ_CONFLICT]
```

Exactly one of each pair committed; the other's effects were fully discarded (not partially applied) -- zero custom locking code anywhere in `batch`, matching `docs/04_trd.md` §7's decision exactly.

**Reference-data interaction under concurrency (TRD §23.1/§23.6):** a `SubmitIngredient` call (resolving a throwaway `ingredient` value through `refdata.ResolveActiveReference`) raced against a concurrent `DeprecateReferenceEntry` on that same value. Both endorsed successfully; block validation caught this one too, with a more specific reason than the counter-key case:

```text
WARN validateAndPrepareBatch -> Transaction marked as invalid by state
     validator. Reason code [PHANTOM_READ_CONFLICT]
```

`PHANTOM_READ_CONFLICT`, not `MVCC_READ_CONFLICT` -- confirms the exact mechanism predicted in `ResolveActiveReference`'s own comment when it was rewritten for versioning (§1.7): a composite-key *range* query's range-query-info in the RWset, not a single-key read, is what Fabric checks here. The `SubmitIngredient` transaction was invalidated; despite the client seeing a "successful" response at endorsement time, no ingredient record was actually written to the ledger — endorsement success is not commit success, and this is the concrete proof of it.

**Immutability (row not runtime-tested, proven by absence instead):** "attempt to edit/delete an existing ledger record" has no function to even attempt — no `UpdateX`/`DeleteX` exists anywhere in `batch` or `refdata` (Guardrails §3 Rule 4 / §3a Rule 1). This is a structural, compile-time guarantee, not something a runtime negative test adds confidence to.

**P3's chaincode-addressable scope is now complete.** The remaining Enforcement Test Matrix rows (audit log tamper resistance/access boundary, audit availability gate, identity spoofing, field-level access, idempotent resubmission, tunnel exposure) require a backend that doesn't exist yet — P4.

### 1.9 Full failure-lifecycle recovery, proven live end-to-end (2026-08-25)

Every piece of the correction/recovery story had been proven individually across P2/P3 (`CorrectIngredient`/`CorrectProduction` in isolation, §1.6; `RequestExport`'s "latest verdict governs" logic on a Pass→Fail transition, §1.5) but the complete arc named in `docs/07_test_strategy.md` §2's "Full failure lifecycle" End-to-End Test and TRD §23.5's closing sentence — "*a fresh verified verdict is required after correction, and export remains blocked until the latest effective verdict is Pass*" — had never been chained together on the real network. Closed as a gap surfaced by re-scoping after P3, not part of the original P3 plan.

Proven live on a fresh batch, `SL-2026-010`:

```text
CreateBatch -> SubmitIngredient -> ConfirmProduction
RecordVerdict(fail, flagging the ingredient record)
RequestExport -> rejected: no_valid_verdict ("current verdict is fail, not pass")
CorrectIngredient -> new record, supersedes_record_id set to the flagged one
RecordVerdict(pass) -- input_digest recomputed over BOTH ingredient records
  (the correction and the original it supersedes) plus the untouched
  production record, in the ledger's own key-sorted order -- accepted with
  no attestation_invalid rejection, confirming the digest computation is
  correct against a genuinely corrected batch, not just a plain one
RequestExport -> succeeds: destination_market "Malaysia"
```

This is the single most narratively important user journey in the system — a batch that failed, got fixed, and shipped — and it now has a real, live, signed-attestation proof behind it, not just its component parts.

- macOS (Apple Silicon or Intel) — Apple Silicon is the primary validated target.
- Docker Desktop (free for individual use).
- Homebrew.
- Go (stable) — for chaincode.
- Node.js LTS — for backend API and Fabric Gateway SDK.
- Git.
- VS Code — recommended extensions: Docker, Go.
- Postman or equivalent — for backend API testing.

**Known platform caveat:** Fabric's tooling is Linux-first historically. Native Apple Silicon support exists today, but occasional rough edges are possible.

## 3. Install Core Tools

```bash
# Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Docker Desktop
brew install --cask docker
open -a Docker

# Go
brew install go

# Node.js
brew install node
```

## 4. Clone the Network Starter

```bash
git clone https://github.com/hyperledger/fabric-samples.git
cd fabric-samples
```

## 5. Bring Up the Test Network

```bash
cd test-network
./network.sh up createChannel -c compliancetrail
```

Validate before going further:

```bash
./network.sh down
```

## 6. Project Structure

```text
halcheck/
|-- chaincode/
|   |-- batch/           # independent chaincode module
|   `-- refdata/          # independent chaincode module
|-- frontend/
|-- backend/
|-- network/
|-- docker-compose.yml
`-- docs/
```

## 7. Chaincode Development Loop

```bash
# Batch chaincode
cd chaincode/batch/
go mod tidy && go build ./... && go test ./...
../../network/network.sh deployCC -ccn batch -ccp . -ccl go

# Reference-data chaincode (deployed independently)
cd chaincode/refdata/
go mod tidy && go build ./... && go test ./...
../../network/network.sh deployCC -ccn refdata -ccp . -ccl go
```

## 8. Backend API

```bash
cd backend/
npm install
npm run dev
```

Environment variables:

```text
FABRIC_CONNECTION_PROFILE=./network/connection-profile.json
FABRIC_WALLET_PATH=./network/wallet
FABRIC_CHANNEL_NAME=compliancetrail
FABRIC_CHAINCODE_NAME=batch
JWT_SECRET=<rotate before any external exposure>
JWT_EXPIRY=8h
DATABASE_URL=postgresql://user:password@localhost:5432/compliancetrail
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=<rotate from default>
MINIO_SECRET_KEY=<rotate from default>
MINIO_BUCKET=halcheck-compliance-trail-files
ALLOWED_ORIGIN=http://localhost:5173
SDK_TIMEOUT_MS=10000
AI_QUESTION_SOFT_CAP=20
```

## 9. Frontend

```bash
cd frontend/
npm install
npm run dev
```

## 10. Full Local Stack

```bash
docker compose up -d
```

`docker-compose.yml` includes explicit health checks and `depends_on: condition: service_healthy` for the backend relative to the Fabric network and PostgreSQL.

## 11. Remote Access (Cloudflare Tunnel)

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create compliancetrail-demo
cloudflared tunnel route dns compliancetrail-demo <your-chosen-subdomain>
cloudflared tunnel run compliancetrail-demo
```

Ingress config must expose only frontend and backend API ports. Run only during active demo use, not left on continuously.

## 12. Dependency Scanning

Run before any new dependency is committed, and as a standing check at P0 setup and again before P10 hardening:

```bash
# Node/npm dependencies
npm audit --audit-level=high

# Go module dependencies
go list -m all | nancy sleuth
```

**Rule:** a dependency with a known high/critical vulnerability is not added. Once CI/CD is activated, `dependabot.yml` should be added to automate this check.

## 13. Chaincode Rollback Procedure

Fabric does not support true rollback. If a newly-committed chaincode version has a bug:

1. Fix the issue in source.
2. Increment the chaincode version/sequence number per Fabric's formal lifecycle (approve → commit).
3. Deploy the corrected version through the same `deployCC` process.

**This is forward-fixing, not rollback.**

## 14. Volume Backup Script

```bash
#!/bin/bash
# backup-volumes.sh — run before any demo/recording session
BACKUP_DIR="./backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker run --rm -v halcheck_postgres-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/postgres-data.tar.gz /data
docker run --rm -v halcheck_minio-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/minio-data.tar.gz /data
docker run --rm -v halcheck_couchdb-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/couchdb-data.tar.gz /data

echo "Backup complete: $BACKUP_DIR"
```

Run this before every walkthrough recording session, not just periodically.

## 15. Pre-Demo Health-Check Script

```bash
#!/bin/bash
# health-check.sh — run immediately before any demo or recording
docker compose ps
echo "---"
curl -sf http://localhost:3000/health || echo "BACKEND UNHEALTHY"
curl -sf http://localhost:5984/_up || echo "COUCHDB UNHEALTHY"
echo "Health check complete — review output above before proceeding."
```

## 16. Log Rotation Configuration

Add to `docker-compose.yml`, applied to every service:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 17. Resource Notes (16GB RAM class machines)

Close unnecessary applications before running the full network. Prefer the minimal single-org topology over the full multi-org sample if resource-constrained. Verify Docker Desktop's allocated memory (Settings → Resources) is reasonable, not left at a default that starves the rest of the system.

## 18. Pre-Demo Checklist

- [ ] Default credentials rotated
- [ ] Tunnel ingress rules confirmed scoped to frontend + backend only
- [ ] Run `backup-volumes.sh`
- [ ] Run `health-check.sh`
- [ ] Fresh, clean demo dataset seeded
- [ ] All negative/bypass tests passing
- [ ] Audit log confirmed populated with expected entries from the current session

## 19. Development Rules

- No secrets committed — `.env` gitignored, only `.env.example` tracked.
- No chaincode function ships without a paired negative test.
- No default credential used past local-only testing.
- No tunnel run without the pre-demo checklist passing first.
- No direct writes to CouchDB, the ledger, or MinIO bypassing the backend/chaincode path, even during debugging.
- No dependency committed without passing the scan in Section 12.
- No chaincode "fix" attempted via manual state editing — always forward-fix via the formal lifecycle (Section 13).
- Before working on `chaincode/refdata/` or the audit log schema specifically, review Vibe-Coding Guardrails §3a/§10a in addition to the general checklist.
