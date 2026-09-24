# HALCHECK — Running It Yourself

## Document Control

- Project: HALCHECK
- Audience: anyone who wants to run this on their own machine, including people who have never touched Hyperledger Fabric
- Status: written 2026-09-24, from the machine this was actually built and proven on

## 1. What you get, and what it costs you

Two very different things live in this repository, and only one of them needs a server:

| Part | What it needs | Time to run |
|---|---|---|
| **Core Screening App** (rules engine + screens) | Node only | ~1 minute |
| **Compliance Trail** (roles, ledger, batch lifecycle) | Docker, Go, a Fabric network, ~11 containers, ~4-8 GB RAM | ~15-20 minutes the first time |

The published static demo (<https://nadyapribadi.github.io/HalCheck/>) is the first one. Everything below is about the second.

## 2. The eleven containers, and why they are not in this repository

When the trail is running, `docker ps` shows roughly:

| Container | What it is |
|---|---|
| `peer0.org1.example.com`, `peer0.org2.example.com` | the two organisations' ledgers |
| `orderer.example.com` | orders transactions into blocks |
| `ca_org1`, `ca_org2`, `ca_orderer` | certificate authorities — where the six role identities come from |
| `dev-peer0.orgN-batch_…`, `dev-peer0.orgN-refdata_…` | the two chaincode modules, one container per peer per module |
| `halcheck-postgres-1`, `halcheck-minio-1` | the non-authoritative off-chain stores (accounts, audit log, evidence files) |

None of it is committed here, and that is deliberate (`docs/19_repository_structure.md`): the network comes from `hyperledger/fabric-samples` (pinned commit in `docs/14` §1.1) and everything generated — crypto material, identities, chaincode packages — is regenerable material that must never be a commit. `scripts/bootstrap-demo.sh` is what reproduces it on your machine.

## 3. The six logins, and where they come from

Every role is **two things**, which is the part that surprises people:

1. a **Fabric CA identity** with a `role` attribute baked into its certificate (`role=ingredient_qa`, and so on) — this is what chaincode actually checks, and a client cannot forge it by sending a role string;
2. an **application account** (username + bcrypt-hashed password) that the backend uses to pick which Fabric identity it acts as on your behalf.

The passwords are random, generated **on your machine** by `npm run seed:users`, and written to `backend/seeded-users.credentials.local` (gitignored). So:

- nobody has to share a password with you, and this repository contains none;
- two people running this have different passwords for the same six usernames;
- the six usernames are always these, with these roles:

| Username | Role | What they can do |
|---|---|---|
| `ingredient-qa` | Ingredient QA | create a batch, add/correct ingredients |
| `production-qa` | Production QA | confirm production, correct it |
| `compliance-officer` | Compliance Officer | record the engine's verdict (signed) |
| `export-officer` | Export Officer | release for export |
| `brand-owner` | Brand Owner | read-only, the full trail |
| `system-admin` | System Admin | governance shell only: reference data + audit log |

`./scripts/bootstrap-demo.sh` prints this table with your usernames at the end, so you do not have to remember it.

## 4. The one command

```bash
git clone https://github.com/nadyapribadi/HalCheck.git
cd HalCheck
./scripts/bootstrap-demo.sh --check     # report only: what is installed, what is missing
./scripts/bootstrap-demo.sh             # do it, phase by phase
```

The script is idempotent: an existing network, an already-enrolled identity or an existing keypair makes it print `skip` and move on. It writes only inside `$FABRIC_DIR` (default `~/fabric-samples-halcheck-p0`, override with `HALCHECK_FABRIC_DIR`) and this repository.

**What it automates:** prerequisites check, cloning fabric-samples at the pinned commit and installing the binaries, bringing the network and channel up, registering and enrolling all six role identities (including the `config.yaml` NodeOU file Fabric Gateway requires), generating the verdict-attestation keypair, writing `backend/.env`, bringing up Postgres + MinIO, and seeding the six logins.

**What it deliberately leaves to a human:** deploying the chaincode (`docs/14` §7). It needs the peer CLI environment for *both* organisations plus the next sequence number from `peer lifecycle chaincode querycommitted`, and getting that wrong is how a deployment ends up half-applied. The script prints the exact section to follow instead of guessing.

**One caveat about the attestation key.** The chaincode verifies verdict signatures against a public key compiled into `chaincode/batch/batch.go`. For a local demo the bootstrap generates a fresh keypair and patches that constant so the pair matches (`chaincode/batch/batch.go` will show as modified afterwards — that is expected, and you can `git checkout` it). On a deployment anyone else depends on, a key change is a reviewed chaincode lifecycle upgrade instead; that distinction is the whole reason the key is compiled in rather than read from a config file.

## 5. Then what?

```bash
cd backend  && npm run dev      # API on :3001
cd frontend && npm run dev      # app on :5173  → log in with any of the six roles
```

Worth doing in this order, because it is the story the project is making:

1. **Create a batch as Ingredient QA**, add an ingredient from the reference list, and try to type one that is not on it — the ledger refuses it, not the dropdown.
2. **Confirm production as Production QA**, then **record the verdict as Compliance Officer**. Watch the sequencing refusals if you skip a step.
3. **Open "Verify integrity"** on the batch: the checks run in your browser. Press *Try to alter a record* and watch them fail.
4. **Download the bundle** and verify it with `npm run verify:proof -- <file>` in `backend/`. Then flip one byte in that file with a text editor and run it again.
5. **Try the Integrity Sandbox** from the batch: mode 1 asks the deployed contract to update an existing record (there is no such function, so the refusal is the chaincode's own), mode 2 submits an unlisted value and shows both refusals.
6. Log in as **System Admin** to see the governance shell: reference data with versions, and the audit log with its flagged window.

## 6. If you want to share it with someone else

- **Static parts** (screening app, proof verifier): already published, see the README.
- **The live trail**: a quick tunnel is the shortest path — `cloudflared tunnel --url http://localhost:5173` — with the configuration in `docs/25` §7. It is temporary by design: the hostname dies with the process.
- **Permanent**: a small VPS running the same `docker compose` stack behind a named Cloudflare tunnel (`docs/25` §1-5). Budget roughly 8 GB RAM; Fabric plus Postgres plus MinIO is not a 1 GB workload.

## 7. Known rough edges

- The first `docker compose up -d` pulls several GB of images.
- Deploying chaincode needs the peer CLI environment for both orgs; the commands in `docs/14` §7 are the tested ones, including the `--lang golang` detail (`go` is rejected).
- A backend process does not recover from a ledger interruption on its own (ADR-CT-032): restart it after restarting the orderer or peers.
- The AI explanation feature refuses on purpose until a model key is configured; it is not broken.
