import fs from 'fs'
import path from 'path'
import { ChildProcess } from 'child_process'
import http from 'http'

// Temp directory name (app-specific to avoid conflicts)
export const TEMP_AUDIO_DIR_NAME = 'bookify_tts_temp'

// Track last used output directory for cleanup
let lastOutputDir: string | null = null

// Preview abort control
let currentPreviewProcess: ChildProcess | null = null
let currentPreviewRequest: http.ClientRequest | null = null
let previewAborted = false

export function setLastOutputDir(dir: string | null): void {
  lastOutputDir = dir
}

export function setCurrentPreviewProcess(process: ChildProcess | null): void {
  currentPreviewProcess = process
}

export function setCurrentPreviewRequest(request: http.ClientRequest | null): void {
  currentPreviewRequest = request
}

export function isPreviewAborted(): boolean {
  return previewAborted
}

export function setPreviewAborted(value: boolean): void {
  previewAborted = value
}

export function getCurrentPreviewProcess(): ChildProcess | null {
  return currentPreviewProcess
}

export function getCurrentPreviewRequest(): http.ClientRequest | null {
  return currentPreviewRequest
}

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

// Cleanup temp audio directory with retry logic for locked files
export function cleanupTempAudio(outputDir?: string): void {
  const dirsToClean: string[] = []

  if (outputDir) {
    dirsToClean.push(path.join(outputDir, TEMP_AUDIO_DIR_NAME))
  }

  if (lastOutputDir && lastOutputDir !== outputDir) {
    dirsToClean.push(path.join(lastOutputDir, TEMP_AUDIO_DIR_NAME))
  }

  for (const tempDir of dirsToClean) {
    cleanupDirWithRetry(tempDir)
  }
}

// Helper to cleanup directory with retries (handles locked files)
function cleanupDirWithRetry(dirPath: string, maxRetries: number = 3): void {
  if (!fs.existsSync(dirPath)) return

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // First try to delete individual files
      const files = fs.readdirSync(dirPath)
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        try {
          fs.unlinkSync(filePath)
        } catch {
          // File might be locked, continue
        }
      }
      // Then remove the directory
      fs.rmSync(dirPath, { recursive: true, force: true })
      console.log(`Cleaned up temp directory: ${dirPath}`)
      return
    } catch (error) {
      if (attempt === maxRetries) {
        console.warn(`Failed to clean up temp directory ${dirPath} after ${maxRetries} attempts:`, error)
      } else {
        // Wait a bit before retry (sync sleep using busy wait for simplicity)
        const waitUntil = Date.now() + 100
        while (Date.now() < waitUntil) { /* busy wait */ }
      }
    }
  }
}
