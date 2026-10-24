param(
    [string]$StackName = "ssfms-prod",
    [string]$Region = "ap-south-1",
    [string]$AlertEmail = "soumikcodes4158@gmail.com",
    [double]$MonthlyBudgetUsd = 25,
    [string]$InstanceType = "t4g.small",
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

function Assert-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' is not on PATH. Install it first (see deploy/README.md)."
    }
}

Assert-Command aws
Assert-Command git

Write-Host "==> Verifying AWS credentials" -ForegroundColor Cyan
$identity = aws sts get-caller-identity --output json 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "AWS credentials are not configured. Run 'aws configure sso' or 'aws configure' first."
}
$identity | ConvertFrom-Json | Format-List

Write-Host "==> Deploying CloudFormation stack '$StackName' to $Region" -ForegroundColor Cyan
Write-Host "    This takes 8-15 minutes (EC2 bootstrap + CloudFront)." -ForegroundColor DarkGray

aws cloudformation deploy `
    --template-file "deploy/stack.yaml" `
    --stack-name $StackName `
    --region $Region `
    --capabilities CAPABILITY_NAMED_IAM `
    --parameter-overrides `
        AlertEmail=$AlertEmail `
        MonthlyBudgetUsd=$MonthlyBudgetUsd `
        InstanceType=$InstanceType

if ($LASTEXITCODE -ne 0) {
    throw "Stack deployment failed. Inspect with: aws cloudformation describe-stack-events --stack-name $StackName --region $Region"
}

Write-Host "==> Reading stack outputs" -ForegroundColor Cyan
$outputs = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $Region `
    --query "Stacks[0].Outputs" --output json | ConvertFrom-Json

$map = @{}
foreach ($o in $outputs) { $map[$o.OutputKey] = $o.OutputValue }
$map.GetEnumerator() | Sort-Object Name | Format-Table -AutoSize

if (-not $SkipFrontend) {
    Write-Host "==> Building the frontend for CloudFront (/api same-origin)" -ForegroundColor Cyan
    $env:VITE_API_BASE_URL = "/api"

    if (Test-Path node_modules) {
        cmd /c "npm ci"
    } else {
        cmd /c "npm install"
    }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

    $bucket = $map["FrontendBucketName"]
    $distributionId = $map["DistributionId"]

    Write-Host "==> Uploading dist/ to s3://$bucket" -ForegroundColor Cyan
    aws s3 sync "dist/" "s3://$bucket" --delete --region $Region --only-show-errors

    if ($distributionId -and $distributionId -ne "None") {
        Write-Host "==> Invalidating CloudFront $distributionId" -ForegroundColor Cyan
        aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*" --query "Invalidation.Id" --output text
    } else {
        Write-Host "!! Could not resolve the distribution id; invalidate manually." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " Site      : $($map['SiteUrl'])" -ForegroundColor Green
Write-Host " API       : $($map['ApiUrl'])" -ForegroundColor Green
Write-Host " API docs  : $($map['ApiDocs'])" -ForegroundColor Green
Write-Host " Instance  : $($map['InstanceId'])" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Admin password:" -ForegroundColor Yellow
Write-Host "  aws secretsmanager get-secret-value --secret-id ssfms/prod/admin --query SecretString --output text --region $Region"
Write-Host ""
Write-Host "Shell onto the box (no SSH port is open):" -ForegroundColor Yellow
Write-Host "  aws ssm start-session --target $($map['InstanceId']) --region $Region"
