# Book to MP3 Converter

Convert e-books (FB2, EPUB, TXT) to MP3 audiobooks using various Text-to-Speech technologies.

<img width="1989" height="1807" alt="image" src="https://github.com/user-attachments/assets/13e6a800-a9da-4099-8f0a-005e5ce8dc94" />

## Features

- **Five TTS providers** - System (Windows SAPI), Piper, Silero, ElevenLabs and Coqui
- **Multiple voices** - 20+ voices in Russian and English
- **Format support** - FB2, EPUB, TXT
- **Speed control** - from 0.5x to 2.0x
- **Dark theme** - light/dark/system theme support
- **Auto-splitting** - large books split into parts

## TTS Providers

### 1. System (Windows SAPI)
**Speed: Fast | Quality: Varies**

Uses any Windows SAPI voices installed on your system. The app automatically detects all available Russian and English voices.

#### Installing additional voices:
- **RHVoice** - [Download voices](https://github.com/RHVoice/RHVoice/releases)
- **Microsoft voices** - Available in Windows Settings → Time & Language → Speech
- Any other SAPI-compatible voices

### 2. Piper (ONNX models)
**Speed: Medium | Quality: Good**

Local neural ONNX models. Good balance of speed and quality.

#### Russian voices:
- Denis, Dmitri (Male)
- Irina, Ruslan (Female/Male)

#### English voices:
- Lessac, Ryan (Male)
- Amy (Female)

Download models: [Piper Voices](https://github.com/rhasspy/piper/releases/tag/v1.2.0)

### 3. Silero (PyTorch)
**Speed: Slow | Quality: Best**

PyTorch models from Silero Team. Best offline quality.

#### Russian voices:
- Aidar, Eugene (Male)
- Baya, Kseniya, Xenia (Female)

#### English voices:
- LJ (Female)
- VCTK (Male)

Models download automatically on first use (~100-200 MB).

### 4. ElevenLabs (Cloud API)
**Speed: Fast | Quality: Premium**

Cloud-based AI voices with premium quality. Requires API key.

#### Voices available:
- Adam, Josh, Sam (Male)
- Rachel, Domi, Bella (Female)

**Setup:**
1. Create account at [ElevenLabs](https://elevenlabs.io/)
2. Get API key from your profile
3. Add to `.env` file:
```
ELEVENLABS_API_KEY=your_api_key_here
```

## Installation

### Prerequisites

- Node.js 18+
- Windows 10/11 (for System SAPI voices)
- Python 3.9+ (for Silero, optional)

### Quick Start

1. **Clone repository**
```bash
git clone <repo-url>
cd book-to-mp3
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup TTS components**

Run the universal setup script:

```bash
# Via npm (recommended)
npm run setup

# Or directly via PowerShell
powershell .\scripts\setup-all.ps1
```

This will install:
- Piper TTS (required)
- FFmpeg (required)
- Silero TTS (optional)

4. **Download voice models**

#### For Piper:
Download voices from [Piper releases](https://github.com/rhasspy/piper/releases/tag/v1.2.0) and extract to:
```
tts_resources/piper/voices/
```

Structure:
```
tts_resources/
  piper/
    voices/
      ru_RU/
        denis/
          medium/
            ru_RU-denis-medium.onnx
            ru_RU-denis-medium.onnx.json
      en_US/
        lessac/
          medium/
            en_US-lessac-medium.onnx
            en_US-lessac-medium.onnx.json
```

#### For System SAPI:
Install any SAPI-compatible voices (RHVoice, Microsoft, etc.). After installation they will be automatically detected by the app.

#### For Silero:
Models download automatically on first use (~100-200 MB).
```bash
# Install only Silero
npm run setup:silero
```

#### For ElevenLabs:
Add your API key to `.env` file:
```
ELEVENLABS_API_KEY=your_api_key_here
```

## Usage

### Development mode
```bash
npm run dev
```

### Build application
```bash
npm run build
npm run package
```

## Project Structure

```
book-to-mp3/
├── electron/               # Electron main process
│   ├── main.ts            # Main process
│   ├── preload.ts         # Preload script
│   └── services/
│       ├── parser.ts      # Book parsing
│       └── tts.ts         # Unified TTS service
├── src/                   # React frontend
│   ├── App.tsx           # Main component
│   └── components/       # UI components
├── tts_resources/        # TTS resources
│   ├── piper/           # Piper TTS
│   ├── silero/          # Silero TTS (optional)
│   └── ffmpeg/          # FFmpeg for conversion
├── scripts/
│   ├── setup-all.ps1    # Universal setup
│   ├── setup-silero.ps1 # Setup only Silero
│   └── silero_generate.py # Python script for Silero
└── .env                 # Environment variables (API keys)
```

## Performance

| Provider    | Speed    | Quality    | Model Size   | Type  | Recommendation          |
|-------------|----------|------------|--------------|-------|-------------------------|
| System      | Fast     | Varies     | N/A          | CPU   | For quick processing    |
| Piper       | Medium   | Good       | ~50 MB       | CPU   | Balanced option         |
| Silero      | Slow     | Best       | ~100-200 MB  | CPU   | Best offline quality    |
| ElevenLabs  | Fast     | Premium    | Cloud        | API   | Best overall quality    |
| Coqui       | Slow     | Excellent  | ~2 GB        | CPU   | Voice cloning support   |

### Parallelization

- **System**: up to 30 parallel threads
- **Piper**: up to 10 parallel threads
- **Silero**: up to 5 parallel threads
- **ElevenLabs**: up to 3 parallel requests

## Troubleshooting

### Piper not working
- Make sure voice models are downloaded
- Check directory structure
- `.onnx` and `.onnx.json` files must be in same folder

### System voices not showing
- Install SAPI-compatible voices (RHVoice, Microsoft, etc.)
- Restart application after installation
- Check that voices are visible in Windows Settings → Time & Language → Speech

### Silero slow generation
- Normal - it uses PyTorch models
- First run downloads models (~100-200 MB)
- For large books consider Piper

### ElevenLabs not working
- Check that API key is set in `.env` file
- Verify API key is valid at elevenlabs.io
- Check internet connection

### FFmpeg errors
- Make sure FFmpeg is installed: `npm run setup`
- Check that `tts_resources/ffmpeg/ffmpeg.exe` exists

## License

MIT

## Acknowledgements

- [RHVoice](https://github.com/RHVoice) - Quality SAPI voices
- [Piper](https://github.com/rhasspy/piper) - Fast ONNX models
- [Silero](https://github.com/snakers4/silero-models) - Excellent PyTorch models
- [ElevenLabs](https://elevenlabs.io/) - Premium cloud TTS
- [FFmpeg](https://ffmpeg.org/) - Audio conversion
