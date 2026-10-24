# SSFMS — AWS Console Links

All resources belong to project/account **081473213109**.
Selected Region: **ap-southeast-2** (Sydney). CloudFront, WAF, IAM and Budgets use the global / `us-east-1` console.

> Console URLs occasionally change. Every entry also lists the CLI command that prints the same information.

---

## Live application

| What | Link |
|---|---|
| Web app | https://d31vvvoobwe8vk.cloudfront.net |
| API base | https://d31vvvoobwe8vk.cloudfront.net/api |
| API docs (Swagger) | https://d31vvvoobwe8vk.cloudfront.net/api/docs |
| Health check | https://d31vvvoobwe8vk.cloudfront.net/api/health |

---

## Compute

| Service | Resource | Console link | CLI |
|---|---|---|---|
| **EC2** | `i-069eb3ae3367f8143` (t4g.small) | [Instance details](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#InstanceDetails:instanceId=i-069eb3ae3367f8143) | `aws ec2 describe-instances --instance-ids i-069eb3ae3367f8143 --region ap-southeast-2` |
| **EC2** | All instances | [Instances](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#Instances:) | `aws ec2 describe-instances --region ap-southeast-2` |
| **EBS** | `vol-018cd06cef5ae6a66` (30 GB gp3) | [Volume](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#VolumeDetails:volumeId=vol-018cd06cef5ae6a66) | `aws ec2 describe-volumes --region ap-southeast-2` |
| **Elastic IP** | `13.238.15.128` / `eipalloc-081d9886729b8a70c` | [Elastic IPs](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#Addresses:) | `aws ec2 describe-addresses --region ap-southeast-2` |
| **Lambda** | `ssfms-prod-health-monitor` | [Function](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions/ssfms-prod-health-monitor) | `aws lambda get-function --function-name ssfms-prod-health-monitor --region ap-southeast-2` |
| **Lambda** | Test invoke | [Test tab](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions/ssfms-prod-health-monitor?tab=testing) | `aws lambda invoke --function-name ssfms-prod-health-monitor --payload '{}' --cli-binary-format raw-in-base64-out out.json --region ap-southeast-2` |

---

## Networking

| Service | Resource | Console link | CLI |
|---|---|---|---|
| **VPC** | `vpc-0a4bee329dd4ef48c` | [VPC details](https://ap-southeast-2.console.aws.amazon.com/vpc/home?region=ap-southeast-2#VpcDetails:VpcId=vpc-0a4bee329dd4ef48c) | `aws ec2 describe-vpcs --region ap-southeast-2` |
| **Subnet** | `subnet-0b1d2b4611d9203f2` (public, ap-southeast-2a) | [Subnet](https://ap-southeast-2.console.aws.amazon.com/vpc/home?region=ap-southeast-2#SubnetDetails:subnetId=subnet-0b1d2b4611d9203f2) | `aws ec2 describe-subnets --region ap-southeast-2` |
| **Route table** | `rtb-04fe926f87451791c` | [Route table](https://ap-southeast-2.console.aws.amazon.com/vpc/home?region=ap-southeast-2#RouteTableDetails:RouteTableId=rtb-04fe926f87451791c) | `aws ec2 describe-route-tables --region ap-southeast-2` |
| **Internet gateway** | `igw-03c47d543f56a6a89` | [IGW](https://ap-southeast-2.console.aws.amazon.com/vpc/home?region=ap-southeast-2#InternetGatewayDetails:internetGatewayId=igw-03c47d543f56a6a89) | `aws ec2 describe-internet-gateways --region ap-southeast-2` |
| **Security group** | `sg-082841dc83e510028` (port 8000 = CloudFront only) | [Security group](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#SecurityGroup:groupId=sg-082841dc83e510028) | `aws ec2 describe-security-groups --group-ids sg-082841dc83e510028 --region ap-southeast-2` |

---

## CDN & storage

| Service | Resource | Console link | CLI |
|---|---|---|---|
| **CloudFront** | `E3FOPM09DTAUK5` | [Distribution](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home?region=us-east-1#/distributions/E3FOPM09DTAUK5) | `aws cloudfront get-distribution --id E3FOPM09DTAUK5` |
| **CloudFront** | Invalidations | [Invalidations](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home?region=us-east-1#/distributions/E3FOPM09DTAUK5/invalidations) | `aws cloudfront list-invalidations --distribution-id E3FOPM09DTAUK5` |
| **S3** | `ssfms-prod-site-081473213109-ap-southeast-2` (frontend) | [Site bucket](https://ap-southeast-2.console.aws.amazon.com/s3/buckets/ssfms-prod-site-081473213109-ap-southeast-2?region=ap-southeast-2) | `aws s3 ls s3://ssfms-prod-site-081473213109-ap-southeast-2` |
| **S3** | `ssfms-prod-backups-081473213109-ap-southeast-2` (nightly DB dumps) | [Backups bucket](https://ap-southeast-2.console.aws.amazon.com/s3/buckets/ssfms-prod-backups-081473213109-ap-southeast-2?region=ap-southeast-2) | `aws s3 ls s3://ssfms-prod-backups-081473213109-ap-southeast-2/postgres/` |

---

## Security, secrets & configuration

| Service | Resource | Console link | CLI |
|---|---|---|---|
| **IAM** | `ssfms-prod-AppInstanceRole-EdHr0YZAQxLS` | [Role](https://us-east-1.console.aws.amazon.com/iam/home?region=us-east-1#/roles/details/ssfms-prod-AppInstanceRole-EdHr0YZAQxLS) | `aws iam get-role --role-name ssfms-prod-AppInstanceRole-EdHr0YZAQxLS` |
| **Secrets Manager** | `ssfms/prod/db` | [DB secret](https://ap-southeast-2.console.aws.amazon.com/secretsmanager/secret?name=ssfms%2Fprod%2Fdb&region=ap-southeast-2) | `aws secretsmanager get-secret-value --secret-id ssfms/prod/db --region ap-southeast-2` |
| **Secrets Manager** | `ssfms/prod/jwt` | [JWT secret](https://ap-southeast-2.console.aws.amazon.com/secretsmanager/secret?name=ssfms%2Fprod%2Fjwt&region=ap-southeast-2) | `aws secretsmanager get-secret-value --secret-id ssfms/prod/jwt --region ap-southeast-2` |
| **Secrets Manager** | `ssfms/prod/admin` | [Admin secret](https://ap-southeast-2.console.aws.amazon.com/secretsmanager/secret?name=ssfms%2Fprod%2Fadmin&region=ap-southeast-2) | `aws secretsmanager get-secret-value --secret-id ssfms/prod/admin --region ap-southeast-2` |
| **SSM Parameter Store** | `/ssfms/prod/*` | [Parameters](https://ap-southeast-2.console.aws.amazon.com/systems-manager/parameters/?region=ap-southeast-2&tab=Table) | `aws ssm get-parameters-by-path --path /ssfms/prod --region ap-southeast-2` |
| **SSM Session Manager** | Managed instance | [Fleet Manager](https://ap-southeast-2.console.aws.amazon.com/systems-manager/managed-instances?region=ap-southeast-2) | `aws ssm start-session --target i-069eb3ae3367f8143 --region ap-southeast-2` |
| **WAF** | `ssfms-cloudfront-acl` | [Web ACLs (global)](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=global) | `aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1` |
| **WAF** | Web ACL detail | [ACL detail](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acl/ssfms-cloudfront-acl/16e58448-7003-4598-a1c7-ed5e4e12ce93/overview?region=global) | `aws wafv2 get-web-acl --name ssfms-cloudfront-acl --scope CLOUDFRONT --id 16e58448-7003-4598-a1c7-ed5e4e12ce93 --region us-east-1` |

---

## Observability & messaging

| Service | Resource | Console link | CLI |
|---|---|---|---|
| **CloudWatch** | Dashboard `ssfms-prod` | [Dashboard](https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#dashboards:name=ssfms-prod) | `aws cloudwatch get-dashboard --dashboard-name ssfms-prod --region ap-southeast-2` |
| **CloudWatch** | Alarms | [Alarms](https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#alarmsV2:) | `aws cloudwatch describe-alarms --region ap-southeast-2` |
| **CloudWatch** | Log groups | [Logs](https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#logsV2:log-groups) | `aws logs describe-log-groups --region ap-southeast-2` |
| **SNS** | `ssfms-prod-alerts` | [Topic](https://ap-southeast-2.console.aws.amazon.com/sns/v3/home?region=ap-southeast-2#/topic/arn%3Aaws%3Asns%3Aap-southeast-2%3A081473213109%3Assfms-prod-alerts) | `aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:ap-southeast-2:081473213109:ssfms-prod-alerts` |
| **SNS** | `ssfms-prod-health-alerts` | [Topic](https://ap-southeast-2.console.aws.amazon.com/sns/v3/home?region=ap-southeast-2#/topic/arn%3Aaws%3Asns%3Aap-southeast-2%3A081473213109%3Assfms-prod-health-alerts) | `aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:ap-southeast-2:081473213109:ssfms-prod-health-alerts` |
| **EventBridge** | Rule `ssfms-prod-health-check` | [Rules](https://ap-southeast-2.console.aws.amazon.com/events/home?region=ap-southeast-2#/rules) | `aws events list-rules --region ap-southeast-2` |

---

## Data

| Service | Resource | Console link | CLI |
|---|---|---|---|
| **DynamoDB** | `ssfms-prod-health-events` | [Table](https://ap-southeast-2.console.aws.amazon.com/dynamodbv2/home?region=ap-southeast-2#table?name=ssfms-prod-health-events) | `aws dynamodb scan --table-name ssfms-prod-health-events --region ap-southeast-2 --max-items 5` |
| **DynamoDB** | Explore items | [Items](https://ap-southeast-2.console.aws.amazon.com/dynamodbv2/home?region=ap-southeast-2#table?name=ssfms-prod-health-events&tab=items) | `aws dynamodb describe-table --table-name ssfms-prod-health-events --region ap-southeast-2` |
| **Cognito** | `ssfms-prod-users` (`ap-southeast-2_eZcCRnjAi`) | [User pool](https://ap-southeast-2.console.aws.amazon.com/cognito/v2/idp/user-pools/ap-southeast-2_eZcCRnjAi/user-pool-details/users?region=ap-southeast-2) | `aws cognito-idp list-user-pools --max-results 10 --region ap-southeast-2` |
| **RDS / Aurora** | *not used* — PostgreSQL 16 runs in Docker on EC2 | — | — |

---

## Infrastructure as code

| Stack | Console link | CLI |
|---|---|---|
| `ssfms-prod` | [Stack](https://ap-southeast-2.console.aws.amazon.com/cloudformation/home?region=ap-southeast-2#/stacks/stackinfo?stackId=arn%3Aaws%3Acloudformation%3Aap-southeast-2%3A081473213109%3Astack%2Fssfms-prod%2Fc0fbb7e0-cf88-11f1-acbe-06ffdc22469d) | `aws cloudformation describe-stacks --stack-name ssfms-prod --region ap-southeast-2` |
| `ssfms-serverless` | [Stack](https://ap-southeast-2.console.aws.amazon.com/cloudformation/home?region=ap-southeast-2#/stacks/stackinfo?stackId=arn%3Aaws%3Acloudformation%3Aap-southeast-2%3A081473213109%3Astack%2Fssfms-serverless%2F273e78e0-cf8d-11f1-9021-02ffdba642dd) | `aws cloudformation describe-stacks --stack-name ssfms-serverless --region ap-southeast-2` |
| CloudFormation (all) | [Stacks](https://ap-southeast-2.console.aws.amazon.com/cloudformation/home?region=ap-southeast-2#/stacks) | `aws cloudformation list-stacks --region ap-southeast-2` |

---

## Billing & project settings

| What | Link |
|---|---|
| AWS Settings (project, team, spend limits) | https://settings.aws.com/ |
| Billing & Cost Management | https://us-east-1.console.aws.amazon.com/billing/home?region=us-east-1 |
| Budgets (`ssfms-prod-monthly`, $25) | https://us-east-1.console.aws.amazon.com/billing/home?region=us-east-1#/budgets |
| Cost Explorer | https://us-east-1.console.aws.amazon.com/costmanagement/home?region=us-east-1#/cost-explorer |
| Free Tier usage | https://us-east-1.console.aws.amazon.com/billing/home?region=us-east-1#/freetier |
| Console home (selected Region) | https://ap-southeast-2.console.aws.amazon.com/console/home?region=ap-southeast-2 |

---

## Useful one-liners

```powershell
# Authenticate (12-hour session, renewable for 90 days)
aws login --profile ssfms

# Logs from the running app (no SSH port is open)
aws ssm send-command --instance-ids i-069eb3ae3367f8143 --region ap-southeast-2 `
  --document-name AWS-RunShellScript `
  --parameters 'commands=["docker compose -f /opt/ssfms/app/docker-compose.yml logs --tail 50 api"]'

# Redeploy after a git push
aws ssm send-command --instance-ids i-069eb3ae3367f8143 --region ap-southeast-2 `
  --document-name AWS-RunShellScript `
  --parameters 'commands=["cd /opt/ssfms/app && git pull && cp /opt/ssfms/.env .env && docker compose up -d --build"]'

# Admin password
aws secretsmanager get-secret-value --secret-id ssfms/prod/admin `
  --query SecretString --output text --region ap-southeast-2

# Manual database backup
aws ssm send-command --instance-ids i-069eb3ae3367f8143 --region ap-southeast-2 `
  --document-name AWS-RunShellScript --parameters 'commands=["/opt/ssfms/backup.sh"]'
```

---

## Services deliberately not used

| Service | Reason |
|---|---|
| GitHub Actions / CodePipeline | SCP denies `iam:CreateOpenIDConnectProvider`; deployment is direct via CLI |
| App Runner | Not available on this AWS experience |
| Textract / GuardDuty / Security Hub | Not in the Free Tier service list |
| RDS | PostgreSQL runs in Docker on EC2 (cheaper, no VPC/NAT redesign) |
| Route 53 + ACM custom domain | Using the CloudFront domain; CloudFormation is blocked in us-east-1 |
| SES | Email alerts go through SNS; SES needs domain/sender verification |
