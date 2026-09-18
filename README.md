# HALCHECK

Halal compliance screening for cosmetic contract manufacturing — with an
accountability trail you can **check without trusting the application**.

Two bounded parts, one repository:

- **Core Screening App** — a browser-only screening workflow. It compares
  BPJPH and JAKIM rules against a supply chain and produces sourced,
  step-level gap findings. No login, no server, no database.
- **Compliance Trail** — the accountability module: a local Hyperledger Fabric
  network, six cryptographically identified roles, and a batch lifecycle
  (ingredient → production → verdict → export) in which **every rule is
  enforced by chaincode**, not by the UI.

> All content is fictional and labelled as such. This demonstrates a
> mechanism, not regulatory guidance, and is not a certification of anything.

## The part that is actually different

Plenty of web apps can store a form submission. This one can hand you an
artifact that you verify yourself, offline, with no account in the system:

```bash
# fetch a batch's proof bundle from the running app, then check it anywhere
npm run verify:proof -- SL-2026-026-proof-bundle.json   # in backend/

VERIFIED -- 7 checks, 0 failures.
  [PASS] Record ingredientRecord c204f40abf7f… hashes to the value the bundle states
  [PASS] The 2 records recompute to the batch's effective input digest
  [PASS] The bundle's public key is a readable P-256 attestation key
  [PASS] Verdict e3b03d305d68… carries a valid ECDSA attestation signature
  [PASS] Verdict e3b03d305d68… attests to this batch
```

Change one byte of any record inside that file and the same command reports
`NOT VERIFIED — 2 of 7 checks failed` and exits non-zero. The verifier
(`src/proof/verifyProofBundle.ts`) has no application imports, no Fabric
client, no network and no login; the browser's public `#/verify` screen runs
the same module. The Integrity Sandbox in the app makes real calls to the
deployed chaincode and reports the ledger's own refusals — including the
contract's own `Function UpdateIngredientRecord not found`, because no update
function exists.

Why that matters: the verdict engine's signed attestation binds to the batch's
own records, every compliance fact is snapshotted at submission, corrections
are new linked records rather than edits, and reference data can only change
through a System Admin action that is itself recorded.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| Core Screening App | engine, storage, 5 screens, frozen dataset releases | complete — 15 tests |
| P0–P3 | local Fabric network, 6 role identities, `batch` + `refdata` chaincode, conformance pass | complete, deployed |
| P4–P5 | backend API: RBAC, audit gating, idempotency, evidence storage | built and verified live |
| P6–P7 | operational shell + governance shell (React) | built |
| P8 | AI trail explanation | endpoint + panel exist and are grounded by construction; returns an explicit `unavailable` until a provider key is configured |
| P9 | public tunnel | documented and proven (`docs/25`); quick-tunnel links are ephemeral by design |
| P10–P11 | hardening, documentation sync | applied |

Test counts as of the last run: backend 67 (against a real local Postgres,
MinIO and Fabric network), chaincode 73 `batch` + 28 `refdata`, Core Screening
App 15, proof verifier 9. Live proofs are recorded in
`docs/14_developer_setup.md` §1.8–§1.11.

## Running it

The Core Screening App needs nothing but Node:

```bash
npm install
npm test          # 15 tests: evaluate()/rationale()/runScreening() over the
                  # three canonical scenarios in docs/12
npm run dev       # the screening app itself
```

The Compliance Trail needs Docker, Go and a Fabric test network (the setup is
written out in `docs/14_developer_setup.md`):

```bash
docker compose up -d                    # Postgres + MinIO
cd chaincode/batch && go test ./...     # 73 tests
cd backend && npm install && npm test   # 67 tests (needs the stores above)
cd backend && npm run dev               # API on :3001
cd frontend && npm install && npm run dev   # app on :5173
```

Demo logins are generated locally into `backend/seeded-users.credentials.local`
(gitignored) by `npm run seed:users`; nothing credential-bearing is committed.

## Repository layout

```text
halcheck/
|-- src/            # Core Screening App — engine, storage, dataset loading, UI
|-- dataset/        # briefs, drafts, verified data, frozen releases
|-- chaincode/
|   |-- batch/      # batch lifecycle: create, ingredient, production, verdict, export
|   `-- refdata/    # governed reference data: add, deprecate, resolve, history
|-- backend/        # Express API, Fabric gateway, audit log, evidence storage
|-- frontend/       # operational shell (P6) + governance shell (P7)
|-- db/init/        # Postgres schema, insert-only audit-log grants
|-- docs/           # the numbered specification and decision set (27 files)
`-- scripts/        # health check, volume backup
```

## Documentation

Documents 00–23 are the planning and specification set (charter, PRD, BRD, FRD,
TRD, architecture, ERD, test strategy, threat model, UI specification and
flows, screen requirements, seed data, implementation plan, developer setup,
config reference, risk register, API reference, vibe-coding guardrails,
repository structure, glossary, decisions, requirements traceability,
roadmap). Six of them (00, 01, 03, 06, 09, 12) cover both parts in one file.

Newer additions worth knowing:

| Doc | Why it exists |
| --- | --- |
| [`docs/21_decisions.md`](docs/21_decisions.md) | every architectural decision, with the alternatives that were rejected and why |
| [`docs/24_demo_runbook.md`](docs/24_demo_runbook.md) | what to show in what order, and what to do when something breaks mid-demo |
| [`docs/25_cloudflare_tunnel_setup.md`](docs/25_cloudflare_tunnel_setup.md) | sharing the app at a public URL, and why quick-tunnel links expire |
| [`docs/26_knowledge_graphs.md`](docs/26_knowledge_graphs.md) | the code-intelligence graphs (`npm run graph:refresh`) and when to rebuild them |
| [`AGENTS.md`](AGENTS.md) | the working agreement for agents and humans on this repo |

## Honest limitations

- Local, single-operator demo. One organisation runs every node; there is no
  multi-party hosting in this version, so the trust story is "records are
  append-only and independently checkable", not "you can trust us".
- A backend process does not recover from a ledger interruption on its own and
  must be restarted (ADR-CT-032, in the runbook).
- The AI explanation feature is deliberately not wired to a provider: with no
  key configured it refuses rather than guessing, and it can never write.
- Verdicts recorded before 2026-09-18 carry no stored attestation; the verifier
  reports that as a note rather than pretending they were checked.
- No license file yet — until one is added, the default is all rights reserved.

## License

Not yet chosen. If you intend to reuse this, open an issue and say so.
