import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { app } from 'electron'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync, rmSync } from 'fs'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)


// Interface for pip progress tracking
interface PipProgressInfo {
  phase: 'collecting' | 'downloading' | 'installing' | 'processing'
  package: string
  downloaded?: number
  total?: number
  percentage?: number
}

// Run pip install with real-time progress tracking
async function runPipWithProgress(
  pythonPath: string,
  packages: string,
  options: {
    indexUrl?: string
    timeout?: number
    msvcEnvPath?: string // Path to vcvarsall.bat for MSVC environment
    extraArgs?: string[] // Additional pip arguments like --prefer-binary
    targetDir?: string // Target directory for installation (for embedded Python)
    onProgress?: (info: PipProgressInfo) => void
    onOutput?: (line: string) => void
  } = {}
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let command: string
    let spawnArgs: string[]

    // Note: --progress-bar was removed in newer pip versions, pip shows progress by default
    const pipArgs = ['pip', 'install', '--no-input']

    if (options.indexUrl) {
      pipArgs.push('--index-url', options.indexUrl)
    }

    if (options.targetDir) {
      pipArgs.push('--target', options.targetDir)
    }

    if (options.extraArgs) {
      pipArgs.push(...options.extraArgs)
    }

    // Add packages (split by space, filter out empty strings)
    pipArgs.push(...packages.split(' ').filter(p => p.trim()))
    
    if (options.msvcEnvPath) {
      // Run pip within MSVC environment
      command = 'cmd.exe'
      const pipCommand = `"${pythonPath}" -m ${pipArgs.join(' ')}`
      spawnArgs = ['/c', `call "${options.msvcEnvPath}" x64 >nul 2>&1 && ${pipCommand}`]
      console.log('[runPipWithProgress] MSVC command:', spawnArgs.join(' '))
    } else {
      command = pythonPath
      spawnArgs = ['-m', ...pipArgs]
      console.log('[runPipWithProgress] command:', command, spawnArgs.join(' '))
    }

    const proc = spawn(command, spawnArgs, {
      shell: true, // Always use shell for proper command parsing
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
    
    let lastPackage = ''
    let stderr = ''
    
    const parseProgressLine = (line: string) => {
      // pip progress format: "Downloading package-1.0.0.whl (123.4 MB)" or percentage updates
      // Also: "Downloading torch-2.0.0+cpu... 50%|█████     | 123/246 [00:30<00:30, 4.0MB/s]"
      
      if (options.onOutput) {
        options.onOutput(line)
      }
      
      // Match "Collecting package"
      const collectMatch = line.match(/Collecting\s+(\S+)/)
      if (collectMatch) {
        lastPackage = collectMatch[1].split('[')[0].split('>')[0].split('<')[0].split('=')[0]
        options.onProgress?.({
          phase: 'collecting',
          package: lastPackage
        })
        return
      }
      
      // Match "Downloading package (size)"
      const downloadStartMatch = line.match(/Downloading\s+(\S+)/)
      if (downloadStartMatch) {
        lastPackage = downloadStartMatch[1].split('-')[0]
        options.onProgress?.({
          phase: 'downloading',
          package: lastPackage
        })
        return
      }
      
      // Match percentage progress: "50%|" or just percentage in download
      const percentMatch = line.match(/(\d+)%\|/)
      if (percentMatch) {
        options.onProgress?.({
          phase: 'downloading',
          package: lastPackage,
          percentage: parseInt(percentMatch[1], 10)
        })
        return
      }
      
      // Match download size progress: "123.4/456.7 MB" or "123/456 kB"
      const sizeMatch = line.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(MB|kB|GB)/i)
      if (sizeMatch) {
        const multiplier = sizeMatch[3].toLowerCase() === 'gb' ? 1024 : sizeMatch[3].toLowerCase() === 'mb' ? 1 : 0.001
        const downloaded = parseFloat(sizeMatch[1]) * multiplier
        const total = parseFloat(sizeMatch[2]) * multiplier
        options.onProgress?.({
          phase: 'downloading',
          package: lastPackage,
          downloaded,
          total,
          percentage: Math.round((downloaded / total) * 100)
        })
        return
      }
      
      // Match "Installing collected packages"
      if (line.includes('Installing collected packages')) {
        options.onProgress?.({
          phase: 'installing',
          package: lastPackage
        })
        return
      }
      
      // Match "Successfully installed"
      if (line.includes('Successfully installed')) {
        options.onProgress?.({
          phase: 'processing',
          package: 'complete',
          percentage: 100
        })
        return
      }
      
      // Match "Building wheel" for compilation progress
      const buildMatch = line.match(/Building wheel for (\S+)/)
      if (buildMatch) {
        lastPackage = buildMatch[1]
        options.onProgress?.({
          phase: 'processing',
          package: lastPackage
        })
        return
      }
    }
    
    // Buffer for incomplete lines
    let stdoutBuffer = ''
    let stderrBuffer = ''
    
    proc.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''
      lines.forEach(parseProgressLine)
    })
    
    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      stderr += str
      stderrBuffer += str
      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() || ''
      // pip often outputs progress to stderr
      lines.forEach(parseProgressLine)
    })
    
    const timeout = options.timeout || 600000
    const timeoutId = setTimeout(() => {
      proc.kill()
      resolve({ success: false, error: `Installation timeout after ${timeout / 1000} seconds` })
    }, timeout)
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      // Process remaining buffer
      if (stdoutBuffer) parseProgressLine(stdoutBuffer)
      if (stderrBuffer) parseProgressLine(stderrBuffer)

      if (code === 0) {
        resolve({ success: true })
      } else {
        console.error('[runPipWithProgress] pip failed with code:', code)
        console.error('[runPipWithProgress] stderr:', stderr.slice(-2000)) // Last 2000 chars
        resolve({ success: false, error: stderr || `pip exited with code ${code}` })
      }
    })
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      resolve({ success: false, error: err.message })
    })
  })
}

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
  coqui: boolean
  coquiAvailable: boolean // true if Python is available for Coqui setup
  coquiBuildToolsAvailable: boolean // true if Visual Studio Build Tools are installed
  rhvoiceCore: boolean // true if RHVoice SAPI engine is installed
  rhvoiceVoices: string[] // list of installed RHVoice voice names
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

export function getCoquiPath(): string {
  return path.join(getResourcesPath(), 'coqui')
}

export function getRHVoicePath(): string {
  return path.join(getResourcesPath(), 'rhvoice')
}

// RHVoice voice download URLs
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

// Embedded Python configuration
const EMBEDDED_PYTHON_VERSION = '3.11.9'
const EMBEDDED_PYTHON_URL = `https://www.python.org/ftp/python/${EMBEDDED_PYTHON_VERSION}/python-${EMBEDDED_PYTHON_VERSION}-embed-amd64.zip`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'

// Get path to embedded Python directory
export function getEmbeddedPythonPath(): string {
  return path.join(getResourcesPath(), 'python')
}

// Get path to embedded Python executable
export function getEmbeddedPythonExe(): string {
  return path.join(getEmbeddedPythonPath(), 'python.exe')
}

// Check if embedded Python is installed and working
export function checkEmbeddedPythonInstalled(): boolean {
  const pythonExe = getEmbeddedPythonExe()
  const pipDir = path.join(getEmbeddedPythonPath(), 'Lib', 'site-packages', 'pip')
  return existsSync(pythonExe) && existsSync(pipDir)
}

// Install embedded Python with pip (packages install directly, no venv needed)
export async function installEmbeddedPython(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const pythonPath = getEmbeddedPythonPath()
  const pythonExe = getEmbeddedPythonExe()
  const zipPath = path.join(pythonPath, 'python-embed.zip')
  const getPipPath = path.join(pythonPath, 'get-pip.py')

  try {
    // Create directory
    if (!existsSync(pythonPath)) {
      mkdirSync(pythonPath, { recursive: true })
    }

    // Download embedded Python
    onProgress({
      stage: 'python',
      progress: 0,
      details: 'Downloading embedded Python...'
    })

    await downloadFile(EMBEDDED_PYTHON_URL, zipPath, (downloaded, total) => {
      const percent = Math.round((downloaded / total) * 40)
      onProgress({
        stage: 'python',
        progress: percent,
        details: `Downloading Python ${EMBEDDED_PYTHON_VERSION}... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      })
    })

    // Extract
    onProgress({
      stage: 'python',
      progress: 45,
      details: 'Extracting Python...'
    })

    await extractZip(zipPath, pythonPath)

    // Clean up zip
    if (existsSync(zipPath)) {
      unlinkSync(zipPath)
    }

    // Enable site-packages by modifying python*._pth file
    onProgress({
      stage: 'python',
      progress: 50,
      details: 'Configuring Python...'
    })

    const pthFiles = fs.readdirSync(pythonPath).filter(f => f.endsWith('._pth'))
    for (const pthFile of pthFiles) {
      const pthPath = path.join(pythonPath, pthFile)
      let content = fs.readFileSync(pthPath, 'utf-8')
      // Uncomment import site
      if (content.includes('#import site')) {
        content = content.replace('#import site', 'import site')
      } else if (!content.includes('import site')) {
        content += '\nimport site\n'
      }
      // Add Lib/site-packages path
      if (!content.includes('Lib/site-packages')) {
        content += '\nLib/site-packages\n'
      }
      fs.writeFileSync(pthPath, content, 'utf-8')
    }

    // Create Lib/site-packages directory
    const sitePackagesPath = path.join(pythonPath, 'Lib', 'site-packages')
    if (!existsSync(sitePackagesPath)) {
      mkdirSync(sitePackagesPath, { recursive: true })
    }

    // Download get-pip.py
    onProgress({
      stage: 'python',
      progress: 55,
      details: 'Downloading pip installer...'
    })

    await downloadFile(GET_PIP_URL, getPipPath)

    // Install pip
    onProgress({
      stage: 'python',
      progress: 60,
      details: 'Installing pip...'
    })

    await execAsync(`"${pythonExe}" "${getPipPath}" --target "${sitePackagesPath}" --no-warn-script-location`, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 10,
      cwd: pythonPath
    })

    // Clean up get-pip.py
    if (existsSync(getPipPath)) {
      unlinkSync(getPipPath)
    }

    // Verify pip installation
    onProgress({
      stage: 'python',
      progress: 90,
      details: 'Verifying pip installation...'
    })

    const { stdout } = await execAsync(`"${pythonExe}" -m pip --version`, { timeout: 30000 })
    if (!stdout.includes('pip')) {
      return { success: false, error: 'Failed to install pip' }
    }

    // Upgrade pip
    onProgress({
      stage: 'python',
      progress: 95,
      details: 'Upgrading pip...'
    })

    await execAsync(`"${pythonExe}" -m pip install --upgrade pip --no-warn-script-location`, {
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10
    })

    onProgress({
      stage: 'python',
      progress: 100,
      details: 'Embedded Python installed successfully!'
    })

    return { success: true }
  } catch (error) {
    // Clean up on error
    try {
      if (existsSync(zipPath)) unlinkSync(zipPath)
      if (existsSync(getPipPath)) unlinkSync(getPipPath)
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: (error as Error).message }
  }
}

// Check if system Python is available (checks embedded first, then system)
export async function checkPythonAvailable(): Promise<string | null> {
  // First check embedded Python
  if (checkEmbeddedPythonInstalled()) {
    const embeddedExe = getEmbeddedPythonExe()
    try {
      const { stdout, stderr } = await execAsync(`"${embeddedExe}" --version`, { timeout: 5000 })
      const output = stdout + stderr
      if (output.includes('Python 3')) {
        return embeddedExe
      }
    } catch {
      // Embedded Python check failed, continue to system Python
    }
  }

  // Helper to verify Python executable
  const verifyPython = async (pythonPath: string): Promise<string | null> => {
    try {
      const quotedPath = pythonPath.includes(' ') ? `"${pythonPath}"` : pythonPath
      const { stdout, stderr } = await execAsync(`${quotedPath} --version`, { timeout: 5000 })
      const output = stdout + stderr
      if (!output.includes('Python 3')) {
        return null
      }
      // Verify it's 64-bit and compatible version
      try {
        const { stdout: archOut } = await execAsync(`${quotedPath} -c "import struct; print(struct.calcsize('P') * 8)"`, { timeout: 5000 })
        if (archOut.trim() !== '64') {
          console.log(`Skipping ${pythonPath}: 32-bit Python not supported`)
          return null
        }
        // Check version is 3.8-3.12
        const { stdout: verOut } = await execAsync(`${quotedPath} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"`, { timeout: 5000 })
        const [major, minor] = verOut.trim().split('.').map(Number)
        if (major !== 3 || minor < 8 || minor > 12) {
          console.log(`Skipping ${pythonPath}: Python ${verOut.trim()} not supported (need 3.8-3.12)`)
          return null
        }
      } catch {
        // If we can't verify, still try to use it
      }
      return pythonPath
    } catch {
      return null
    }
  }

  // First check PATH
  const pythonCommands = ['python', 'python3', 'py']
  for (const cmd of pythonCommands) {
    const result = await verifyPython(cmd)
    if (result) return result
  }

  // If not in PATH, search common installation locations
  const userProfile = process.env.USERPROFILE || process.env.HOME || ''
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  // Common Python installation paths (sorted by preference: newer versions first)
  const pythonSearchPaths: string[] = []

  // Python versions to check (3.12 down to 3.8)
  for (let minor = 12; minor >= 8; minor--) {
    // User-installed Python (most common)
    pythonSearchPaths.push(path.join(localAppData, 'Programs', 'Python', `Python3${minor}`, 'python.exe'))
    // System-wide install
    pythonSearchPaths.push(path.join(programFiles, `Python3${minor}`, 'python.exe'))
    pythonSearchPaths.push(path.join(programFilesX86, `Python3${minor}`, 'python.exe'))
    // Older style paths
    pythonSearchPaths.push(`C:\\Python3${minor}\\python.exe`)
  }

  // Also check for pyenv-win
  pythonSearchPaths.push(path.join(userProfile, '.pyenv', 'pyenv-win', 'shims', 'python.exe'))

  for (const pythonPath of pythonSearchPaths) {
    if (existsSync(pythonPath)) {
      const result = await verifyPython(pythonPath)
      if (result) {
        console.log(`Found Python at: ${pythonPath}`)
        return result
      }
    }
  }

  return null
}

// Check if Python is available (system or embedded) - returns info about which one
export async function getPythonInfo(): Promise<{ available: boolean; path: string | null; isEmbedded: boolean; version: string | null }> {
  // First check embedded Python
  if (checkEmbeddedPythonInstalled()) {
    const embeddedExe = getEmbeddedPythonExe()
    try {
      const { stdout, stderr } = await execAsync(`"${embeddedExe}" --version`, { timeout: 5000 })
      const output = stdout + stderr
      const match = output.match(/Python (\d+\.\d+\.\d+)/)
      if (match) {
        return { available: true, path: embeddedExe, isEmbedded: true, version: match[1] }
      }
    } catch {
      // Continue to system Python
    }
  }

  // Check system Python
  const pythonCmd = await checkPythonAvailable()
  if (pythonCmd && !pythonCmd.includes(getEmbeddedPythonPath())) {
    try {
      const { stdout, stderr } = await execAsync(`${pythonCmd} --version`, { timeout: 5000 })
      const output = stdout + stderr
      const match = output.match(/Python (\d+\.\d+\.\d+)/)
      return { available: true, path: pythonCmd, isEmbedded: false, version: match ? match[1] : null }
    } catch {
      // Failed
    }
  }

  return { available: false, path: null, isEmbedded: false, version: null }
}


// Check if Visual Studio Build Tools (C++ compiler) is available
export async function checkBuildToolsAvailable(): Promise<boolean> {
  // Helper function to check for cl.exe in MSVC path
  const checkMsvcPath = (msvcPath: string): boolean => {
    if (existsSync(msvcPath)) {
      try {
        const versions = fs.readdirSync(msvcPath)
        for (const version of versions) {
          const clPath = path.join(msvcPath, version, 'bin', 'Hostx64', 'x64', 'cl.exe')
          if (existsSync(clPath)) {
            return true
          }
        }
      } catch {
        // Ignore read errors
      }
    }
    return false
  }

  // Method 1: Use vswhere.exe to find Visual Studio installations with C++ tools
  const vswherePaths = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  ]

  for (const vswherePath of vswherePaths) {
    if (existsSync(vswherePath)) {
      try {
        // Query for installations with VC++ tools component
        const { stdout } = await execAsync(
          `"${vswherePath}" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
          { timeout: 10000 }
        )
        
        if (stdout.trim()) {
          const vsPath = stdout.trim()
          const msvcPath = path.join(vsPath, 'VC', 'Tools', 'MSVC')
          if (checkMsvcPath(msvcPath)) {
            return true
          }
        }
      } catch {
        // vswhere failed, continue to fallback
      }
    }
  }

  // Method 2: Direct path check for common VS/Build Tools installations
  // This catches installations that vswhere doesn't find (older installs, custom paths)
  const possibleMsvcPaths = [
    // VS 2022 Build Tools
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    // VS 2022 editions
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Tools\\MSVC',
    // VS 2019
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Tools\\MSVC',
    // VS 2017
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\VC\\Tools\\MSVC',
  ]

  for (const msvcPath of possibleMsvcPaths) {
    if (checkMsvcPath(msvcPath)) {
      return true
    }
  }

  // Method 3: Try to run cl.exe directly (in case it's in PATH via Developer Command Prompt)
  try {
    await execAsync('where cl.exe', { timeout: 5000 })
    return true
  } catch {
    // cl.exe not in PATH
  }

  return false
}

// Download and install Visual Studio Build Tools
export async function installBuildTools(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string; requiresRestart?: boolean }> {
  const resourcesPath = getResourcesPath()
  const installerPath = path.join(resourcesPath, 'vs_buildtools.exe')

  try {
    // Create resources directory if it doesn't exist
    if (!existsSync(resourcesPath)) {
      mkdirSync(resourcesPath, { recursive: true })
    }

    onProgress({
      stage: 'buildtools',
      progress: 5,
      details: 'Downloading Visual Studio Build Tools installer...'
    })

    // Download the Visual Studio Build Tools installer
    const installerUrl = 'https://aka.ms/vs/17/release/vs_buildtools.exe'
    
    await new Promise<void>((resolve, reject) => {
      downloadFile(installerUrl, installerPath, (downloaded, total) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 40) + 5 : 10
        onProgress({
          stage: 'buildtools',
          progress: percent,
          details: `Downloading installer... ${Math.round(downloaded / 1024 / 1024)}MB`
        })
      })
        .then(() => resolve())
        .catch(reject)
    })

    onProgress({
      stage: 'buildtools',
      progress: 50,
      details: 'Installing Visual Studio Build Tools (this may take 10-20 minutes)...'
    })

    // Run the installer silently with C++ workload
    // --quiet: no UI
    // --wait: wait for installation to complete
    // --norestart: don't restart automatically
    // --add: add the C++ build tools workload
    const installCmd = `"${installerPath}" --quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`

    try {
      await execAsync(installCmd, { 
        timeout: 3600000, // 1 hour timeout for installation
        maxBuffer: 1024 * 1024 * 10
      })
    } catch (installError) {
      // The installer might return non-zero exit code even on success
      // Check if build tools are now available
      const installed = await checkBuildToolsAvailable()
      if (!installed) {
        // Check for common error codes
        const errorMsg = (installError as Error).message
        if (errorMsg.includes('3010')) {
          // Exit code 3010 means success but requires restart
          onProgress({
            stage: 'buildtools',
            progress: 100,
            details: 'Build Tools installed! Computer restart required.'
          })
          return { success: true, requiresRestart: true }
        }
        throw installError
      }
    }

    // Cleanup installer
    try {
      unlinkSync(installerPath)
    } catch {
      // Ignore cleanup errors
    }

    // Verify installation
    onProgress({
      stage: 'buildtools',
      progress: 95,
      details: 'Verifying installation...'
    })

    const installed = await checkBuildToolsAvailable()
    if (!installed) {
      return { 
        success: false, 
        error: 'Build Tools installation completed but compiler not found. Please restart your computer and try again.' 
      }
    }

    onProgress({
      stage: 'buildtools',
      progress: 100,
      details: 'Visual Studio Build Tools installed successfully!'
    })

    return { success: true }
  } catch (error) {
    // Cleanup on error
    try {
      if (existsSync(installerPath)) {
        unlinkSync(installerPath)
      }
    } catch {
      // Ignore cleanup errors
    }
    
    return { success: false, error: (error as Error).message }
  }
}

// Check if Silero is set up and working (supports both venv and embedded Python)
export function checkSileroInstalled(): boolean {
  const sileroPath = getSileroPath()
  const venvPython = path.join(sileroPath, 'venv', 'Scripts', 'python.exe')
  const embeddedPython = getEmbeddedPythonExe()
  const generateScript = path.join(sileroPath, 'generate.py')

  // Check if either venv Python or embedded Python exists
  const venvPythonExists = existsSync(venvPython)
  const embeddedPythonExists = checkEmbeddedPythonInstalled()
  const pythonExists = venvPythonExists || embeddedPythonExists
  const scriptExists = existsSync(generateScript)

  console.log('Silero check:', {
    sileroPath,
    venvPython,
    embeddedPython,
    venvPythonExists,
    embeddedPythonExists,
    generateScript,
    pythonExists,
    scriptExists
  })

  return pythonExists && scriptExists
}

// Check if Coqui is set up and working (supports both venv and embedded Python)
export function checkCoquiInstalled(): boolean {
  const coquiPath = getCoquiPath()
  const venvPython = path.join(coquiPath, 'venv', 'Scripts', 'python.exe')
  const embeddedPython = getEmbeddedPythonExe()
  const generateScript = path.join(coquiPath, 'generate.py')

  // Check if either venv Python or embedded Python exists
  const venvPythonExists = existsSync(venvPython)
  const embeddedPythonExists = checkEmbeddedPythonInstalled()
  const pythonExists = venvPythonExists || embeddedPythonExists
  const scriptExists = existsSync(generateScript)

  console.log('Coqui check:', {
    coquiPath,
    venvPython,
    embeddedPython,
    venvPythonExists,
    embeddedPythonExists,
    generateScript,
    pythonExists,
    scriptExists
  })

  return pythonExists && scriptExists
}

// Check if RHVoice core is installed (checks if any RHVoice voice is in SAPI)
export async function checkRHVoiceCoreInstalled(): Promise<boolean> {
  try {
    const installedVoices = await getInstalledSAPIVoices()
    // Check if any RHVoice voice is installed
    return installedVoices.some(v => v.toLowerCase().includes('rhvoice') || 
      ['aleksandr', 'anna', 'elena', 'irina', 'bdl', 'slt', 'clb', 'alan'].some(name => 
        v.toLowerCase() === name.toLowerCase()
      )
    )
  } catch {
    return false
  }
}

// Get list of installed SAPI voices
export async function getInstalledSAPIVoices(): Promise<string[]> {
  try {
    // Query SAPI5 voices directly from registry (more reliable than System.Speech)
    const psScript = `
$voices = @()

# Check 64-bit SAPI5 voices
$path64 = 'HKLM:\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens'
if (Test-Path $path64) {
  Get-ChildItem $path64 | ForEach-Object {
    $name = (Get-ItemProperty $_.PSPath).'(default)'
    if ($name) { $voices += $name }
  }
}

# Check 32-bit SAPI5 voices (WoW6432Node)
$path32 = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Speech\\Voices\\Tokens'
if (Test-Path $path32) {
  Get-ChildItem $path32 | ForEach-Object {
    $name = (Get-ItemProperty $_.PSPath).'(default)'
    if ($name) { $voices += $name }
  }
}

# Also check System.Speech as fallback
try {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.GetInstalledVoices() | ForEach-Object {
    if ($_.Enabled) {
      $voices += $_.VoiceInfo.Name
    }
  }
  $synth.Dispose()
} catch {}

# Return unique voices
$voices | Select-Object -Unique | ForEach-Object { Write-Output $_ }
`
    const tempDir = app.getPath('temp')
    const scriptPath = path.join(tempDir, 'get_voices.ps1')
    fs.writeFileSync(scriptPath, psScript, 'utf-8')
    
    const { stdout, stderr } = await execAsync(`powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 })
    
    if (stderr) {
      console.error('PowerShell stderr:', stderr)
    }
    
    if (existsSync(scriptPath)) {
      unlinkSync(scriptPath)
    }
    
    const voices = stdout.split('\n').map(v => v.trim()).filter(v => v.length > 0)
    console.log('Raw SAPI output:', stdout)
    console.log('Parsed SAPI voices:', voices)
    return voices
  } catch (error) {
    console.error('Failed to get SAPI voices:', error)
    return []
  }
}

// Check if a specific RHVoice is installed
export async function isRHVoiceInstalled(voiceName: string): Promise<boolean> {
  const voices = await getInstalledSAPIVoices()
  return voices.some(v => v.toLowerCase() === voiceName.toLowerCase())
}

// Get all installed RHVoice voices
export async function getInstalledRHVoices(): Promise<string[]> {
  const allVoices = await getInstalledSAPIVoices()
  console.log('SAPI voices found:', allVoices)
  
  const rhvoiceNames = ['aleksandr', 'anna', 'elena', 'irina', 'bdl', 'slt', 'clb', 'alan']
  
  // Match voices that contain RHVoice name (SAPI may return full names like "RHVoice Aleksandr")
  const installedRHVoices: string[] = []
  for (const voiceName of allVoices) {
    const lowerVoiceName = voiceName.toLowerCase()
    for (const rhName of rhvoiceNames) {
      if (lowerVoiceName.includes(rhName)) {
        // Return the canonical name (capitalized)
        installedRHVoices.push(rhName.charAt(0).toUpperCase() + rhName.slice(1))
        break
      }
    }
  }
  
  console.log('Installed RHVoice voices:', installedRHVoices)
  return installedRHVoices
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

  // Check Coqui
  const coquiInstalled = checkCoquiInstalled()

  return {
    piper: existsSync(piperExe),
    ffmpeg: existsSync(ffmpegExe),
    silero: sileroInstalled,
    sileroAvailable: false, // Will be set by async check
    coqui: coquiInstalled,
    coquiAvailable: false, // Will be set by async check
    coquiBuildToolsAvailable: false, // Will be set by async check
    rhvoiceCore: false, // Will be set by async check
    rhvoiceVoices: [], // Will be set by async check
    piperVoices: {
      ruRU: installedRuVoices,
      enUS: installedEnVoices
    }
  }
}

// Check if any essential dependency is missing
export function needsSetup(): boolean {
  const status = checkDependencies()
  // Only FFmpeg is required at startup (used by all providers)
  return !status.ffmpeg
}

// Async version of checkDependencies that also checks Python availability
export async function checkDependenciesAsync(): Promise<DependencyStatus> {
  const status = checkDependencies()
  const pythonCmd = await checkPythonAvailable()
  status.sileroAvailable = pythonCmd !== null
  status.coquiAvailable = pythonCmd !== null

  // Check Build Tools for Coqui
  status.coquiBuildToolsAvailable = await checkBuildToolsAvailable()

  // Check RHVoice
  status.rhvoiceVoices = await getInstalledRHVoices()
  status.rhvoiceCore = status.rhvoiceVoices.length > 0 || await checkRHVoiceCoreInstalled()
  
  console.log('checkDependenciesAsync result:', { ...status, pythonCmd })
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

      // Throttle progress updates to avoid UI flickering
      let lastProgressUpdate = 0
      const PROGRESS_THROTTLE_MS = 100 // Update at most every 100ms
      let lastReportedPercent = -1

      // Ensure directory exists
      const dir = path.dirname(destPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const fileStream = createWriteStream(destPath)

      // Live timeout - resets on each data chunk received
      const IDLE_TIMEOUT = 30000 // 30 seconds without data = timeout
      let timeoutId: NodeJS.Timeout | null = null

      const resetTimeout = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
          request.destroy()
          if (existsSync(destPath)) {
            unlinkSync(destPath)
          }
          reject(new Error('Download timeout - no data received for 30 seconds'))
        }, IDLE_TIMEOUT)
      }

      const clearTimeoutHandler = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }

      // Start the timeout
      resetTimeout()

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length
        resetTimeout() // Reset timeout on each chunk
        
        if (onProgress && totalSize > 0) {
          const now = Date.now()
          const currentPercent = Math.round((downloadedSize / totalSize) * 100)
          
          // Only update if enough time passed OR if percentage changed by at least 1%
          // Always update at 100%
          if (
            downloadedSize >= totalSize ||
            (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS && currentPercent !== lastReportedPercent)
          ) {
            lastProgressUpdate = now
            lastReportedPercent = currentPercent
            onProgress(downloadedSize, totalSize)
          }
        }
      })

      response.pipe(fileStream)

      fileStream.on('finish', () => {
        clearTimeoutHandler()
        fileStream.close()
        // Final progress update to ensure we report 100%
        if (onProgress && totalSize > 0) {
          onProgress(totalSize, totalSize)
        }
        resolve()
      })

      fileStream.on('error', (err) => {
        clearTimeoutHandler()
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
export async function installPiper(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const piperPath = getPiperResourcesPath()
  const binPath = path.join(piperPath, 'bin')
  const zipPath = path.join(piperPath, 'piper_windows_amd64.zip')

  const piperUrl = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'

  try {
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

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Install FFmpeg
export async function installFfmpeg(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const ffmpegPath = getFfmpegPath()
  const zipPath = path.join(ffmpegPath, 'ffmpeg-essentials.zip')
  const tempPath = path.join(ffmpegPath, 'temp')

  const ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

  try {
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

// Full setup process
export async function runSetup(
  onProgress: (progress: SetupProgress) => void,
  options: {
    installPiper?: boolean
    installFfmpeg?: boolean
    installRussianVoices?: boolean
    installEnglishVoices?: boolean
    installSilero?: boolean
  } = {}
): Promise<{ success: boolean; error?: string }> {
  const {
    installPiper: shouldInstallPiper = false, // Not installed by default anymore
    installFfmpeg: shouldInstallFfmpeg = false, // Not installed by default anymore
    installRussianVoices = false,
    installEnglishVoices = false,
    installSilero: shouldInstallSilero = false
  } = options

  try {
    const status = checkDependencies()

    // Install Piper if needed
    if (shouldInstallPiper && !status.piper) {
      const result = await installPiper(onProgress)
      if (!result.success) {
        return result
      }
    }

    // Install FFmpeg if needed
    if (shouldInstallFfmpeg && !status.ffmpeg) {
      const result = await installFfmpeg(onProgress)
      if (!result.success) {
        return result
      }
    }

    // Install Russian voices (only if explicitly requested)
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

    // Install English voices (only if explicitly requested)
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

    // Install Silero if explicitly requested and Python is available
    if (shouldInstallSilero && !status.silero) {
      const pythonCmd = await checkPythonAvailable()
      if (pythonCmd) {
        const result = await installSilero(onProgress)
        if (!result.success) {
          console.warn('Silero installation failed:', result.error)
          // Don't fail the whole setup, Silero is optional
        }
      } else {
        console.log('Skipping Silero installation: Python not available')
      }
    }

    onProgress({
      stage: 'complete',
      progress: 100,
      details: 'Setup complete!'
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Get total download size estimate
export async function getEstimatedDownloadSize(): Promise<{ size: number; includeSilero: boolean }> {
  const status = checkDependencies()
  let size = 0

  // Piper binary ~21MB
  if (!status.piper) {
    size += 21
  }

  // FFmpeg ~101MB
  if (!status.ffmpeg) {
    size += 101
  }

  // Voices are now installed on-demand, not included in initial setup
  const includeSilero = false

  return { size, includeSilero }
}

// Install Silero TTS (will auto-install embedded Python if system Python is not available)
export async function installSilero(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  let pythonCmd = await checkPythonAvailable()

  // If no Python available, install embedded Python first
  if (!pythonCmd) {
    onProgress({
      stage: 'silero',
      progress: 0,
      details: 'Python not found. Installing embedded Python...'
    })

    const pythonResult = await installEmbeddedPython((p) => {
      // Scale embedded python progress to 0-15% of overall silero progress
      onProgress({
        stage: 'silero',
        progress: Math.round(p.progress * 0.15),
        details: p.details
      })
    })

    if (!pythonResult.success) {
      return {
        success: false,
        error: `Failed to install embedded Python: ${pythonResult.error}`
      }
    }

    // Re-check Python after installation
    pythonCmd = await checkPythonAvailable()
    if (!pythonCmd) {
      return {
        success: false,
        error: 'Embedded Python installation succeeded but Python is still not available'
      }
    }
  }

  const sileroPath = getSileroPath()
  const embeddedPythonExe = getEmbeddedPythonExe()
  const isUsingEmbedded = pythonCmd === embeddedPythonExe

  // For embedded Python: install packages directly (no venv)
  // For system Python: use venv as before
  const venvPath = path.join(sileroPath, 'venv')
  const venvPython = path.join(venvPath, 'Scripts', 'python.exe')

  // The Python to use for pip install
  let targetPython: string

  // Progress offset: if we installed embedded Python, start from 15%, otherwise from 0%
  const progressOffset = isUsingEmbedded ? 15 : 0
  const scaleProgress = (p: number) => Math.min(100, progressOffset + Math.round(p * (100 - progressOffset) / 100))

  try {
    // Create silero directory
    if (!existsSync(sileroPath)) {
      mkdirSync(sileroPath, { recursive: true })
    }

    if (isUsingEmbedded) {
      // For embedded Python - install packages directly, no venv
      targetPython = embeddedPythonExe
      console.log('[installSilero] Using embedded Python directly (no venv)')

      onProgress({
        stage: 'silero',
        progress: scaleProgress(8),
        details: 'Using embedded Python...'
      })
    } else {
      // For system Python - use venv as before
      // Clean up incomplete venv if exists but python is missing
      if (existsSync(venvPath) && !existsSync(venvPython)) {
        console.log('[installSilero] Removing incomplete venv...')
        rmSync(venvPath, { recursive: true, force: true })
      }

      // Create virtual environment if not exists
      if (!existsSync(venvPython)) {
        onProgress({
          stage: 'silero',
          progress: scaleProgress(5),
          details: 'Creating Python virtual environment...'
        })

        const pythonExecCmd = pythonCmd.includes(' ') ? `"${pythonCmd}"` : pythonCmd
        await execAsync(`${pythonExecCmd} -m venv "${venvPath}"`, { timeout: 60000 })

        if (!existsSync(venvPython)) {
          return { success: false, error: 'Failed to create virtual environment' }
        }

        // Upgrade pip only for fresh venv
        onProgress({
          stage: 'silero',
          progress: scaleProgress(8),
          details: 'Upgrading pip...'
        })

        await execAsync(`"${venvPython}" -m pip install --upgrade pip --no-input`, {
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10
        })
      } else {
        onProgress({
          stage: 'silero',
          progress: scaleProgress(8),
          details: 'Using existing virtual environment...'
        })
      }

      targetPython = venvPython
    }

    // Install PyTorch CPU
    onProgress({
      stage: 'silero',
      progress: scaleProgress(10),
      details: 'Installing PyTorch (CPU)...'
    })

    // For embedded Python, install to its Lib/site-packages
    const embeddedTargetDir = isUsingEmbedded
      ? path.join(getEmbeddedPythonPath(), 'Lib', 'site-packages')
      : undefined

    const pytorchResult = await runPipWithProgress(
      targetPython,
      'torch torchvision torchaudio',
      {
        indexUrl: 'https://download.pytorch.org/whl/cpu',
        timeout: 600000,
        targetDir: embeddedTargetDir,
        onProgress: (info) => {
          const progress = scaleProgress(10 + Math.round((info.percentage || 0) * 0.5))
          let details = 'Installing PyTorch...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ${info.package}: ${info.percentage}%`
          }
          onProgress({ stage: 'silero', progress, details })
        }
      }
    )

    if (!pytorchResult.success) {
      return { success: false, error: pytorchResult.error || 'Failed to install PyTorch' }
    }

    // Install additional dependencies (60% to 85%)
    onProgress({
      stage: 'silero',
      progress: scaleProgress(60),
      details: 'Installing additional dependencies...'
    })

    const depsResult = await runPipWithProgress(
      targetPython,
      'omegaconf numpy scipy flask psutil',
      {
        timeout: 180000,
        targetDir: embeddedTargetDir,
        onProgress: (info) => {
          const progress = scaleProgress(60 + Math.round((info.percentage || 0) * 0.25))
          let details = 'Installing dependencies...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ${info.package}: ${info.percentage}%`
          }
          onProgress({ stage: 'silero', progress, details })
        }
      }
    )

    if (!depsResult.success) {
      return { success: false, error: depsResult.error || 'Failed to install dependencies' }
    }

    // Copy generate.py script
    onProgress({
      stage: 'silero',
      progress: scaleProgress(88),
      details: 'Setting up generation script...'
    })

    const generateScript = getGenerateScriptContent()
    fs.writeFileSync(path.join(sileroPath, 'generate.py'), generateScript, 'utf-8')

    // Copy TTS server script to tts_resources root
    const ttsServerScript = getTTSServerScriptContent()
    const ttsResourcesPath = path.dirname(sileroPath)
    fs.writeFileSync(path.join(ttsResourcesPath, 'tts_server.py'), ttsServerScript, 'utf-8')

    // Verify installation
    onProgress({
      stage: 'silero',
      progress: scaleProgress(94),
      details: 'Verifying installation...'
    })

    const { stdout } = await execAsync(`"${targetPython}" -c "import torch; print('OK')"`, { timeout: 30000 })

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
"""
Silero TTS Generation Script
Generates speech audio using Silero models
"""

import argparse
import os
import sys
import re
from pathlib import Path

try:
    import torch
except ImportError:
    print("Error: PyTorch not installed.", file=sys.stderr)
    print("Please install: pip install torch", file=sys.stderr)
    sys.exit(1)

try:
    import scipy.io.wavfile as wavfile
    import numpy as np
    from scipy import signal
except ImportError:
    print("Error: scipy/numpy not installed.", file=sys.stderr)
    print("Please install: pip install scipy numpy", file=sys.stderr)
    sys.exit(1)


def parse_rate(rate_str):
    """Parse rate string like '+50%' or '-25%' to a multiplier."""
    if not rate_str:
        return 1.0
    match = re.match(r'^([+-])(\\d+)%$', rate_str)
    if match:
        sign = match.group(1)
        percent = int(match.group(2))
        if sign == '+':
            return 1.0 + percent / 100
        else:
            return 1.0 - percent / 100
    return 1.0


def change_speed(audio, speed_factor):
    """Change audio speed by resampling."""
    if speed_factor == 1.0:
        return audio
    # Resample to change speed (higher speed = shorter audio)
    new_length = int(len(audio) / speed_factor)
    return signal.resample(audio, new_length)


def main():
    parser = argparse.ArgumentParser(description='Generate speech using Silero TTS')
    parser.add_argument('--text', required=True, help='Text to convert to speech')
    parser.add_argument('--speaker', required=True, help='Speaker model (e.g., v3_1_ru/aidar)')
    parser.add_argument('--output', required=True, help='Output WAV file path')
    parser.add_argument('--sample-rate', type=int, default=48000, help='Sample rate (default: 48000)')
    parser.add_argument('--rate', type=str, default='', help='Speed adjustment (e.g., +50%, -25%)')

    args = parser.parse_args()

    try:
        # Parse speaker path
        parts = args.speaker.split('/')
        if len(parts) != 2:
            raise ValueError(f"Invalid speaker path format: {args.speaker}")

        model_id = parts[0]  # e.g., 'v5_ru' or 'v3_en'
        speaker = parts[1]    # e.g., 'aidar', 'baya', etc.

        # Determine language
        if 'ru' in model_id:
            language = 'ru'
            model_name = 'v5_ru'
        elif 'en' in model_id:
            language = 'en'
            model_name = 'v3_en'
        else:
            raise ValueError(f"Unknown language in model: {model_id}")

        print(f"Loading Silero model: {model_name}, speaker: {speaker}", file=sys.stderr)

        # Load Silero model from torch hub
        device = torch.device('cpu')  # Use CPU for compatibility

        # Load model
        model, example_text = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_tts',
            language=language,
            speaker=model_name
        )

        model.to(device)

        print(f"Generating audio for text length: {len(args.text)} characters", file=sys.stderr)

        # Generate audio with auto-stress and yo placement for Russian
        audio = model.apply_tts(
            text=args.text,
            speaker=speaker,
            sample_rate=args.sample_rate,
            put_accent=True,
            put_yo=True
        )

        # Save to WAV file
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert to numpy array
        if isinstance(audio, torch.Tensor):
            audio = audio.numpy()

        # Ensure 1D array for mono
        if audio.ndim > 1:
            audio = audio.squeeze()

        # Apply speed change if specified
        speed_factor = parse_rate(args.rate)
        if speed_factor != 1.0:
            print(f"Applying speed factor: {speed_factor}", file=sys.stderr)
            audio = change_speed(audio, speed_factor)

        # Normalize to int16 range
        audio = (audio * 32767).astype(np.int16)

        # Save using scipy
        wavfile.write(str(output_path), args.sample_rate, audio)

        print(f"Successfully generated audio: {args.output}", file=sys.stderr)
        return 0

    except Exception as e:
        print(f"Error generating audio: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
`
}

// Find vcvarsall.bat path for setting up MSVC environment
async function findVcvarsallPath(): Promise<string | null> {
  const checkVcvarsall = (basePath: string): string | null => {
    const vcvarsallPath = path.join(basePath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat')
    if (existsSync(vcvarsallPath)) {
      return vcvarsallPath
    }
    return null
  }

  const vswherePaths = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  ]

  for (const vswherePath of vswherePaths) {
    if (existsSync(vswherePath)) {
      try {
        const { stdout } = await execAsync(
          `"${vswherePath}" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
          { timeout: 10000 }
        )
        if (stdout.trim()) {
          const vcvarsall = checkVcvarsall(stdout.trim())
          if (vcvarsall) return vcvarsall
        }
      } catch {
        // Continue to fallback
      }
    }
  }

  const possibleVsPaths = [
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools',
    'C:\\Program Files\\Microsoft Visual Studio\\2019\\BuildTools',
  ]

  for (const vsPath of possibleVsPaths) {
    const vcvarsall = checkVcvarsall(vsPath)
    if (vcvarsall) return vcvarsall
  }

  return null
}

// Install Coqui TTS (requires Python and Visual Studio Build Tools)
export async function installCoqui(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string; needsBuildTools?: boolean }> {
  let pythonCmd = await checkPythonAvailable()

  // If no Python available, install embedded Python first
  if (!pythonCmd) {
    onProgress({
      stage: 'coqui',
      progress: 0,
      details: 'Python not found. Installing embedded Python...'
    })

    const pythonResult = await installEmbeddedPython((p) => {
      // Scale embedded python progress to 0-10% of overall coqui progress
      onProgress({
        stage: 'coqui',
        progress: Math.round(p.progress * 0.10),
        details: p.details
      })
    })

    if (!pythonResult.success) {
      return {
        success: false,
        error: `Failed to install embedded Python: ${pythonResult.error}`
      }
    }

    // Re-check Python after installation
    pythonCmd = await checkPythonAvailable()
    if (!pythonCmd) {
      return {
        success: false,
        error: 'Embedded Python installation succeeded but Python is still not available'
      }
    }
  }

  const hasBuildTools = await checkBuildToolsAvailable()

  if (!hasBuildTools) {
    return {
      success: false,
      needsBuildTools: true,
      error: 'Visual Studio Build Tools are required for Coqui TTS installation.'
    }
  }

  const vcvarsallPath = await findVcvarsallPath()
  if (!vcvarsallPath) {
    return {
      success: false,
      error: 'Could not find vcvarsall.bat. Please reinstall Visual Studio Build Tools with C++ workload.'
    }
  }

  const coquiPath = getCoquiPath()
  const embeddedPythonExe = getEmbeddedPythonExe()
  const isUsingEmbedded = pythonCmd === embeddedPythonExe

  // For embedded Python: install packages directly (no venv)
  // For system Python: use venv as before
  const venvPath = path.join(coquiPath, 'venv')
  const venvPython = path.join(venvPath, 'Scripts', 'python.exe')

  // The Python to use for pip install
  let targetPython: string

  // Progress offset: if we installed embedded Python, start from 10%, otherwise from 0%
  const progressOffset = isUsingEmbedded ? 10 : 0
  const scaleProgress = (p: number) => Math.min(100, progressOffset + Math.round(p * (100 - progressOffset) / 100))

  try {
    if (!existsSync(coquiPath)) {
      mkdirSync(coquiPath, { recursive: true })
    }

    const voicesPath = path.join(coquiPath, 'voices')
    if (!existsSync(voicesPath)) {
      mkdirSync(voicesPath, { recursive: true })
    }

    if (isUsingEmbedded) {
      // For embedded Python - install packages directly, no venv
      targetPython = embeddedPythonExe
      console.log('[installCoqui] Using embedded Python directly (no venv)')

      onProgress({
        stage: 'coqui',
        progress: scaleProgress(5),
        details: 'Using embedded Python...'
      })
    } else {
      // For system Python - use venv as before
      // Clean up incomplete venv if exists but python is missing
      if (existsSync(venvPath) && !existsSync(venvPython)) {
        console.log('[installCoqui] Removing incomplete venv...')
        rmSync(venvPath, { recursive: true, force: true })
      }

      // Create virtual environment if not exists
      if (!existsSync(venvPython)) {
        onProgress({
          stage: 'coqui',
          progress: scaleProgress(2),
          details: 'Creating Python virtual environment...'
        })

        const pythonExecCmd = pythonCmd.includes(' ') ? `"${pythonCmd}"` : pythonCmd
        await execAsync(`${pythonExecCmd} -m venv "${venvPath}"`, { timeout: 60000 })

        if (!existsSync(venvPython)) {
          return { success: false, error: 'Failed to create virtual environment' }
        }

        // Upgrade pip only for fresh venv
        onProgress({
          stage: 'coqui',
          progress: scaleProgress(5),
          details: 'Upgrading pip...'
        })

        await execAsync(`"${venvPython}" -m pip install --upgrade pip --no-input`, {
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10
        })
      } else {
        onProgress({
          stage: 'coqui',
          progress: scaleProgress(5),
          details: 'Using existing virtual environment...'
        })
      }

      targetPython = venvPython
    }

    // For embedded Python, install to its Lib/site-packages
    const embeddedTargetDir = isUsingEmbedded
      ? path.join(getEmbeddedPythonPath(), 'Lib', 'site-packages')
      : undefined

    // Install PyTorch CPU - range 5% to 40%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(8),
      details: 'Downloading PyTorch (~200MB)...'
    })

    const pytorchResult = await runPipWithProgress(
      targetPython,
      'torch torchaudio',
      {
        indexUrl: 'https://download.pytorch.org/whl/cpu',
        timeout: 1200000,
        targetDir: embeddedTargetDir,
        onProgress: (info) => {
          const baseProgress = 8
          const rangeSize = 32 // 8% to 40%

          let subProgress = 0
          if (info.phase === 'collecting') {
            subProgress = 0
          } else if (info.phase === 'downloading') {
            subProgress = (info.percentage || 0) * 0.85
          } else if (info.phase === 'installing') {
            subProgress = 90
          } else if (info.phase === 'processing') {
            subProgress = 100
          }

          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))

          let details = 'Installing PyTorch...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            if (info.downloaded !== undefined && info.total !== undefined) {
              details = `Downloading ${info.package}: ${info.downloaded.toFixed(1)}/${info.total.toFixed(1)} MB (${info.percentage}%)`
            } else {
              details = `Downloading ${info.package}: ${info.percentage}%`
            }
          } else if (info.phase === 'collecting') {
            details = `Resolving dependencies: ${info.package}...`
          } else if (info.phase === 'installing') {
            details = 'Installing downloaded packages...'
          }

          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!pytorchResult.success) {
      console.error('PyTorch installation error:', pytorchResult.error)
      return {
        success: false,
        error: 'Failed to install PyTorch. Please check your internet connection and try again.'
      }
    }

    // Install numpy, scipy - range 40% to 50%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(42),
      details: 'Installing numpy, scipy, omegaconf...'
    })

    const depsResult = await runPipWithProgress(
      targetPython,
      'numpy scipy omegaconf',
      {
        timeout: 300000,
        extraArgs: ['--prefer-binary'],
        targetDir: embeddedTargetDir,
        onProgress: (info) => {
          const baseProgress = 42
          const rangeSize = 8

          let subProgress = (info.percentage || 0)
          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))

          let details = 'Installing dependencies...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ${info.package}: ${info.percentage}%`
          }

          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!depsResult.success) {
      console.error('Dependencies installation error:', depsResult.error)
      return { success: false, error: depsResult.error }
    }

    // Install Coqui TTS with MSVC - range 50% to 80%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(50),
      details: 'Installing Coqui TTS (downloading and compiling)...'
    })

    const ttsResult = await runPipWithProgress(
      targetPython,
      'TTS flask psutil',
      {
        timeout: 1200000,
        msvcEnvPath: vcvarsallPath,
        targetDir: embeddedTargetDir,
        onProgress: (info) => {
          const baseProgress = 50
          const rangeSize = 30 // 50% to 80%

          let subProgress = 0
          if (info.phase === 'collecting') {
            subProgress = 5
          } else if (info.phase === 'downloading') {
            subProgress = 10 + (info.percentage || 0) * 0.5
          } else if (info.phase === 'processing') {
            // Building/compiling takes significant time
            subProgress = 70
          } else if (info.phase === 'installing') {
            subProgress = 95
          }

          const totalProgress = scaleProgress(Math.round(baseProgress + (subProgress / 100) * rangeSize))

          let details = 'Installing Coqui TTS...'
          if (info.phase === 'downloading' && info.percentage !== undefined) {
            details = `Downloading ${info.package}: ${info.percentage}%`
          } else if (info.phase === 'collecting') {
            details = `Resolving: ${info.package}...`
          } else if (info.phase === 'processing') {
            details = `Compiling ${info.package}...`
          } else if (info.phase === 'installing') {
            details = 'Installing compiled packages...'
          }

          onProgress({
            stage: 'coqui',
            progress: totalProgress,
            details
          })
        }
      }
    )

    if (!ttsResult.success) {
      console.error('TTS installation error:', ttsResult.error)
      return { success: false, error: ttsResult.error }
    }

    // Fix transformers compatibility issue with Coqui TTS
    // Newer transformers removed BeamSearchScorer which TTS needs
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(80),
      details: 'Fixing transformers compatibility...'
    })

    const transformersCmd = embeddedTargetDir
      ? `"${targetPython}" -m pip install "transformers>=4.33.0,<4.40.0" --target "${embeddedTargetDir}" --no-input`
      : `"${targetPython}" -m pip install "transformers>=4.33.0,<4.40.0" --no-input`

    await execAsync(transformersCmd, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 10
    })

    onProgress({
      stage: 'coqui',
      progress: scaleProgress(82),
      details: 'Setting up generation script...'
    })

    const generateScript = getCoquiGenerateScriptContent()
    fs.writeFileSync(path.join(coquiPath, 'generate.py'), generateScript, 'utf-8')

    onProgress({
      stage: 'coqui',
      progress: scaleProgress(85),
      details: 'Verifying installation...'
    })

    // Small delay to let filesystem sync after pip install
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Retry verification a few times in case of timing issues
    let verifySuccess = false
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { stdout } = await execAsync(`"${targetPython}" -c "from TTS.api import TTS; print('OK')"`, { timeout: 60000 })
        if (stdout.includes('OK')) {
          verifySuccess = true
          break
        }
        lastError = 'TTS import did not return OK'
      } catch (err) {
        lastError = (err as Error).message
        console.log(`[installCoqui] Verification attempt ${attempt} failed: ${lastError}`)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
    }

    if (!verifySuccess) {
      return { success: false, error: `Coqui TTS verification failed: ${lastError}` }
    }

    // Pre-download XTTS-v2 model - range 85% to 100%
    onProgress({
      stage: 'coqui',
      progress: scaleProgress(87),
      details: 'Pre-downloading XTTS-v2 model (~1.8GB)...'
    })

    const preloadScript = `import os
import sys
os.environ["COQUI_TOS_AGREED"] = "1"

# Fix for PyTorch 2.6+ weights_only default change
import torch
_orig_load = torch.load
def _patched_load(*a, **kw):
    if 'weights_only' not in kw:
        kw['weights_only'] = False
    return _orig_load(*a, **kw)
torch.load = _patched_load

# Simple progress tracking for model download
class ProgressTracker:
    def __init__(self):
        self.last_percent = -1

    def update(self, current, total):
        if total > 0:
            percent = int((current / total) * 100)
            if percent != self.last_percent and percent % 5 == 0:
                self.last_percent = percent
                print(f"PROGRESS:{percent}", flush=True)

from TTS.api import TTS
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
print("Model downloaded successfully")
`
    const preloadScriptPath = path.join(coquiPath, 'preload_model.py')
    fs.writeFileSync(preloadScriptPath, preloadScript, 'utf-8')

    try {
      // Run model download with progress tracking
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(targetPython, [preloadScriptPath], {
          shell: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        })
        
        let stderr = ''
        
        proc.stdout?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n')
          for (const line of lines) {
            const match = line.match(/PROGRESS:(\d+)/)
            if (match) {
              const modelPercent = parseInt(match[1], 10)
              // Map model download progress to 87-98%
              const totalProgress = scaleProgress(87 + Math.round(modelPercent * 0.11))
              onProgress({
                stage: 'coqui',
                progress: totalProgress,
                details: `Downloading XTTS-v2 model: ${modelPercent}%`
              })
            }
            if (line.includes('Model downloaded successfully')) {
              onProgress({
                stage: 'coqui',
                progress: scaleProgress(98),
                details: 'Model download complete!'
              })
            }
          }
        })

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
          // TTS library outputs download progress to stderr
          const progressMatch = data.toString().match(/(\d+)%\|/)
          if (progressMatch) {
            const modelPercent = parseInt(progressMatch[1], 10)
            const totalProgress = scaleProgress(87 + Math.round(modelPercent * 0.11))
            onProgress({
              stage: 'coqui',
              progress: totalProgress,
              details: `Downloading XTTS-v2 model: ${modelPercent}%`
            })
          }
        })
        
        const timeout = setTimeout(() => {
          proc.kill()
          reject(new Error('Model download timeout'))
        }, 1800000)
        
        proc.on('close', (code) => {
          clearTimeout(timeout)
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(stderr || `Model download failed with code ${code}`))
          }
        })
        
        proc.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })
    } finally {
      try { unlinkSync(preloadScriptPath) } catch {}
    }

    onProgress({
      stage: 'coqui',
      progress: 100,
      details: 'Coqui TTS installation complete!'
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Generate.py script content for Coqui XTTS-v2
function getCoquiGenerateScriptContent(): string {
  return `#!/usr/bin/env python3
"""Coqui XTTS-v2 TTS Generation Script with built-in speakers"""

import argparse
import os
import sys
from pathlib import Path

os.environ["COQUI_TOS_AGREED"] = "1"

# Fix for PyTorch 2.6+ weights_only default change
import torch
_orig_load = torch.load
def _patched_load(*a, **kw):
    if 'weights_only' not in kw:
        kw['weights_only'] = False
    return _orig_load(*a, **kw)
torch.load = _patched_load

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', required=True)
    parser.add_argument('--speaker', required=True, help='Built-in speaker name (e.g., "Claribel Dervla")')
    parser.add_argument('--language', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    from TTS.api import TTS

    # Normalize language code (app uses ru-RU, XTTS uses ru)
    lang = args.language.lower()
    if lang in ['ru-ru', 'ru_ru']:
        lang = 'ru'
    elif lang in ['en-us', 'en-gb', 'en_us', 'en_gb', 'en']:
        lang = 'en'

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    tts.tts_to_file(
        text=args.text,
        speaker=args.speaker,
        language=lang,
        file_path=args.output
    )

    print(f"Audio saved to {args.output}")

if __name__ == "__main__":
    main()
`
}

// TTS Server script content - Universal server for Silero and Coqui
function getTTSServerScriptContent(): string {
  return `#!/usr/bin/env python3
"""Universal TTS Server for Silero and Coqui XTTS"""

import argparse, gc, io, os, sys, re, threading, time
from pathlib import Path

os.environ["COQUI_TOS_AGREED"] = "1"

try:
    from flask import Flask, request, jsonify, Response
    import torch
    import psutil
    import scipy.io.wavfile as wavfile
    import numpy as np
    from scipy import signal
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    sys.exit(1)

_orig_load = torch.load
def _patched_load(*a, **kw):
    if 'weights_only' not in kw:
        kw['weights_only'] = False
    return _orig_load(*a, **kw)
torch.load = _patched_load

app = Flask(__name__)
models = {"silero": {"ru": None, "en": None}, "coqui": None}
coqui_lock = threading.Lock()

def detect_device():
    """Detect best available compute device. Priority: CUDA > Intel XPU > DirectML > CPU"""
    device_info = {"device": "cpu", "backend": "cpu", "gpu_name": None}

    # 1. Try CUDA (NVIDIA)
    if torch.cuda.is_available():
        try:
            device_info = {
                "device": "cuda",
                "backend": "cuda",
                "gpu_name": torch.cuda.get_device_name(0)
            }
            return device_info
        except:
            pass

    # 2. Try Intel XPU
    try:
        import intel_extension_for_pytorch as ipex
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            device_info = {
                "device": "xpu",
                "backend": "xpu",
                "gpu_name": torch.xpu.get_device_name(0) if hasattr(torch.xpu, 'get_device_name') else "Intel XPU"
            }
            return device_info
    except ImportError:
        pass

    # 3. DirectML (via ONNX Runtime) - note: Silero uses PyTorch, so DirectML helps only for ONNX models
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        if 'DmlExecutionProvider' in providers:
            device_info = {
                "device": "cpu",  # PyTorch still uses CPU
                "backend": "directml",
                "gpu_name": "DirectML (ONNX Runtime)"
            }
            return device_info
    except ImportError:
        pass

    return device_info

_device_info = detect_device()
device = _device_info["device"]
backend = _device_info["backend"]
gpu_name = _device_info["gpu_name"]
print(f"Using device: {device}, backend: {backend}, GPU: {gpu_name}", file=sys.stderr)

def get_memory_gb():
    return psutil.Process().memory_info().rss / (1024**3)

def parse_rate(rate_str):
    if not rate_str:
        return 1.0
    m = re.match(r'^([+-])(\\d+)%$', str(rate_str))
    if m:
        return 1.0 + int(m.group(2)) / 100 if m.group(1) == '+' else 1.0 - int(m.group(2)) / 100
    try:
        return float(rate_str)
    except Exception:
        return 1.0

def change_speed(audio, factor):
    return audio if factor == 1.0 else signal.resample(audio, int(len(audio) / factor))

def audio_to_wav_bytes(audio, sr=48000):
    if isinstance(audio, torch.Tensor):
        audio = audio.numpy()
    if audio.ndim > 1:
        audio = audio.squeeze()
    buf = io.BytesIO()
    wavfile.write(buf, sr, (audio * 32767).astype(np.int16))
    buf.seek(0)
    return buf.read()

def load_silero_model(lang):
    global models
    model_name = 'v5_ru' if lang == 'ru' else 'v3_en'
    print(f"Loading Silero {model_name}...", file=sys.stderr)
    model, _ = torch.hub.load('snakers4/silero-models', 'silero_tts', language=lang, speaker=model_name)
    model.to(torch.device(device))
    models["silero"][lang] = model
    print(f"Silero {lang} loaded on {device}. Memory: {get_memory_gb():.2f} GB", file=sys.stderr)

def generate_silero(text, speaker, lang, rate=1.0, sr=48000):
    if models["silero"].get(lang) is None:
        raise RuntimeError(f"Silero model for '{lang}' is not loaded. Please load it first.")
    model = models["silero"][lang]
    spk = speaker.split('/')[-1] if '/' in speaker else speaker
    audio = model.apply_tts(text=text, speaker=spk, sample_rate=sr, put_accent=True, put_yo=True)
    if isinstance(audio, torch.Tensor):
        audio = audio.numpy()
    if audio.ndim > 1:
        audio = audio.squeeze()
    factor = parse_rate(rate) if isinstance(rate, str) else rate
    if factor != 1.0:
        audio = change_speed(audio, factor)
    return audio_to_wav_bytes(audio, sr)

def load_coqui_model():
    global models
    print("Loading Coqui XTTS-v2...", file=sys.stderr)
    from TTS.api import TTS
    models["coqui"] = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    print(f"Coqui loaded on {device}. Memory: {get_memory_gb():.2f} GB", file=sys.stderr)

def generate_coqui(text, speaker, lang):
    l = lang.lower()
    if l in ['ru-ru', 'ru_ru']:
        l = 'ru'
    elif l in ['en-us', 'en-gb', 'en_us', 'en_gb']:
        l = 'en'
    with coqui_lock:
        if models["coqui"] is None:
            raise RuntimeError("Coqui model is not loaded. Please load it first.")
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            tmp = f.name
        try:
            models["coqui"].tts_to_file(text=text, speaker=speaker, language=l, file_path=tmp)
            with open(tmp, 'rb') as f:
                return f.read()
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

@app.route("/status", methods=["GET"])
def status():
    return jsonify({
        "silero": {"ru_loaded": models["silero"]["ru"] is not None, "en_loaded": models["silero"]["en"] is not None},
        "coqui": {"loaded": models["coqui"] is not None},
        "memory_gb": round(get_memory_gb(), 2),
        "device": device,
        "backend": backend,
        "gpu_name": gpu_name
    })

@app.route("/load", methods=["POST"])
def load_model():
    data = request.json or {}
    engine, lang = data.get("engine"), data.get("language", "ru")
    if not engine:
        return jsonify({"error": "Missing engine"}), 400
    try:
        if engine == "silero" and models["silero"].get(lang) is None:
            load_silero_model(lang)
        elif engine == "coqui" and models["coqui"] is None:
            load_coqui_model()
        return jsonify({"success": True, "memory_gb": round(get_memory_gb(), 2)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/unload", methods=["POST"])
def unload_model():
    data = request.json or {}
    engine, lang = data.get("engine"), data.get("language")
    if engine == "silero":
        if lang:
            models["silero"][lang] = None
        else:
            models["silero"] = {"ru": None, "en": None}
    elif engine == "coqui":
        models["coqui"] = None
    elif engine == "all":
        models["silero"] = {"ru": None, "en": None}
        models["coqui"] = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if hasattr(torch, 'xpu') and torch.xpu.is_available():
        torch.xpu.empty_cache()
    return jsonify({"success": True, "memory_gb": round(get_memory_gb(), 2)})

@app.route("/generate", methods=["POST"])
def generate():
    data = request.json or {}
    engine, text, speaker = data.get("engine"), data.get("text"), data.get("speaker")
    lang, rate = data.get("language", "ru"), data.get("rate", 1.0)
    if not all([engine, text, speaker]):
        return jsonify({"error": "Missing params"}), 400
    try:
        audio = generate_silero(text, speaker, lang, rate) if engine == "silero" else generate_coqui(text, speaker, lang)
        return Response(audio, mimetype="audio/wav")
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        error_msg = str(e) or repr(e) or "Unknown error occurred"
        return jsonify({"error": error_msg}), 500

@app.route("/shutdown", methods=["POST"])
def shutdown():
    global models
    models = {"silero": {"ru": None, "en": None}, "coqui": None}
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if hasattr(torch, 'xpu') and torch.xpu.is_available():
        torch.xpu.empty_cache()
    threading.Thread(target=lambda: (time.sleep(0.5), os._exit(0))).start()
    return jsonify({"success": True})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=5050)
    p.add_argument("--host", type=str, default="127.0.0.1")
    args = p.parse_args()
    print(f"TTS Server on {args.host}:{args.port}, device={device}", file=sys.stderr)
    app.run(host=args.host, port=args.port, threaded=True)
`
}


// RHVoice NVDA addon URL
const RHVOICE_ADDON_URL = 'https://rhvoice.eu-central-1.linodeobjects.com/RHVoice-1.16.402.nvda-addon'

// Install RHVoice core (NVDA addon which includes SAPI support)
export async function installRHVoiceCore(
  onProgress: (progress: SetupProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const rhvoicePath = getRHVoicePath()
  const addonPath = path.join(rhvoicePath, 'RHVoice.nvda-addon')
  
  try {
    if (!existsSync(rhvoicePath)) {
      mkdirSync(rhvoicePath, { recursive: true })
    }
    
    onProgress({
      stage: 'rhvoice',
      progress: 0,
      details: 'Downloading RHVoice core...'
    })
    
    await downloadFile(RHVOICE_ADDON_URL, addonPath, (downloaded, total) => {
      const percent = Math.round((downloaded / total) * 50)
      onProgress({
        stage: 'rhvoice',
        progress: percent,
        details: `Downloading RHVoice core... ${Math.round(downloaded / 1024)}KB / ${Math.round(total / 1024)}KB`
      })
    })
    
    onProgress({
      stage: 'rhvoice',
      progress: 60,
      details: 'Installing RHVoice addon...'
    })
    
    // The .nvda-addon is a zip file, we need to extract and register the SAPI engine
    // For simplicity, we'll just run the addon file which should trigger NVDA to install it
    // However, for SAPI support we actually need to run a separate installer
    
    // Actually, for SAPI we need to use the SAPI core installer from RHVoice
    // Let's download and run the SAPI5 core installer instead
    const sapiCoreUrl = 'https://github.com/RHVoice/RHVoice/releases/download/1.8.0/RHVoice-1.8.0-sapi.exe'
    const sapiInstallerPath = path.join(rhvoicePath, 'RHVoice-sapi.exe')
    
    onProgress({
      stage: 'rhvoice',
      progress: 65,
      details: 'Downloading RHVoice SAPI engine...'
    })
    
    await downloadFile(sapiCoreUrl, sapiInstallerPath, (downloaded, total) => {
      const percent = 65 + Math.round((downloaded / total) * 25)
      onProgress({
        stage: 'rhvoice',
        progress: percent,
        details: `Downloading RHVoice SAPI engine... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      })
    })
    
    onProgress({
      stage: 'rhvoice',
      progress: 92,
      details: 'Installing RHVoice SAPI engine (requires admin)...'
    })
    
    // Run installer silently
    await execAsync(`"${sapiInstallerPath}" /S`, { timeout: 120000 })
    
    // Clean up installers
    if (existsSync(addonPath)) {
      unlinkSync(addonPath)
    }
    if (existsSync(sapiInstallerPath)) {
      unlinkSync(sapiInstallerPath)
    }
    
    onProgress({
      stage: 'rhvoice',
      progress: 100,
      details: 'RHVoice core installed!'
    })
    
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
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
      progress: 100,
      details: `${voiceName} voice installed!`
    })
    
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
