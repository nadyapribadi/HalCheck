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

(To be filled in once Build starts — see `docs/14_developer_setup.md` for
the current install/run steps.)

```bash
# Chaincode
cd chaincode/batch && go test ./...
cd chaincode/refdata && go test ./...

# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Full stack
docker-compose up -d
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

Status: Design complete. Build not started. Do not run Fabric/setup/build
commands until the documentation/repo-hygiene pass is accepted. After that,
the next build step is Implementation Plan P0 (local network foundation) —
see `docs/13_implementation_plan.md`.
