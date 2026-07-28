param(
    [string]$Source = (Resolve-Path "$PSScriptRoot\..").Path,
    [string]$DestRoot = (Join-Path $env:USERPROFILE '.agents/skills'),
    [switch]$Force
)

$skillName = 'artifacts-beam'
$dest = Join-Path $DestRoot $skillName

if (-not (Test-Path $Source)) {
    throw "Source skill folder not found: $Source"
}

if ((Test-Path $dest) -and -not $Force) {
    Write-Host "Skill already installed at $dest." -ForegroundColor Yellow
    Write-Host "Pass -Force to overwrite." -ForegroundColor Yellow
    exit 1
}

if (Test-Path $dest) {
    Write-Host "Removing existing $dest..." -ForegroundColor Yellow
    Remove-Item -Path $dest -Recurse -Force
}

if (-not (Test-Path $DestRoot)) {
    New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null
}

Copy-Item -Path $Source -Destination $dest -Recurse -Force
Write-Host ("✓ Installed artifacts-beam skill to {0}" -f $dest) -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Ensure Node.js 18+ is installed:  node --version"
Write-Host "  2. Sign in once (opens your browser — nothing to copy or paste):"
Write-Host "       node `"$dest\scripts\abeam.mjs`" login"
Write-Host "  3. Verify:  node `"$dest\scripts\abeam.mjs`" whoami"
Write-Host ""
Write-Host "See $dest\references\auth-setup.md for the full sign-in walkthrough."
