import type { ConversionError, ProviderError, ToolkitError, SetupError, TTSProvider, ErrorType } from './types'

/**
 * Patterns indicating installation-related errors
 * These errors suggest the TTS provider needs to be reinstalled
 */
const INSTALLATION_ERROR_PATTERNS = [
  'python environment not found',
  'python not found',
  'failed to start',
  'spawn error',
  'spawn enoent',
  'module not found',
  'no module named',
  'failed to import',
  'import error',
  'venv not found',
  'generate.py not found',
  'script not found',
  'piper not found',
  'piper.exe not found',
  'rhvoice not installed',
  'silero python environment not found',
  'coqui python environment not found',
  'environment not found',
  'dll not found',
  'missing dll',
  'cannot find module',
  'tts server failed to start',
  'server not running',
  'failed to connect to tts server'
]

/**
 * Patterns indicating generation/runtime errors (NOT installation related)
 * These errors should NOT trigger reinstall suggestion
 */
const GENERATION_ERROR_PATTERNS = [
  'out of memory',
  'cuda out of memory',
  'memory allocation',
  'text is too long',
  'text too long',
  'invalid voice',
  'voice not found',
  'audio file was not created',
  'failed to generate audio',
  'generation failed',
  'api error',
  'api key',
  'invalid api',
  'rate limit',
  'quota exceeded',
  'timeout',
  'timed out',
  'connection refused',
  'network error',
  'econnrefused',
  'enotfound',
  'socket hang up',
  'file too large',
  'invalid format',
  'unsupported format',
  'encoding error',
  'decoding error'
]

/**
 * Patterns for toolkit-related errors
 */
const TOOLKIT_ERROR_PATTERNS = {
  cuda: [
    'cuda',
    'cudnn',
    'cudart',
    'cublas',
    'cusparse',
    'nvrtc',
    'nvidia'
  ]
}

/**
 * Check if a message matches any pattern from a list
 */
function matchesPatterns(message: string, patterns: string[]): boolean {
  const lowerMessage = message.toLowerCase()
  return patterns.some(pattern => lowerMessage.includes(pattern))
}

/**
 * Classify a conversion error to determine if reinstall should be offered
 */
export function classifyConversionError(
  error: Error | string,
  provider: TTSProvider
): ConversionError {
  const message = typeof error === 'string' ? error : error.message
  const lowerMessage = message.toLowerCase()

  // Check for installation patterns
  const matchesInstallation = matchesPatterns(lowerMessage, INSTALLATION_ERROR_PATTERNS)

  // Check for generation patterns
  const matchesGeneration = matchesPatterns(lowerMessage, GENERATION_ERROR_PATTERNS)

  // Determine if installation-related
  // If matches both, prioritize installation (more severe)
  // If matches neither, default to generation error (safer - don't suggest reinstall)
  const isInstallationRelated = matchesInstallation && !matchesGeneration

  // Determine error type
  let type: ConversionError['type'] = 'generation_error'
  if (isInstallationRelated) {
    type = 'installation_error'
  } else if (lowerMessage.includes('api')) {
    type = 'api_error'
  } else if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    type = 'network_error'
  }

  return {
    type,
    message,
    details: typeof error === 'object' && 'stack' in error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    provider,
    isInstallationRelated
  }
}

/**
 * Classify a provider installation error
 */
export function classifyProviderError(
  error: Error | string,
  provider: TTSProvider,
  stage?: 'download' | 'extract' | 'install' | 'verify'
): ProviderError {
  const message = typeof error === 'string' ? error : error.message
  const lowerMessage = message.toLowerCase()

  // Determine error type
  let type: ProviderError['type'] = 'installation_error'
  if (lowerMessage.includes('network') || lowerMessage.includes('enotfound') || lowerMessage.includes('econnrefused')) {
    type = 'network_error'
  } else if (lowerMessage.includes('permission') || lowerMessage.includes('access denied') || lowerMessage.includes('eacces')) {
    type = 'permission_error'
  } else if (lowerMessage.includes('no space') || lowerMessage.includes('disk full') || lowerMessage.includes('enospc')) {
    type = 'disk_error'
  }

  return {
    type,
    message,
    details: typeof error === 'object' && 'stack' in error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    provider,
    stage
  }
}

/**
 * Classify a setup error (FFmpeg installation)
 */
export function classifySetupError(
  error: Error | string,
  component: SetupError['component']
): SetupError {
  const message = typeof error === 'string' ? error : error.message
  const lowerMessage = message.toLowerCase()

  // Determine error type
  let type: SetupError['type'] = 'installation_error'
  if (lowerMessage.includes('network') || lowerMessage.includes('enotfound') || lowerMessage.includes('econnrefused')) {
    type = 'network_error'
  } else if (lowerMessage.includes('permission') || lowerMessage.includes('access denied') || lowerMessage.includes('eacces')) {
    type = 'permission_error'
  } else if (lowerMessage.includes('no space') || lowerMessage.includes('disk full') || lowerMessage.includes('enospc')) {
    type = 'disk_error'
  }

  return {
    type,
    message,
    details: typeof error === 'object' && 'stack' in error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    component
  }
}

/**
 * Parse toolkit error from JSON string returned by gpu.ts
 */
export function parseToolkitError(errorString: string): ToolkitError | null {
  try {
    const parsed = JSON.parse(errorString)
    if (parsed.type === 'toolkit_missing' || parsed.type === 'toolkit_restart_required') {
      return {
        type: 'toolkit_error',
        toolkit: 'cuda',
        subtype: parsed.type,
        message: parsed.title || parsed.message || 'Toolkit error',
        title: parsed.title || 'GPU Toolkit Required',
        description: parsed.description || '',
        downloadUrl: parsed.downloadUrl,
        steps: parsed.steps || [],
        timestamp: new Date().toISOString(),
        fallbackOption: parsed.fallbackToCpu ? {
          engine: 'silero', // Will be set correctly by caller
          accelerator: 'cpu'
        } : undefined
      }
    }
  } catch {
    // Not a JSON error, check if it's a toolkit-related error by patterns
    const lowerError = errorString.toLowerCase()

    // Check for CUDA patterns
    if (matchesPatterns(lowerError, TOOLKIT_ERROR_PATTERNS.cuda)) {
      return {
        type: 'toolkit_error',
        toolkit: 'cuda',
        subtype: lowerError.includes('restart') ? 'toolkit_restart_required' : 'toolkit_missing',
        message: errorString,
        title: 'CUDA Toolkit Error',
        description: 'Check your CUDA Toolkit installation',
        downloadUrl: 'https://developer.nvidia.com/cuda-downloads',
        steps: [
          'Download CUDA Toolkit from the official website',
          'Install CUDA Toolkit',
          'Restart the application'
        ],
        timestamp: new Date().toISOString(),
        fallbackOption: { engine: 'silero', accelerator: 'cpu' }
      }
    }

  }
  return null
}

/**
 * Get user-friendly error message based on error type
 * Note: This returns error type prefix. Full localization is handled in UI components.
 */
export function getErrorMessage(error: { type: ErrorType; message: string }): string {
  const baseMessage = error.message

  switch (error.type) {
    case 'installation_error':
      return `Setup error: ${baseMessage}`
    case 'generation_error':
      return `Generation error: ${baseMessage}`
    case 'toolkit_error':
      return `GPU error: ${baseMessage}`
    case 'network_error':
      return `Network error: ${baseMessage}`
    case 'permission_error':
      return `Access error: ${baseMessage}`
    case 'disk_error':
      return `Disk error: ${baseMessage}`
    case 'api_error':
      return `API error: ${baseMessage}`
    default:
      return baseMessage
  }
}

/**
 * Get recovery suggestion based on error type
 * Note: Full localization is handled in UI components via i18n.
 */
export function getRecoverySuggestion(error: { type: ErrorType }): string {
  switch (error.type) {
    case 'installation_error':
      return 'Try reinstalling the component'
    case 'generation_error':
      return 'Try again or select a different voice'
    case 'toolkit_error':
      return 'Install the required GPU toolkit or use CPU mode'
    case 'network_error':
      return 'Check your internet connection'
    case 'permission_error':
      return 'Run the application as administrator'
    case 'disk_error':
      return 'Free up disk space'
    case 'api_error':
      return 'Check your API key and limits'
    default:
      return 'Try the operation again'
  }
}
