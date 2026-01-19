// Re-export all types
export * from './tts/types'

// Re-export cleanup functions
export * from './tts/cleanup'

// Re-export server management
export {
  killOrphanTTSServers,
  getTTSServerScript,
  getTTSServerPythonExecutable,
  waitForServer,
  startTTSServer,
  stopTTSServer,
  getTTSServerStatus,
  loadTTSModel,
  unloadTTSModel,
  setPreferredDevice,
  generateViaServer,
  generateViaServerForPreview,
  httpRequest,
  httpRequestBinary,
  httpRequestBinaryForPreview,
  getCurrentPreviewRequest,
  clearCurrentPreviewRequest,
  setModelLoadProgressCallback
} from './tts/server'

export type { AvailableDevice, TTSServerStatus } from './tts/server'

// Re-export voice configurations
export {
  RHVOICE_VOICES,
  PIPER_VOICES,
  SILERO_VOICES,
  ELEVENLABS_VOICES,
  COQUI_VOICES,
  isPiperVoiceInstalled,
  getVoicesForLanguage
} from './tts/voices'

// Re-export provider functions
export {
  setElevenLabsApiKey,
  getElevenLabsApiKey,
  getSupportedLanguages,
  getAvailableProviders,
  isProviderAvailableForLanguage
} from './tts/providers'

// Re-export utility functions
export {
  getResourcesPath,
  getPiperResourcesPath,
  getPiperExecutable,
  getSileroPythonExecutable,
  getSileroScript,
  getCoquiPythonExecutable,
  getCoquiScript,
  getFfmpegExecutable
} from './tts/utils'

// Re-export converter functions
export {
  abortPreview,
  convertToSpeech,
  previewVoice
} from './tts/converter'
