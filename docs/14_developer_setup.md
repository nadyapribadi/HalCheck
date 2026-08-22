# HALCHECK — Developer Setup / Installation Guide

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Status

Design phase complete. Build phase not yet started. This guide covers environment setup only — no working code exists yet to run.

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
