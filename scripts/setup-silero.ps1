# Silero TTS Setup Script for Windows

$ErrorActionPreference = "Stop"

# Get script and project directories
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
Set-Location $projectDir

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "   Silero TTS Setup Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
Write-Host "Checking for Python installation..." -ForegroundColor Yellow
$pythonCmd = $null

$pythonPaths = @("python", "python3", "py")
foreach ($cmd in $pythonPaths) {
    try {
        $version = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = $cmd
            Write-Host "Found Python: $version" -ForegroundColor Green
            break
        }
    } catch {
        continue
    }
}

if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python 3.9 or newer from https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Create resources directory
$resourcesDir = "tts_resources"
$sileroDir = "$resourcesDir\silero"
$venvPython = "$sileroDir\venv\Scripts\python.exe"

# Check if Silero is already installed
if (Test-Path $venvPython) {
    Write-Host "`nChecking existing Silero installation..." -ForegroundColor Yellow
    $testResult = & $venvPython -c "import torch; print('OK')" 2>&1
    if ($testResult -match "OK") {
        Write-Host "Silero TTS already installed and working, skipping..." -ForegroundColor Green

        # Just update the generation script if needed
        $genScript = "$scriptDir\silero_generate.py"
        if (Test-Path $genScript) {
            Copy-Item $genScript "$sileroDir\generate.py" -Force
        }

        Write-Host "`n====================================" -ForegroundColor Cyan
        Write-Host "   Silero TTS Ready!" -ForegroundColor Green
        Write-Host "====================================" -ForegroundColor Cyan
        exit 0
    }
}

Write-Host "`nCreating directory structure..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $sileroDir | Out-Null

# Create virtual environment
Write-Host "`nCreating Python virtual environment..." -ForegroundColor Yellow
& $pythonCmd -m venv "$sileroDir\venv"

if (-not (Test-Path $venvPython)) {
    Write-Host "ERROR: Failed to create virtual environment" -ForegroundColor Red
    exit 1
}

Write-Host "Virtual environment created successfully" -ForegroundColor Green

# Upgrade pip
Write-Host "`nUpgrading pip..." -ForegroundColor Yellow
& $venvPython -m pip install --upgrade pip --no-input

# Install PyTorch (CPU version)
Write-Host "`nInstalling PyTorch (CPU version)..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
& $venvPython -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --no-input

# Install additional dependencies
Write-Host "`nInstalling additional dependencies..." -ForegroundColor Yellow
& $venvPython -m pip install omegaconf --no-input

# Copy generation script
Write-Host "`nCopying generation script..." -ForegroundColor Yellow
Copy-Item "$scriptDir\silero_generate.py" "$sileroDir\generate.py" -Force

# Create wrapper script
$wrapperScript = @"
@echo off
"%~dp0venv\Scripts\python.exe" "%~dp0generate.py" %*
"@

Set-Content -Path "$sileroDir\silero_generate.bat" -Value $wrapperScript -Encoding ASCII

Write-Host "`nTesting Silero installation..." -ForegroundColor Yellow
$testResult = & $venvPython -c "import torch; print('OK')" 2>&1

if ($testResult -match "OK") {
    Write-Host "Silero installed successfully!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Silero installation test failed" -ForegroundColor Yellow
    Write-Host "Error: $testResult" -ForegroundColor Red
}

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "   Setup Complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Silero TTS has been installed in: $sileroDir" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: First-time usage will download model files (~100-200 MB)" -ForegroundColor Yellow
Write-Host "These will be cached in torch hub cache directory." -ForegroundColor Yellow
Write-Host ""
Write-Host "You can now use Silero voices in the application!" -ForegroundColor Green
