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

**A real bug this deployment step caught, that unit tests structurally could not:** contractapi generates its own JSON schema for every transaction's return type and validates the actual response against it. Schema-required vs. optional is driven entirely by a dedicated `metadata:"...,optional"` struct tag — the `json:",omitempty"` tag has no effect on it. `ReferenceEntry`'s `superseded_by`/`deprecated_by`/`deprecated_at` (correctly empty and omitted from the JSON for a freshly-added entry) failed contractapi's schema validation on the very first live invoke, because those fields were schema-required by default. Unit tests never exercised this: they call the Go functions directly, bypassing `contractapi.ContractChaincode.Invoke()`'s dispatch and schema-validation layer entirely. Fixed by adding the missing `metadata` tags to every optional field in both `ReferenceEntry`, `ReferenceEntryHistoryItem`, and `IngredientRecord`; redeployed as v1.1 (sequence 2) on both chaincodes. This is the concrete argument for why `docs/07_test_strategy.md`'s "Chaincode Conformance Tests ... tested against the full local network (not mocked)" layer exists as its own category, not a redundant repeat of unit tests.

A second infrastructure lesson from the same session: a multi-hour-old Docker daemon hiccup left both peers' internal chaincode-container tracking stale (a `basicgo` container had silently exited; new chaincode builds for `refdata`/`batch` never even started). Symptom was `"No such image"` on every invoke with no new build attempt logged. Fix was a plain `docker restart` of both peer containers — safe, no ledger data lost (peers reload existing ledger state from disk) — after which builds proceeded normally.

## 2. Requirements

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
