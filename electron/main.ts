import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { config } from 'dotenv'
import { parseBook } from './services/parser'
import { convertToSpeech, getVoicesForLanguage, previewVoice, setElevenLabsApiKey, getElevenLabsApiKey } from './services/tts'

// Load environment variables from .env file
config()

// Initialize ElevenLabs API key from environment
if (process.env.ELEVENLABS_API_KEY) {
  setElevenLabsApiKey(process.env.ELEVENLABS_API_KEY)
}

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

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
