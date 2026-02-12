# Memurai Production Setup Script
# Run this as Administrator

Write-Host "Memurai Production Setup" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select Run as Administrator" -ForegroundColor Yellow
    exit 1
}

# Check if Memurai is installed
$memuriPath = "C:\Program Files\Memurai"
if (-not (Test-Path $memuriPath)) {
    Write-Host "ERROR: Memurai not found at $memuriPath" -ForegroundColor Red
    Write-Host "Please install Memurai first: https://www.memurai.com/get-memurai" -ForegroundColor Yellow
    exit 1
}

Write-Host "Memurai found" -ForegroundColor Green
Write-Host ""

# Step 1: Generate secure password
Write-Host "Step 1: Generating secure password..." -ForegroundColor Cyan
$password = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Host "Password: $password" -ForegroundColor Yellow
Write-Host "SAVE THIS PASSWORD - You will need it!" -ForegroundColor Yellow
Write-Host ""

# Step 2: Backup existing config
Write-Host "Step 2: Backing up existing config..." -ForegroundColor Cyan
$configPath = Join-Path $memuriPath "memurai.conf"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupPath = Join-Path $memuriPath "memurai.conf.backup.$timestamp"

if (Test-Path $configPath) {
    Copy-Item $configPath $backupPath
    Write-Host "Backup created: $backupPath" -ForegroundColor Green
} else {
    Write-Host "No existing config found" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Create production config
Write-Host "Step 3: Creating production config..." -ForegroundColor Cyan

$dataDir = Join-Path $memuriPath "data"
$logsDir = Join-Path $memuriPath "logs"
$logFile = Join-Path $logsDir "memurai.log"

$configContent = @"
# Memurai Production Configuration
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Network
bind 0.0.0.0
port 6379
protected-mode yes
requirepass $password

# Memory Management
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
dir "$dataDir"

# Logging
loglevel notice
logfile "$logFile"

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Security - Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
"@

Set-Content -Path $configPath -Value $configContent
Write-Host "Config created" -ForegroundColor Green
Write-Host ""

# Step 4: Create directories
Write-Host "Step 4: Creating directories..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Write-Host "Directories created" -ForegroundColor Green
Write-Host ""

# Step 5: Configure firewall
Write-Host "Step 5: Configuring firewall..." -ForegroundColor Cyan
try {
    Remove-NetFirewallRule -DisplayName "Memurai Redis" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Memurai Redis" -Direction Inbound -LocalPort 6379 -Protocol TCP -Action Allow | Out-Null
    Write-Host "Firewall rule created" -ForegroundColor Green
} catch {
    Write-Host "Firewall rule creation failed: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Restart Memurai service
Write-Host "Step 6: Restarting Memurai service..." -ForegroundColor Cyan
try {
    Restart-Service Memurai -ErrorAction Stop
    Start-Sleep -Seconds 2
    
    $service = Get-Service Memurai
    if ($service.Status -eq "Running") {
        Write-Host "Memurai is running" -ForegroundColor Green
    } else {
        Write-Host "Memurai failed to start" -ForegroundColor Red
        Write-Host "Check logs: $logFile" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to restart service: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 7: Test connection
Write-Host "Step 7: Testing connection..." -ForegroundColor Cyan
try {
    $cliPath = Join-Path $memuriPath "memurai-cli.exe"
    $result = & $cliPath -a $password ping 2>&1
    
    if ($result -match "PONG") {
        Write-Host "Connection successful" -ForegroundColor Green
    } else {
        Write-Host "Connection failed: $result" -ForegroundColor Red
    }
} catch {
    Write-Host "Test failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 8: Create .env entry
Write-Host "Step 8: Environment variables..." -ForegroundColor Cyan
Write-Host "Add these to your .env file:" -ForegroundColor Yellow
Write-Host ""
Write-Host "REDIS_URL=redis://localhost:6379" -ForegroundColor White
Write-Host "REDIS_PASSWORD=$password" -ForegroundColor White
Write-Host "REDIS_DB=0" -ForegroundColor White
Write-Host ""

# Step 9: Create backup script
Write-Host "Step 9: Creating backup script..." -ForegroundColor Cyan
$backupScriptPath = Join-Path $memuriPath "backup-redis.ps1"
$dumpFile = Join-Path $dataDir "dump.rdb"

$backupScriptContent = @"
# Memurai Backup Script
`$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
`$backupDir = "C:\Backups\Memurai"
`$sourceFile = "$dumpFile"
`$destFile = Join-Path `$backupDir "dump_`$timestamp.rdb"

New-Item -ItemType Directory -Force -Path `$backupDir | Out-Null
& "$cliPath" -a $password BGSAVE
Start-Sleep -Seconds 5
Copy-Item `$sourceFile `$destFile -ErrorAction SilentlyContinue

Get-ChildItem `$backupDir -Filter "dump_*.rdb" | 
  Where-Object { `$_.LastWriteTime -lt (Get-Date).AddDays(-7) } | 
  Remove-Item

Write-Host "Backup created: `$destFile"
"@

Set-Content -Path $backupScriptPath -Value $backupScriptContent
Write-Host "Backup script created: $backupScriptPath" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Save the password to your password manager" -ForegroundColor White
Write-Host "2. Update NA/api/.env with the password" -ForegroundColor White
Write-Host "3. Test: cd NA/api && npx ts-node test-production-redis.ts" -ForegroundColor White
Write-Host "4. Schedule backups: $backupScriptPath" -ForegroundColor White
Write-Host ""
Write-Host "Your Redis Password:" -ForegroundColor Yellow
Write-Host "$password" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
