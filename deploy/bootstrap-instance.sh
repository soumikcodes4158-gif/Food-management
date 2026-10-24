#!/bin/bash
# Manual re-run of the instance bootstrap, safe to execute over SSM after a
# failed first boot. Mirrors the UserData block in deploy/stack.yaml.
set -euxo pipefail

APP_DIR="/opt/ssfms"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-southeast-2}"

param() { aws ssm get-parameter --name "$1" --query Parameter.Value --output text; }
secret() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }
json_field() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

APP_REPO="$(param /ssfms/prod/repo-url)"
APP_BRANCH="$(param /ssfms/prod/repo-branch)"
STACK_NAME="$(param /ssfms/prod/stack-name)"
BACKUP_BUCKET="$(param /ssfms/prod/backup-bucket)"

if [ ! -f /swapfile ]; then
	dd if=/dev/zero of=/swapfile bs=1M count=2048
	chmod 600 /swapfile
	mkswap /swapfile
	swapon /swapfile
	echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

dnf install -y docker git cronie
systemctl enable --now docker
systemctl start docker
usermod -aG docker ec2-user

case "$(uname -m)" in
aarch64)
	COMPOSE_ARCH="aarch64"
	DOCKER_ARCH="arm64"
	;;
*)
	COMPOSE_ARCH="x86_64"
	DOCKER_ARCH="amd64"
	;;
esac
mkdir -p /usr/libexec/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
	-o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# `docker compose build` requires the buildx plugin, which AL2023 lacks.
BUILDX_VERSION="$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest |
	sed -n 's/.*"tag_name": "\(v[^"]*\)".*/\1/p' | head -n1)"
BUILDX_VERSION="${BUILDX_VERSION:-v0.30.1}"
curl -fsSL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${DOCKER_ARCH}" \
	-o /usr/libexec/docker/cli-plugins/docker-buildx
chmod +x /usr/libexec/docker/cli-plugins/docker-buildx

DB_JSON="$(secret ssfms/prod/db)"
JWT_JSON="$(secret ssfms/prod/jwt)"
ADMIN_JSON="$(secret ssfms/prod/admin)"

DB_USER="$(printf '%s' "$DB_JSON" | json_field username)"
DB_PASS="$(printf '%s' "$DB_JSON" | json_field password)"
JWT_SECRET="$(printf '%s' "$JWT_JSON" | json_field secret)"
ADMIN_USER="$(printf '%s' "$ADMIN_JSON" | json_field username)"
ADMIN_PASS="$(printf '%s' "$ADMIN_JSON" | json_field password)"

mkdir -p "$APP_DIR"
umask 077
cat >"$APP_DIR/.env" <<ENVFILE
POSTGRES_DB=ssfms
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASS}
JWT_SECRET=${JWT_SECRET}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
ADMIN_NAME=Administrator
ACCESS_TOKEN_EXPIRE_MINUTES=480
BACKUP_BUCKET=${BACKUP_BUCKET}
ENVFILE
umask 022

if [ ! -d "$APP_DIR/app/.git" ]; then
	git clone --branch "$APP_BRANCH" --depth 1 "$APP_REPO" "$APP_DIR/app"
fi

cd "$APP_DIR/app"
cp "$APP_DIR/.env" .env
docker compose up -d --build

install -m 0750 "$APP_DIR/app/deploy/backup.sh" "$APP_DIR/backup.sh"
cat >/etc/cron.d/ssfms-backup <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
17 20 * * * root /opt/ssfms/backup.sh >>/var/log/ssfms-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/ssfms-backup

RESULT=1
for _ in $(seq 1 60); do
	if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
		RESULT=0
		break
	fi
	sleep 10
done

if [ "$RESULT" -eq 0 ]; then SIGNAL_STATUS=SUCCESS; else SIGNAL_STATUS=FAILURE; fi
INSTANCE_ID="$(curl -fsS -H 'X-aws-ec2-metadata-token: '"$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')"'' http://169.254.169.254/latest/meta-data/instance-id)"
aws cloudformation signal-resource --stack-name "$STACK_NAME" \
	--logical-resource-id AppInstance --unique-id "$INSTANCE_ID" \
	--status "$SIGNAL_STATUS" --region "$AWS_DEFAULT_REGION" || true

echo "bootstrap finished with status $SIGNAL_STATUS"
