#!/bin/bash
set -euo pipefail

docker compose ps
echo "---"
curl -sf http://localhost:3000/health || echo "BACKEND UNHEALTHY"
curl -sf http://localhost:5984/_up || echo "COUCHDB UNHEALTHY"
echo "Health check complete - review output above before proceeding."
