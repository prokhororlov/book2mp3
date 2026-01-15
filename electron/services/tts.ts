import fs from 'fs'
import path from 'path'
import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { checkSileroInstalled, checkCoquiInstalled, getInstalledRHVoices } from './setup'
import http from 'http'

const execAsync = promisify(exec)

// Temp directory name (app-specific to avoid conflicts)
const TEMP_AUDIO_DIR_NAME = 'bookify_tts_temp'

// Track last used output directory for cleanup
let lastOutputDir: string | null = null

// Preview abort control
let currentPreviewProcess: ChildProcess | null = null
let currentPreviewRequest: http.ClientRequest | null = null
let previewAborted = false

// Abort current preview generation
export function abortPreview(): void {
  previewAborted = true

  // Kill the process if running
  if (currentPreviewProcess) {
    try {
      currentPreviewProcess.kill('SIGTERM')
    } catch {
      // Process may have already exited
    }
    currentPreviewProcess = null
  }

  // Abort HTTP request if running
  if (currentPreviewRequest) {
    try {
      currentPreviewRequest.destroy()
    } catch {
      // Request may have already completed
    }
    currentPreviewRequest = null
  }
}

// Cleanup temp audio directory
export function cleanupTempAudio(outputDir?: string): void {
  const dirsToClean: string[] = []

  if (outputDir) {
    dirsToClean.push(path.join(outputDir, TEMP_AUDIO_DIR_NAME))
  }

  if (lastOutputDir && lastOutputDir !== outputDir) {
    dirsToClean.push(path.join(lastOutputDir, TEMP_AUDIO_DIR_NAME))
  }

  for (const tempDir of dirsToClean) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        console.log(`Cleaned up temp directory: ${tempDir}`)
      }
    } catch (error) {
      console.warn(`Failed to clean up temp directory ${tempDir}:`, error)
    }
  }
}

// ==================== TTS Server Management ====================

const TTS_SERVER_PORT = 5050
const TTS_SERVER_URL = `http://127.0.0.1:${TTS_SERVER_PORT}`

let ttsServerProcess: ChildProcess | null = null
let ttsServerReady = false
let serverStarting = false // Prevent multiple simultaneous starts

// Kill process tree on Windows (taskkill /T kills child processes)
async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execAsync(`taskkill /pid ${pid} /T /F`)
    } catch {
      // Process may already be dead
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL') // Kill process group on Unix
    } catch {
      // Process may already be dead
    }
  }
}

// Kill any orphan TTS server processes (from previous crashes)
export async function killOrphanTTSServers(): Promise<void> {
  if (process.platform === 'win32') {
    try {
      // Find python processes running tts_server.py
      const { stdout } = await execAsync('wmic process where "commandline like \'%tts_server.py%\'" get processid /format:list')
      const pids = stdout.match(/ProcessId=(\d+)/g)
      if (pids) {
        for (const match of pids) {
          const pid = parseInt(match.replace('ProcessId=', ''))
          if (pid && !isNaN(pid)) {
            console.log(`Killing orphan TTS server process: ${pid}`)
            await killProcessTree(pid)
          }
        }
      }
    } catch {
      // No orphan processes or wmic not available
    }
  }
}

export interface TTSServerStatus {
  running: boolean
  silero: {
    ru_loaded: boolean
    en_loaded: boolean
  }
  coqui: {
    loaded: boolean
  }
  memory_gb: number
  cpu_percent: number
  device: string
}

function getTTSServerScript(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'tts_server.py')
}

function getTTSServerPythonExecutable(): string {
  // Prefer Coqui's venv as it has all dependencies (including TTS module)
  // Silero's venv doesn't have the TTS module which causes "No module named 'TTS'" error
  const coquiExe = getCoquiPythonExecutable()
  if (fs.existsSync(coquiExe)) {
    return coquiExe
  }
  return getSileroPythonExecutable()
}

async function waitForServer(maxAttempts: number = 60, delayMs: number = 500): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await getTTSServerStatus()
      if (status.running) {
        return true
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return false
}

export async function startTTSServer(): Promise<void> {
  // Already running
  if (ttsServerProcess && ttsServerReady) {
    console.log('TTS Server already running')
    return
  }

  // Prevent multiple simultaneous starts
  if (serverStarting) {
    console.log('TTS Server is already starting, waiting...')
    await waitForServer()
    return
  }

  serverStarting = true

  try {
    // Kill any orphan servers first
    await killOrphanTTSServers()

    const pythonExe = getTTSServerPythonExecutable()
    const serverScript = getTTSServerScript()

    if (!fs.existsSync(pythonExe)) {
      throw new Error('Python environment not found. Please install Silero or Coqui first.')
    }

    if (!fs.existsSync(serverScript)) {
      throw new Error('TTS Server script not found.')
    }

    console.log('Starting TTS Server...')

    await new Promise<void>((resolve, reject) => {
      const args = [serverScript, '--port', TTS_SERVER_PORT.toString()]

      ttsServerProcess = spawn(pythonExe, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false // Ensure child dies with parent
      })

      const pid = ttsServerProcess.pid
      console.log(`TTS Server process started with PID: ${pid}`)

      ttsServerProcess.stdout?.on('data', (data) => {
        console.log('[TTS Server]', data.toString().trim())
      })

      ttsServerProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim()
        console.log('[TTS Server]', msg)
        // Check if server started
        if (msg.includes('Running on')) {
          ttsServerReady = true
        }
      })

      ttsServerProcess.on('error', (error) => {
        console.error('TTS Server error:', error)
        ttsServerProcess = null
        ttsServerReady = false
        reject(error)
      })

      ttsServerProcess.on('close', (code) => {
        console.log(`TTS Server exited with code ${code}`)
        ttsServerProcess = null
        ttsServerReady = false
      })

      // Wait for server to be ready
      waitForServer().then((ready) => {
        if (ready) {
          console.log('TTS Server is ready')
          resolve()
        } else {
          reject(new Error('TTS Server failed to start'))
        }
      })
    })
  } finally {
    serverStarting = false
  }
}

export async function stopTTSServer(): Promise<void> {
  const pid = ttsServerProcess?.pid

  if (!ttsServerProcess || !pid) {
    // Even if we don't have a process reference, kill any orphans
    await killOrphanTTSServers()
    return
  }

  console.log(`Stopping TTS Server (PID: ${pid})...`)

  try {
    // Try graceful shutdown via HTTP first
    await httpRequest(`${TTS_SERVER_URL}/shutdown`, 'POST')
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000))
  } catch {
    // Graceful shutdown failed, will force kill
  }

  // Force kill the process tree to ensure all child processes are killed
  await killProcessTree(pid)

  ttsServerProcess = null
  ttsServerReady = false
  serverStarting = false
  console.log('TTS Server stopped')
}

export async function getTTSServerStatus(): Promise<TTSServerStatus> {
  try {
    const response = await httpRequest(`${TTS_SERVER_URL}/status`, 'GET')
    const data = JSON.parse(response)
    return {
      running: true,
      silero: data.silero,
      coqui: data.coqui,
      memory_gb: data.memory_gb,
      cpu_percent: data.cpu_percent || 0,
      device: data.device
    }
  } catch {
    return {
      running: false,
      silero: { ru_loaded: false, en_loaded: false },
      coqui: { loaded: false },
      memory_gb: 0,
      cpu_percent: 0,
      device: 'unknown'
    }
  }
}

export async function loadTTSModel(
  engine: 'silero' | 'coqui',
  language?: string
): Promise<{ success: boolean; memory_gb: number; error?: string }> {
  try {
    // Start server if not running
    const status = await getTTSServerStatus()
    if (!status.running) {
      await startTTSServer()
    }

    const body = JSON.stringify({ engine, language })
    const response = await httpRequest(`${TTS_SERVER_URL}/load`, 'POST', body)
    const data = JSON.parse(response)

    return {
      success: data.success,
      memory_gb: data.memory_gb
    }
  } catch (error) {
    return {
      success: false,
      memory_gb: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function unloadTTSModel(
  engine: 'silero' | 'coqui' | 'all',
  language?: string
): Promise<{ success: boolean; memory_gb: number }> {
  try {
    const body = JSON.stringify({ engine, language })
    const response = await httpRequest(`${TTS_SERVER_URL}/unload`, 'POST', body)
    const data = JSON.parse(response)

    return {
      success: data.success,
      memory_gb: data.memory_gb
    }
  } catch {
    return { success: false, memory_gb: 0 }
  }
}

async function generateViaServer(
  engine: 'silero' | 'coqui',
  text: string,
  speaker: string,
  language: string,
  outputPath: string,
  rate?: string | number
): Promise<void> {
  const body = JSON.stringify({
    engine,
    text,
    speaker,
    language,
    rate
  })

  const audioBuffer = await httpRequestBinary(`${TTS_SERVER_URL}/generate`, 'POST', body)

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, audioBuffer)
}

// Abortable version for preview
async function generateViaServerForPreview(
  engine: 'silero' | 'coqui',
  text: string,
  speaker: string,
  language: string,
  outputPath: string,
  rate?: string | number
): Promise<void> {
  const body = JSON.stringify({
    engine,
    text,
    speaker,
    language,
    rate
  })

  const audioBuffer = await httpRequestBinaryForPreview(`${TTS_SERVER_URL}/generate`, 'POST', body)

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, audioBuffer)
}

function httpRequest(url: string, method: string, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(60000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

function httpRequestBinary(url: string, method: string, body?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buffer)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(120000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

// Abortable version for preview - stores request reference for cancellation
function httpRequestBinaryForPreview(url: string, method: string, body?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        currentPreviewRequest = null
        const buffer = Buffer.concat(chunks)
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buffer)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`))
        }
      })
    })

    // Store reference for abort
    currentPreviewRequest = req

    req.on('error', (err) => {
      currentPreviewRequest = null
      reject(err)
    })
    req.setTimeout(120000, () => {
      currentPreviewRequest = null
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

// ==================== End TTS Server Management ====================

export type TTSProvider = 'rhvoice' | 'piper' | 'silero' | 'elevenlabs' | 'coqui'

export interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: TTSProvider
  modelPath?: string // For Piper and Silero
  voiceId?: string // For ElevenLabs
  isInstalled?: boolean // For RHVoice and Piper
}

// RHVoice configurations (Windows SAPI)
const RHVOICE_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Aleksandr', shortName: 'Aleksandr', gender: 'Male', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Irina', shortName: 'Irina', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Anna', shortName: 'Anna', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Elena', shortName: 'Elena', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' }
  ],
  'en': [
    { name: 'Bdl', shortName: 'Bdl', gender: 'Male', locale: 'en', provider: 'rhvoice' },
    { name: 'Slt', shortName: 'Slt', gender: 'Female', locale: 'en', provider: 'rhvoice' },
    { name: 'Clb', shortName: 'Clb', gender: 'Female', locale: 'en', provider: 'rhvoice' },
    { name: 'Alan', shortName: 'Alan', gender: 'Male', locale: 'en', provider: 'rhvoice' }
  ]
}

// Piper voice configurations
const PIPER_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    {
      name: 'Denis',
      shortName: 'piper-denis',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/denis/medium/ru_RU-denis-medium.onnx'
    },
    {
      name: 'Dmitri',
      shortName: 'piper-dmitri',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx'
    },
    {
      name: 'Irina',
      shortName: 'piper-irina',
      gender: 'Female',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/irina/medium/ru_RU-irina-medium.onnx'
    },
    {
      name: 'Ruslan',
      shortName: 'piper-ruslan',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx'
    }
  ],
  'en': [
    {
      name: 'Amy',
      shortName: 'piper-amy',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/amy/low/en_US-amy-low.onnx'
    },
    {
      name: 'Lessac',
      shortName: 'piper-lessac',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/lessac/medium/en_US-lessac-medium.onnx'
    },
    {
      name: 'Ryan',
      shortName: 'piper-ryan',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/ryan/medium/en_US-ryan-medium.onnx'
    }
  ]
}

// Silero voice configurations
const SILERO_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Aidar', shortName: 'silero-aidar', gender: 'Male', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/aidar' },
    { name: 'Baya', shortName: 'silero-baya', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/baya' },
    { name: 'Kseniya', shortName: 'silero-kseniya', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/kseniya' },
    { name: 'Xenia', shortName: 'silero-xenia', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/xenia' },
    { name: 'Eugene', shortName: 'silero-eugene', gender: 'Male', locale: 'ru-RU', provider: 'silero', modelPath: 'v5_ru/eugene' }
  ],
  'en': [
    { name: 'Female 1', shortName: 'silero-en-f1', gender: 'Female', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_0' },
    { name: 'Female 2', shortName: 'silero-en-f2', gender: 'Female', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_1' },
    { name: 'Male 1', shortName: 'silero-en-m1', gender: 'Male', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_2' },
    { name: 'Male 2', shortName: 'silero-en-m2', gender: 'Male', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_3' }
  ]
}

// ElevenLabs voice configurations
// Voice IDs from ElevenLabs API - these are the default voices available
const ELEVENLABS_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'ElevenLabs Adam', shortName: 'elevenlabs-adam', gender: 'Male', locale: 'ru-RU', provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
    { name: 'ElevenLabs Rachel', shortName: 'elevenlabs-rachel', gender: 'Female', locale: 'ru-RU', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' }
  ],
  'en': [
    { name: 'ElevenLabs Adam', shortName: 'elevenlabs-adam-en', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
    { name: 'ElevenLabs Rachel', shortName: 'elevenlabs-rachel-en', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
    { name: 'ElevenLabs Domi', shortName: 'elevenlabs-domi', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: 'AZnzlk1XvdvUeBnXmlld' },
    { name: 'ElevenLabs Bella', shortName: 'elevenlabs-bella', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
    { name: 'ElevenLabs Josh', shortName: 'elevenlabs-josh', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'TxGEqnHWrfWFTfGW9XjX' },
    { name: 'ElevenLabs Sam', shortName: 'elevenlabs-sam', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'yoZ06aMxZJJ28mfd3POQ' }
  ]
}

// Coqui XTTS-v2 voice configurations (built-in speakers)
const COQUI_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Claribel Dervla', shortName: 'coqui-claribel', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Claribel Dervla' },
    { name: 'Daisy Studious', shortName: 'coqui-daisy', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Daisy Studious' },
    { name: 'Gracie Wise', shortName: 'coqui-gracie', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Gracie Wise' },
    { name: 'Tammie Ema', shortName: 'coqui-tammie', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Tammie Ema' },
    { name: 'Alison Dietlinde', shortName: 'coqui-alison', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Alison Dietlinde' },
    { name: 'Ana Florence', shortName: 'coqui-ana', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Ana Florence' },
    { name: 'Annmarie Nele', shortName: 'coqui-annmarie', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Annmarie Nele' },
    { name: 'Asya Anara', shortName: 'coqui-asya', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Asya Anara' },
    { name: 'Andrew Chipper', shortName: 'coqui-andrew', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Andrew Chipper' },
    { name: 'Badr Odhiambo', shortName: 'coqui-badr', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Badr Odhiambo' },
    { name: 'Dionisio Schuyler', shortName: 'coqui-dionisio', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Dionisio Schuyler' },
    { name: 'Royston Min', shortName: 'coqui-royston', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Royston Min' },
    { name: 'Viktor Eka', shortName: 'coqui-viktor', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Viktor Eka' },
    { name: 'Abrahan Mack', shortName: 'coqui-abrahan', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Abrahan Mack' },
  ],
  'en': [
    { name: 'Claribel Dervla', shortName: 'coqui-claribel-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Claribel Dervla' },
    { name: 'Daisy Studious', shortName: 'coqui-daisy-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Daisy Studious' },
    { name: 'Gracie Wise', shortName: 'coqui-gracie-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Gracie Wise' },
    { name: 'Tammie Ema', shortName: 'coqui-tammie-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Tammie Ema' },
    { name: 'Alison Dietlinde', shortName: 'coqui-alison-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Alison Dietlinde' },
    { name: 'Ana Florence', shortName: 'coqui-ana-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Ana Florence' },
    { name: 'Annmarie Nele', shortName: 'coqui-annmarie-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Annmarie Nele' },
    { name: 'Asya Anara', shortName: 'coqui-asya-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Asya Anara' },
    { name: 'Andrew Chipper', shortName: 'coqui-andrew-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Andrew Chipper' },
    { name: 'Badr Odhiambo', shortName: 'coqui-badr-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Badr Odhiambo' },
    { name: 'Dionisio Schuyler', shortName: 'coqui-dionisio-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Dionisio Schuyler' },
    { name: 'Royston Min', shortName: 'coqui-royston-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Royston Min' },
    { name: 'Viktor Eka', shortName: 'coqui-viktor-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Viktor Eka' },
    { name: 'Abrahan Mack', shortName: 'coqui-abrahan-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Abrahan Mack' },
  ]
}

// ElevenLabs API key storage
let elevenLabsApiKey: string | null = null

export function setElevenLabsApiKey(apiKey: string): void {
  elevenLabsApiKey = apiKey
}

export function getElevenLabsApiKey(): string | null {
  return elevenLabsApiKey
}


// Check if Piper voice model file exists
function isPiperVoiceInstalled(modelPath: string): boolean {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)
  const jsonPath = fullModelPath + '.json'
  return fs.existsSync(fullModelPath) && fs.existsSync(jsonPath)
}

export async function getVoicesForLanguage(language: string, provider?: TTSProvider): Promise<VoiceInfo[]> {
  let allVoices: VoiceInfo[] = []

  if (!provider || provider === 'rhvoice') {
    // Get installed RHVoice voices from SAPI
    const installedRHVoices = await getInstalledRHVoices()
    const rhvoiceVoices = (RHVOICE_VOICES[language] || []).map(voice => ({
      ...voice,
      isInstalled: installedRHVoices.some(v => v.toLowerCase() === voice.shortName.toLowerCase())
    }))
    allVoices = allVoices.concat(rhvoiceVoices)
  }

  if (!provider || provider === 'piper') {
    // Check if each Piper voice model file exists
    const piperVoices = (PIPER_VOICES[language] || []).map(voice => ({
      ...voice,
      isInstalled: voice.modelPath ? isPiperVoiceInstalled(voice.modelPath) : false
    }))
    allVoices = allVoices.concat(piperVoices)
  }

  // Silero requires Python environment to be set up
  if ((!provider || provider === 'silero') && checkSileroInstalled()) {
    allVoices = allVoices.concat(SILERO_VOICES[language] || [])
  }

  if (!provider || provider === 'elevenlabs') {
    allVoices = allVoices.concat(ELEVENLABS_VOICES[language] || [])
  }

  // Coqui XTTS-v2 requires Python environment to be set up
  if ((!provider || provider === 'coqui') && checkCoquiInstalled()) {
    allVoices = allVoices.concat(COQUI_VOICES[language] || [])
  }

  if (allVoices.length === 0) {
    throw new Error(`Language ${language} is not supported`)
  }

  return allVoices
}

export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: 'ru-RU', name: 'Русский' },
    { code: 'en', name: 'English' }
  ]
}

export function getAvailableProviders(): Array<{ id: TTSProvider; name: string; description: string; requiresSetup?: boolean }> {
  const providers: Array<{ id: TTSProvider; name: string; description: string; requiresSetup?: boolean }> = [
    {
      id: 'rhvoice',
      name: 'RHVoice',
      description: 'Lightweight offline engine based on Windows SAPI with minimal installation size (~15 MB per voice). Provides instant speech generation with very low CPU usage, making it perfect for converting large books quickly. Fully offline operation — no internet connection required. Supports Russian, English, and several other languages with clear, intelligible voices. Ideal choice for users who prioritize speed and simplicity.',
      requiresSetup: true
    },
    {
      id: 'piper',
      name: 'Piper',
      description: 'Neural TTS engine powered by ONNX Runtime, developed by Rhasspy. Offers excellent voice quality with fast generation speed — processes text 10-50x faster than real-time on most CPUs. Features compact voice models (15-100 MB each), supports 30+ languages with multiple voice options per language. Fully offline, no internet required.',
      requiresSetup: true
    },
    {
      id: 'silero',
      name: 'Silero',
      description: 'Advanced neural TTS engine built on PyTorch by Silero Team. Delivers natural, expressive speech with excellent prosody and intonation. Russian model (v5) includes 5 high-quality voices, English model (v3) offers 118 diverse voices. Works completely offline, though generation is slower than Piper — best for shorter texts or when quality is priority.',
      requiresSetup: true
    },
    {
      id: 'coqui',
      name: 'Coqui XTTS-v2',
      description: 'State-of-the-art multilingual model with 55 built-in speaker voices across 17 languages including English, Spanish, French, German, Italian, Portuguese, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Hungarian, Korean, and Hindi. Produces the most natural-sounding speech among local engines with exceptional emotional range and prosody.',
      requiresSetup: true
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      description: 'Premium cloud-based TTS service with cutting-edge AI voice synthesis technology. Offers studio-quality output with remarkable naturalness, emotion control, and voice cloning capabilities. Access to thousands of community voices plus ability to create custom voices. Requires API key and internet connection; usage is metered based on character count.',
      requiresSetup: false
    }
  ]

  return providers
}

export function isProviderAvailableForLanguage(provider: TTSProvider, language: string): boolean {
  switch (provider) {
    case 'rhvoice':
      return RHVOICE_VOICES[language] !== undefined
    case 'piper':
      return PIPER_VOICES[language] !== undefined
    case 'silero':
      return SILERO_VOICES[language] !== undefined
    case 'elevenlabs':
      return ELEVENLABS_VOICES[language] !== undefined
    case 'coqui':
      return COQUI_VOICES[language] !== undefined
    default:
      return false
  }
}

// Get path to resources - uses userData for packaged app (dependencies installed at runtime)
function getResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'tts_resources')
  } else {
    return path.join(process.cwd(), 'tts_resources')
  }
}


function getPiperResourcesPath(): string {
  return path.join(getResourcesPath(), 'piper')
}

// Get path to Piper executable
function getPiperExecutable(): string {
  const resourcesPath = getPiperResourcesPath()
  return path.join(resourcesPath, 'bin', 'piper', 'piper.exe')
}

// Get path to Python executable for Silero
function getSileroPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'silero', 'venv', 'Scripts', 'python.exe')
}

// Get path to Silero script
function getSileroScript(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'silero', 'generate.py')
}

// Coqui XTTS-v2 path helpers
function getCoquiPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'coqui', 'venv', 'Scripts', 'python.exe')
}

function getCoquiScript(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'coqui', 'generate.py')
}

// Clean text for TTS
function cleanTextForTTS(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .trim()
}

// Split text into chunks
function splitIntoChunks(text: string, maxLength: number = 1000): string[] {
  const cleanedText = cleanTextForTTS(text)
  const chunks: string[] = []
  const paragraphs = cleanedText.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    const trimmedPara = para.trim()
    if (!trimmedPara) continue

    if ((currentChunk + '\n\n' + trimmedPara).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }

      if (trimmedPara.length > maxLength) {
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+\s*/g) || [trimmedPara]
        let sentenceChunk = ''

        for (const sentence of sentences) {
          if ((sentenceChunk + sentence).length > maxLength) {
            if (sentenceChunk) {
              chunks.push(sentenceChunk.trim())
            }
            sentenceChunk = sentence
          } else {
            sentenceChunk += sentence
          }
        }

        if (sentenceChunk.trim()) {
          currentChunk = sentenceChunk
        } else {
          currentChunk = ''
        }
      } else {
        currentChunk = trimmedPara
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(c => c.length > 0)
}

// ============= RHVoice (SAPI) Implementation =============
async function generateSpeechWithRHVoice(
  text: string,
  voice: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  const tempDir = path.dirname(outputPath)
  const timestamp = Date.now()
  const tempTextPath = path.join(tempDir, `temp_text_${timestamp}.txt`)
  const tempScriptPath = path.join(tempDir, `temp_script_${timestamp}.ps1`)

  fs.writeFileSync(tempTextPath, text, { encoding: 'utf8' })

  // Convert rate from percentage format to SAPI rate (-10 to 10)
  // +100% -> 10, +50% -> 5, 0% -> 0, -50% -> -5
  let sapiRate = 0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      // Map percentage to -10..10 range (100% = 10)
      sapiRate = sign === '+' ? Math.round(percent / 10) : -Math.round(percent / 10)
      // Clamp to valid range
      sapiRate = Math.max(-10, Math.min(10, sapiRate))
    }
  }

  const psScript = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("${voice}")
$synth.Rate = ${sapiRate}
$synth.SetOutputToWaveFile("${outputPath.replace(/\\/g, '\\\\')}")
$text = [System.IO.File]::ReadAllText("${tempTextPath.replace(/\\/g, '\\\\')}", [System.Text.Encoding]::UTF8)
$synth.Speak($text)
$synth.Dispose()
`

  fs.writeFileSync(tempScriptPath, psScript, 'utf-8')

  try {
    await execAsync(`powershell.exe -ExecutionPolicy Bypass -File "${tempScriptPath}"`)
  } finally {
    if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath)
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath)
  }
}

// ============= Piper Implementation =============
async function generateSpeechWithPiper(
  text: string,
  modelPath: string,
  outputPath: string,
  options: { rate?: string; sentencePause?: number } = {}
): Promise<void> {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)

  if (!fs.existsSync(fullModelPath)) {
    throw new Error(`Piper voice model not found: ${fullModelPath}`)
  }

  const piperExe = getPiperExecutable()
  const piperDir = path.dirname(piperExe)

  let lengthScale = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        lengthScale = 1.0 / (1.0 + percent / 100)
      } else {
        lengthScale = 1.0 / (1.0 - percent / 100)
      }
    }
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      '--model', fullModelPath,
      '--output_file', outputPath,
      '--length_scale', lengthScale.toFixed(2)
    ]

    // Add sentence silence if specified
    if (options.sentencePause !== undefined && options.sentencePause > 0) {
      args.push('--sentence_silence', options.sentencePause.toFixed(2))
    }

    // Run piper from its own directory so it can find DLLs
    const piperProcess = spawn(piperExe, args, { cwd: piperDir })
    let stderr = ''

    piperProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    piperProcess.on('error', (error) => {
      reject(new Error(`Failed to start Piper: ${error.message}`))
    })

    piperProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Piper failed to generate audio file'))
        return
      }

      resolve()
    })

    if (piperProcess.stdin) {
      piperProcess.stdin.write(text, 'utf8')
      piperProcess.stdin.end()
    } else {
      reject(new Error('Failed to write to Piper stdin'))
    }
  })
}

// ============= Silero Implementation =============
async function generateSpeechWithSilero(
  text: string,
  speakerPath: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  // Try to use TTS server first
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    // Determine language from speaker path (e.g., "v5_ru/aidar" -> "ru")
    const language = speakerPath.includes('_ru') ? 'ru' : 'en'
    await generateViaServer('silero', text, speakerPath, language, outputPath, options.rate)
    return
  }

  // Fallback to spawning process
  const pythonExe = getSileroPythonExecutable()
  const sileroScript = getSileroScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Silero Python environment not found. Please run setup script.')
  }

  if (!fs.existsSync(sileroScript)) {
    throw new Error('Silero generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      sileroScript,
      '--text', text,
      '--speaker', speakerPath,
      '--output', outputPath
    ]

    // Add rate parameter if specified
    if (options.rate) {
      args.push('--rate', options.rate)
    }

    const sileroProcess = spawn(pythonExe, args)
    let stderr = ''
    let stdout = ''

    sileroProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    sileroProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    sileroProcess.on('error', (error) => {
      reject(new Error(`Failed to start Silero: ${error.message}`))
    })

    sileroProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Silero exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Silero failed to generate audio file'))
        return
      }

      resolve()
    })
  })
}

// ============= Coqui XTTS-v2 Implementation =============
async function generateSpeechWithCoqui(
  text: string,
  speakerName: string,
  language: string,
  outputPath: string
): Promise<void> {
  // Try to use TTS server first
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    await generateViaServer('coqui', text, speakerName, language, outputPath)
    return
  }

  // Fallback to spawning process
  const pythonExe = getCoquiPythonExecutable()
  const coquiScript = getCoquiScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Coqui Python environment not found. Please run setup.')
  }

  if (!fs.existsSync(coquiScript)) {
    throw new Error('Coqui generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      coquiScript,
      '--text', text,
      '--speaker', speakerName,
      '--language', language,
      '--output', outputPath
    ]

    const coquiProcess = spawn(pythonExe, args)
    let stderr = ''
    let stdout = ''

    coquiProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    coquiProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    coquiProcess.on('error', (error) => {
      reject(new Error(`Failed to start Coqui: ${error.message}`))
    })

    coquiProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Coqui exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Coqui failed to generate audio file'))
        return
      }

      resolve()
    })
  })
}

// ============= Abortable Preview Versions =============

// RHVoice abortable version for preview
async function generateSpeechWithRHVoiceForPreview(
  text: string,
  voice: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  // RHVoice uses PowerShell which is fast, just use the regular version
  // but wrap it to check for abort
  if (previewAborted) throw new Error('Preview cancelled')
  await generateSpeechWithRHVoice(text, voice, outputPath, options)
}

// Piper abortable version for preview
async function generateSpeechWithPiperForPreview(
  text: string,
  modelPath: string,
  outputPath: string,
  options: { rate?: string; sentencePause?: number } = {}
): Promise<void> {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)

  if (!fs.existsSync(fullModelPath)) {
    throw new Error(`Piper voice model not found: ${fullModelPath}`)
  }

  const piperExe = getPiperExecutable()
  const piperDir = path.dirname(piperExe)

  let lengthScale = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        lengthScale = 1.0 / (1.0 + percent / 100)
      } else {
        lengthScale = 1.0 / (1.0 - percent / 100)
      }
    }
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      '--model', fullModelPath,
      '--output_file', outputPath,
      '--length_scale', lengthScale.toFixed(2)
    ]

    if (options.sentencePause !== undefined && options.sentencePause > 0) {
      args.push('--sentence_silence', options.sentencePause.toFixed(2))
    }

    const piperProcess = spawn(piperExe, args, { cwd: piperDir })
    currentPreviewProcess = piperProcess
    let stderr = ''

    piperProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    piperProcess.on('error', (error) => {
      currentPreviewProcess = null
      reject(new Error(`Failed to start Piper: ${error.message}`))
    })

    piperProcess.on('close', (code) => {
      currentPreviewProcess = null
      if (previewAborted) {
        reject(new Error('Preview cancelled'))
        return
      }
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`))
        return
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Piper failed to generate audio file'))
        return
      }
      resolve()
    })

    if (piperProcess.stdin) {
      piperProcess.stdin.write(text, 'utf8')
      piperProcess.stdin.end()
    } else {
      reject(new Error('Failed to write to Piper stdin'))
    }
  })
}

// Silero abortable version for preview
async function generateSpeechWithSileroForPreview(
  text: string,
  speakerPath: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  // Try to use TTS server first (abortable via HTTP)
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    const language = speakerPath.includes('_ru') ? 'ru' : 'en'
    await generateViaServerForPreview('silero', text, speakerPath, language, outputPath, options.rate)
    return
  }

  // Fallback to spawning process
  const pythonExe = getSileroPythonExecutable()
  const sileroScript = getSileroScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Silero Python environment not found. Please run setup script.')
  }

  if (!fs.existsSync(sileroScript)) {
    throw new Error('Silero generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      sileroScript,
      '--text', text,
      '--speaker', speakerPath,
      '--output', outputPath
    ]

    if (options.rate) {
      args.push('--rate', options.rate)
    }

    const sileroProcess = spawn(pythonExe, args)
    currentPreviewProcess = sileroProcess
    let stderr = ''

    sileroProcess.stdout?.on('data', () => {})
    sileroProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    sileroProcess.on('error', (error) => {
      currentPreviewProcess = null
      reject(new Error(`Failed to start Silero: ${error.message}`))
    })

    sileroProcess.on('close', (code) => {
      currentPreviewProcess = null
      if (previewAborted) {
        reject(new Error('Preview cancelled'))
        return
      }
      if (code !== 0) {
        reject(new Error(`Silero exited with code ${code}: ${stderr}`))
        return
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Silero failed to generate audio file'))
        return
      }
      resolve()
    })
  })
}

// Coqui abortable version for preview
async function generateSpeechWithCoquiForPreview(
  text: string,
  speakerName: string,
  language: string,
  outputPath: string
): Promise<void> {
  // Try to use TTS server first (abortable via HTTP)
  const serverStatus = await getTTSServerStatus()
  if (serverStatus.running) {
    await generateViaServerForPreview('coqui', text, speakerName, language, outputPath)
    return
  }

  // Fallback to spawning process
  const pythonExe = getCoquiPythonExecutable()
  const coquiScript = getCoquiScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Coqui Python environment not found. Please run setup.')
  }

  if (!fs.existsSync(coquiScript)) {
    throw new Error('Coqui generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      coquiScript,
      '--text', text,
      '--speaker', speakerName,
      '--language', language,
      '--output', outputPath
    ]

    const coquiProcess = spawn(pythonExe, args)
    currentPreviewProcess = coquiProcess
    let stderr = ''

    coquiProcess.stdout?.on('data', () => {})
    coquiProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    coquiProcess.on('error', (error) => {
      currentPreviewProcess = null
      reject(new Error(`Failed to start Coqui: ${error.message}`))
    })

    coquiProcess.on('close', (code) => {
      currentPreviewProcess = null
      if (previewAborted) {
        reject(new Error('Preview cancelled'))
        return
      }
      if (code !== 0) {
        reject(new Error(`Coqui exited with code ${code}: ${stderr}`))
        return
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Coqui failed to generate audio file'))
        return
      }
      resolve()
    })
  })
}

// ============= ElevenLabs Implementation =============
async function generateSpeechWithElevenLabs(
  text: string,
  voiceId: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  const apiKey = elevenLabsApiKey

  if (!apiKey) {
    throw new Error('ElevenLabs API key not set. Please configure your API key in settings.')
  }

  // Convert rate from percentage format to ElevenLabs speed (0.7 to 1.2)
  // +100% -> 1.2, +20% -> 1.2, 0% -> 1.0, -30% -> 0.7
  let speed = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        // Map 0-100% to 1.0-1.2
        speed = 1.0 + (percent / 100) * 0.2
      } else {
        // Map 0-50% to 1.0-0.7
        speed = 1.0 - (percent / 100) * 0.6
      }
      // Clamp to valid range
      speed = Math.max(0.7, Math.min(1.2, speed))
    }
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: speed
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // ElevenLabs returns MP3, but we need WAV for consistency with other providers
  // Save as temp MP3 first, then convert to WAV
  const tempMp3Path = outputPath.replace('.wav', '_temp.mp3')
  fs.writeFileSync(tempMp3Path, buffer)

  // Convert MP3 to WAV using ffmpeg
  const ffmpegExe = getFfmpegExecutable()
  await execAsync(`"${ffmpegExe}" -i "${tempMp3Path}" -acodec pcm_s16le -ar 22050 -ac 1 -y "${outputPath}"`)

  // Clean up temp MP3
  if (fs.existsSync(tempMp3Path)) {
    fs.unlinkSync(tempMp3Path)
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ElevenLabs failed to generate audio file')
  }
}

// ============= Unified Processing =============
async function processChunk(
  chunk: string,
  index: number,
  voiceInfo: VoiceInfo,
  tempDir: string,
  maxRetries: number,
  retryDelay: number,
  options: { rate?: string; sentencePause?: number }
): Promise<{ success: boolean; file?: string; error?: string }> {
  let success = false
  let lastError: Error | null = null
  const tempFile = path.join(tempDir, `chunk_${index}.wav`)

  for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
    try {
      // Route to appropriate provider
      switch (voiceInfo.provider) {
        case 'rhvoice':
          await generateSpeechWithRHVoice(chunk, voiceInfo.shortName, tempFile, options)
          break

        case 'piper':
          if (!voiceInfo.modelPath) {
            throw new Error('Model path required for Piper')
          }
          await generateSpeechWithPiper(chunk, voiceInfo.modelPath, tempFile, options)
          break

        case 'silero':
          if (!voiceInfo.modelPath) {
            throw new Error('Speaker path required for Silero')
          }
          await generateSpeechWithSilero(chunk, voiceInfo.modelPath, tempFile, options)
          break

        case 'elevenlabs':
          if (!voiceInfo.voiceId) {
            throw new Error('Voice ID required for ElevenLabs')
          }
          await generateSpeechWithElevenLabs(chunk, voiceInfo.voiceId, tempFile, options)
          break

        case 'coqui':
          if (!voiceInfo.modelPath) {
            throw new Error('Speaker name required for Coqui')
          }
          await generateSpeechWithCoqui(chunk, voiceInfo.modelPath, voiceInfo.locale, tempFile)
          break

        default:
          throw new Error(`Unknown provider: ${voiceInfo.provider}`)
      }

      if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
        success = true
        return { success: true, file: tempFile }
      } else {
        throw new Error('Audio file was not created or is empty')
      }
    } catch (error) {
      lastError = error as Error
      console.error(`Error processing chunk ${index + 1} (attempt ${attempt}/${maxRetries}):`, error)

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error'
  }
}

export async function convertToSpeech(
  text: string,
  voiceShortName: string,
  outputPath: string,
  options: { rate?: string; volume?: string; sentencePause?: number } = {},
  onProgress?: (progress: number, status: string) => void,
  isAborted?: () => boolean
): Promise<void> {
  // Find voice by short name across all providers
  let voiceInfo: VoiceInfo | undefined
  const allVoices = [
    ...Object.values(RHVOICE_VOICES).flat(),
    ...Object.values(PIPER_VOICES).flat(),
    ...Object.values(SILERO_VOICES).flat(),
    ...Object.values(ELEVENLABS_VOICES).flat(),
    ...Object.values(COQUI_VOICES).flat()
  ]

  voiceInfo = allVoices.find(v => v.shortName === voiceShortName)

  if (!voiceInfo) {
    throw new Error(`Voice not found: ${voiceShortName}`)
  }

  // Silero and Coqui have token limits in the positional encoder.
  // Cyrillic/non-Latin text expands to more tokens, so use smaller chunks.
  const maxChunkLength = (voiceInfo.provider === 'silero' || voiceInfo.provider === 'coqui') ? 500 : 1000
  const chunks = splitIntoChunks(text, maxChunkLength)

  if (chunks.length === 0) {
    throw new Error('No text content to convert')
  }

  const totalChunks = chunks.length
  const chunksPerPart = 100
  const totalParts = Math.ceil(totalChunks / chunksPerPart)

  const audioFiles: string[] = new Array(totalChunks)
  let successfulChunks = 0
  const errors: Array<{ chunk: number; error: string }> = []
  const maxRetries = 3
  const retryDelay = 1000

  // Concurrency limits depend on provider
  // Coqui XTTS is slow and memory-intensive, process sequentially
  const concurrentLimit = voiceInfo.provider === 'coqui' ? 1 :
                         voiceInfo.provider === 'silero' ? 5 :
                         voiceInfo.provider === 'piper' ? 10 :
                         voiceInfo.provider === 'elevenlabs' ? 3 : 30

  onProgress?.(0, `Preparing ${totalChunks} text segments in ${totalParts} parts... (${voiceInfo.provider})`)

  const outputDir = path.dirname(outputPath)
  lastOutputDir = outputDir // Remember for cleanup
  const tempDir = path.join(outputDir, TEMP_AUDIO_DIR_NAME)
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  let nextChunkIndex = 0
  let completedChunks = 0
  const chunkCompletionTimes: number[] = []

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)
    const pad = (num: number) => String(num).padStart(2, '0')

    if (hours > 0) {
      return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    } else if (minutes > 0) {
      return `${pad(minutes)}m ${pad(seconds)}s`
    } else {
      return `${pad(seconds)}s`
    }
  }

  const processNextChunk = async () => {
    const currentIndex = nextChunkIndex++
    if (currentIndex >= chunks.length) return

    const chunkStartTime = Date.now()

    try {
      const result = await processChunk(
        chunks[currentIndex],
        currentIndex,
        voiceInfo!,
        tempDir,
        maxRetries,
        retryDelay,
        options
      )

      if (result.success && result.file) {
        audioFiles[currentIndex] = result.file
        successfulChunks++
      } else {
        errors.push({
          chunk: currentIndex + 1,
          error: result.error || 'Unknown error'
        })
      }

      completedChunks++
      const chunkDuration = Date.now() - chunkStartTime
      chunkCompletionTimes.push(chunkDuration)

      let statusMessage = ''
      if (completedChunks >= 3) {
        const recentTimes = chunkCompletionTimes.slice(-10)
        const avgTimePerChunk = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length
        const remainingChunks = totalChunks - completedChunks
        const estimatedRemainingMs = (remainingChunks * avgTimePerChunk) / concurrentLimit
        statusMessage = `Осталось ~${formatTime(estimatedRemainingMs)} | Сегмент ${completedChunks} из ${totalChunks}`
      } else {
        statusMessage = `Вычисляем время... | Сегмент ${completedChunks} из ${totalChunks}`
      }

      onProgress?.(
        Math.round((completedChunks / totalChunks) * 90),
        statusMessage
      )
    } catch (error) {
      errors.push({
        chunk: currentIndex + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      completedChunks++
    }
  }

  // Process chunks with proper parallelization
  for (let i = 0; i < chunks.length; i += concurrentLimit) {
    // Check if conversion was aborted
    if (isAborted?.()) {
      return
    }

    const batch = []
    for (let j = 0; j < concurrentLimit && i + j < chunks.length; j++) {
      batch.push(processNextChunk())
    }
    await Promise.all(batch)
  }

  const validAudioFiles = audioFiles.filter(f => f !== undefined)

  if (validAudioFiles.length === 0) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error)
    }

    const errorDetails = errors.length > 0
      ? `\n\nDetails:\n${errors.map(e => `- Segment ${e.chunk}: ${e.error}`).join('\n')}`
      : ''
    throw new Error(
      `Failed to generate any audio after ${maxRetries} attempts per segment.${errorDetails}`
    )
  }

  if (successfulChunks < totalChunks) {
    const failedCount = totalChunks - successfulChunks
    console.warn(
      `Warning: ${failedCount} of ${totalChunks} segments failed to convert. ` +
      `Proceeding with ${successfulChunks} successful segments.`
    )
  }

  // Combine files into parts
  const outputBaseName = path.basename(outputPath, path.extname(outputPath))

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  for (let partIndex = 0; partIndex < totalParts; partIndex++) {
    const startIdx = partIndex * chunksPerPart
    const endIdx = Math.min(startIdx + chunksPerPart, validAudioFiles.length)
    const partFiles = validAudioFiles.slice(startIdx, endIdx)

    if (partFiles.length === 0) continue

    const currentPart = partIndex + 1
    const partProgress = 90 + Math.round((currentPart / totalParts) * 10)
    onProgress?.(
      partProgress,
      `Создание части ${currentPart} из ${totalParts} (сегменты ${startIdx + 1}-${endIdx})...`
    )

    const partOutputPath = totalParts > 1
      ? path.join(outputDir, `${outputBaseName}_part${currentPart}.mp3`)
      : outputPath

    await combineToPart(partFiles, partOutputPath, tempDir)
  }

  // Clean up temp directory
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  } catch (error) {
    console.warn('Failed to clean up temp directory:', error)
  }

  onProgress?.(100, `Conversion complete! Created ${totalParts} part(s).`)
}


/**
 * Preview a voice by generating a short audio sample and returning its path
 * Supports abortion via abortPreview()
 */
export async function previewVoice(
  text: string,
  voiceShortName: string,
  options: { rate?: string; sentencePause?: number } = {}
): Promise<{ success: boolean; audioData?: string; error?: string }> {
  // Reset abort state
  previewAborted = false
  currentPreviewProcess = null
  currentPreviewRequest = null

  // Find voice by short name across all providers
  const allVoices = [
    ...Object.values(RHVOICE_VOICES).flat(),
    ...Object.values(PIPER_VOICES).flat(),
    ...Object.values(SILERO_VOICES).flat(),
    ...Object.values(ELEVENLABS_VOICES).flat(),
    ...Object.values(COQUI_VOICES).flat()
  ]

  const voiceInfo = allVoices.find(v => v.shortName === voiceShortName)

  if (!voiceInfo) {
    return { success: false, error: `Voice not found: ${voiceShortName}` }
  }

  // Use a temp directory for preview files
  const tempDir = path.join(app.getPath('temp'), 'book-to-mp3-preview')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const timestamp = Date.now()
  const tempWavFile = path.join(tempDir, `preview_${timestamp}.wav`)
  const tempMp3File = path.join(tempDir, `preview_${timestamp}.mp3`)

  console.log('Preview paths:', { tempDir, tempWavFile, tempMp3File, voice: voiceShortName })

  try {
    // Generate audio based on provider (using abortable versions)
    switch (voiceInfo.provider) {
      case 'rhvoice':
        await generateSpeechWithRHVoiceForPreview(text, voiceInfo.shortName, tempWavFile, options)
        break

      case 'piper':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Model path required for Piper' }
        }
        await generateSpeechWithPiperForPreview(text, voiceInfo.modelPath, tempWavFile, options)
        break

      case 'silero':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Speaker path required for Silero' }
        }
        await generateSpeechWithSileroForPreview(text, voiceInfo.modelPath, tempWavFile, options)
        break

      case 'elevenlabs':
        if (!voiceInfo.voiceId) {
          return { success: false, error: 'Voice ID required for ElevenLabs' }
        }
        await generateSpeechWithElevenLabs(text, voiceInfo.voiceId, tempWavFile, options)
        break

      case 'coqui':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Speaker name required for Coqui' }
        }
        await generateSpeechWithCoquiForPreview(text, voiceInfo.modelPath, voiceInfo.locale, tempWavFile)
        break

      default:
        return { success: false, error: `Unknown provider: ${voiceInfo.provider}` }
    }

    // Check if aborted
    if (previewAborted) {
      return { success: false, error: 'Preview cancelled' }
    }

    console.log('WAV exists:', fs.existsSync(tempWavFile), 'Size:', fs.existsSync(tempWavFile) ? fs.statSync(tempWavFile).size : 0)

    if (!fs.existsSync(tempWavFile) || fs.statSync(tempWavFile).size === 0) {
      return { success: false, error: 'Audio file was not created or is empty' }
    }

    // Convert WAV to MP3 for browser playback
    await convertWavToMp3(tempWavFile, tempMp3File)

    // Check if aborted
    if (previewAborted) {
      return { success: false, error: 'Preview cancelled' }
    }

    console.log('MP3 exists:', fs.existsSync(tempMp3File), 'Size:', fs.existsSync(tempMp3File) ? fs.statSync(tempMp3File).size : 0)

    // Clean up WAV file
    try {
      fs.unlinkSync(tempWavFile)
    } catch {
      // Ignore cleanup errors
    }

    if (!fs.existsSync(tempMp3File) || fs.statSync(tempMp3File).size === 0) {
      return { success: false, error: 'Failed to convert audio to MP3' }
    }

    // Read MP3 file as base64
    const audioBuffer = fs.readFileSync(tempMp3File)
    const audioBase64 = audioBuffer.toString('base64')
    const audioData = `data:audio/mpeg;base64,${audioBase64}`

    console.log('Audio data length:', audioData.length)

    // Clean up MP3 file
    try {
      fs.unlinkSync(tempMp3File)
    } catch {
      // Ignore cleanup errors
    }

    return { success: true, audioData }
  } catch (error) {
    console.error('Preview error:', error)
    // Clean up temp files on error
    try {
      if (fs.existsSync(tempWavFile)) fs.unlinkSync(tempWavFile)
      if (fs.existsSync(tempMp3File)) fs.unlinkSync(tempMp3File)
    } catch {
      // Ignore cleanup errors
    }

    // Don't show error if it was aborted
    if (previewAborted) {
      return { success: false, error: 'Preview cancelled' }
    }
    return { success: false, error: (error as Error).message }
  }
}

// Combine multiple WAV files
async function combineWavFiles(inputFiles: string[], outputPath: string): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files to combine')
  }

  const firstFile = inputFiles[0]
  const headerBuffer = Buffer.alloc(44)
  const fd = fs.openSync(firstFile, 'r')
  fs.readSync(fd, headerBuffer, 0, 44, 0)
  fs.closeSync(fd)

  let totalDataSize = 0
  for (const file of inputFiles) {
    const stats = fs.statSync(file)
    totalDataSize += stats.size - 44
  }

  const newFileSize = 36 + totalDataSize
  headerBuffer.writeUInt32LE(newFileSize, 4)
  headerBuffer.writeUInt32LE(totalDataSize, 40)

  const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 64 * 1024 })
  writeStream.write(headerBuffer)

  for (const file of inputFiles) {
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(file, {
        start: 44,
        highWaterMark: 64 * 1024
      })

      readStream.on('data', (chunk) => {
        if (!writeStream.write(chunk)) {
          readStream.pause()
          writeStream.once('drain', () => readStream.resume())
        }
      })

      readStream.on('end', resolve)
      readStream.on('error', reject)
    })
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve())
    writeStream.on('error', reject)
  })
}

// Combine a group of WAV files and convert to MP3
async function combineToPart(
  inputFiles: string[],
  outputMp3Path: string,
  tempDir: string
): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files to combine')
  }

  const tempWavPath = path.join(tempDir, `part_${Date.now()}.wav`)

  try {
    if (inputFiles.length === 1) {
      fs.copyFileSync(inputFiles[0], tempWavPath)
    } else {
      await combineWavFiles(inputFiles, tempWavPath)
    }

    await convertWavToMp3(tempWavPath, outputMp3Path)

    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath)
    }
  } catch (error) {
    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath)
    }
    throw error
  }
}

// Get path to ffmpeg executable
function getFfmpegExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe')
}

// Convert WAV to MP3 using FFmpeg
async function convertWavToMp3(wavPath: string, mp3Path: string): Promise<void> {
  const ffmpegExe = getFfmpegExecutable()

  if (!fs.existsSync(ffmpegExe)) {
    throw new Error(
      'FFmpeg not found. Please run setup script to download FFmpeg.'
    )
  }

  const ffmpegCommand = `"${ffmpegExe}" -i "${wavPath}" -b:a 128k -ar 22050 -ac 1 -y "${mp3Path}"`

  try {
    await execAsync(ffmpegCommand, { maxBuffer: 1024 * 1024 * 100 })
  } catch (error) {
    throw new Error(`Failed to convert WAV to MP3: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
    throw new Error('MP3 file was not created or is empty')
  }
}
