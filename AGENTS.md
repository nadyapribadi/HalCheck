# AGENTS.md

## Project Overview

HALCHECK is the product repository. Compliance Trail is its planned
Hyperledger Fabric accountability module for halal compliance in contract
manufacturing. Six roles, each cryptographically identified, submit records
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

# Chaincode (not yet implemented — see docs/13_implementation_plan.md P2)
cd chaincode/batch && go test ./...
cd chaincode/refdata && go test ./...

# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Full stack
docker compose up -d
```

## Architecture (brief — see docs/05_architecture.md for full diagrams)

Ledger-first. Frontend and backend are clients of the ledger, never sources
of truth. Two independent chaincode modules: `batch` and `refdata`. Off-chain
stores (PostgreSQL, MinIO) are non-authoritative, except the System Audit
Log, which is insert-only at the database grant level.

## Conventions

- Chaincode: Go, business rules only — no I/O beyond ledger reads/writes.
- Backend: Node/Express, thin translation layer, never holds authority.
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

## Current Work Context

Status: Design complete. Repo-hygiene pass accepted (`docs/19_repository_structure.md`
§11). Build in progress on both modules:

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
- **Not yet closed:** `scripts/backup-volumes.sh` couldn't be exercised — Docker Hub was unreachable for the `alpine` pull (confirmed not a sandboxing artifact, still true as of P1). Retry once registry connectivity is available; this is P0's one remaining exit criterion.

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

**P2 — Chaincode Core Rules, in progress (`docs/14_developer_setup.md` §1.3):**
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
- Next: `batch` sequencing functions (production confirmation, verdict,
  export) and correction-mode ingredient submission
  (`supersedes_record_id`), then P3 (formal negative-test-matrix pass) once
  P2's function set is complete. Critical tier per
  `docs/18_vibe_coding_guardrails.md` §2 throughout — every function needs
  human line-by-line review before acceptance, not just a passing test.
