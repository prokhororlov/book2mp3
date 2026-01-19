import path from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { SetupProgress } from './types'
import { getPiperResourcesPath, getRHVoicePath } from './paths'
import { downloadFile } from './utils'

const execAsync = promisify(exec)

// RHVoice voice URLs by language
export const RHVOICE_VOICE_URLS: Record<string, Record<string, { url: string; gender: 'Male' | 'Female' }>> = {
  'ru-RU': {
    'Aleksandr': {
      url: 'https://github.com/RHVoice/aleksandr-rus/releases/download/4.2/RHVoice-voice-Russian-Aleksandr-v4.2.2016.21-setup.exe',
      gender: 'Male'
    },
    'Anna': {
      url: 'https://github.com/RHVoice/anna-rus/releases/download/4.1/RHVoice-voice-Russian-Anna-v4.1.2016.21-setup.exe',
      gender: 'Female'
    },
    'Elena': {
      url: 'https://github.com/RHVoice/elena-rus/releases/download/v4.3/RHVoice-voice-Russian-Elena-v4.3.2016.21-setup.exe',
      gender: 'Female'
    },
    'Irina': {
      url: 'https://github.com/RHVoice/irina-rus/releases/download/4.1/RHVoice-voice-Russian-Irina-v4.1.2016.21-setup.exe',
      gender: 'Female'
    }
  },
  'en': {
    'Bdl': {
      url: 'https://github.com/RHVoice/bdl-eng/releases/download/4.1/RHVoice-voice-English-Bdl-v4.1.2016.21-setup.exe',
      gender: 'Male'
    },
    'Slt': {
      url: 'https://github.com/RHVoice/slt-eng/releases/download/4.1/RHVoice-voice-English-Slt-v4.1.2016.21-setup.exe',
      gender: 'Female'
    },
    'Clb': {
      url: 'https://github.com/RHVoice/clb-eng/releases/download/4.0/RHVoice-voice-English-Clb-v4.0.2016.21-setup.exe',
      gender: 'Female'
    },
    'Alan': {
      url: 'https://github.com/RHVoice/alan-eng/releases/download/4.0/RHVoice-voice-English-Alan-v4.0.2016.21-setup.exe',
      gender: 'Male'
    }
  }
}

// Get all available RHVoice voices for a language
export function getAvailableRHVoices(language: string): Array<{ name: string; gender: 'Male' | 'Female' }> {
  const voices = RHVOICE_VOICE_URLS[language]
  if (!voices) return []
  return Object.entries(voices).map(([name, info]) => ({ name, gender: info.gender }))
}

// Get list of installed SAPI voices using System.Speech (includes RHVoice)
export async function getInstalledSAPIVoices(): Promise<string[]> {
  try {
    // Use System.Speech to get all installed voices (more reliable, includes RHVoice)
    const psScript = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.GetInstalledVoices() | ForEach-Object { Write-Output $_.VoiceInfo.Name }; $synth.Dispose()`

    const { stdout } = await execAsync(`powershell -Command "${psScript}"`, {
      timeout: 15000
    })

    return stdout
      .trim()
      .split('\n')
      .map(v => v.trim())
      .filter(v => v.length > 0)
  } catch (error) {
    console.error('Error getting SAPI voices:', error)
    return []
  }
}

// Check if a specific RHVoice voice is installed
export async function isRHVoiceInstalled(voiceName: string): Promise<boolean> {
  const voices = await getInstalledSAPIVoices()
  // RHVoice voices are registered by their name (e.g., "Aleksandr", "Anna")
  // Check for exact match (case-insensitive)
  return voices.some(v => v.toLowerCase() === voiceName.toLowerCase())
}

// Get all installed RHVoice voices
export async function getInstalledRHVoices(): Promise<string[]> {
  const allVoices = await getInstalledSAPIVoices()
  console.log('SAPI voices found:', allVoices)

  // RHVoice voice names (registered in SAPI without "RHVoice" prefix)
  const rhvoiceNames = ['aleksandr', 'anna', 'elena', 'irina', 'bdl', 'slt', 'clb', 'alan']

  // Match voices by exact name (RHVoice registers voices by their name only)
  const installedRHVoices: string[] = []
  for (const voiceName of allVoices) {
    const lowerVoiceName = voiceName.toLowerCase()
    // Check for exact match with known RHVoice voice names
    for (const rhName of rhvoiceNames) {
      if (lowerVoiceName === rhName) {
        // Return the canonical name (capitalized)
        installedRHVoices.push(rhName.charAt(0).toUpperCase() + rhName.slice(1))
        break
      }
    }
  }

  console.log('Installed RHVoice voices:', installedRHVoices)
  return installedRHVoices
}

// Check if RHVoice core is installed (checks if any RHVoice voice is in SAPI)
export async function checkRHVoiceCoreInstalled(): Promise<boolean> {
  try {
    const installedVoices = await getInstalledRHVoices()
    return installedVoices.length > 0
  } catch {
    return false
  }
}

// Install RHVoice core (SAPI engine)
// Note: RHVoice voice installers already include all necessary SAPI components,
// so we install a default voice (Aleksandr) which provides the SAPI engine
export async function installRHVoiceCore(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  // RHVoice voice installers already contain the SAPI engine,
  // so we just install the default Russian voice (Aleksandr)
  return installRHVoice('Aleksandr', 'ru-RU', onProgress)
}

// Install a specific RHVoice voice
export async function installRHVoice(
  voiceName: string,
  language: string,
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const voiceInfo = RHVOICE_VOICE_URLS[language]?.[voiceName]

  if (!voiceInfo) {
    return { success: false, error: `Unknown voice: ${voiceName} for language ${language}` }
  }

  const rhvoicePath = getRHVoicePath()
  const installerPath = path.join(rhvoicePath, `RHVoice-${voiceName}.exe`)

  try {
    if (!existsSync(rhvoicePath)) {
      mkdirSync(rhvoicePath, { recursive: true })
    }

    onProgress({
      stage: 'rhvoice-voice',
      progress: 0,
      details: `Downloading ${voiceName} voice...`
    })

    await downloadFile(voiceInfo.url, installerPath, (downloaded, total) => {
      const percent = Math.round((downloaded / total) * 80)
      onProgress({
        stage: 'rhvoice-voice',
        progress: percent,
        details: `Downloading ${voiceName}... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      })
    })

    onProgress({
      stage: 'rhvoice-voice',
      progress: 85,
      details: `Installing ${voiceName} voice...`
    })

    // Run installer silently
    await execAsync(`"${installerPath}" /S`, { timeout: 120000 })

    // Clean up installer
    if (existsSync(installerPath)) {
      unlinkSync(installerPath)
    }

    onProgress({
      stage: 'rhvoice-voice',
      progress: 90,
      details: `Verifying ${voiceName} installation...`
    })

    // Wait for SAPI registration to complete and verify installation
    // NSIS installer may finish before registry is fully updated
    let installed = false
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      installed = await isRHVoiceInstalled(voiceName)
      if (installed) break
    }

    if (!installed) {
      console.warn(`Voice ${voiceName} not found in SAPI after installation, but installer completed successfully`)
    }

    onProgress({
      stage: 'rhvoice-voice',
      progress: 100,
      details: `${voiceName} voice installed!`
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Install a single Piper voice
export async function installPiperVoice(
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
