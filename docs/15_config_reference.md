# HALCHECK — Configuration Reference

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Default Locations

```text
halcheck/
|-- .env                     # local secrets, never committed
|-- .env.example              # placeholder template, committed
|-- docker-compose.yml         # orchestrates Fabric + Postgres + MinIO
|-- network/
|   |-- connection-profile.json    # Fabric network connection details
|   `-- crypto-config/              # identity/certificate material (never committed)
|-- backend/
|   `-- config/
|       `-- default.json            # non-secret backend config
`-- frontend/
    `-- .env.local             # frontend-side non-secret config
```

## 2. Backend `.env` Keys

```text
# Fabric connection
FABRIC_CONNECTION_PROFILE=./network/connection-profile.json
FABRIC_WALLET_PATH=./network/wallet
FABRIC_CHANNEL_NAME=compliancetrail
FABRIC_CHAINCODE_NAME=batch

# Auth
JWT_SECRET=<rotate before any external exposure>
JWT_EXPIRY=8h

# Off-chain database
DATABASE_URL=postgresql://user:password@localhost:5432/compliancetrail

# File storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=<rotate from default>
MINIO_SECRET_KEY=<rotate from default>
MINIO_BUCKET=halcheck-compliance-trail-files

# CORS
ALLOWED_ORIGIN=http://localhost:5173

# Reliability
SDK_TIMEOUT_MS=10000
AI_QUESTION_SOFT_CAP=20
```

## 3. Frontend Config

```text
VITE_API_BASE_URL=http://localhost:3000
```

No secrets belong in frontend config — anything here is publicly visible in the browser by definition.

## 4. Docker Compose Configuration Keys

| Service | Key settings |
|---|---|
| Fabric peer(s) | Ports, MSP paths, CouchDB connection |
| Fabric orderer | Raft consensus config, TLS certs |
| Fabric CA | Admin credentials (rotate before exposure), TLS |
| CouchDB | Admin credentials (rotate from default) |
| PostgreSQL | `POSTGRES_USER`, `POSTGRES_PASSWORD` (rotate), `POSTGRES_DB` |
| MinIO | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (rotate from `minioadmin`/`minioadmin` default) |
| Backend | Reads from `.env`, exposes only its intended port |

**Log rotation** (applied to every service):

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

**Health checks:** every service defines a health check; backend uses `depends_on: condition: service_healthy` against the Fabric network and PostgreSQL.

## 5. Tunnel Configuration

```yaml
# cloudflared config.yml
tunnel: compliancetrail-demo
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: <chosen-subdomain>.<your-domain>
    service: http://localhost:5173   # frontend only
  - hostname: <chosen-subdomain>-api.<your-domain>
    service: http://localhost:3000   # backend API only
  - service: http_status:404          # catch-all — everything else explicitly refused
```

The catch-all rule guarantees nothing besides the two named services is ever reachable through the tunnel.

## 6. Chaincode Configuration

Files that must be manually reviewed before use, not accepted as generated:

```text
network/configtx.yaml       # channel policies — who can read/write which channel
network/crypto-config.yaml  # organization and identity structure
```

## 7. Object Storage Key Convention

```text
{batchId}/{recordType}/{sha256hash}.{ext}
```

Example: `SL-2026-002/ingredient/a1b2c3....csv`. Makes any file directly locatable from ledger data alone — no separate mapping table required.

## 8. Secret Rules

- Never commit `.env`, `crypto-config/`, or any wallet/identity material.
- Only `.env.example` (placeholder values, clearly fake) is committed.
- No default credential (Fabric CA admin, PostgreSQL, MinIO root) survives past local-only testing — rotate before any tunnel activation, every time.
- `JWT_SECRET` must be a real random value, never the same value across environments.
- Redact any credential-looking value before it could appear in logs.
- Rotating `JWT_SECRET` invalidates all active sessions immediately — accepted behavior, not an incident.

## 9. Environment Variables Summary

```text
# Backend
FABRIC_CONNECTION_PROFILE
FABRIC_WALLET_PATH
FABRIC_CHANNEL_NAME
FABRIC_CHAINCODE_NAME
JWT_SECRET
JWT_EXPIRY
DATABASE_URL
MINIO_ENDPOINT
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET
ALLOWED_ORIGIN
SDK_TIMEOUT_MS
AI_QUESTION_SOFT_CAP

# Frontend (non-secret only)
VITE_API_BASE_URL

# Docker Compose
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
```

## 10. Config Validation Rule

Before any `docker compose up` that will be followed by a tunnel activation, confirm every credential-bearing variable above has been changed from its template/default value — this is the same check as the Pre-Demo Checklist in Developer Setup, restated here as a configuration-level rule.
