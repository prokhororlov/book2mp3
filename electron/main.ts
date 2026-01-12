import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { config } from 'dotenv'
import { parseBook } from './services/parser'
import { convertToSpeech, getVoicesForLanguage, previewVoice, setElevenLabsApiKey, getElevenLabsApiKey, getAvailableProviders } from './services/tts'
import { checkDependencies, checkDependenciesAsync, needsSetup, runSetup, getEstimatedDownloadSize, SetupProgress, installSilero, checkPythonAvailable } from './services/setup'

// Load environment variables from .env file
config()

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Allow opening DevTools with F12 in production for debugging
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
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
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC Handlers

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Books', extensions: ['fb2', 'epub', 'txt'] },
      { name: 'FB2', extensions: ['fb2'] },
      { name: 'EPUB', extensions: ['epub'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('save-file-dialog', async (_event, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [
      { name: 'MP3 Audio', extensions: ['mp3'] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
})

ipcMain.handle('parse-book', async (_event, filePath: string) => {
  try {
    const content = await parseBook(filePath)
    return { success: true, content }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

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

let conversionAborted = false

ipcMain.handle('convert-to-speech', async (
  event,
  text: string,
  voice: string,
  outputPath: string,
  options: { rate?: string; volume?: string }
) => {
  conversionAborted = false

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
      }
    )
    return { success: true }
  } catch (error) {
    if (conversionAborted) {
      return { success: false, error: 'Conversion cancelled' }
    }
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('abort-conversion', async () => {
  conversionAborted = true
  return { success: true }
})

ipcMain.handle('get-file-info', async (_event, filePath: string) => {
  try {
    const stats = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const name = path.basename(filePath, path.extname(filePath))

    return {
      success: true,
      info: {
        name,
        extension: ext,
        size: stats.size,
        path: filePath,
      }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('preview-voice', async (_event, text: string, voiceShortName: string) => {
  return await previewVoice(text, voiceShortName)
})

// Setup/dependency management handlers
ipcMain.handle('check-dependencies', async () => {
  return checkDependencies()
})

ipcMain.handle('check-dependencies-async', async () => {
  const result = await checkDependenciesAsync()
  console.log('checkDependenciesAsync result:', JSON.stringify(result, null, 2))
  return result
})

ipcMain.handle('check-python-available', async () => {
  const pythonCmd = await checkPythonAvailable()
  return pythonCmd !== null
})

ipcMain.handle('install-silero', async (event) => {
  try {
    const result = await installSilero((progress) => {
      event.sender.send('setup-progress', progress)
    })
    return result
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('needs-setup', async () => {
  return needsSetup()
})

ipcMain.handle('get-estimated-download-size', async () => {
  return await getEstimatedDownloadSize()
})

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

ipcMain.handle('run-setup', async (event, options?: {
  installPiper?: boolean
  installFfmpeg?: boolean
  installRussianVoices?: boolean
  installEnglishVoices?: boolean
}) => {
  try {
    await runSetup((progress: SetupProgress) => {
      event.sender.send('setup-progress', progress)
    }, options)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})
