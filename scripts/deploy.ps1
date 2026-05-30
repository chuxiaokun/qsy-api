# Deploy xiaoe-api to server (Windows PowerShell 5+)
# Run: .\deploy.cmd

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$ConfigFile = Join-Path $Root "deploy.env"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "Missing deploy.env - copy from deploy.env.example" -ForegroundColor Yellow
    exit 1
}

Get-Content $ConfigFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '^\s*(\w+)\s*=\s*(.*)$') { return }
    $name = $Matches[1]
    $value = $Matches[2].Trim().Trim('"').Trim("'")
    Set-Variable -Name $name -Value $value -Scope Script
}

foreach ($key in @("DEPLOY_HOST", "DEPLOY_PATH", "PM2_NAME")) {
    if (-not (Get-Variable -Name $key -ErrorAction SilentlyContinue) -or [string]::IsNullOrWhiteSpace((Get-Variable $key).Value)) {
        Write-Host "deploy.env missing: $key" -ForegroundColor Red
        exit 1
    }
}

if (-not $PACKAGE_MANAGER) { $PACKAGE_MANAGER = "npm" }

$installCmd = switch ($PACKAGE_MANAGER) {
    "pnpm" { "pnpm install --prod" }
    default { "npm install --omit=dev" }
}

Write-Host ">>> Sync to ${DEPLOY_HOST}:${DEPLOY_PATH}" -ForegroundColor Cyan

# PowerShell pipe corrupts binary gzip; pack locally then scp (do not use tar | ssh on Windows)
$archive = Join-Path $env:TEMP ("xiaoe-api-deploy-{0}.tgz" -f [guid]::NewGuid().ToString("n"))
$remoteArchive = "/tmp/xiaoe-api-deploy.tgz"

try {
    $tarArgs = @(
        "--exclude=node_modules",
        "--exclude=.git",
        "--exclude=.env",
        "--exclude=deploy.env",
        "--exclude=uploads",
        "--exclude=*.log",
        "-czf", $archive, "."
    )
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ">>> Upload archive..." -ForegroundColor Cyan
    scp $archive "${DEPLOY_HOST}:${remoteArchive}"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $remoteExtract = ('mkdir -p ''{0}'' && cd ''{0}'' && tar -xzf {1} && rm -f {1}' -f $DEPLOY_PATH, $remoteArchive)
    ssh $DEPLOY_HOST $remoteExtract
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Remove-Item $archive -Force -ErrorAction SilentlyContinue
}

$remoteDeployTemplate = @'
set -e
cd '{0}'
{1}
if pm2 describe '{2}' >/dev/null 2>&1; then
  pm2 restart '{2}'
else
  pm2 start src/index.js --name '{2}'
fi
pm2 save 2>/dev/null || true
curl -sf http://127.0.0.1:3000/health || echo health_check_failed
'@

$remoteDeploy = $remoteDeployTemplate -f $DEPLOY_PATH, $installCmd, $PM2_NAME

Write-Host ">>> Install and pm2 restart: $PM2_NAME" -ForegroundColor Cyan
$remoteDeploy | ssh $DEPLOY_HOST "bash -s"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">>> Done" -ForegroundColor Green
