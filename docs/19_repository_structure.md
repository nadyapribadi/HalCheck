# HALCHECK — Repository Structure Guide

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Repository Identity

```text
Repository: halcheck
Visibility: Private
Relationship to halcheck: Same repository; Compliance Trail is a bounded module inside HALCHECK
```

**Reasoning:** HALCHECK's core screening app keeps its static, no-backend architecture claim. Compliance Trail is a separately bounded module in the same repository with its own backend/Fabric build path, so the repo can contain both without implying the static core app itself has become a backend system — see Decision Log ADR-CT-019.

## 2. Full Directory Tree

```text
halcheck/
|-- .github/
|   `-- workflows/                # CI checks — deferred, not required to start
|-- docs/
|   |-- 00_project_charter.md
|   |-- 01_prd.md
|   |-- 02_brd.md
|   |-- 03_frd.md
|   |-- 04_trd.md
|   |-- 05_architecture.md
|   |-- 06_erd.md
|   |-- 07_test_strategy.md
|   |-- 08_security_threat_model.md
|   |-- 09_ui_specification.md
|   |-- 10_ui_flow_navigation.md
|   |-- 11_screen_requirements.md
|   |-- 12_seed_data_specification.md
|   |-- 13_implementation_plan.md
|   |-- 14_developer_setup.md
|   |-- 15_config_reference.md
|   |-- 16_risk_register.md
|   |-- 17_api_reference.md
|   |-- 18_vibe_coding_guardrails.md
|   |-- 19_repository_structure.md
|   |-- 20_glossary.md
|   |-- 21_decisions.md
|   |-- 22_requirements_traceability.md
|   `-- 23_roadmap.md
|-- chaincode/
|   |-- batch/
|   |   `-- go.mod
|   `-- refdata/
|       `-- go.mod
|-- backend/
|   |-- src/
|   |   |-- routes/
|   |   |-- admin/
|   |   |-- ai/
|   |   `-- rbac/
|   |-- .env.example
|   `-- package.json
|-- frontend/
|   |-- src/
|   |-- public/
|   |-- .env.local.example
|   `-- package.json
|-- network/
|   |-- connection-profile.example.json
|   |-- configtx.yaml
|   `-- crypto-config.yaml
|-- docker-compose.yml
|-- .gitignore
|-- README.md
`-- LICENSE
```

## 3. What Belongs in Version Control

- All source code (frontend, backend, chaincode)
- All 24 documents under `docs/`
- `docker-compose.yml`
- `.env.example` / `.env.local.example` — placeholder templates only
- `connection-profile.example.json`, `configtx.yaml`, `crypto-config.yaml` — structure/policy definitions, not generated secrets
- Dependency manifests and lockfiles

## 4. What Must Never Be Committed

| Item | Why |
|---|---|
| `.env`, `.env.local` (real) | Real secrets |
| `network/wallet/`, any keystore directory | Private keys |
| `network/crypto-config/` (generated output) | Actual certificates/private keys |
| `network/organizations/`, `network/channel-artifacts/` | Generated Fabric identities and channel artifacts |
| `*.pem`, `*.key`, `*.crt`, `*.p12`, `*_sk` | Cryptographic material, including Fabric private-key filenames |
| Docker volume data (Postgres, CouchDB, MinIO) | Runtime state, not source |
| Real `connection-profile.json` | May contain real internal endpoints |
| Logs, `*.log` | May contain sensitive runtime detail even redacted |
| `node_modules/`, `dist/`, `build/` | Regenerable |
| `backups/` | Local volume backup output, not source |

## 5. `.gitignore`

```text
# Secrets
.env
.env.local
network/wallet/
network/crypto-config/
network/organizations/
network/channel-artifacts/
*.pem
*.key
*.crt
*.p12
*_sk

# Runtime data
logs/
*.log
postgres-data/
couchdb-data/
minio-data/
backups/

# Dependencies / build output
node_modules/
dist/
build/

# OS/editor cruft
.DS_Store
.vscode/settings.json
```

## 6. README Outline

1. One-paragraph HALCHECK description.
2. Explicit scope split: Core Screening App vs. Compliance Trail.
3. Honesty line: Compliance Trail is a planned real Hyperledger Fabric implementation, self-hosted, not permanently hosted.
4. Link to `docs/` for full documentation.
5. Quick-start pointer to `docs/14_developer_setup.md` once Build starts.
6. Known limitations, stated plainly.

## 7. HALCHECK README Scope Language

HALCHECK's README must not describe the whole repository as browser-only once Compliance Trail source is present. It should describe the core screening app as browser-only, then separately describe Compliance Trail as the planned accountability module with backend/Fabric infrastructure.

## 8. Branch Strategy

```text
main         — always in a working, demo-able state
feature/*    — one branch per Implementation Plan phase (e.g. feature/p2-chaincode-rules)
```

No complex gitflow needed at solo-developer scale.

## 9. Commit Message Convention

```text
feat: add ingredient submission chaincode function
fix: correct sequencing check in production confirmation
test: add negative test for cross-role export attempt
docs: update TRD with read-only access requirements
chore: rotate default MinIO credentials
```

## 10. Pre-Push Checklist

- [ ] `.gitignore` confirmed covering everything in Section 4 before the first commit
- [ ] Secret scan run against working tree and history
- [ ] No `.env` (non-example) present in `git status`
- [ ] No generated `crypto-config/` or `wallet/` output staged
- [ ] Dependency scan passed (see Developer Setup Section 12)

## 11. Documentation and Repository Hygiene Acceptance

**Status:** Accepted on 2026-08-22.

The pre-P0 baseline was checked for documentation consistency, untracked/generated material, ignore coverage, tracked cryptographic material, high-confidence secret markers in the current non-document tree and Git history, and local numbered-document links. No secret or generated material was found. `backup-volumes.sh` and `health-check.sh` are executable and passed shell syntax validation.

The acceptance added ignore coverage for `network/organizations/`, `network/channel-artifacts/`, `*.crt`, `*.p12`, and Fabric private-key filenames ending in `_sk`. It does not replace P0 runtime validation, dependency scanning, or later security gates. Before retaining generated Fabric material, rerun the tracked-file and secret checks.
