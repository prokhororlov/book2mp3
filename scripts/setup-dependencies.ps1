# Setup script for Book to MP3 Converter
# This script downloads all necessary dependencies to make the app self-contained

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Book to MP3 - Setup Dependencies" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create directories
Write-Host "Creating directory structure..." -ForegroundColor Green
$dirs = @(
    "piper_resources\bin",
    "piper_resources\voices\ru_RU\denis\medium",
    "piper_resources\voices\ru_RU\dmitri\medium",
    "piper_resources\voices\ru_RU\irina\medium",
    "piper_resources\voices\ru_RU\ruslan\medium",
    "piper_resources\voices\en_US\amy\low",
    "piper_resources\voices\en_US\lessac\high",
    "piper_resources\voices\en_US\ryan\high",
    "piper_resources\ffmpeg"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Write-Host "Directories created" -ForegroundColor Green
Write-Host ""

# Download Piper TTS binary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Downloading Piper TTS (Windows AMD64)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$piperUrl = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
$piperZip = "piper_resources\piper_windows_amd64.zip"

try {
    Invoke-WebRequest -Uri $piperUrl -OutFile $piperZip -ErrorAction Stop
    Write-Host "Piper downloaded" -ForegroundColor Green

    # Extract Piper
    Write-Host "Extracting Piper..." -ForegroundColor Yellow
    Expand-Archive -Path $piperZip -DestinationPath "piper_resources\bin" -Force
    Remove-Item $piperZip
    Write-Host "Piper extracted" -ForegroundColor Green
} catch {
    Write-Host "Failed to download Piper: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Download FFmpeg
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Downloading FFmpeg (Essential build)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$ffmpegZip = "piper_resources\ffmpeg-essentials.zip"

try {
    Write-Host "Downloading from gyan.dev..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -ErrorAction Stop
    Write-Host "FFmpeg downloaded" -ForegroundColor Green

    # Extract FFmpeg
    Write-Host "Extracting FFmpeg..." -ForegroundColor Yellow
    Expand-Archive -Path $ffmpegZip -DestinationPath "piper_resources\ffmpeg_temp" -Force

    # Move ffmpeg.exe to the correct location
    $ffmpegExe = Get-ChildItem -Path "piper_resources\ffmpeg_temp" -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if ($ffmpegExe) {
        Copy-Item -Path $ffmpegExe.FullName -Destination "piper_resources\ffmpeg\ffmpeg.exe" -Force
        Write-Host "FFmpeg extracted" -ForegroundColor Green
    } else {
        Write-Host "Could not find ffmpeg.exe in archive" -ForegroundColor Red
    }

    # Cleanup
    Remove-Item -Recurse -Force "piper_resources\ffmpeg_temp"
    Remove-Item $ffmpegZip
} catch {
    Write-Host "Failed to download FFmpeg: $_" -ForegroundColor Red
    Write-Host "You can download FFmpeg manually from: https://www.gyan.dev/ffmpeg/builds/" -ForegroundColor Yellow
}

Write-Host ""

# Download Russian voices
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Downloading Russian voices (Piper)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$russianVoices = @(
    @{name="denis"; quality="medium"},
    @{name="dmitri"; quality="medium"},
    @{name="irina"; quality="medium"},
    @{name="ruslan"; quality="medium"}
)

foreach ($voice in $russianVoices) {
    $name = $voice.name
    $quality = $voice.quality
    $baseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/$name/$quality"
    $fileName = "ru_RU-$name-$quality"

    Write-Host "  - Downloading $name..." -ForegroundColor Yellow

    try {
        # Download .onnx model
        $onnxUrl = "$baseUrl/$fileName.onnx"
        $onnxPath = "piper_resources\voices\ru_RU\$name\$quality\$fileName.onnx"
        Invoke-WebRequest -Uri $onnxUrl -OutFile $onnxPath -ErrorAction Stop

        # Download .onnx.json config
        $jsonUrl = "$baseUrl/$fileName.onnx.json"
        $jsonPath = "piper_resources\voices\ru_RU\$name\$quality\$fileName.onnx.json"
        Invoke-WebRequest -Uri $jsonUrl -OutFile $jsonPath -ErrorAction Stop

        Write-Host "    $name downloaded" -ForegroundColor Green
    } catch {
        Write-Host "    Failed to download $name" -ForegroundColor Red
    }
}

Write-Host ""

# Download English voices
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Downloading English voices (Piper)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$englishVoices = @(
    @{name="amy"; quality="low"},
    @{name="lessac"; quality="high"},
    @{name="ryan"; quality="high"}
)

foreach ($voice in $englishVoices) {
    $name = $voice.name
    $quality = $voice.quality
    $baseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/$name/$quality"
    $fileName = "en_US-$name-$quality"

    Write-Host "  - Downloading $name..." -ForegroundColor Yellow

    try {
        # Download .onnx model
        $onnxUrl = "$baseUrl/$fileName.onnx"
        $onnxPath = "piper_resources\voices\en_US\$name\$quality\$fileName.onnx"
        Invoke-WebRequest -Uri $onnxUrl -OutFile $onnxPath -ErrorAction Stop

        # Download .onnx.json config
        $jsonUrl = "$baseUrl/$fileName.onnx.json"
        $jsonPath = "piper_resources\voices\en_US\$name\$quality\$fileName.onnx.json"
        Invoke-WebRequest -Uri $jsonUrl -OutFile $jsonPath -ErrorAction Stop

        Write-Host "    $name downloaded" -ForegroundColor Green
    } catch {
        Write-Host "    Failed to download $name" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Downloaded:" -ForegroundColor Cyan
Write-Host "  Piper TTS binary (piper.exe)" -ForegroundColor White
Write-Host "  FFmpeg (ffmpeg.exe)" -ForegroundColor White
Write-Host "  4 Russian voices (Denis, Dmitri, Irina, Ruslan)" -ForegroundColor White
Write-Host "  3 English voices (Amy, Lessac, Ryan)" -ForegroundColor White
Write-Host ""
Write-Host "Total size: ~150-200 MB" -ForegroundColor Yellow
Write-Host ""
Write-Host "You can now run:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
