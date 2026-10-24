#!/bin/bash
# Nightly PostgreSQL logical backup to S3. Runs from cron on the app server.
set -euo pipefail

APP_DIR="/opt/ssfms"
# shellcheck disable=SC1091
source "$APP_DIR/.env"

: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/ssfms-${STAMP}.dump"

cd "$APP_DIR/app"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$FILE"

aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/postgres/${STAMP}.dump" \
	--sse AES256 \
	--only-show-errors

rm -f "$FILE"
echo "backup uploaded: s3://${BACKUP_BUCKET}/postgres/${STAMP}.dump"
