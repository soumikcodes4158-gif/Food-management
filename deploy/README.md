# SSFMS on AWS — deployment runbook

Track 1 architecture: one ARM EC2 instance runs the FastAPI container and
PostgreSQL with Docker Compose, a private S3 bucket holds the React build, and
a single CloudFront distribution serves the site at `/` and proxies `/api/*`
to the instance.

```
Route53/custom domain (later)      optional
        │
CloudFront (HTTPS, one domain) ──── /api/* ──> EC2:8000 (FastAPI) ──> Postgres (container)
        └── default ─────────────> S3 (private, OAC)
```

Why one domain: the browser calls `/api/...` on the same origin, so there is no
CORS configuration to get wrong and no mixed-content problem. CloudFront gives
you HTTPS without owning a domain.

---

## 0. Prerequisites

| Tool | Install |
|---|---|
| AWS CLI v2 | `winget install Amazon.AWSCLI` |
| Node 22 | already installed |
| Git | already installed |

### AWS account bootstrap (one time, in the console)

1. Sign in as the root user of `soumikcodes4158@gmail.com`.
2. **Enable MFA on root** (Security credentials → MFA). Never create root access keys.
3. **IAM → Identity Center** (or IAM user) → create an admin identity with MFA.
4. Billing → **Budgets** → confirm the $25 budget created by the stack.
5. Pick region **ap-south-1 (Mumbai)** for everything.

### Local credentials

```powershell
aws configure sso
# or, for a simple classroom setup:
aws configure
#   Access key ID / Secret / region: ap-south-1 / output: json
aws sts get-caller-identity
```

---

## 1. Deploy the infrastructure

```powershell
.\deploy\deploy.ps1
```

Or manually:

```powershell
aws cloudformation deploy `
  --template-file deploy/stack.yaml `
  --stack-name ssfms-prod `
  --region ap-south-1 `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides AlertEmail=soumikcodes4158@gmail.com MonthlyBudgetUsd=25
```

What the stack creates:

| Resource | Purpose |
|---|---|
| VPC + 1 public subnet + IGW | Network, no NAT gateway (saves ~$33/mo) |
| t4g.small EC2 + 30 GB gp3 + EIP | Runs Docker Compose (API + Postgres) |
| Security group | Port 8000 open **only** to CloudFront's origin-facing prefix list |
| IAM role + instance profile | SSM access, secret reads, S3 backup writes |
| Secrets Manager ×3 | DB password, JWT signing key, bootstrap admin password |
| S3 ×2 | Frontend build (private + OAC), nightly DB backups |
| CloudFront | Site + `/api` proxy, HTTPS, SPA error routing |
| CloudWatch alarms | CPU > 80%, status check failure |
| SNS topic | Email alerts (confirm the subscription) |
| AWS Budgets | $25/month with 80% actual and 100% forecast alerts |

The instance clones the public GitHub repo on first boot, builds the image, and
signals CloudFormation **only after** `/health` returns 200. If bootstrap fails
the stack rolls back instead of silently shipping a broken server.

---

## 2. Get the admin password

```powershell
aws secretsmanager get-secret-value --secret-id ssfms/prod/admin `
  --query SecretString --output text --region ap-south-1
```

Read the site URL from the stack outputs, open it, and log in with that
`username` / `password`. The account is created only when no admin exists.
There is no longer a hardcoded `admin/admin123` shortcut.

---

## 3. Push frontend changes

```powershell
$env:VITE_API_BASE_URL="/api"
npm run build
aws s3 sync dist/ s3://<FrontendBucketName> --delete
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

`deploy.ps1` does this for you.

---

## 4. CI/CD (optional, recommended)

```powershell
aws cloudformation deploy `
  --template-file deploy/github-oidc.yaml `
  --stack-name ssfms-github-oidc `
  --region ap-south-1 `
  --capabilities CAPABILITY_NAMED_IAM
```

Then in GitHub → Settings → Secrets and variables → Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `AWS_DEPLOY_ROLE_ARN` | stack output `RoleArn` |
| Variable | `FRONTEND_BUCKET` | stack output `FrontendBucketName` |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | distribution id |
| Variable | `APP_INSTANCE_ID` | stack output `InstanceId` |

Every push to `soumik` then lints, builds, uploads to S3, invalidates the CDN,
and rebuilds the container over SSM. No access keys are stored in GitHub.

---

## 5. Operations

```powershell
# Shell onto the instance (no port 22 is open)
aws ssm start-session --target <InstanceId> --region ap-south-1

# Logs
docker compose -f /opt/ssfms/app/docker-compose.yml logs -f api
docker compose -f /opt/ssfms/app/docker-compose.yml logs -f db

# Restart after a manual change
cd /opt/ssfms/app && git pull && cp /opt/ssfms/.env .env && docker compose up -d --build

# Manual backup
/opt/ssfms/backup.sh

# Restore a dump
aws s3 cp s3://<BackupBucketName>/postgres/<stamp>.dump .
docker compose exec -T db pg_restore -U ssfms -d ssfms --clean --if-exists < <stamp>.dump
```

Nightly backups run at 01:47 IST, are encrypted with SSE-S3, versioned, and
expire after 30 days.

---

## 6. Estimated monthly cost (ap-south-1, on-demand)

| Item | USD/month |
|---|---|
| t4g.small EC2 (730 h) | ~13 |
| 30 GB gp3 EBS | ~2.40 |
| Elastic IP (attached) | 0 |
| S3 + CloudFront (low traffic) | ~1 |
| Secrets Manager (3 secrets) | ~1.20 |
| CloudWatch alarms (2) | ~0.20 |
| SNS email | ~0 |
| **Total** | **~$18 (≈ ₹1,550)** |

Free-tier accounts may pay less in the first 6–12 months. Verify current terms
in the AWS console — the 2025 Free Tier is credit-based.

---

## 7. Teardown

```powershell
aws cloudformation delete-stack --stack-name ssfms-prod --region ap-south-1
```

The S3 buckets contain objects and will block deletion; empty them first:

```powershell
aws s3 rm s3://<FrontendBucketName> --recursive
aws s3 rm s3://<BackupBucketName> --recursive
```

---

## Not in this stack (deliberately)

These have real value but are not worth the complexity for a first deployment:

| Feature | Why deferred |
|---|---|
| Custom domain + ACM | ACM for CloudFront must live in `us-east-1` → separate stack |
| AWS WAF | Also `us-east-1` for CloudFront scope; ~$5/mo |
| RDS instead of container Postgres | +$15/mo and needs a VPC/NAT redesign |
| Cognito | Only worth it if you need password reset, MFA, or many schools |
| Nightly ML retraining | Needs real data first; the model is trained on synthetic rows |
| SES report emails | Requires domain verification and sandbox exit |
| Textract receipt OCR | Great feature, but a product change, not an infra one |
