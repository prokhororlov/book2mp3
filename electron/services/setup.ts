import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { app } from 'electron'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync, rmSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface SetupProgress {
  stage: string
  progress: number
  details: string
}

export interface DependencyStatus {
  piper: boolean
  ffmpeg: boolean
  piperVoices: {
    ruRU: string[]
    enUS: string[]
  }
}

// Get path to resources
function getResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'tts_resources')
  } else {
    return path.join(process.cwd(), 'tts_resources')
  }
}

export function getPiperResourcesPath(): string {
  return path.join(getResourcesPath(), 'piper')
}

export function getFfmpegPath(): string {
  return path.join(getResourcesPath(), 'ffmpeg')
}

// Check which dependencies are installed
export function checkDependencies(): DependencyStatus {
  const piperPath = getPiperResourcesPath()
  const ffmpegPath = getFfmpegPath()

  const piperExe = path.join(piperPath, 'bin', 'piper', 'piper.exe')
  const ffmpegExe = path.join(ffmpegPath, 'ffmpeg.exe')

  const ruVoices = ['denis', 'dmitri', 'irina', 'ruslan']
  const enVoices = ['amy', 'lessac', 'ryan']

  const installedRuVoices: string[] = []
  const installedEnVoices: string[] = []

  // Check Russian voices
  for (const voice of ruVoices) {
    const quality = 'medium'
    const voicePath = path.join(piperPath, 'voices', 'ru_RU', voice, quality, `ru_RU-${voice}-${quality}.onnx`)
    if (existsSync(voicePath)) {
      installedRuVoices.push(voice)
    }
  }

  // Check English voices
  for (const voice of enVoices) {
    const quality = voice === 'amy' ? 'low' : 'medium'
    const voicePath = path.join(piperPath, 'voices', 'en_US', voice, quality, `en_US-${voice}-${quality}.onnx`)
    if (existsSync(voicePath)) {
      installedEnVoices.push(voice)
    }
  }

  return {
    piper: existsSync(piperExe),
    ffmpeg: existsSync(ffmpegExe),
    piperVoices: {
      ruRU: installedRuVoices,
      enUS: installedEnVoices
    }
  }
}

// Check if any essential dependency is missing
export function needsSetup(): boolean {
  const status = checkDependencies()

  // Need piper and ffmpeg at minimum
  if (!status.piper || !status.ffmpeg) {
    return true
  }

  // Need at least one voice
  const totalVoices = status.piperVoices.ruRU.length + status.piperVoices.enUS.length
  return totalVoices === 0
}

// Download file with progress tracking
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol === 'https:' ? https : http

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Book-to-MP3/1.0'
      }
    }, (response) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: Failed to download ${url}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0

      // Ensure directory exists
      const dir = path.dirname(destPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const fileStream = createWriteStream(destPath)

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length
        if (onProgress && totalSize > 0) {
          onProgress(downloadedSize, totalSize)
        }
      })

      response.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close()
        resolve()
      })

      fileStream.on('error', (err) => {
        // Clean up partial file
        if (existsSync(destPath)) {
          unlinkSync(destPath)
        }
        reject(err)
      })
    })

    request.on('error', (err) => {
      reject(err)
    })

    request.setTimeout(30000, () => {
      request.destroy()
      reject(new Error('Download timeout'))
    })
  })
}

// Extract ZIP file using PowerShell
async function extractZip(zipPath: string, destPath: string): Promise<void> {
  if (!existsSync(destPath)) {
    mkdirSync(destPath, { recursive: true })
  }

  const command = `powershell.exe -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`
  await execAsync(command, { maxBuffer: 1024 * 1024 * 50 })
}

// Install Piper TTS binary
async function installPiper(onProgress: (progress: SetupProgress) => void): Promise<void> {
  const piperPath = getPiperResourcesPath()
  const binPath = path.join(piperPath, 'bin')
  const zipPath = path.join(piperPath, 'piper_windows_amd64.zip')

  const piperUrl = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'

  onProgress({
    stage: 'piper',
    progress: 0,
    details: 'Downloading Piper TTS...'
  })

  await downloadFile(piperUrl, zipPath, (downloaded, total) => {
    const percent = Math.round((downloaded / total) * 100)
    onProgress({
      stage: 'piper',
      progress: percent,
      details: `Downloading Piper TTS... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
    })
  })

  onProgress({
    stage: 'piper',
    progress: 100,
    details: 'Extracting Piper TTS...'
  })

  await extractZip(zipPath, binPath)

  // Clean up zip
  if (existsSync(zipPath)) {
    unlinkSync(zipPath)
  }
}

// Install FFmpeg
async function installFfmpeg(onProgress: (progress: SetupProgress) => void): Promise<void> {
  const ffmpegPath = getFfmpegPath()
  const zipPath = path.join(ffmpegPath, 'ffmpeg-essentials.zip')
  const tempPath = path.join(ffmpegPath, 'temp')

  const ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

  onProgress({
    stage: 'ffmpeg',
    progress: 0,
    details: 'Downloading FFmpeg...'
  })

  await downloadFile(ffmpegUrl, zipPath, (downloaded, total) => {
    const percent = Math.round((downloaded / total) * 100)
    onProgress({
      stage: 'ffmpeg',
      progress: percent,
      details: `Downloading FFmpeg... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
    })
  })

  onProgress({
    stage: 'ffmpeg',
    progress: 100,
    details: 'Extracting FFmpeg...'
  })

  await extractZip(zipPath, tempPath)

  // Find ffmpeg.exe in extracted folder
  const findFfmpeg = async (dir: string): Promise<string | null> => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = await findFfmpeg(fullPath)
        if (found) return found
      } else if (entry.name === 'ffmpeg.exe') {
        return fullPath
      }
    }
    return null
  }

  const ffmpegExePath = await findFfmpeg(tempPath)
  if (ffmpegExePath) {
    fs.copyFileSync(ffmpegExePath, path.join(ffmpegPath, 'ffmpeg.exe'))
  }

  // Clean up
  if (existsSync(tempPath)) {
    rmSync(tempPath, { recursive: true })
  }
  if (existsSync(zipPath)) {
    unlinkSync(zipPath)
  }
}

// Install a single Piper voice
async function installPiperVoice(
  lang: 'ru_RU' | 'en_US',
  name: string,
  quality: string,
  onProgress: (progress: SetupProgress) => void
): Promise<void> {
  const piperPath = getPiperResourcesPath()
  const voicePath = path.join(piperPath, 'voices', lang, name, quality)
  const fileName = `${lang}-${name}-${quality}`

  if (!existsSync(voicePath)) {
    mkdirSync(voicePath, { recursive: true })
  }

  const langLower = lang.toLowerCase().replace('_', '/')
  const baseUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/${langLower}/${name}/${quality}`

  // Download .onnx model
  const onnxUrl = `${baseUrl}/${fileName}.onnx`
  const onnxPath = path.join(voicePath, `${fileName}.onnx`)

  onProgress({
    stage: 'voice',
    progress: 0,
    details: `Downloading voice ${name}...`
  })

  await downloadFile(onnxUrl, onnxPath, (downloaded, total) => {
    const percent = Math.round((downloaded / total) * 100)
    onProgress({
      stage: 'voice',
      progress: percent,
      details: `Downloading voice ${name}... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
    })
  })

  // Download .onnx.json config
  const jsonUrl = `${baseUrl}/${fileName}.onnx.json`
  const jsonPath = path.join(voicePath, `${fileName}.onnx.json`)

  await downloadFile(jsonUrl, jsonPath)
}

// Full setup process
export async function runSetup(
  onProgress: (progress: SetupProgress) => void,
  options: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
  } = {}
): Promise<void> {
  const {
    installPiper: shouldInstallPiper = true,
    installFfmpeg: shouldInstallFfmpeg = true,
    installRussianVoices = true,
    installEnglishVoices = true
  } = options

  const status = checkDependencies()

  // Install Piper if needed
  if (shouldInstallPiper && !status.piper) {
    await installPiper(onProgress)
  }

  // Install FFmpeg if needed
  if (shouldInstallFfmpeg && !status.ffmpeg) {
    await installFfmpeg(onProgress)
  }

  // Install Russian voices
  if (installRussianVoices) {
    const russianVoices = [
      { name: 'denis', quality: 'medium' },
      { name: 'dmitri', quality: 'medium' },
      { name: 'irina', quality: 'medium' },
      { name: 'ruslan', quality: 'medium' }
    ]

    for (const voice of russianVoices) {
      if (!status.piperVoices.ruRU.includes(voice.name)) {
        await installPiperVoice('ru_RU', voice.name, voice.quality, onProgress)
      }
    }
  }

  // Install English voices
  if (installEnglishVoices) {
    const englishVoices = [
      { name: 'amy', quality: 'low' },
      { name: 'lessac', quality: 'medium' },
      { name: 'ryan', quality: 'medium' }
    ]

    for (const voice of englishVoices) {
      if (!status.piperVoices.enUS.includes(voice.name)) {
        await installPiperVoice('en_US', voice.name, voice.quality, onProgress)
      }
    }
  }

  onProgress({
    stage: 'complete',
    progress: 100,
    details: 'Setup complete!'
  })
}

// Get total download size estimate
export function getEstimatedDownloadSize(): number {
  const status = checkDependencies()
  let size = 0

  // Piper binary ~15MB
  if (!status.piper) {
    size += 15
  }

  // FFmpeg ~85MB
  if (!status.ffmpeg) {
    size += 85
  }

  // Voices ~20MB each on average
  const missingRuVoices = 4 - status.piperVoices.ruRU.length
  const missingEnVoices = 3 - status.piperVoices.enUS.length
  size += (missingRuVoices + missingEnVoices) * 20

  return size
}
