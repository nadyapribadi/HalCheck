#!/bin/bash
set -euo pipefail

BACKUP_DIR="./backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker run --rm -v halcheck_postgres-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/postgres-data.tar.gz /data
docker run --rm -v halcheck_minio-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/minio-data.tar.gz /data
docker run --rm -v halcheck_couchdb-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/couchdb-data.tar.gz /data

echo "Backup complete: $BACKUP_DIR"
