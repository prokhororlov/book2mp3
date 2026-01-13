/// <reference types="vite/client" />

interface FileInfo {
  name: string
  extension: string
  size: number
  path: string
}

interface BookContent {
  title: string
  author: string
  chapters: Array<{
    title: string
    content: string
  }>
  fullText: string
}

interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: 'system' | 'piper' | 'silero' | 'elevenlabs' | 'rhvoice'
  modelPath?: string
  voiceId?: string
  isInstalled?: boolean
}

interface RHVoiceInfo {
  name: string
  gender: 'Male' | 'Female'
}

interface RHVoiceUrls {
  [language: string]: {
    [voiceName: string]: {
      url: string
      gender: 'Male' | 'Female'
    }
  }
}

interface ConversionProgress {
  progress: number
  status: string
}

interface SetupProgress {
  stage: string
  progress: number
  details: string
}

interface DependencyStatus {
  piper: boolean
  ffmpeg: boolean
  silero: boolean
  sileroAvailable: boolean
  rhvoiceCore: boolean
  rhvoiceVoices: string[]
  piperVoices: {
    ruRU: string[]
    enUS: string[]
  }
}

interface ElectronAPI {
  openFileDialog: () => Promise<string | null>
  saveFileDialog: (defaultName: string) => Promise<string | null>
  parseBook: (filePath: string) => Promise<{ success: boolean; content?: BookContent; error?: string }>
  getVoices: (language: string) => Promise<VoiceInfo[]>
  getAvailableProviders: () => Promise<Array<{ id: string; name: string; description: string }>>
  convertToSpeech: (
    text: string,
    voice: string,
    outputPath: string,
    options: { rate?: string; volume?: string }
  ) => Promise<{ success: boolean; error?: string }>
  abortConversion: () => Promise<{ success: boolean }>
  getFileInfo: (filePath: string) => Promise<{ success: boolean; info?: FileInfo; error?: string }>
  previewVoice: (text: string, voiceShortName: string) => Promise<{ success: boolean; audioData?: string; error?: string }>
  onConversionProgress: (callback: (data: ConversionProgress) => void) => () => void

  // Setup/dependency management
  checkDependencies: () => Promise<DependencyStatus>
  checkDependenciesAsync: () => Promise<DependencyStatus>
  checkPythonAvailable: () => Promise<boolean>
  installSilero: () => Promise<{ success: boolean; error?: string }>
  checkBuildTools: () => Promise<boolean>
  installBuildTools: () => Promise<{ success: boolean; error?: string; requiresRestart?: boolean }>
  installPiperVoice: (lang: 'ru_RU' | 'en_US', voiceName: string, quality: string) => Promise<{ success: boolean; error?: string }>

  // RHVoice management
  installRHVoiceCore: () => Promise<{ success: boolean; error?: string }>
  installRHVoice: (voiceName: string, language: string) => Promise<{ success: boolean; error?: string }>
  getInstalledRHVoices: () => Promise<string[]>
  getAvailableRHVoices: (language: string) => Promise<RHVoiceInfo[]>
  getRHVoiceUrls: () => Promise<RHVoiceUrls>

  needsSetup: () => Promise<boolean>
  runSetup: (options?: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
    installSilero?: boolean
  }) => Promise<{ success: boolean; error?: string }>
  getEstimatedDownloadSize: () => Promise<{ size: number; includeSilero: boolean }>

  // ElevenLabs API key management
  getElevenLabsApiKey: () => Promise<string | null>
  setElevenLabsApiKey: (apiKey: string) => Promise<{ success: boolean }>

  onSetupProgress: (callback: (data: SetupProgress) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
