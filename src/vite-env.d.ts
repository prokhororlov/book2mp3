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
}

interface ConversionProgress {
  progress: number
  status: string
}

interface ElectronAPI {
  openFileDialog: () => Promise<string | null>
  saveFileDialog: (defaultName: string) => Promise<string | null>
  parseBook: (filePath: string) => Promise<{ success: boolean; content?: BookContent; error?: string }>
  getVoices: (language: string) => Promise<{ success: boolean; voices?: VoiceInfo[]; error?: string }>
  convertToSpeech: (
    text: string,
    voice: string,
    outputPath: string,
    options: { rate?: string; volume?: string }
  ) => Promise<{ success: boolean; error?: string }>
  abortConversion: () => Promise<{ success: boolean }>
  getFileInfo: (filePath: string) => Promise<{ success: boolean; info?: FileInfo; error?: string }>
  onConversionProgress: (callback: (data: ConversionProgress) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
