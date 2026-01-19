import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { setElevenLabsApiKey, killOrphanTTSServers, stopTTSServer, cleanupTempAudio, setModelLoadProgressCallback } from './services/tts'
import { createWindow, getMainWindow } from './main/window'
import { registerHandlers } from './main/handlers'

// Load environment variables from .env file
config()

app.whenReady().then(async () => {
  // Kill any orphan TTS server processes from previous crashes
  await killOrphanTTSServers()

  // Load saved ElevenLabs API key, env variable takes priority
  if (process.env.ELEVENLABS_API_KEY) {
    setElevenLabsApiKey(process.env.ELEVENLABS_API_KEY)
  } else {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json')
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        if (settings.elevenLabsApiKey) {
          setElevenLabsApiKey(settings.elevenLabsApiKey)
        }
      }
    } catch (error) {
      console.error('Failed to load saved API key:', error)
    }
  }

  // Register all IPC handlers
  registerHandlers()

  // Create main window
  createWindow()

  // Set up model load progress callback to send events to renderer
  setModelLoadProgressCallback((progress, engine, language) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('model-load-progress', { progress, engine, language })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Graceful shutdown - stop TTS server and cleanup temp files before quitting
app.on('before-quit', async (event) => {
  event.preventDefault()
  try {
    // Cleanup temp audio files
    cleanupTempAudio()
    await stopTTSServer()
  } catch (error) {
    console.error('Error during shutdown:', error)
  }
  app.exit(0)
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
