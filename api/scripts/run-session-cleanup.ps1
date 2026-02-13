# Call API to run session cleanup. Use with Task Scheduler or run manually.
# Set $env:API_URL and $env:INTERNAL_API_KEY, or load from api\.env.

$ErrorActionPreference = "Stop"
$apiRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $apiRoot ".env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'''), "Process")
        }
    }
}

$apiUrl = if ($env:API_URL) { $env:API_URL.TrimEnd('/') } else { "http://localhost:3000" }
$key = $env:INTERNAL_API_KEY
if (-not $key) {
    Write-Error "INTERNAL_API_KEY is not set. Set it in .env or the environment."
    exit 1
}

$url = "$apiUrl/api/internal/cleanup-sessions"
$headers = @{
    "Authorization" = "Bearer $key"
    "Content-Type"  = "application/json"
}

try {
    $r = Invoke-RestMethod -Uri $url -Method POST -Headers $headers
    if ($r.success) {
        Write-Host "OK deleted_count=$($r.deleted_count)"
    } else {
        Write-Error "Cleanup failed: $($r.message)"
        exit 1
    }
} catch {
    Write-Error "Request failed: $_"
    exit 1
}
