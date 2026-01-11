# Complete Setup Script for Book to MP3 Converter
# Sets up Piper, FFmpeg, and optionally Silero

$ErrorActionPreference = "Stop"

# Get script and project directories
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
Set-Location $projectDir

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "   Book to MP3 Setup Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will set up all required dependencies:" -ForegroundColor White
Write-Host "  - Piper TTS (required)" -ForegroundColor White
Write-Host "  - FFmpeg (required)" -ForegroundColor White
Write-Host "  - Silero TTS (optional)" -ForegroundColor White
Write-Host ""

# Ask about optional installations (default is Yes)
$installSilero = Read-Host "Do you want to install Silero TTS? (Y/n)"
$shouldInstallSilero = $installSilero -eq "" -or $installSilero -eq "y" -or $installSilero -eq "Y"

Write-Host ""

# Create resources directory
$resourcesDir = "tts_resources"
Write-Host "Creating resources directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null
New-Item -ItemType Directory -Force -Path "$resourcesDir\piper" | Out-Null

# Download and extract Piper
Write-Host "`nSetting up Piper TTS..." -ForegroundColor Yellow
$piperUrl = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
$piperZip = "$resourcesDir\piper.zip"
$piperExe = "$resourcesDir\piper\bin\piper\piper.exe"

if (Test-Path $piperExe) {
    Write-Host "Piper TTS already installed, skipping..." -ForegroundColor Green
} else {
    try {
        Write-Host "Downloading Piper..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $piperUrl -OutFile $piperZip -UseBasicParsing

        Write-Host "Extracting Piper..." -ForegroundColor Gray
        Expand-Archive -Path $piperZip -DestinationPath "$resourcesDir\piper\bin" -Force
        Remove-Item $piperZip

        Write-Host "Piper TTS installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to install Piper TTS" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

# Download and extract FFmpeg
Write-Host "`nSetting up FFmpeg..." -ForegroundColor Yellow
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$ffmpegZip = "$resourcesDir\ffmpeg.zip"
$ffmpegExe = "$resourcesDir\ffmpeg\ffmpeg.exe"

if (Test-Path $ffmpegExe) {
    Write-Host "FFmpeg already installed, skipping..." -ForegroundColor Green
} else {
    try {
        Write-Host "Downloading FFmpeg..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing

        Write-Host "Extracting FFmpeg..." -ForegroundColor Gray
        Expand-Archive -Path $ffmpegZip -DestinationPath $resourcesDir -Force

        # Move ffmpeg.exe to correct location
        $ffmpegExtracted = Get-ChildItem -Path $resourcesDir -Filter "ffmpeg-master-latest-win64-gpl" -Directory | Select-Object -First 1
        if ($ffmpegExtracted) {
            New-Item -ItemType Directory -Force -Path "$resourcesDir\ffmpeg" | Out-Null
            Copy-Item "$($ffmpegExtracted.FullName)\bin\ffmpeg.exe" "$resourcesDir\ffmpeg\ffmpeg.exe" -Force
            Remove-Item $ffmpegExtracted.FullName -Recurse -Force
        }

        Remove-Item $ffmpegZip -ErrorAction SilentlyContinue
        Write-Host "FFmpeg installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to install FFmpeg" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

# Create voices directory
Write-Host "`nCreating voices directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$resourcesDir\piper\voices" | Out-Null

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "NOTE: Piper Voice Models" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "You need to download Piper voice models separately." -ForegroundColor White
Write-Host ""
Write-Host "Download voices from:" -ForegroundColor White
Write-Host "https://github.com/rhasspy/piper/releases/tag/v1.2.0" -ForegroundColor Cyan
Write-Host ""
Write-Host "Extract voice files (.onnx and .onnx.json) to:" -ForegroundColor White
Write-Host "$resourcesDir\piper\voices\" -ForegroundColor Cyan
Write-Host ""
Write-Host "Example structure:" -ForegroundColor White
Write-Host "  voices\ru_RU\denis\medium\ru_RU-denis-medium.onnx" -ForegroundColor Gray
Write-Host "  voices\ru_RU\denis\medium\ru_RU-denis-medium.onnx.json" -ForegroundColor Gray
Write-Host ""

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Install Silero if requested
if ($shouldInstallSilero) {
    Write-Host "`nSetting up Silero TTS..." -ForegroundColor Yellow
    try {
        & "$scriptDir\setup-silero.ps1"
    } catch {
        Write-Host "WARNING: Silero setup failed" -ForegroundColor Yellow
        Write-Host "You can run 'npm run setup:silero' manually later" -ForegroundColor Yellow
    }
}

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "   Setup Complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Core components installed:" -ForegroundColor White
Write-Host "  [OK] Piper TTS" -ForegroundColor Green
Write-Host "  [OK] FFmpeg" -ForegroundColor Green
if ($shouldInstallSilero) {
    Write-Host "  [OK] Silero TTS" -ForegroundColor Green
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Download Piper voice models (see note above)" -ForegroundColor White
Write-Host "  2. Install RHVoice voices for Windows SAPI (optional)" -ForegroundColor White
Write-Host "  3. For ElevenLabs: add ELEVENLABS_API_KEY to .env file" -ForegroundColor White
Write-Host "  4. Run 'npm run dev' to start the application" -ForegroundColor White
Write-Host ""
