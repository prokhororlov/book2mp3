import { ipcMain } from 'electron'
import path from 'path'
import {
  convertToSpeech,
  getVoicesForLanguage,
  previewVoice,
  abortPreview,
  getAvailableProviders,
  startTTSServer,
  stopTTSServer,
  getTTSServerStatus,
  loadTTSModel,
  unloadTTSModel,
  setPreferredDevice,
  cleanupTempAudio
} from '../../services/tts'

let conversionAborted = false
let lastConversionOutputPath: string | null = null

export function registerTTSHandlers() {
  ipcMain.handle('get-voices', async (_event, language: string) => {
    try {
      const voices = await getVoicesForLanguage(language)
      return { success: true, voices }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('get-available-providers', () => {
    return getAvailableProviders()
  })

  ipcMain.handle('convert-to-speech', async (
    event,
    text: string,
    voice: string,
    outputPath: string,
    options: { rate?: string; volume?: string }
  ) => {
    conversionAborted = false

    // Cleanup temp from previous conversion before starting new one
    if (lastConversionOutputPath) {
      cleanupTempAudio(path.dirname(lastConversionOutputPath))
    }
    lastConversionOutputPath = outputPath

    try {
      await convertToSpeech(
        text,
        voice,
        outputPath,
        options,
        (progress: number, status: string) => {
          if (!conversionAborted) {
            event.sender.send('conversion-progress', { progress, status })
          }
        },
        () => conversionAborted
      )
      return { success: true }
    } catch (error) {
      // Cleanup on error
      cleanupTempAudio(path.dirname(outputPath))
      if (conversionAborted) {
        return { success: false, error: 'Conversion cancelled' }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('abort-conversion', async () => {
    conversionAborted = true
    // Cleanup temp files on abort
    if (lastConversionOutputPath) {
      cleanupTempAudio(path.dirname(lastConversionOutputPath))
    }
    return { success: true }
  })

  ipcMain.handle('preview-voice', async (_event, text: string, voiceShortName: string, options: Record<string, unknown> = {}) => {
    return await previewVoice(text, voiceShortName, options as { rate?: string; sentencePause?: number })
  })

  ipcMain.handle('abort-preview', () => {
    abortPreview()
    return { success: true }
  })

  // TTS Server handlers
  ipcMain.handle('tts-server-start', async () => {
    try {
      await startTTSServer()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('tts-server-stop', async () => {
    try {
      await stopTTSServer()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('tts-server-status', async () => {
    return getTTSServerStatus()
  })

  ipcMain.handle('tts-model-load', async (_event, engine: 'silero' | 'coqui', language?: string) => {
    return loadTTSModel(engine, language)
  })

  ipcMain.handle('tts-model-unload', async (_event, engine: 'silero' | 'coqui' | 'all', language?: string) => {
    return unloadTTSModel(engine, language)
  })

  ipcMain.handle('tts-set-device', async (_event, device: string) => {
    return setPreferredDevice(device)
  })
}
