# AGENTS.md

## Project Overview

HALCHECK is the product repository. Compliance Trail is its Hyperledger
Fabric accountability module for halal compliance in contract manufacturing
(chaincode functionally complete as of P2, deployed live — backend/frontend
not yet built). Six roles, each cryptographically identified, submit records
through a sequenced batch lifecycle enforced by chaincode — not by the UI.

## The One Rule That Matters Most

No permission or business rule is ever enforced only in the frontend or
backend. If a rule exists, it exists in chaincode first. A backend check
without a matching chaincode check is a defect, not a convenience.
Full detail: `docs/18_vibe_coding_guardrails.md` — read this before touching
`chaincode/`, identity config, or the audit log schema.

## Commands

```bash
# Core Screening App engine (real — implemented against docs/03_frd.md's
# Core Screening App FRD section)
npm install
npm test          # vitest — evaluate()/rationale()/runScreening() against
                   # the three canonical SL-2026-00x scenarios (docs/12)
npm run typecheck

# Chaincode (P2 functionally complete — see docs/14_developer_setup.md §1.3-1.6)
cd chaincode/batch && go test ./...
cd chaincode/refdata && go test ./...

# Backend (P4 in progress — auth, gateway wrapper, RBAC serializer built
# and tested; all P2 chaincode functions routed — see Current Work Context)
cd backend && npm test          # vitest — against the real local Postgres
                                 # and Fabric network, not mocked (matches
                                 # docs/07_test_strategy.md §2's own
                                 # unit-vs-conformance distinction)
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Full stack
docker compose up -d
```

## Knowledge graphs (derived, never committed)

Two code-intelligence graphs are set up for this repo — full detail and caveats in
`docs/26_knowledge_graphs.md`:

```bash
npm run graph:bootstrap   # once per fresh clone (regenerates .gitnexus/run.cjs)
npm run graph:index       # GitNexus: symbols, call graph, execution flows, blast radius
npm run graph:status      # is the index current with this working tree?
npm run graph:update      # graphify: code + doc graph with community detection
npm run graph:refresh     # both, in order
```

**When to run them:** nothing here is tied to a commit — both describe file
content. GitNexus only needs a refresh **after** the working tree moves past
the indexed commit (after a commit or merge); *before* committing, use its
`detect_changes` tool on the existing index instead, which is what maps an
uncommitted diff to affected execution flows. graphify is content-hash cached,
so `npm run graph:update` after a change is cheap and a no-op when nothing
moved.

Both outputs (`.gitnexus/`, `graphify-out/`, plus analyse's generated `.claude/`)
are gitignored derived artifacts — never commit them, never edit them, and
delete either freely; a rebuild costs seconds. Always pass `--skip-agents-md`
to `analyze` (the npm scripts do): without it, GitNexus writes into this file,
which is hand-written. `docs/26` also records why the root graphify graph is
~88% Go vendor code here, and the runner-identity gotcha that makes a
freshly-built index report "stale".

## Architecture (brief — see docs/05_architecture.md for full diagrams)

Ledger-first. Frontend and backend are clients of the ledger, never sources
of truth. Two independent chaincode modules: `batch` and `refdata`. Off-chain
stores (PostgreSQL, MinIO) are non-authoritative, except the System Audit
Log, which is insert-only at the database grant level.

## Conventions

- Chaincode: Go, business rules only — no I/O beyond ledger reads/writes.
- Backend: Node/Express, thin translation layer, never holds authority.
- API endpoints model ledger resources and actions, never a specific
  screen's shape (`docs/04_trd.md` §8) — a frontend redesign or an
  unplanned flow change should never require a backend change.
- No update/delete function on any ledger record type, ever — corrections
  are new, linked records.
- Every chaincode function needs a paired negative test in the same commit.
- Reference data changes only via System Admin identity, chaincode-enforced.
- UI copy: English, plain language, minimal density (see docs/09_ui_specification.md §3).

## Before Working On

- **Chaincode, identity, or audit log**: read `docs/18_vibe_coding_guardrails.md`
  §3, §3a, §10 first. Critical tier — no exceptions for "it passed the test."
- **Anything touching the public tunnel**: read Guardrails §8, run the
  negative-exposure test after every change, not just before.
- **New requirements**: check `docs/22_requirements_traceability.md` for
  existing coverage before adding something that might already exist.

## Do Not

- Add a `.env` value, credential, or secret to any committed file.
- Introduce a locking mechanism outside Fabric's native MVCC conflict
  detection (see `docs/04_trd.md` §7).
- Let the AI Explanation feature (docs/04_trd.md §15) gain write access or
  answer beyond the specific batch's own recorded data.
- Skip the P1.5 decisions in `docs/13_implementation_plan.md` — they're
  already resolved; don't re-derive them differently mid-Build.
- Add a backend endpoint, response field, or session/wizard state because
  one specific screen wants it shaped that way — reuse or extend an
  existing resource endpoint instead (`docs/04_trd.md` §8).
- Put a "next step" instruction in any API response — screen sequencing
  is a frontend routing decision, never the backend's to make.

## Current Work Context

Status: Design complete. Core Screening App complete (15/15 tests). Compliance
Trail: P0–P7 built, P4/P5 verified against the live network, and the P6
operational shell plus P7 governance shell built in `frontend/`. P8 (AI), P9
(tunnel), P10 (hardening) and P11 (doc consolidation) are in progress — see the
2026-09-18 section at the end of this block for what that pass found and fixed:

### Core Screening App — functionally complete for v1 scope

Engine (`src/engine/`), local storage (`src/storage/`), and all 5 UI screens
(`src/app/`, `src/features/{profiles,intake,screening,report,reference}/`)
are implemented, unit-tested (15/15 passing), and manually verified in-browser
against all 3 canonical SL-2026-00x scenarios from `docs/12`. See
`docs/06_erd.md` §10 for the exact output contract Compliance Trail's
`VERDICT_RECORD` expects from this engine.

### Compliance Trail — P0/P1/P1.5 done; P2 in progress, first slice live

**P0 (outside this repo — no HALCHECK source files changed):**
- Fabric samples checkout pinned at `05edea0`, at `/private/tmp/fabric-samples-halcheck-p0`.
- Local toolchain proven: Docker 29.6.2, Go go1.26.5, peer v2.5.15, Node v26.0.0 — see `docs/14_developer_setup.md` §1.1.
- 2-org test network up (peers, Raft orderer, 3 CAs); `compliancetrail` channel created and joined.
- `basicgo` sample chaincode installed, approved by both orgs, and **committed** (sequence 2).
- Sample transaction proven both directions: `InitLedger` submitted, `GetAllAssets` queried successfully.
- **Closed (2026-08-25):** `scripts/backup-volumes.sh` retried and ran cleanly end-to-end — `alpine` pulled without issue, all three named volumes mounted, `tar` archives produced (originally blocked by transient Docker Hub unreachability; long since resolved). At that date `docker-compose.yml` was still `services: {}`, so the volumes were empty and the auto-created ones were deleted as test artifacts. **Superseded (2026-09-18):** compose now defines `postgres` and `minio`, and both volumes hold real state (six seeded users, the insert-only audit log, and MinIO evidence objects), so they are no longer disposable. P0 remains fully closed.

**P1 — Identity Setup, fully proven (`docs/14_developer_setup.md` §1.2):**
- All 6 roles issued real Fabric CA identities (Org1 CA), each carrying a `role` custom attribute matching `06_erd.md`'s `IDENTITY.role` enum exactly (`ingredient_qa`, `production_qa`, `compliance_officer`, `export_officer`, `brand_owner`, `system_admin`).
- Verified via a throwaway `identity-probe` chaincode (`WhoAmI`, using `cid.GetAttributeValue`) — kept outside this repo, distinct from the real `chaincode/batch`/`chaincode/refdata` modules P2 will define. All 6 identities returned their exact role read live from chaincode context.
- Submit capability proven for 2 representative identities (`ingredient-qa`, `system-admin`) against `basicgo`.
- P1 exit criteria met in full: "six distinct, verifiable identities exist and can be used to submit test transactions."

**P1.5 — Chaincode Design Gate, closed (2026-08-22):**
Re-verified all 5 TRD §23 pre-build authority items are still synchronized
across `03_frd.md`, `04_trd.md`, `05_architecture.md`, `06_erd.md` — none
drifted from this session's additive edits (which only appended new Core
Screening App sections, never touched existing Compliance Trail content;
`04_trd.md`/`05_architecture.md` untouched entirely, confirmed via `git log`).

| # | Decision | Status |
|---|---|---|
| 1 | Reference-data enforcement via `refdata.ResolveActiveReference` | synchronized |
| 2 | Signed verdict attestation, binding | synchronized — now also grounded in a real, working engine (see `06_erd.md` §10) |
| 3 | Fail-closed audit delivery | synchronized |
| 4 | Canonical Role × Field × Access matrix (TRD §23.4) | synchronized |
| 5 | Uniform corrections (ingredient + production `supersedes_record_id`) | synchronized |

**P2 — Chaincode Core Rules, functionally complete (`docs/14_developer_setup.md` §1.3-§1.6):**
- `refdata` (5 functions: `AddReferenceEntry`, `DeprecateReferenceEntry`,
  `ResolveActiveReference`, `GetReferenceEntryHistory`,
  `ListReferenceEntries`) and `batch` (2 functions: `CreateBatch`,
  `SubmitIngredient`) are unit-tested (39 tests) and deployed live to the
  `compliancetrail` channel, each as its own independently-upgradable
  chaincode (`ADR-CT-023`).
- Real cross-chaincode invocation proven on the live network, not mocked:
  `batch.SubmitIngredient` submitted as `ingredient-qa` genuinely calls
  `refdata.ResolveActiveReference` via `stub.InvokeChaincode` (TRD §23.1);
  snapshot fields (`ingredient_reference_entry_id`, versions) exactly match
  `refdata`'s real ledger state. Both rejection paths (unrecognized value,
  wrong role) also proven live.
- **Caught by the live deployment, not by unit tests:** contractapi's
  response-schema validation requires an explicit `metadata:"...,optional"`
  struct tag for every nullable field — `json:",omitempty"` alone doesn't
  register with it. `ReferenceEntry` failed schema validation on its first
  real invoke; unit tests never caught it because they call functions
  directly, skipping contractapi's dispatch layer entirely. Fixed across
  both modules, redeployed as v1.1. Full incident write-up in
  `docs/14_developer_setup.md` §1.3 — worth reading before writing more
  contractapi-based chaincode functions.
- `ConfirmProduction` added (Production QA only, requires a prior ingredient
  record, resolves the CPKB standard through `refdata` the same way
  ingredients/suppliers are resolved). 22 `batch` tests total. Deployed live
  as v1.2 with the `metadata` struct tags applied proactively from the
  start — worked on the first live invoke, no repeat of the v1.1 incident.
  Both the happy path and the sequencing-violation rejection (production
  attempted before any ingredient record exists) proven live.
- `RecordVerdict` added — the binding, signed engine-attestation contract
  from TRD §23.2, in full (`docs/14_developer_setup.md` §1.4). Compliance
  Officer only; verifies a real ECDSA P-256 signature against a public key
  compiled into the chaincode (private key generated for local testing,
  lives entirely outside this repo); independently recomputes the input
  digest from the batch's *actual current* records and rejects a stale
  attestation; resolves the governing regulation and (for Fail) the catalog
  fail reason through `refdata`; verifies a Fail's flagged record actually
  exists on the batch. 31 `batch` tests total. Deployed live as v1.3
  (sequence 4) and proven with a **genuinely signed** attestation — not a
  test fixture — built from the exact ledger bytes captured in the P0.1.3
  entry, both the pass verdict and a wrong-role rejection confirmed live.
- `RequestExport` added — **the full batch lifecycle is now built:**
  `CreateBatch -> SubmitIngredient -> ConfirmProduction -> RecordVerdict ->
  RequestExport` (`docs/14_developer_setup.md` §1.5). Export/Logistics
  Officer only; destination is copied from the batch's own immutable
  market with no parameter to override it; blocked unless the *current*
  verdict (not just any Pass ever recorded) is Pass; rejects a second
  export on an already-exported batch. Required adding a small
  "latest verdict pointer" mechanism to `RecordVerdict` (touching an
  already-deployed function again, transparently) since multiple verdicts
  can legitimately exist over a batch's life and their record IDs aren't a
  sortable sequence. 38 `batch` tests total. Deployed live as v1.4
  (sequence 5); happy path, duplicate-export rejection, and no-verdict
  rejection all proven live — including the real consequence of the
  pointer mechanism being new: the earlier live Pass verdict (recorded
  under v1.3) had no pointer and had to be re-recorded under v1.4 before
  export would work, which is correct, not a bug.
- `CorrectIngredient`/`CorrectProduction` added — TRD §23.5's uniform
  correction model, closing out P2's function set
  (`docs/14_developer_setup.md` §1.6). `SubmitIngredient`/`ConfirmProduction`
  refactored into thin role/state wrappers over a shared writer
  (behavior-preserving: all 38 pre-existing tests passed unchanged before
  any new test was added). There is no parameter anywhere for a caller to
  name which record to correct — it's always derived from the batch's own
  latest verdict (must be Fail, must have flagged a record of the matching
  type) via a new `currentFlaggedRecord` helper; a second correction against
  the same flagged record is rejected as `duplicate_entry` via a new
  `isSuperseded` helper. 53 `batch` tests total (a `CorrectProduction`
  premature-correction-attempt test, TRD §23.6's own required-test wording,
  was added during a subsequent doc-alignment review). Deployed live as v1.5
  (sequence 6); a "wrong record type flagged" rejection message read
  awkwardly on its first live run (not a behavior bug), fixed and
  redeployed as v1.6 (sequence 7) through the full formal lifecycle again.
  Both correction functions proven live on two fresh batches — happy path,
  duplicate-correction rejection, wrong-role rejection, and the
  ingredient/production cross-check (a Fail that flagged one record type is
  refused by the other type's correction function) all confirmed against
  the real network, using genuinely signed Fail attestations (first Fail
  verdicts ever recorded live in this project).
- Reference-data versioning redesign (`docs/14_developer_setup.md` §1.7):
  scoping P3 surfaced that `refdata.AddReferenceEntry` hardcoded
  `Version: "1"` forever with no way to ever create "version 2" of
  anything — a real design gap, not a missing test. Redesigned the ledger
  key to `(type, value, version)`; a value's only-existing-version being
  deprecated now allows re-adding it as the next version, backfilling
  `SupersededBy` on the one it replaces. `batch` needed no changes.
  **A real bug caught live, not by unit tests:** `DeprecateReferenceEntry`
  and two other functions recomputed an entry's key from its own fields
  instead of reusing the key it was actually read from — harmless for
  entries the redesigned code itself creates, but silently wrote to the
  wrong key for the pre-existing entries already live on the network from
  earlier in P2. Fixed by threading each entry's real key through
  everywhere a write-back happens; two regression tests added
  (`TestDeprecateReferenceEntry_SucceedsAgainstLegacyKeyFormat`,
  `TestAddReferenceEntry_NewVersionAfterDeprecatingLegacyEntrySucceeds`).
  28 `refdata` tests total. Deployed live as v1.4 (sequence 5) after v1.2
  and v1.3 both hit an infra-only "chaincode image never built" incident
  isolated to Org1's peer (Org2 built and ran the identical package fine
  throughout) — resolved by a second peer restart, no Docker Desktop
  restart needed. Fully proven live against a value that predates this
  redesign: deprecate → re-add as v2 → resolve correctly → duplicate/
  already-deprecated rejections both confirmed. One permanent, harmless
  orphaned ledger entry remains from the pre-fix buggy write — left as-is,
  consistent with this project's own append-only discipline.
- **P2 is functionally complete.** Every `batch` and `refdata` function
  from the design docs is built, unit-tested, and deployed live.

**P3 — Chaincode conformance, chaincode-scope complete (`docs/14_developer_setup.md` §1.8):**
Scoped the Enforcement Test Matrix (`docs/07_test_strategy.md` §3) against
what's built: most rows were already covered by P2's accumulated unit
tests. Three rows genuinely needed new live-network proof, since they
require real MVCC behavior the mock can't simulate:
- **Reference-data snapshot immutability** — two batches' production
  records captured `standard`/`CPKB` on either side of a real version
  bump (v3 → v4); the earlier batch's snapshot is permanently what's on
  the ledger, since no function ever writes to an existing record's key
  again.
- **Concurrency conflict handling** — two genuinely simultaneous
  `CreateBatch` calls against the contested `batchCounter` key. Both
  endorsed successfully (simulation can't detect it); block validation
  correctly invalidated one with `MVCC_READ_CONFLICT`, the other
  committed cleanly, zero custom locking code anywhere.
- **Reference-data interaction under concurrency** — `SubmitIngredient`
  racing a concurrent `DeprecateReferenceEntry` on the same value.
  Invalidated with `PHANTOM_READ_CONFLICT` — not `MVCC_READ_CONFLICT` —
  confirming the range-query-based mechanism predicted in
  `ResolveActiveReference`'s own comment when it was rewritten for
  versioning. The `SubmitIngredient` client saw "successful" at
  endorsement; no record was actually written — concrete proof that
  endorsement success isn't commit success.

Immutability itself (edit/delete an existing record) isn't runtime-tested
— there's no function to even attempt it, a structural guarantee, not a
tested one. Remaining matrix rows (audit log, identity spoofing,
field-level access, idempotency, tunnel exposure) need a backend that
doesn't exist yet — P4.

**Two gaps closed before starting P4 (2026-08-25):**
- `scripts/backup-volumes.sh` retried and ran cleanly — `alpine` pulled,
  all three volumes mounted, `tar` archives produced. Originally blocked
  by transient Docker Hub unreachability back in P0; long since resolved,
  just never revisited. (That note described 2026-08-25, when
  `docker-compose.yml` was still `services: {}` and the volumes were empty.
  As of 2026-09-18 compose defines `postgres` and `minio`, both hold real
  state, and neither volume is disposable any more.)
  **P0 is now fully closed.**
- The full failure-lifecycle recovery arc — a batch that fails, gets
  corrected, receives a fresh Pass verdict, and successfully exports — had
  only ever been proven in individual pieces, never chained together live
  (`docs/14_developer_setup.md` §1.9). Proven end-to-end on `SL-2026-010`:
  Fail (flagging the ingredient record) → `RequestExport` correctly
  blocked (`no_valid_verdict`) → `CorrectIngredient` → a fresh Pass
  verdict whose `input_digest` was recomputed over both the corrected and
  original ingredient records plus the untouched production record, in
  the ledger's own key-sorted order → `RequestExport` succeeds.

Critical tier per `docs/18_vibe_coding_guardrails.md` §2 throughout —
every function needs human line-by-line review before acceptance, not
just a passing test.

### 2026-09-18 — P4/P5 verified live, P6/P7 built, P10 hardening applied

The environment was rebuilt (the Fabric checkout had moved from `/private/tmp`
to `~/fabric-samples-halcheck-p0`, so `backend/.env`'s paths were updated and
the six role identities' MSP directories gained the `config.yaml` they were
missing). Then P4 and P5 were verified against the live network rather than
asserted, which surfaced **five real defects, all fixed in the same pass**:

1. `idempotency_keys.response_body` was `JSONB`, and Postgres rejects the
   `\u0000` escapes in every reference-entry key — the first idempotent
   ingredient submission killed the backend process. Now `TEXT` (ADR-CT-028).
2. Unhandled errors in async Express 4 handlers ended the process; the shared
   chaincode helpers, the CSV route, an error middleware and an
   `unhandledRejection` guard now translate them into 500s instead.
3. `no_valid_verdict` had no HTTP status mapping, so a correct refusal
   surfaced as 500 (ADR-CT-031).
4. The engine evaluated superseded records, so a corrected batch could never
   clear its Fail — the flagship recovery arc was impossible through the API
   (ADR-CT-029).
5. `coaFileHash` was readable from the request body while the code and docs
   both claimed it was server-computed, defeating T-006 (ADR-CT-030). The
   ingredient routes now accept an optional file and always hash it
   themselves.

Verified live end-to-end through the API: the full lifecycle, the
Fail → correction → Pass → export arc, reference-data add/deprecate/re-add as
v2, field-level RBAC across all six roles, chaincode-level role rejection with
a real non-admin identity, audit-log insert-only at the database grant level,
and idempotent retries that never duplicate.

**ADR-CT-033 implemented and proven live (2026-09-18, Critical tier).** A
batch's ingredient records now snapshot the supplier reference entry's
`verificationStatus` at submission (shared writer, so corrections carry it
too), and the verdict bridge builds every evaluation input from those
records instead of looking names up in the frozen engine dataset; the release
keeps the rules/standards, the recognition agreements, and one fallback for
records written before the field existed. A supplier entry with no status is
refused at submission (`missing_reference_metadata`, 400) rather than
recorded empty. `batch` deployed as v1.1, sequence 6, through the formal
lifecycle. Proven live: the SL-2026-021 case (an ingredient and supplier that
exist only on the ledger) now yields a signed Fail → correction → Pass →
export arc, while a pre-existing record still evaluates through the release
unchanged. The three pre-existing supplier entries had no metadata at all and
were completed to v2 through the governed API. Suite counts: chaincode 68
batch / 28 refdata, backend 52, Core Screening App 15. Full record:
`docs/14_developer_setup.md` §1.10, decision: `docs/21_decisions.md`
ADR-CT-033.

`frontend/` now holds the P6 operational shell and P7 governance shell (React
+ Vite, no new dependencies, hash router): role-filtered batch list with the
notification badge, batch detail with a connected trail, ingredient panel
(manual, bulk CSV, correction mode), production/verdict/export modals,
Integrity Sandbox with both modes, AI Explanation panel, reference-data
administration and the audit-log viewer.

P10 hardening applied: Postgres, MinIO and JWT secrets rotated off their
defaults (R-004), Fabric peer/orderer/CA ports rebound to `127.0.0.1` (they
shipped publishing on every interface), and `scripts/health-check.sh`
rewritten — it had been checking port 3000 and a CouchDB that never existed.

**Open, and honest:** ADR-CT-032 records that a backend process does not
recover from a ledger interruption on its own and must be restarted;
`docs/24_demo_runbook.md` carries that step and the rest of the demo
procedure. P8 (AI), P9 (public tunnel — needs the operator's Cloudflare
account) and the remaining P11 documentation sync are what is left.

### 2026-09-18 (later) — ADR-CT-034: the ledger's guarantees are now visible and checkable

A product review found that the UI showed none of what makes this system
different from an ordinary web app, and traced it to three verifiable causes:
the Integrity Sandbox returned canned rejections without touching the ledger,
`storage/minio.ts`'s `downloadAndVerify` (threat T-006's enforcement point) had
no caller anywhere, and `RecordVerdict` verified the officer's attestation
signature and then discarded it, leaving the attestation unverifiable by
anyone. All three are fixed: the sandbox makes real calls and reports the
ledger's own answers; `GetBatchIntegrity` exposes each record's stored bytes,
hashes and the batch digest for recomputation; attestation + signature are
stored on the verdict record with `GetAttestationPublicKey` publishing the
verification key; an evidence route gives `downloadAndVerify` its first
caller; and `GET /batches/:id/proof-bundle` + `src/proof/verifyProofBundle.ts`
let anyone verify a batch with **no account** — the same module behind
`npm run verify:proof` (exit 0/1) and the public `#/verify` screen.

`batch` deployed as v1.2, sequence 7. New audit event type `sandbox_attempt`
(schema + live `ALTER TYPE`). Proven live on `SL-2026-026`: proof bundle
verified by the CLI (7 checks, 0 failures, exit 0), one byte flipped → 2
failures and exit 1, fetched COA re-hashing to the same value as the ledger
record, and both sandbox modes returning the deployed contract's own
refusals. Two integration assumptions were caught only by running live —
contractapi returns a bare string as raw bytes, not JSON, and raw chaincode
responses are snake_case where RBAC-serialized ones are camelCase. Suite
counts: chaincode 73 batch / 28 refdata, backend 55, verifier 9, Core
Screening App 15. Decision: `docs/21_decisions.md` ADR-CT-034; deploy and
proof: `docs/14_developer_setup.md` §1.11.
