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
  provider: 'rhvoice' | 'piper' | 'silero' | 'elevenlabs'
  modelPath?: string
  voiceId?: string
}

export interface ConversionProgress {
  progress: number
  status: string
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

  convertToSpeech: (
    text: string,
    voice: string,
    outputPath: string,
    options: { rate?: string; volume?: string }
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('convert-to-speech', text, voice, outputPath, options),

  abortConversion: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('abort-conversion'),

  getFileInfo: (filePath: string): Promise<{ success: boolean; info?: FileInfo; error?: string }> =>
    ipcRenderer.invoke('get-file-info', filePath),

  previewVoice: (text: string, voiceShortName: string): Promise<{ success: boolean; audioData?: string; error?: string }> =>
    ipcRenderer.invoke('preview-voice', text, voiceShortName),

  onConversionProgress: (callback: (data: ConversionProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ConversionProgress) => callback(data)
    ipcRenderer.on('conversion-progress', handler)
    return () => ipcRenderer.removeListener('conversion-progress', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
