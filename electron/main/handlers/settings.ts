import { ipcMain, shell, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { setElevenLabsApiKey, getElevenLabsApiKey } from '../../services/tts'

// Settings file path
function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

// Load settings from file
function loadSettings(): Record<string, unknown> {
  try {
    const settingsPath = getSettingsPath()
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
  return {}
}

// Save settings to file
function saveSettings(settings: Record<string, unknown>): void {
  try {
    const settingsPath = getSettingsPath()
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

export function registerSettingsHandlers() {
  // Get system locale
  ipcMain.handle('get-system-locale', () => {
    return app.getLocale()
  })

  // ElevenLabs API key handlers
  ipcMain.handle('get-elevenlabs-api-key', async () => {
    // First check if already set in memory (from env or previous call)
    const currentKey = getElevenLabsApiKey()
    if (currentKey) return currentKey

    // Otherwise load from settings
    const settings = loadSettings()
    const savedKey = settings.elevenLabsApiKey as string | undefined
    if (savedKey) {
      setElevenLabsApiKey(savedKey)
      return savedKey
    }
    return null
  })

  ipcMain.handle('set-elevenlabs-api-key', async (_event, apiKey: string) => {
    setElevenLabsApiKey(apiKey)
    const settings = loadSettings()
    settings.elevenLabsApiKey = apiKey
    saveSettings(settings)
    return { success: true }
  })

  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url)
  })
}

export { getSettingsPath, loadSettings, saveSettings }
