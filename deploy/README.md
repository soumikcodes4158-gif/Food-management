# SSFMS on AWS — deployment runbook

## Deployed environment (live)

| Item | Value |
|---|---|
| Project / account | `081473213109` |
| Selected Region | `ap-southeast-2` |
| Site URL | <https://d31vvvoobwe8vk.cloudfront.net> |
| API base | <https://d31vvvoobwe8vk.cloudfront.net/api> |
| API docs | <https://d31vvvoobwe8vk.cloudfront.net/api/docs> |
| CloudFront distribution | `E3FOPM09DTAUK5` |
| EC2 instance | `i-069eb3ae3367f8143` (`t4g.small`) |
| Frontend bucket | `ssfms-prod-site-081473213109-ap-southeast-2` |
| Backup bucket | `ssfms-prod-backups-081473213109-ap-southeast-2` |
| CloudFormation stacks | `ssfms-prod`, `ssfms-serverless` |
| WAF Web ACL | `ssfms-cloudfront-acl` (`us-east-1`, global scope) |
| Admin password | `aws secretsmanager get-secret-value --secret-id ssfms/prod/admin --query SecretString --output text --region ap-southeast-2` |

GitHub Actions / OIDC is **not used**: the project SCP denies
`iam:CreateOpenIDConnectProvider` and `iam:ListOpenIDConnectProviders`.
CloudFormation is also blocked in `us-east-1`, so the WAF is created through the
WAF API directly rather than a stack.

Track 1 architecture: one ARM EC2 instance runs the FastAPI container and
PostgreSQL with Docker Compose, a private S3 bucket holds the React build, and
a single CloudFront distribution serves the site at `/` and proxies `/api/*` to
the instance.

```
Route 53 / custom domain (optional, not created)
        │
CloudFront (HTTPS, one domain)
        ├── /api/*  ──> EC2 t4g.small:8000 ──> PostgreSQL 16 (container)
        └── /*      ──> S3 (private, Origin Access Control)
```

**Why one domain:** the browser calls `/api/...` on the same origin, so there is
no CORS configuration to get wrong and no mixed-content problem. CloudFront
provides HTTPS without requiring a custom domain.

> **Templates are local-only.** `.gitignore` excludes `deploy/*.yaml` and
> `.github/workflows/`, so a fresh clone contains only this runbook and the shell
> scripts. Keep `stack.yaml` on the machine you deploy from (or restore it from
> your own backup). `serverless.yaml` and `waf.yaml` are optional extras used by
> the live project's `ssfms-serverless` stack and WAF Web ACL; neither is needed
> for the Track 1 deployment described here.

---

## What the stack creates

| Resource | Purpose |
|---|---|
| VPC, one public subnet, internet gateway, route table | Network; no NAT gateway (saves ~$33/month) |
| `t4g.small` EC2, 30 GB gp3, Elastic IP | Runs Docker Compose (API + PostgreSQL) |
| Security group | Port 8000 open **only** to CloudFront's origin-facing managed prefix list |
| IAM role + instance profile | SSM Session Manager, Secrets Manager reads, S3 backup writes |
| SSM parameters | Repo URL, branch, stack name, backup bucket |
| Secrets Manager ×3 | `ssfms/prod/db`, `ssfms/prod/jwt`, `ssfms/prod/admin` |
| S3 frontend bucket | Private, versioned, AES256, OAC-only reads |
| S3 backup bucket | Private, versioned, 30-day expiry, nightly PostgreSQL dumps |
| CloudFront distribution | Site + `/api` proxy, HTTPS redirect, SPA 403/404 routing |
| CloudWatch alarms ×2 | CPU > 80% for 10 minutes; instance/system status check failed |
| SNS topic + email subscription | Alarm and budget notifications (confirm the email) |
| AWS Budgets | Monthly budget (default $25) with 80% actual and 100% forecast alerts |

### First-boot sequence

The instance user data:

1. Installs Docker, Git, cron, Compose, and buildx on Amazon Linux 2023 (ARM).
2. Adds a 2 GB swap file (headroom for the container build).
3. Reads the three secrets and writes `/opt/ssfms/.env` with mode `600`.
4. Clones the configured repository branch into `/opt/ssfms/app`.
5. Runs `docker compose up -d --build`.
6. Waits up to 10 minutes for `http://127.0.0.1:8000/health` to return 200.
7. Signals CloudFormation `SUCCESS` or `FAILURE` for the instance resource.

Because CloudFormation waits for the health signal, a broken bootstrap **rolls
the stack back** instead of leaving a server that silently fails.

---

## Before you deploy

### Tools

| Tool | Install |
|---|---|
| AWS CLI v2 | `winget install Amazon.AWSCLI` |
| Node.js 22 LTS | <https://nodejs.org> |
| Git | <https://git-scm.com> |
| PowerShell 5.1+ | included with Windows |

### Credentials

Use short-lived credentials — do not create root access keys.

```powershell
aws configure sso          # or: aws login
aws sts get-caller-identity
```

`deploy.ps1` defaults to the profile name `ssfms`. Pass `-AwsProfile <name>` if
your profile is different.

### Region and spend

- Confirm the project's **selected Region** in AWS Settings → **View all
  projects** → **Overview** → **Additional Info** → **Region**. The stack
  defaults to **`ap-southeast-2` (Sydney)**.
- If the selected Region is not `ap-southeast-2`, pass `-Region` and override
  `CloudFrontPrefixListId`; the managed prefix list ID is region-specific. The
  default `pl-b8a742d1` is the Sydney CloudFront origin-facing list.
- Check **AWS Settings → Billing** for an active spend limit. A spend limit can
  pause the project mid-deploy, which surfaces as sudden `AccessDenied` errors.
- Budgets and cost alerts are managed in the **AWS Billing and Cost Management**
  console.

### Optional domain

A custom domain requires an ACM certificate in **`us-east-1`** (CloudFront
scope) plus a Route 53 record. That is deliberately not in this stack; add it as
a separate step once the CloudFront URL works.

---

## Deploy

```powershell
.\deploy\deploy.ps1
```

Useful parameters:

| Parameter | Default | Notes |
|---|---|---|
| `-StackName` | `ssfms-prod` | CloudFormation stack name |
| `-Region` | `ap-southeast-2` | Use the project's selected Region |
| `-AwsProfile` | `ssfms` | AWS CLI profile |
| `-AlertEmail` | repository default | SNS/budget recipient; confirm the subscription |
| `-MonthlyBudgetUsd` | `25` | Budget amount |
| `-InstanceType` | `t4g.small` | `t4g.medium` / `t4g.large` also allowed |
| `-SkipFrontend` | off | Skip the npm build and S3 upload |

The script:

1. Verifies credentials with `sts get-caller-identity`.
2. Runs `aws cloudformation deploy` with `CAPABILITY_NAMED_IAM`.
3. Reads the stack outputs.
4. Builds the frontend with `VITE_API_BASE_URL=/api`.
5. Syncs `dist/` to the frontend bucket and invalidates CloudFront.
6. Prints the site URL, API URL, docs URL, and instance ID.

Deployment takes roughly **8–15 minutes** (EC2 bootstrap + CloudFront
propagation).

### Manual deployment

```powershell
aws cloudformation deploy `
  --template-file deploy/stack.yaml `
  --stack-name ssfms-prod `
  --region ap-southeast-2 `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides `
      AlertEmail=you@example.com `
      MonthlyBudgetUsd=25 `
      RepoBranch=soumik
```

Then build and upload the frontend:

```powershell
$env:VITE_API_BASE_URL = "/api"
npm ci
npm run build
aws s3 sync dist/ s3://<FrontendBucketName> --delete --region ap-southeast-2
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

### Branch note

The stack parameter `RepoBranch` defaults to **`soumik`**, and `deploy.ps1` does
not expose it. If your canonical branch is **`main`**, pass
`RepoBranch=main` in the manual command (or update the template) so the instance
clones the right code. Pushing to a different branch does not update a running
instance until you redeploy or switch branches over SSM.

---

## First login

Read the bootstrap admin credentials:

```powershell
aws secretsmanager get-secret-value --secret-id ssfms/prod/admin `
  --query SecretString --output text --region ap-southeast-2
```

The secret is JSON with `username` and `password`. Open the `SiteUrl` stack
output and sign in. The account is created only when no admin exists and
`ADMIN_PASSWORD` is set; there is no hardcoded `admin` / `admin123` shortcut.

Other outputs:

| Output | Use |
|---|---|
| `SiteUrl` | Public HTTPS site |
| `ApiUrl` | `https://<distribution>/api` |
| `ApiDocs` | Swagger UI |
| `InstanceId` | SSM target |
| `FrontendBucketName` | `aws s3 sync` destination |
| `BackupBucketName` | PostgreSQL dump destination |
| `DistributionId` | CloudFront invalidation |
| `AlertTopicArn` | SNS topic |
| `AdminSecretName` | `ssfms/prod/admin` |
| `RestartCommand` | Ready-made SSM redeploy command |

---

## Updating the application

### Frontend only

```powershell
$env:VITE_API_BASE_URL = "/api"
npm ci
npm run build
aws s3 sync dist/ s3://<FrontendBucketName> --delete --region ap-southeast-2
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

### Backend / full stack

1. Commit and push to the branch the instance tracks (`RepoBranch`).
2. Redeploy the container over SSM — no SSH port is open:

```powershell
aws ssm send-command `
  --instance-ids <InstanceId> `
  --document-name "AWS-RunShellScript" `
  --region ap-southeast-2 `
  --parameters commands='cd /opt/ssfms/app && git pull && cp /opt/ssfms/.env .env && docker compose up -d --build'
```

Or copy the `RestartCommand` stack output. The rebuild keeps PostgreSQL data in
the `db_data` Docker volume.

If you switched the repository's default branch, update `RepoBranch` (and, on an
existing instance, check out the new branch once over SSM before rebuilding).

### CI/CD

This repository intentionally does **not** ship GitHub Actions workflows:
`.github/workflows/` is git-ignored and the supported path is direct deployment
from a trusted machine. The earlier OIDC workflow was removed because the
project SCP denies `iam:CreateOpenIDConnectProvider` and
`iam:ListOpenIDConnectProviders`; enabling CI later requires those permissions,
a scoped deploy role, and a review of the project policy.

---

## Operations

```powershell
# Shell onto the instance (no port 22 is open)
aws ssm start-session --target <InstanceId> --region ap-southeast-2
```

Inside the instance:

```bash
cd /opt/ssfms/app

# Status
docker compose ps
curl -fsS http://127.0.0.1:8000/health

# Logs
docker compose logs -f api
docker compose logs -f db

# Restart the API after a config change
docker compose up -d --force-recreate api

# Pull a new backend revision and rebuild
git pull && cp /opt/ssfms/.env .env && docker compose up -d --build

# Manual database backup
/opt/ssfms/backup.sh
```

Configuration lives in `/opt/ssfms/.env` (written with `umask 077`). Edit it
over SSM, then recreate the API container so the new environment is picked up.
The file contains the database password, JWT secret, and bootstrap admin
password — never copy it into the repository or an image.

### Rotate a secret

1. Update the value in Secrets Manager (or edit `/opt/ssfms/.env` directly).
2. Recreate the affected container:
   ```bash
   cd /opt/ssfms/app && docker compose up -d --force-recreate api
   ```
3. If you rotate `JWT_SECRET`, every existing session is invalidated; users must
   sign in again.
4. If you rotate the database password in Secrets Manager, update
   `POSTGRES_PASSWORD` in `.env` **and** the role inside PostgreSQL before
   recreating both containers.

---

## Backups and restore

- Cron runs at **20:17 UTC (01:47 IST)** from `/etc/cron.d/ssfms-backup`.
- `pg_dump -Fc` output is uploaded to
  `s3://<BackupBucketName>/postgres/<UTC-stamp>.dump`.
- Uploads use SSE-S3 (`AES256`); the bucket is private and versioned.
- Current dumps expire after **30 days**; noncurrent versions after **7 days**.
- Logs go to `/var/log/ssfms-backup.log`.

Manual backup: `/opt/ssfms/backup.sh`.

Restore:

```bash
cd /opt/ssfms/app
aws s3 cp s3://<BackupBucketName>/postgres/<stamp>.dump /tmp/restore.dump
docker compose exec -T db pg_restore -U ssfms -d ssfms --clean --if-exists < /tmp/restore.dump
```

Test a restore into a disposable stack before relying on it. Backups are only as
good as the last restore you verified.

---

## Monitoring and alerts

- **CPU alarm:** average > 80% for 10 minutes.
- **Status check alarm:** instance or system status check failed.
- **SNS:** both alarms publish to the alert topic; confirm the email
  subscription or no notifications are delivered.
- **Budget:** default $25/month with alerts at 80% actual and 100% forecast.
- **Health:** CloudFormation and operators use `/health`, which returns `503`
  when PostgreSQL is unreachable.

CloudFront access logs and CloudWatch Logs shipping are not enabled by this
stack. The live environment additionally has the `ssfms-cloudfront-acl` WAF Web
ACL, created through the WAF API; see the live environment table above.

---

## Estimated monthly cost

`ap-southeast-2`, on-demand, low traffic:

| Item | USD/month |
|---|---|
| `t4g.small` EC2 (730 h) | ~13.00 |
| 30 GB gp3 EBS | ~2.40 |
| Elastic IP (attached) | 0 |
| S3 + CloudFront | ~1.00 |
| Secrets Manager (3 secrets) | ~1.20 |
| CloudWatch alarms (2) | ~0.20 |
| SNS email | ~0 |
| **Total** | **~$18 (≈ ₹1,550)** |

Free-tier credits may reduce the first months. This estimate covers the Track 1
`ssfms-prod` stack only; the live project also runs the `ssfms-serverless` stack
and a WAF Web ACL, which add their own charges. Verify current pricing and free
tier terms in the AWS console before deploying; the 2025+ free tier is
credit-based.

---

## Teardown

Empty both buckets first — CloudFormation cannot delete non-empty buckets:

```powershell
aws s3 rm s3://<FrontendBucketName> --recursive
aws s3 rm s3://<BackupBucketName> --recursive
```

Take a final database dump if you need the data:

```bash
/opt/ssfms/backup.sh
aws s3 cp s3://<BackupBucketName>/postgres/<stamp>.dump .
```

Then delete the stack:

```powershell
aws cloudformation delete-stack --stack-name ssfms-prod --region ap-southeast-2
aws cloudformation wait stack-delete-complete --stack-name ssfms-prod --region ap-southeast-2
```

This removes the instance, Elastic IP, VPC, distribution, secrets, and buckets.
CloudFront deletion can take several minutes.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Stack rolls back at `AppInstance` | User-data bootstrap failed | Inspect `/var/log/cloud-init-output.log` over SSM (or the stack events); fix and rerun `deploy/bootstrap-instance.sh` |
| `CREATE_FAILED` on the instance | Missing repo access, bad branch, Docker build error | Check `git clone` and `docker compose build` output in the log |
| `502` from CloudFront on `/api/*` | API container unhealthy or DB not ready | `docker compose ps`, `docker compose logs api db`, `curl /health` |
| `403` on site routes | OAC/bucket policy mismatch | Re-sync `dist/`; verify the bucket policy allows the distribution ARN |
| Blank page after upload | Cached old `index.html` or missing assets | Re-run `aws s3 sync` and invalidate `/*` |
| Login "cannot connect" | Frontend built without `/api` | Rebuild with `VITE_API_BASE_URL=/api` |
| `503` on prediction | Model missing from the image | Ensure `ML/ssfms_monthly_model.pkl` exists and the image copies `ML/` |
| Admin secret invalid | Secret regenerated but DB still has the old admin | Read `ssfms/prod/admin`; the bootstrap only runs when no admin exists |
| `AccessDenied` on AWS calls | Expired SSO session or active spend limit | `aws sso login` / `aws login`; check AWS Settings → Billing |
| Prefix list / region error | Deploying outside the template's Region | Use the selected Region and override `CloudFrontPrefixListId` |
| Budget alarm at 80% | Normal early-warning | Review usage; adjust `MonthlyBudgetUsd` only deliberately |

CloudFormation events are the fastest way to find the failing resource:

```powershell
aws cloudformation describe-stack-events --stack-name ssfms-prod `
  --region ap-southeast-2 --max-items 30
```

---

## Security notes

- **No SSH.** Port 22 is closed; administrative access is SSM Session Manager.
- **API is not public.** Port 8000 accepts traffic only from CloudFront's
  origin-facing prefix list.
- **Private storage.** Both buckets block public access and are encrypted at
  rest; CloudFront reads the site through OAC with a source-ARN condition.
- **Secrets.** Database password, JWT key, and bootstrap admin password live in
  Secrets Manager and are written to a mode-`600` env file on the instance.
- **No static AWS keys.** The instance uses an IAM role; local operators use SSO.
- **Least privilege.** The instance role is limited to SSM core, the three
  secrets, and the backup bucket/parameter.
- **Auth.** Passwords are bcrypt-hashed; JWTs expire after 8 hours by default.
- **Rotate** the admin password and `JWT_SECRET` after sharing the site with
  others, and never commit `.env` or `deploy/*.yaml`.

---

## Deliberately not in this stack

| Feature | Why deferred |
|---|---|
| Custom domain + ACM | ACM for CloudFront must live in `us-east-1`; separate stack |
| AWS WAF | Created outside this stack for the live site (`ssfms-cloudfront-acl`, `us-east-1`); CloudFormation is blocked there, so it is managed through the WAF API |
| RDS instead of container PostgreSQL | +$15/month and a VPC/NAT redesign |
| Cognito | Worth it only with password reset, MFA, or many schools |
| Nightly ML retraining | Needs real data first; the model is synthetic |
| SES report emails | Requires domain verification and sandbox exit |
| Textract receipt OCR | A product change, not an infrastructure one |
| Multi-AZ / autoscaling | Overkill for one school; the stack is intentionally cheap |
| CloudFront access logs | Add when you need traffic analytics or abuse forensics |

---

## Template reference

### `stack.yaml` parameters

| Parameter | Default | Notes |
|---|---|---|
| `ProjectName` | `ssfms` | Lowercase alphanumeric/hyphen, 3–20 chars |
| `Environment` | `prod` | `dev` or `prod` |
| `InstanceType` | `t4g.small` | ARM family only with the default AMI |
| `RepoUrl` | public GitHub repository | Must be reachable from the instance |
| `RepoBranch` | `soumik` | Branch to clone |
| `AlertEmail` | repository default | Must be confirmed |
| `MonthlyBudgetUsd` | `25` | 1–1000 |
| `CloudFrontPrefixListId` | `pl-b8a742d1` | Sydney origin-facing prefix list |
| `AmiSsmParameter` | AL2023 ARM64 | Override with an x86_64 AMI for `t3` |

### Outputs

`SiteUrl`, `ApiUrl`, `ApiDocs`, `InstanceId`, `FrontendBucketName`,
`DistributionId`, `BackupBucketName`, `AlertTopicArn`, `AdminSecretName`,
`RestartCommand`.

### Helper scripts

| Script | Purpose |
|---|---|
| `deploy.ps1` | Deploy the stack and publish the frontend |
| `bootstrap-instance.sh` | Re-run first-boot setup safely over SSM |
| `backup.sh` | Dump PostgreSQL to S3 |
