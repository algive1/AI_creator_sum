param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start',
  [int]$BackendPort = 3137,
  [int]$AdminPort = 5173,
  [string]$DbHost = '127.0.0.1',
  [int]$DbPort = 3306,
  [string]$DbName = 'ai_creator_login_test',
  [string]$DbUser = 'root',
  [string]$DbPassword = '',
  [string]$AdminUsername = 'local_admin',
  [string]$AdminPassword = 'LocalTest#2026'
)

$ErrorActionPreference = 'Stop'
$ExplicitBackendPort = $PSBoundParameters.ContainsKey('BackendPort')
$ExplicitAdminPort = $PSBoundParameters.ContainsKey('AdminPort')

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $ProjectRoot 'server'
$AdminDir = Join-Path $ProjectRoot 'admin-web'
$StateDir = Join-Path $ProjectRoot 'server/runtime/local-test'
$BackendPidPath = Join-Path $StateDir 'backend.pid'
$AdminPidPath = Join-Path $StateDir 'admin-web.pid'
$BackendRunnerPath = Join-Path $StateDir 'backend-runner.ps1'
$AdminRunnerPath = Join-Path $StateDir 'admin-web-runner.ps1'
$PortsPath = Join-Path $StateDir 'ports.json'
$BackendOutLog = Join-Path $StateDir 'backend.out.log'
$BackendErrLog = Join-Path $StateDir 'backend.err.log'
$AdminOutLog = Join-Path $StateDir 'admin-web.out.log'
$AdminErrLog = Join-Path $StateDir 'admin-web.err.log'

function Write-LocalInfo([string]$Message) {
  Write-Host "[local-test] $Message"
}

function ConvertTo-PsLiteral([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

function Get-NpmCommand {
  $isWindows = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
  if ($isWindows) { return 'npm.cmd' }
  return 'npm'
}

function Get-PowerShellCommand {
  $powershell = Get-Command powershell.exe -ErrorAction SilentlyContinue
  if ($powershell) { return $powershell.Source }
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) { return $pwsh.Source }
  throw 'PowerShell executable was not found.'
}

function Test-ProcessAlive([string]$PidPath) {
  if (!(Test-Path $PidPath)) { return $false }
  $processIdText = (Get-Content -Raw $PidPath).Trim()
  if (!$processIdText) { return $false }
  $processId = [int]$processIdText
  return $null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Test-PortFree([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    $listener.Stop()
  }
}

function Find-FreePort([int]$StartPort, [int]$EndPort) {
  foreach ($port in $StartPort..$EndPort) {
    if (Test-PortFree $port) { return $port }
  }
  return 0
}

function Resolve-LocalPort([string]$Name, [int]$RequestedPort, [int]$EndPort, [bool]$AllowFallback) {
  if (Test-PortFree $RequestedPort) { return $RequestedPort }
  if (!$AllowFallback) {
    throw "$Name port $RequestedPort is already in use."
  }
  $fallback = Find-FreePort ($RequestedPort + 1) $EndPort
  if ($fallback -le 0) {
    throw "$Name port $RequestedPort is already in use and no free fallback port was found."
  }
  Write-LocalInfo "$Name port $RequestedPort is already in use; using $fallback instead."
  return $fallback
}

function Stop-ProcessTree([int]$ProcessId) {
  if (Get-Command taskkill.exe -ErrorAction SilentlyContinue) {
    & taskkill.exe /PID $ProcessId /T /F | Out-Null
    return
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-RecordedProcess([string]$Name, [string]$PidPath) {
  if (!(Test-Path $PidPath)) {
    Write-LocalInfo "$Name is not running."
    return
  }
  $processIdText = (Get-Content -Raw $PidPath).Trim()
  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
  if (!$processIdText) {
    Write-LocalInfo "$Name pid file was empty."
    return
  }
  $processId = [int]$processIdText
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
    Stop-ProcessTree $processId
    Write-LocalInfo "stopped $Name pid=$processId"
  } else {
    Write-LocalInfo "$Name pid=$processId was already stopped."
  }
}

function Stop-LocalProcesses {
  Stop-RecordedProcess 'admin-web' $AdminPidPath
  Stop-RecordedProcess 'backend' $BackendPidPath
}

function Show-LocalStatus {
  Import-RecordedPorts
  $backendAlive = Test-ProcessAlive $BackendPidPath
  $adminAlive = Test-ProcessAlive $AdminPidPath
  $backendStatus = if ($backendAlive) { 'running' } else { 'stopped' }
  $adminStatus = if ($adminAlive) { 'running' } else { 'stopped' }
  Write-LocalInfo "backend port: http://127.0.0.1:$BackendPort/health ($backendStatus)"
  Write-LocalInfo "admin web:    http://127.0.0.1:$AdminPort/login ($adminStatus)"
  Write-LocalInfo "admin login:  $AdminUsername / $AdminPassword"
  Write-LocalInfo "logs:         $StateDir"
}

function Invoke-NodeWithEnv([string]$JavaScript, [hashtable]$EnvMap, [string]$WorkingDirectory) {
  $oldValues = @{}
  foreach ($key in $EnvMap.Keys) {
    $oldValues[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
    [System.Environment]::SetEnvironmentVariable($key, [string]$EnvMap[$key], 'Process')
  }
  Push-Location $WorkingDirectory
  try {
    & node -e $JavaScript
    if ($LASTEXITCODE -ne 0) {
      throw "node helper failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
    foreach ($key in $EnvMap.Keys) {
      [System.Environment]::SetEnvironmentVariable($key, $oldValues[$key], 'Process')
    }
  }
}

function Initialize-LocalState {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot 'shared') | Out-Null
}

function Import-RecordedPorts {
  if (!(Test-Path $PortsPath)) { return }
  try {
    $recorded = Get-Content -Raw $PortsPath | ConvertFrom-Json
    if (!$ExplicitBackendPort -and $recorded.backendPort) {
      $script:BackendPort = [int]$recorded.backendPort
    }
    if (!$ExplicitAdminPort -and $recorded.adminPort) {
      $script:AdminPort = [int]$recorded.adminPort
    }
  } catch {
    return
  }
}

function Save-RecordedPorts {
  @{
    backendPort = $BackendPort
    adminPort = $AdminPort
    backendHealthUrl = "http://127.0.0.1:$BackendPort/health"
    adminLoginUrl = "http://127.0.0.1:$AdminPort/login"
    adminUsername = $AdminUsername
  } | ConvertTo-Json | Set-Content -LiteralPath $PortsPath -Encoding UTF8
}

function Initialize-LocalInstallLock {
  $lockPath = Join-Path $ProjectRoot 'shared/.env.installed'
  $content = @(
    'installed=true',
    "installedAt=$((Get-Date).ToString('o'))",
    'releaseVersion=local-test',
    "appRootDir=$ProjectRoot",
    'pm2AppName=ai-creator-local-test',
    "healthCheckUrl=http://127.0.0.1:$BackendPort/health"
  )
  Set-Content -LiteralPath $lockPath -Value $content -Encoding UTF8
}

function Initialize-LocalAdmin {
  # ensure local admin
  $ensureAdminJs = @'
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const cfg = {
    host: process.env.LOCAL_TEST_DB_HOST,
    port: Number(process.env.LOCAL_TEST_DB_PORT || 3306),
    user: process.env.LOCAL_TEST_DB_USER,
    password: process.env.LOCAL_TEST_DB_PASSWORD || '',
    database: process.env.LOCAL_TEST_DB_NAME,
  };
  const username = process.env.LOCAL_TEST_ADMIN_USERNAME;
  const password = process.env.LOCAL_TEST_ADMIN_PASSWORD;
  if (!cfg.host || !cfg.user || !cfg.database || !username || !password) {
    throw new Error('Missing local test database or admin environment.');
  }
  const conn = await mysql.createConnection(cfg);
  const hash = bcrypt.hashSync(password, 10);
  await conn.execute(
    `INSERT INTO admin_users (username, password_hash, nickname, role_key, status, created_at, updated_at)
     VALUES (?, ?, ?, 'super_admin', 'active', NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       nickname = VALUES(nickname),
       role_key = 'super_admin',
       status = 'active',
       updated_at = NOW(3)`,
    [username, hash, 'Local Test Admin'],
  );
  await conn.end();
  console.log(`[local-test] ensured local admin ${username}`);
}

main().catch(err => {
  console.error(`[local-test] failed to ensure local admin: ${err.message || err}`);
  process.exit(1);
});
'@
  Invoke-NodeWithEnv $ensureAdminJs @{
    LOCAL_TEST_DB_HOST = $DbHost
    LOCAL_TEST_DB_PORT = "$DbPort"
    LOCAL_TEST_DB_NAME = $DbName
    LOCAL_TEST_DB_USER = $DbUser
    LOCAL_TEST_DB_PASSWORD = $DbPassword
    LOCAL_TEST_ADMIN_USERNAME = $AdminUsername
    LOCAL_TEST_ADMIN_PASSWORD = $AdminPassword
  } $ServerDir
}

function Write-RunnerScript([string]$Path, [string]$WorkingDirectory, [hashtable]$EnvMap, [string[]]$CommandAndArgs) {
  $lines = @(
    '$ErrorActionPreference = ''Stop''',
    "Set-Location $(ConvertTo-PsLiteral $WorkingDirectory)"
  )
  foreach ($key in ($EnvMap.Keys | Sort-Object)) {
    $lines += "`$env:$key = $(ConvertTo-PsLiteral ([string]$EnvMap[$key]))"
  }
  $command = ConvertTo-PsLiteral $CommandAndArgs[0]
  $args = $CommandAndArgs[1..($CommandAndArgs.Count - 1)] | ForEach-Object { ConvertTo-PsLiteral $_ }
  $lines += "& $command $($args -join ' ')"
  $lines += 'exit $LASTEXITCODE'
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Start-RunnerProcess([string]$Name, [string]$RunnerPath, [string]$OutLog, [string]$ErrLog, [string]$PidPath) {
  Remove-Item -LiteralPath $OutLog, $ErrLog -Force -ErrorAction SilentlyContinue
  $psCommand = Get-PowerShellCommand
  $process = Start-Process `
    -FilePath $psCommand `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $RunnerPath) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru
  Set-Content -LiteralPath $PidPath -Value $process.Id -Encoding ASCII
  Write-LocalInfo "started $Name pid=$($process.Id)"
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Assert-NodeDependencies {
  if (!(Test-Path (Join-Path $ServerDir 'node_modules'))) {
    throw 'server/node_modules is missing. Run npm ci in ai-creator-server/server first.'
  }
  if (!(Test-Path (Join-Path $AdminDir 'node_modules'))) {
    throw 'admin-web/node_modules is missing. Run npm ci in ai-creator-server/admin-web first.'
  }
}

function Start-LocalPorts {
  Initialize-LocalState
  Assert-NodeDependencies

  if ((Test-ProcessAlive $BackendPidPath) -or (Test-ProcessAlive $AdminPidPath)) {
    Write-LocalInfo 'local test processes are already recorded.'
    Show-LocalStatus
    return
  }

  $script:BackendPort = Resolve-LocalPort 'backend' $BackendPort 3150 (!$ExplicitBackendPort)
  $script:AdminPort = Resolve-LocalPort 'admin' $AdminPort 5199 (!$ExplicitAdminPort)
  Save-RecordedPorts

  Initialize-LocalAdmin
  Initialize-LocalInstallLock

  $npm = Get-NpmCommand
  $backendEnv = @{
    APP_ROOT_DIR = $ProjectRoot
    CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$AdminPort,http://localhost:$AdminPort"
    DB_HOST = $DbHost
    DB_NAME = $DbName
    DB_PASSWORD = $DbPassword
    DB_PORT = "$DbPort"
    DB_USER = $DbUser
    ENCRYPTION_KEY = 'local-test-encryption-key-0123456789abcdef'
    HEALTH_CHECK_URL = "http://127.0.0.1:$BackendPort/health"
    JWT_SECRET = 'local-test-jwt-secret-0123456789abcdef'
    LOCAL_BASE_URL = '/static'
    LOCAL_UPLOAD_DIR = (Join-Path $ServerDir 'uploads')
    NODE_ENV = 'development'
    PM2_APP_NAME = 'ai-creator-local-test'
    PORT = "$BackendPort"
    STORAGE_PROVIDER = 'local'
  }
  $adminEnv = @{
    VITE_API_PROXY_TARGET = "http://127.0.0.1:$BackendPort"
  }

  Write-RunnerScript $BackendRunnerPath $ServerDir $backendEnv @($npm, 'run', 'dev')
  Write-RunnerScript $AdminRunnerPath $AdminDir $adminEnv @($npm, 'run', 'dev', '--', '--host', '127.0.0.1', '--port', "$AdminPort")

  Start-RunnerProcess 'backend' $BackendRunnerPath $BackendOutLog $BackendErrLog $BackendPidPath
  if (!(Wait-HttpReady "http://127.0.0.1:$BackendPort/health" 45)) {
    Stop-LocalProcesses
    throw "backend did not become healthy. See $BackendOutLog and $BackendErrLog"
  }

  Start-RunnerProcess 'admin-web' $AdminRunnerPath $AdminOutLog $AdminErrLog $AdminPidPath
  if (!(Wait-HttpReady "http://127.0.0.1:$AdminPort/login" 60)) {
    Stop-LocalProcesses
    throw "admin web did not become ready. See $AdminOutLog and $AdminErrLog"
  }

  Show-LocalStatus
}

switch ($Action) {
  'start' { Start-LocalPorts }
  'stop' { Initialize-LocalState; Stop-LocalProcesses }
  'status' { Initialize-LocalState; Show-LocalStatus }
}
