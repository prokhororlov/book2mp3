import { contextBridge, ipcRenderer } from 'electron'

export interface FileInfo {
  name: string
  extension: string
  size: number
  path: string
}

export interface BookContent {
  title: string
  author: string
  chapters: Array<{
    title: string
    content: string
  }>
  fullText: string
}

export interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: 'system' | 'piper' | 'silero' | 'elevenlabs' | 'coqui'
  modelPath?: string
  voiceId?: string
  isInstalled?: boolean
}

export interface ConversionProgress {
  progress: number
  status: string
}

export interface SetupProgress {
  stage: string
  progress: number
  details: string
}

export interface DependencyStatus {
  piper: boolean
  ffmpeg: boolean
  silero: boolean
  sileroAvailable: boolean
  coqui: boolean
  coquiAvailable: boolean
  coquiBuildToolsAvailable: boolean
  rhvoiceCore: boolean
  rhvoiceVoices: string[]
  piperVoices: {
    ruRU: string[]
    enUS: string[]
  }
}

export interface RHVoiceInfo {
  name: string
  gender: 'Male' | 'Female'
}

export interface RHVoiceUrls {
  [language: string]: {
    [voiceName: string]: {
      url: string
      gender: 'Male' | 'Female'
    }
  }
}

// GPU Accelerator types
export interface GPUInfo {
  available: boolean
  name?: string
  vram?: number  // in MB
}

export interface AvailableAccelerators {
  cpu: true
  cuda: GPUInfo
  xpu: GPUInfo
}

export type AcceleratorType = 'cpu' | 'cuda' | 'xpu'

export interface AcceleratorConfig {
  accelerator: AcceleratorType
  installedAt: string
  pytorchVersion?: string
}

export interface ReinstallProgress {
  stage: 'stopping' | 'removing' | 'installing' | 'starting' | 'complete' | 'error'
  message: string
  progress?: number
}

// Update types
export interface ReleaseInfo {
  version: string
  releaseDate: string
  downloadUrl: string
  releaseNotes: string
  fileName: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  releaseInfo?: ReleaseInfo
  error?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}


const electronAPI = {
  openFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('open-file-dialog'),

  saveFileDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('save-file-dialog', defaultName),

  parseBook: (filePath: string): Promise<{ success: boolean; content?: BookContent; error?: string }> =>
    ipcRenderer.invoke('parse-book', filePath),

  getVoices: (language: string): Promise<VoiceInfo[]> =>
    ipcRenderer.invoke('get-voices', language).then(result => result.voices || []),

  getAvailableProviders: (): Promise<Array<{ id: string; name: string; description: string }>> =>
    ipcRenderer.invoke('get-available-providers'),

  convertToSpeech: (
    text: string,
    voice: string,
    outputPath: string,
    options: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('convert-to-speech', text, voice, outputPath, options),

  abortConversion: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('abort-conversion'),

  getFileInfo: (filePath: string): Promise<{ success: boolean; info?: FileInfo; error?: string }> =>
    ipcRenderer.invoke('get-file-info', filePath),

  previewVoice: (text: string, voiceShortName: string, options?: Record<string, unknown>): Promise<{ success: boolean; audioData?: string; error?: string }> =>
    ipcRenderer.invoke('preview-voice', text, voiceShortName, options || {}),

  abortPreview: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('abort-preview'),

  onConversionProgress: (callback: (data: ConversionProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ConversionProgress) => callback(data)
    ipcRenderer.on('conversion-progress', handler)
    return () => ipcRenderer.removeListener('conversion-progress', handler)
  },

  // Setup/dependency management
  checkDependencies: (): Promise<DependencyStatus> =>
    ipcRenderer.invoke('check-dependencies'),

  checkDependenciesAsync: (): Promise<DependencyStatus> =>
    ipcRenderer.invoke('check-dependencies-async'),

  checkPythonAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('check-python-available'),

  // Embedded Python management
  installEmbeddedPython: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-embedded-python'),

  checkEmbeddedPython: (): Promise<boolean> =>
    ipcRenderer.invoke('check-embedded-python'),

  getPythonInfo: (): Promise<{ available: boolean; path: string | null; isEmbedded: boolean; version: string | null }> =>
    ipcRenderer.invoke('get-python-info'),

  installSilero: (accelerator: AcceleratorType = 'cpu'): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-silero', accelerator),

  installCoqui: (accelerator: AcceleratorType = 'cpu'): Promise<{ success: boolean; error?: string; needsBuildTools?: boolean }> =>
    ipcRenderer.invoke('install-coqui', accelerator),

  checkBuildTools: (): Promise<boolean> =>
    ipcRenderer.invoke('check-build-tools'),

  installBuildTools: (): Promise<{ success: boolean; error?: string; requiresRestart?: boolean }> =>
    ipcRenderer.invoke('install-build-tools'),

  installPiper: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-piper'),

  installFfmpeg: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-ffmpeg'),

  // GPU Accelerator management
  getAvailableAccelerators: (): Promise<AvailableAccelerators> =>
    ipcRenderer.invoke('get-available-accelerators'),

  getCurrentSileroAccelerator: (): Promise<AcceleratorConfig | null> =>
    ipcRenderer.invoke('get-current-silero-accelerator'),

  getCurrentCoquiAccelerator: (): Promise<AcceleratorConfig | null> =>
    ipcRenderer.invoke('get-current-coqui-accelerator'),

  reinstallSileroWithAccelerator: (accelerator: AcceleratorType): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('reinstall-silero-with-accelerator', accelerator),

  reinstallCoquiWithAccelerator: (accelerator: AcceleratorType): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('reinstall-coqui-with-accelerator', accelerator),

  onReinstallProgress: (callback: (data: ReinstallProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ReinstallProgress) => callback(data)
    ipcRenderer.on('reinstall-progress', handler)
    return () => ipcRenderer.removeListener('reinstall-progress', handler)
  },

  installPiperVoice: (lang: 'ru_RU' | 'en_US', voiceName: string, quality: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-piper-voice', lang, voiceName, quality),

  // RHVoice management
  installRHVoiceCore: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-rhvoice-core'),

  installRHVoice: (voiceName: string, language: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-rhvoice', voiceName, language),

  getInstalledRHVoices: (): Promise<string[]> =>
    ipcRenderer.invoke('get-installed-rhvoices'),

  getAvailableRHVoices: (language: string): Promise<RHVoiceInfo[]> =>
    ipcRenderer.invoke('get-available-rhvoices', language),

  getRHVoiceUrls: (): Promise<RHVoiceUrls> =>
    ipcRenderer.invoke('get-rhvoice-urls'),

  needsSetup: (): Promise<boolean> =>
    ipcRenderer.invoke('needs-setup'),

  runSetup: (options?: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
    installSilero?: boolean
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('run-setup', options),

  getEstimatedDownloadSize: (): Promise<{ size: number; includeSilero: boolean }> =>
    ipcRenderer.invoke('get-estimated-download-size'),

  // ElevenLabs API key management
  getElevenLabsApiKey: (): Promise<string | null> =>
    ipcRenderer.invoke('get-elevenlabs-api-key'),

  setElevenLabsApiKey: (apiKey: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('set-elevenlabs-api-key', apiKey),

  onSetupProgress: (callback: (data: SetupProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SetupProgress) => callback(data)
    ipcRenderer.on('setup-progress', handler)
    return () => ipcRenderer.removeListener('setup-progress', handler)
  },

  // TTS Server management
  ttsServerStart: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tts-server-start'),

  ttsServerStop: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tts-server-stop'),

  ttsServerStatus: (): Promise<{
    running: boolean
    silero: { ru_loaded: boolean; en_loaded: boolean }
    coqui: { loaded: boolean }
    memory_gb: number
    cpu_percent: number
    device: string
    backend: string
    gpu_name: string | null
    preferred_device: string
    available_devices: Array<{
      id: string
      name: string
      available: boolean
      description: string
    }>
  }> => ipcRenderer.invoke('tts-server-status'),

  ttsModelLoad: (engine: 'silero' | 'coqui', language?: string): Promise<{ success: boolean; memory_gb: number; error?: string }> =>
    ipcRenderer.invoke('tts-model-load', engine, language),

  ttsModelUnload: (engine: 'silero' | 'coqui' | 'all', language?: string): Promise<{ success: boolean; memory_gb: number }> =>
    ipcRenderer.invoke('tts-model-unload', engine, language),

  ttsSetDevice: (device: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tts-set-device', device),

  // Update management
  checkForUpdates: (): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke('check-for-updates'),

  downloadUpdate: (releaseInfo: ReleaseInfo): Promise<{ success: boolean; installerPath?: string; error?: string }> =>
    ipcRenderer.invoke('download-update', releaseInfo),

  installUpdate: (installerPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-update', installerPath),

  onUpdateDownloadProgress: (callback: (data: DownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DownloadProgress) => callback(data)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
