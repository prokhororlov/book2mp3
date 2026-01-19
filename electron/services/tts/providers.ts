import { TTSProvider } from './types'
import { RHVOICE_VOICES, PIPER_VOICES, SILERO_VOICES, ELEVENLABS_VOICES, COQUI_VOICES } from './voices'

// ElevenLabs API key storage
let elevenLabsApiKey: string | null = null

export function setElevenLabsApiKey(apiKey: string): void {
  elevenLabsApiKey = apiKey
}

export function getElevenLabsApiKey(): string | null {
  return elevenLabsApiKey
}

export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: 'ru-RU', name: 'Русский' },
    { code: 'en', name: 'English' }
  ]
}

export function getAvailableProviders(): Array<{ id: TTSProvider; name: string; description: string; requiresSetup?: boolean }> {
  const providers: Array<{ id: TTSProvider; name: string; description: string; requiresSetup?: boolean }> = [
    {
      id: 'rhvoice',
      name: 'RHVoice',
      description: 'Lightweight offline engine based on Windows SAPI with minimal installation size (~15 MB per voice). Provides instant speech generation with very low CPU usage, making it perfect for converting large books quickly. Fully offline operation — no internet connection required. Supports Russian, English, and several other languages with clear, intelligible voices. Ideal choice for users who prioritize speed and simplicity.',
      requiresSetup: true
    },
    {
      id: 'piper',
      name: 'Piper',
      description: 'Neural TTS engine powered by ONNX Runtime, developed by Rhasspy. Offers excellent voice quality with fast generation speed — processes text 10-50x faster than real-time on most CPUs. Features compact voice models (15-100 MB each), supports 30+ languages with multiple voice options per language. Fully offline, no internet required.',
      requiresSetup: true
    },
    {
      id: 'silero',
      name: 'Silero',
      description: 'Advanced neural TTS engine built on PyTorch by Silero Team. Delivers natural, expressive speech with excellent prosody and intonation. Russian model (v5) includes 5 high-quality voices, English model (v3) offers 118 diverse voices. Works completely offline, though generation is slower than Piper — best for shorter texts or when quality is priority.',
      requiresSetup: true
    },
    {
      id: 'coqui',
      name: 'Coqui',
      description: 'State-of-the-art multilingual model with 55 built-in speaker voices across 17 languages including English, Spanish, French, German, Italian, Portuguese, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Hungarian, Korean, and Hindi. Produces the most natural-sounding speech among local engines with exceptional emotional range and prosody.',
      requiresSetup: true
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      description: 'Premium cloud-based TTS service with cutting-edge AI voice synthesis technology. Offers studio-quality output with remarkable naturalness, emotion control, and voice cloning capabilities. Access to thousands of community voices plus ability to create custom voices. Requires API key and internet connection; usage is metered based on character count.',
      requiresSetup: false
    }
  ]

  return providers
}

export function isProviderAvailableForLanguage(provider: TTSProvider, language: string): boolean {
  switch (provider) {
    case 'rhvoice':
      return RHVOICE_VOICES[language] !== undefined
    case 'piper':
      return PIPER_VOICES[language] !== undefined
    case 'silero':
      return SILERO_VOICES[language] !== undefined
    case 'elevenlabs':
      return ELEVENLABS_VOICES[language] !== undefined
    case 'coqui':
      return COQUI_VOICES[language] !== undefined
    default:
      return false
  }
}
