#!/bin/bash
# Pre-demo health check (docs/14_developer_setup.md §15). Exits non-zero if
# anything the walkthrough depends on is missing, so "it looked fine" can't
# be mistaken for "it was checked".
#
# Two stale checks were corrected here during P10: the backend port was 3000
# (it has been 3001 since the P4 build, so the old script always reported
# BACKEND UNHEALTHY), and CouchDB was checked although docker-compose.yml has
# never run one -- the ledger uses LevelDB, so the check was noise.
set -uo pipefail

fail=0
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '  ok    %s\n' "$label"
  else
    printf '  FAIL  %s\n' "$label"
    fail=1
  fi
}

echo "Off-chain stores"
check "postgres healthy"  bash -c 'docker compose ps postgres --format "{{.Status}}" | grep -q healthy'
check "minio healthy"     bash -c 'docker compose ps minio --format "{{.Status}}" | grep -q healthy'

echo "Ledger"
check "orderer running"   bash -c 'docker ps --format "{{.Names}}" | grep -q "^orderer.example.com$"'
check "peer0.org1 running" bash -c 'docker ps --format "{{.Names}}" | grep -q "^peer0.org1.example.com$"'
check "peer0.org2 running" bash -c 'docker ps --format "{{.Names}}" | grep -q "^peer0.org2.example.com$"'
check "peer bound to loopback only" bash -c 'docker ps --format "{{.Ports}}" | grep -q "127.0.0.1:7051->7051"'

echo "Application"
check "backend /health on :3001" bash -c 'curl -sf -m 5 http://localhost:3001/health >/dev/null'
check "frontend on :5173"       bash -c 'curl -sf -m 5 http://localhost:5173/ >/dev/null'
# MinIO publishes a port range (9000-9001), so this checks the binding prefix
# rather than an exact "9000->9000" mapping.
check "minio bound to loopback only" bash -c 'docker ps --format "{{.Ports}}" | grep -q "127.0.0.1:9000"'

echo
if [ "$fail" -ne 0 ]; then
  echo "Health check FAILED - fix the items marked FAIL before recording or sharing a link."
  exit 1
fi
echo "Health check complete - all checks passed."
