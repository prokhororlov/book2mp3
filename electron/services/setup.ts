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
  silero: boolean
  sileroAvailable: boolean // true if Python is available for Silero setup
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

export function getSileroPath(): string {
  return path.join(getResourcesPath(), 'silero')
}

// Check if system Python is available
export async function checkPythonAvailable(): Promise<string | null> {
  const pythonCommands = ['python', 'python3', 'py']

  for (const cmd of pythonCommands) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`, { timeout: 5000 })
      if (stdout.includes('Python 3')) {
        return cmd
      }
    } catch {
      continue
    }
  }
  return null
}

// Check if Silero venv is set up and working
export function checkSileroInstalled(): boolean {
  const sileroPath = getSileroPath()
  const venvPython = path.join(sileroPath, 'venv', 'Scripts', 'python.exe')
  const generateScript = path.join(sileroPath, 'generate.py')

  return existsSync(venvPython) && existsSync(generateScript)
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

  // Check Silero
  const sileroInstalled = checkSileroInstalled()

  return {
    piper: existsSync(piperExe),
    ffmpeg: existsSync(ffmpegExe),
    silero: sileroInstalled,
    sileroAvailable: false, // Will be set by async check
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

// Async version of checkDependencies that also checks Python availability
export async function checkDependenciesAsync(): Promise<DependencyStatus> {
  const status = checkDependencies()
  const pythonCmd = await checkPythonAvailable()
  status.sileroAvailable = pythonCmd !== null
  return status
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
          // Handle relative redirect URLs by resolving against the original URL
          const absoluteRedirectUrl = new URL(redirectUrl, url).href
          downloadFile(absoluteRedirectUrl, destPath, onProgress).then(resolve).catch(reject)
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

  const langCode = lang.split('_')[0].toLowerCase()
  const baseUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/${langCode}/${lang}/${name}/${quality}`

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

// Install Silero TTS (requires Python to be installed on system)
export async function installSilero(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const pythonCmd = await checkPythonAvailable()

  if (!pythonCmd) {
    return {
      success: false,
      error: 'Python 3 is not installed. Please install Python 3.9+ from python.org'
    }
  }

  const sileroPath = getSileroPath()
  const venvPath = path.join(sileroPath, 'venv')
  const venvPython = path.join(venvPath, 'Scripts', 'python.exe')

  try {
    // Create silero directory
    if (!existsSync(sileroPath)) {
      mkdirSync(sileroPath, { recursive: true })
    }

    // Create virtual environment
    onProgress({
      stage: 'silero',
      progress: 10,
      details: 'Creating Python virtual environment...'
    })

    await execAsync(`${pythonCmd} -m venv "${venvPath}"`, { timeout: 60000 })

    if (!existsSync(venvPython)) {
      return { success: false, error: 'Failed to create virtual environment' }
    }

    // Upgrade pip
    onProgress({
      stage: 'silero',
      progress: 20,
      details: 'Upgrading pip...'
    })

    await execAsync(`"${venvPython}" -m pip install --upgrade pip --no-input`, {
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10
    })

    // Install PyTorch CPU
    onProgress({
      stage: 'silero',
      progress: 30,
      details: 'Installing PyTorch (this may take several minutes)...'
    })

    await execAsync(
      `"${venvPython}" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --no-input`,
      { timeout: 600000, maxBuffer: 1024 * 1024 * 50 }
    )

    // Install additional dependencies
    onProgress({
      stage: 'silero',
      progress: 80,
      details: 'Installing additional dependencies...'
    })

    await execAsync(`"${venvPython}" -m pip install omegaconf --no-input`, {
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10
    })

    // Copy generate.py script
    onProgress({
      stage: 'silero',
      progress: 90,
      details: 'Setting up generation script...'
    })

    const generateScript = getGenerateScriptContent()
    fs.writeFileSync(path.join(sileroPath, 'generate.py'), generateScript, 'utf-8')

    // Verify installation
    onProgress({
      stage: 'silero',
      progress: 95,
      details: 'Verifying installation...'
    })

    const { stdout } = await execAsync(`"${venvPython}" -c "import torch; print('OK')"`, { timeout: 30000 })

    if (!stdout.includes('OK')) {
      return { success: false, error: 'PyTorch verification failed' }
    }

    onProgress({
      stage: 'silero',
      progress: 100,
      details: 'Silero installation complete!'
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Generate.py script content for Silero
function getGenerateScriptContent(): string {
  return `#!/usr/bin/env python3
import argparse
import torch
import os

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', required=True, help='Text to synthesize')
    parser.add_argument('--speaker', required=True, help='Speaker ID (e.g., xenia, baya, eugene)')
    parser.add_argument('--output', required=True, help='Output WAV file path')
    parser.add_argument('--sample_rate', type=int, default=48000)
    args = parser.parse_args()

    device = torch.device('cpu')

    # Determine language from speaker
    ru_speakers = ['xenia', 'baya', 'kseniya', 'aidar', 'eugene', 'random']
    en_speakers = ['en_0', 'en_1', 'en_2', 'en_3', 'en_4']

    if args.speaker in ru_speakers:
        model, _ = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_tts',
            language='ru',
            speaker='v4_ru'
        )
    else:
        model, _ = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_tts',
            language='en',
            speaker='v3_en'
        )

    model.to(device)

    audio = model.apply_tts(
        text=args.text,
        speaker=args.speaker,
        sample_rate=args.sample_rate
    )

    # Save as WAV
    import wave
    import struct

    with wave.open(args.output, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(args.sample_rate)

        # Convert float tensor to int16
        audio_int16 = (audio * 32767).to(torch.int16)
        wav_file.writeframes(audio_int16.numpy().tobytes())

    print(f'Audio saved to {args.output}')

if __name__ == '__main__':
    main()
`
}
