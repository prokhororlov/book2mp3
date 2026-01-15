# Book to MP3 Converter

Convert e-books (FB2, EPUB, TXT) to MP3 audiobooks using various Text-to-Speech technologies.

<img width="1989" height="1807" alt="image" src="https://github.com/user-attachments/assets/13e6a800-a9da-4099-8f0a-005e5ce8dc94" />

## Features

- **Five TTS providers** - RHVoice, Piper, Silero, Coqui XTTS-v2 and ElevenLabs
- **60+ voices** - Multiple voices in Russian and English
- **Format support** - FB2, EPUB, TXT
- **Speed control** - from 0.5x to 2.0x
- **Dark theme** - light/dark/system theme support
- **Auto-splitting** - large books split into parts

## TTS Providers

### 1. RHVoice
**Speed: Fast | Quality: Good | Offline**

Lightweight offline engine based on Windows SAPI with minimal installation size (~15 MB per voice). Provides instant speech generation with very low CPU usage, making it perfect for converting large books quickly.

#### Russian voices:
- Aleksandr (Male)
- Irina, Anna, Elena (Female)

#### English voices:
- Bdl, Alan (Male)
- Slt, Clb (Female)

Download: [RHVoice releases](https://github.com/RHVoice/RHVoice/releases)

### 2. Piper (ONNX models)
**Speed: Fast | Quality: Good | Offline**

Neural TTS engine powered by ONNX Runtime. Offers excellent voice quality with fast generation — processes text 10-50x faster than real-time on most CPUs.

#### Russian voices (4):
- Denis, Dmitri, Ruslan (Male)
- Irina (Female)

#### English voices (29):
**US voices:** Amy, Kathleen, Kristin, HFC Female, LJSpeech (Female) • Arctic, Bryce, Danny, HFC Male, Joe, John, Kusal, L2Arctic, Lessac, LibriTTS, Norman, Reza Ibrahim, Ryan, Sam (Male)

**GB voices:** Alba, Cori, Jenny Dioco, Southern English Female (Female) • Alan, Aru, Northern English Male, Semaine, VCTK (Male)

Download models: [Piper Voices](https://github.com/rhasspy/piper/releases/tag/v1.2.0)

### 3. Silero (PyTorch)
**Speed: Medium | Quality: Excellent | Offline**

Advanced neural TTS engine built on PyTorch. Delivers natural, expressive speech with excellent prosody.

#### Russian voices (5):
- Aidar, Eugene (Male)
- Baya, Kseniya, Xenia (Female)

#### English voices (4):
- Male 1, Male 2 (Male)
- Female 1, Female 2 (Female)

Models download automatically on first use (~100-200 MB).

### 4. Coqui XTTS-v2
**Speed: Slow | Quality: Premium | Offline**

State-of-the-art multilingual model with 14 built-in speaker voices. Produces the most natural-sounding speech among local engines with exceptional emotional range and prosody.

#### Voices (14, same for all languages):
**Female:** Claribel Dervla, Daisy Studious, Gracie Wise, Tammie Ema, Alison Dietlinde, Ana Florence, Annmarie Nele, Asya Anara

**Male:** Andrew Chipper, Badr Odhiambo, Dionisio Schuyler, Royston Min, Viktor Eka, Abrahan Mack

Supports 17 languages including Russian, English, Spanish, French, German, Italian, Portuguese, Polish, Turkish, Dutch, Czech, Arabic, Chinese, Japanese, Hungarian, Korean, and Hindi.

### 5. ElevenLabs (Cloud API)
**Speed: Fast | Quality: Premium | Online**

Premium cloud-based TTS with cutting-edge AI voice synthesis. Offers studio-quality output with remarkable naturalness.

#### Russian voices:
- Adam (Male)
- Rachel (Female)

#### English voices:
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
- Windows 10/11
- Python 3.9+ (for Silero and Coqui)

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
- Piper TTS
- FFmpeg
- Silero TTS
- Coqui XTTS-v2

4. **Download voice models**

#### For RHVoice:
Download and install from [RHVoice releases](https://github.com/RHVoice/RHVoice/releases). Voices will be automatically detected after installation.

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

#### For Silero:
Models download automatically on first use (~100-200 MB).
```bash
# Install only Silero
npm run setup:silero
```

#### For Coqui XTTS-v2:
Model downloads automatically on first use (~2 GB). Requires Python 3.9+ and GPU recommended for faster generation.

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
│       ├── setup.ts       # TTS setup service
│       └── tts.ts         # Unified TTS service
├── src/                   # React frontend
│   ├── App.tsx           # Main component
│   └── components/       # UI components
├── tts_resources/        # TTS resources
│   ├── piper/           # Piper TTS
│   ├── silero/          # Silero TTS
│   ├── coqui/           # Coqui XTTS-v2
│   ├── ffmpeg/          # FFmpeg for conversion
│   └── tts_server.py    # Python TTS server
├── scripts/
│   ├── setup-all.ps1    # Universal setup
│   ├── setup-silero.ps1 # Setup only Silero
│   ├── release.cjs      # Release automation
│   └── silero_generate.py # Python script for Silero
└── .env                 # Environment variables (API keys)
```

## Performance

| Provider    | Speed    | Quality    | Model Size   | Type     | Recommendation            |
|-------------|----------|------------|--------------|----------|---------------------------|
| RHVoice     | Fast     | Good       | ~15 MB       | CPU      | Quick processing          |
| Piper       | Fast     | Good       | ~50 MB       | CPU      | Balanced option           |
| Silero      | Medium   | Excellent  | ~100-200 MB  | CPU      | Natural Russian voices    |
| Coqui       | Slow     | Premium    | ~2 GB        | CPU/GPU  | Best offline quality      |
| ElevenLabs  | Fast     | Premium    | Cloud        | API      | Best overall quality      |

### Parallelization

- **RHVoice**: up to 30 parallel threads
- **Piper**: up to 10 parallel threads
- **Silero**: up to 5 parallel threads
- **Coqui**: 1 thread (sequential processing)
- **ElevenLabs**: up to 3 parallel requests

## Troubleshooting

### RHVoice not working
- Install RHVoice from [official releases](https://github.com/RHVoice/RHVoice/releases)
- Restart application after installation
- Voices are detected automatically via Windows SAPI

### Piper not working
- Make sure voice models are downloaded
- Check directory structure
- `.onnx` and `.onnx.json` files must be in same folder

### Silero slow generation
- Normal - it uses PyTorch models
- First run downloads models (~100-200 MB)
- For large books consider Piper or RHVoice

### Coqui XTTS-v2 issues
- First run downloads ~2 GB model
- GPU recommended for faster generation
- Requires Python 3.9+
- Check that `tts_resources/coqui/venv` exists

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

- [RHVoice](https://github.com/RHVoice/RHVoice) - Lightweight SAPI voices
- [Piper](https://github.com/rhasspy/piper) - Fast ONNX TTS models
- [Silero](https://github.com/snakers4/silero-models) - Natural PyTorch voices
- [Coqui TTS](https://github.com/coqui-ai/TTS) - State-of-the-art XTTS-v2 model
- [ElevenLabs](https://elevenlabs.io/) - Premium cloud TTS
- [FFmpeg](https://ffmpeg.org/) - Audio conversion
