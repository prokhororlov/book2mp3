import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Book, Upload, Volume2, Play, Download, X, FileAudio, Languages, Sun, Moon, Zap, Cpu, Sparkles, Cloud, Pencil, Check, Loader2, Key, Eye, EyeOff, Wand2, AlertTriangle, Settings } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Gender icons as inline SVG components
const MaleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5" />
    <path d="M19 5l-5.4 5.4" />
    <path d="M15 5h4v4" />
  </svg>
)

const FemaleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" />
    <path d="M12 13v8" />
    <path d="M9 18h6" />
  </svg>
)
import { SetupScreen } from '@/components/SetupScreen'

interface BookContent {
  title: string
  author: string
  chapters: Array<{ title: string; content: string }>
  fullText: string
}

interface FileInfo {
  name: string
  extension: string
  size: number
  path: string
}

interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: 'system' | 'piper' | 'silero' | 'elevenlabs' | 'coqui' | 'rhvoice'
  isInstalled?: boolean
}

interface ProviderInfo {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  requiresSetup?: boolean
}

// Sanitize filename - remove invalid characters
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid Windows filename characters
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .trim()
    .substring(0, 200)             // Limit length
    || 'audiobook'                 // Fallback
}

const LANGUAGES = [
  { code: 'ru-RU', name: 'Русский' },
  { code: 'en', name: 'English' },
]

// Provider icons mapping
const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  system: <Zap className="h-4 w-4" />,
  rhvoice: <Zap className="h-4 w-4" />,
  piper: <Cpu className="h-4 w-4" />,
  silero: <Sparkles className="h-4 w-4" />,
  coqui: <Wand2 className="h-4 w-4" />,
  elevenlabs: <Cloud className="h-4 w-4" />,
}

function App() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [file, setFile] = useState<FileInfo | null>(null)
  const [bookContent, setBookContent] = useState<BookContent | null>(null)
  // Default to English
  const [language, setLanguage] = useState('en')

  // Check if setup is needed on app start
  useEffect(() => {
    const checkSetup = async () => {
      if (!window.electronAPI) {
        setNeedsSetup(false)
        return
      }
      const needs = await window.electronAPI.needsSetup()
      setNeedsSetup(needs)
    }
    checkSetup()
  }, [])

  // Fetch available providers from backend
  useEffect(() => {
    const fetchProviders = async () => {
      if (!window.electronAPI) return
      try {
        const providers = await window.electronAPI.getAvailableProviders()
        const providersWithIcons: ProviderInfo[] = providers.map(p => ({
          ...p,
          icon: PROVIDER_ICONS[p.id] || <Cpu className="h-4 w-4" />
        }))
        setAvailableProviders(providersWithIcons)
      } catch (err) {
        console.error('Failed to fetch providers:', err)
      }
    }
    fetchProviders()
  }, [])
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('piper')
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([])
  const [speed, setSpeed] = useState([1.0])
  const [sentencePause, setSentencePause] = useState([0.0]) // Pause between sentences in seconds (for Piper)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const getDefaultPreviewText = (lang: string) => {
    return lang.startsWith('en') ? 'Hello! This is an example of how the voice sounds.' : 'Привет! Это пример звучания голоса.'
  }
  const [previewText, setPreviewText] = useState(() => getDefaultPreviewText('en'))
  const [isEditingPreview, setIsEditingPreview] = useState(false)
  const [tempPreviewText, setTempPreviewText] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('theme')
    return (stored === 'dark' || stored === 'light' || stored === 'system') ? stored : 'system'
  })

  // ElevenLabs API key state
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>('')
  const [isEditingApiKey, setIsEditingApiKey] = useState(false)
  const [tempApiKey, setTempApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)

  // Silero state
  const [sileroInstalled, setSileroInstalled] = useState(false)
  const [pythonAvailable, setPythonAvailable] = useState(false)
  const [isInstallingSilero, setIsInstallingSilero] = useState(false)
  const [sileroInstallProgress, setSileroInstallProgress] = useState('')
  const [sileroInstallPercent, setSileroInstallPercent] = useState(0)

  // Coqui state
  const [coquiInstalled, setCoquiInstalled] = useState(false)
  const [coquiBuildToolsAvailable, setCoquiBuildToolsAvailable] = useState(false)
  const [isInstallingCoqui, setIsInstallingCoqui] = useState(false)
  const [coquiInstallProgress, setCoquiInstallProgress] = useState('')
  const [coquiInstallPercent, setCoquiInstallPercent] = useState(0)

  // TTS Server state
  const [ttsServerStatus, setTtsServerStatus] = useState<{
    running: boolean
    silero: { ru_loaded: boolean; en_loaded: boolean }
    coqui: { loaded: boolean }
    memory_gb: number
    cpu_percent: number
    device: string
  } | null>(null)
  const [isLoadingModel, setIsLoadingModel] = useState<string | null>(null)

  // Piper voice installation state
  const [installingVoice, setInstallingVoice] = useState<string | null>(null)
  const [voiceInstallProgress, setVoiceInstallProgress] = useState<number>(0)
  const [voiceSelectOpen, setVoiceSelectOpen] = useState(false)

  // RHVoice state
  const [installingRHVoice, setInstallingRHVoice] = useState<string | null>(null)
  const [rhvoiceInstallProgress, setRHVoiceInstallProgress] = useState<number>(0)
  const [rhvoiceCoreInstalled, setRhvoiceCoreInstalled] = useState(false)
  const [isInstallingRHVoiceCore, setIsInstallingRHVoiceCore] = useState(false)
  const [rhvoiceCoreInstallProgress, setRhvoiceCoreInstallProgress] = useState('')
  const [rhvoiceCoreInstallPercent, setRhvoiceCoreInstallPercent] = useState(0)

  // Piper state
  const [piperInstalled, setPiperInstalled] = useState(false)
  const [ffmpegInstalled, setFfmpegInstalled] = useState(false)
  const [isInstallingPiperCore, setIsInstallingPiperCore] = useState(false)
  const [piperCoreInstallProgress, setPiperCoreInstallProgress] = useState('')
  const [piperCoreInstallPercent, setPiperCoreInstallPercent] = useState(0)

  // Load ElevenLabs API key and check Silero on mount
  useEffect(() => {
    const loadApiKey = async () => {
      if (!window.electronAPI) return
      try {
        const key = await window.electronAPI.getElevenLabsApiKey()
        if (key) {
          setElevenLabsApiKey(key)
          setHasApiKey(true)
        }
      } catch (err) {
        console.error('Failed to load ElevenLabs API key:', err)
      }
    }

    const checkProviders = async () => {
      if (!window.electronAPI) return
      try {
        const deps = await window.electronAPI.checkDependenciesAsync()
        setSileroInstalled(deps.silero)
        setCoquiInstalled(deps.coqui)
        setCoquiBuildToolsAvailable(deps.coquiBuildToolsAvailable)
        setPythonAvailable(deps.sileroAvailable || deps.coquiAvailable)
        setPiperInstalled(deps.piper)
        setFfmpegInstalled(deps.ffmpeg)
        setRhvoiceCoreInstalled(deps.rhvoiceCore)
      } catch (err) {
        console.error('Failed to check provider status:', err)
      }
    }

    loadApiKey()
    checkProviders()
  }, [])

  // Get actual theme based on system preference
  const getEffectiveTheme = useCallback(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme
  }, [theme])

  // Apply theme to document
  useEffect(() => {
    const applyTheme = () => {
      const effectiveTheme = getEffectiveTheme()
      if (effectiveTheme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    applyTheme()
    localStorage.setItem('theme', theme)

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') applyTheme()
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, getEffectiveTheme])

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'system') return 'light'
      if (prev === 'light') return 'dark'
      return 'system'
    })
  }

  const getThemeIcon = () => {
    const effectiveTheme = getEffectiveTheme()
    // Show opposite icon (what clicking will switch to)
    return effectiveTheme === 'dark'
      ? <Sun className="h-5 w-5" />
      : <Moon className="h-5 w-5" />
  }

  // Load voices when language changes
  useEffect(() => {
    const loadVoices = async () => {
      if (!window.electronAPI) return

      setIsLoadingVoices(true)
      try {
        const loadedVoices = await window.electronAPI.getVoices(language)
        setVoices(loadedVoices)
      } catch (error) {
        console.error('Failed to load voices:', error)
      } finally {
        setIsLoadingVoices(false)
      }
    }

    loadVoices()
  }, [language, needsSetup, sileroInstalled, coquiInstalled, rhvoiceCoreInstalled, piperInstalled])

  // Force refresh RHVoice voices when switching to rhvoice provider if no installed voices found
  useEffect(() => {
    if (selectedProvider !== 'rhvoice') return

    const rhvoiceVoices = voices.filter(v => v.provider === 'rhvoice')
    const hasInstalledRHVoices = rhvoiceVoices.some(v => v.isInstalled === true)

    // If RHVoice is selected but no installed voices found, force refresh
    if (rhvoiceVoices.length > 0 && !hasInstalledRHVoices) {
      const refreshVoices = async () => {
        if (!window.electronAPI) return

        console.log('RHVoice selected but no installed voices found, forcing refresh...')
        setIsLoadingVoices(true)
        try {
          const loadedVoices = await window.electronAPI.getVoices(language)
          setVoices(loadedVoices)
        } catch (error) {
          console.error('Failed to refresh RHVoice voices:', error)
        } finally {
          setIsLoadingVoices(false)
        }
      }

      refreshVoices()
    }
  }, [selectedProvider])

  // Select default voice when provider changes or voices are loaded
  useEffect(() => {
    // Filter by provider
    const providerVoices = voices.filter((v: VoiceInfo) => v.provider === selectedProvider)

    // For Piper and RHVoice, only select installed voices
    if (selectedProvider === 'piper' || selectedProvider === 'rhvoice') {
      const installedVoices = providerVoices.filter((v: VoiceInfo) => v.isInstalled !== false)
      // Check if current selection is still valid (installed)
      const currentVoiceValid = installedVoices.some((v: VoiceInfo) => v.shortName === selectedVoice)
      if (currentVoiceValid) {
        // Keep current selection
        return
      }
      if (installedVoices.length > 0) {
        setSelectedVoice(installedVoices[0].shortName)
      } else {
        setSelectedVoice('') // No installed voices
      }
    } else if (providerVoices.length > 0) {
      // Check if current selection is still valid
      const currentVoiceValid = providerVoices.some((v: VoiceInfo) => v.shortName === selectedVoice)
      if (currentVoiceValid) {
        return
      }
      // Default to first available voice in filtered list
      setSelectedVoice(providerVoices[0].shortName)
    } else if (selectedProvider === 'silero' || selectedProvider === 'coqui') {
      // Silero and Coqui may not have voices until dependencies are installed
      // Don't reset provider, just clear voice selection
      setSelectedVoice('')
    } else if (voices.length > 0) {
      // If no voices in selected provider, reset to all and select first
      setSelectedProvider('all')
      setSelectedVoice(voices[0].shortName)
    }
  }, [voices, selectedProvider])

  // Update preview text when language changes
  useEffect(() => {
    setPreviewText(getDefaultPreviewText(language))
  }, [language])

  // Listen for conversion progress
  useEffect(() => {
    if (!window.electronAPI) return

    const unsubscribe = window.electronAPI.onConversionProgress(({ progress, status }) => {
      setProgress(progress)
      setStatus(status)
    })

    return () => unsubscribe()
  }, [])

  const handleFileSelect = async () => {
    if (!window.electronAPI) return

    const filePath = await window.electronAPI.openFileDialog()
    if (!filePath) return

    await loadFile(filePath)
  }

  const loadFile = async (filePath: string) => {
    if (!window.electronAPI) return

    setError(null)

    // Get file info
    const fileResult = await window.electronAPI.getFileInfo(filePath)
    if (!fileResult.success || !fileResult.info) {
      setError(fileResult.error || 'Failed to read file')
      return
    }

    setFile(fileResult.info)

    // Parse book content
    const parseResult = await window.electronAPI.parseBook(filePath)
    if (!parseResult.success || !parseResult.content) {
      setError(parseResult.error || 'Failed to parse book')
      return
    }

    setBookContent(parseResult.content)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const filePath = (files[0] as any).path
      if (filePath) {
        await loadFile(filePath)
      }
    }
  }, [])

  const handleConvert = async () => {
    if (!window.electronAPI || !bookContent || !selectedVoice) return

    // Ask for save location
    const safeFilename = sanitizeFilename(bookContent.title)
    const outputPath = await window.electronAPI.saveFileDialog(`${safeFilename}.mp3`)
    if (!outputPath) return

    setIsConverting(true)
    setProgress(0)
    setStatus('Starting conversion...')
    setError(null)

    const rateValue = speed[0]
    const rate = rateValue === 1.0 ? '+0%' : rateValue > 1.0 ? `+${Math.round((rateValue - 1) * 100)}%` : `-${Math.round((1 - rateValue) * 100)}%`

    const options: Record<string, unknown> = { rate }

    // Add sentence pause for Piper
    if (selectedProvider === 'piper' && sentencePause[0] > 0) {
      options.sentencePause = sentencePause[0]
    }

    const result = await window.electronAPI.convertToSpeech(
      bookContent.fullText,
      selectedVoice,
      outputPath,
      options
    )

    setIsConverting(false)

    if (!result.success) {
      setError(result.error || 'Conversion failed')
    } else {
      setStatus('Conversion complete!')
    }
  }

  const handleCancel = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.abortConversion()
    setIsConverting(false)
    setStatus('Conversion cancelled')
  }

  const clearFile = () => {
    setFile(null)
    setBookContent(null)
    setProgress(0)
    setStatus('')
    setError(null)
  }

  const handlePreviewVoice = async () => {
    if (!window.electronAPI || !selectedVoice || isPreviewing) return

    // Stop and cleanup any currently playing audio
    if (previewAudio) {
      previewAudio.pause()
      previewAudio.onended = null
      previewAudio.onerror = null
      previewAudio.src = ''
      setPreviewAudio(null)
    }

    setIsPreviewing(true)
    setError(null)

    try {
      const rateValue = speed[0]
      const rate = rateValue === 1.0 ? '+0%' : rateValue > 1.0 ? `+${Math.round((rateValue - 1) * 100)}%` : `-${Math.round((1 - rateValue) * 100)}%`

      const options: Record<string, unknown> = { rate }

      // Add sentence pause for Piper
      if (selectedProvider === 'piper' && sentencePause[0] > 0) {
        options.sentencePause = sentencePause[0]
      }

      const result = await window.electronAPI.previewVoice(previewText, selectedVoice, options)

      if (result.success && result.audioData) {
        const audio = new Audio(result.audioData)

        const cleanup = () => {
          audio.onended = null
          audio.onerror = null
        }

        audio.onended = () => {
          cleanup()
          setIsPreviewing(false)
        }

        audio.onerror = () => {
          // Only show error if audio hasn't started playing
          if (audio.currentTime === 0) {
            cleanup()
            setIsPreviewing(false)
            setError('Failed to play audio preview')
          }
        }

        setPreviewAudio(audio)
        await audio.play()
      } else {
        setError(result.error || 'Failed to generate preview')
        setIsPreviewing(false)
      }
    } catch (err) {
      setIsPreviewing(false)
      // Don't show error if it's just an abort
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
      }
    }
  }

  const startEditingPreview = () => {
    setTempPreviewText(previewText)
    setIsEditingPreview(true)
  }

  const savePreviewText = () => {
    if (tempPreviewText.trim()) {
      setPreviewText(tempPreviewText.trim())
    }
    setIsEditingPreview(false)
  }

  const cancelEditingPreview = () => {
    setIsEditingPreview(false)
    setTempPreviewText('')
  }

  // TTS Server management functions
  const refreshServerStatus = async () => {
    if (!window.electronAPI) return
    try {
      const status = await window.electronAPI.ttsServerStatus()
      setTtsServerStatus(status)
    } catch (err) {
      console.error('Failed to get server status:', err)
    }
  }

  const handleLoadModel = async (engine: 'silero' | 'coqui', language?: string) => {
    if (!window.electronAPI) return
    const loadKey = language ? `${engine}-${language}` : engine
    setIsLoadingModel(loadKey)
    try {
      const result = await window.electronAPI.ttsModelLoad(engine, language)
      if (!result.success && result.error) {
        setError(result.error)
      }
      await refreshServerStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingModel(null)
    }
  }

  const handleUnloadModel = async (engine: 'silero' | 'coqui' | 'all', language?: string) => {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.ttsModelUnload(engine, language)
      await refreshServerStatus()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Refresh server status periodically when Silero or Coqui is selected
  useEffect(() => {
    if ((selectedProvider === 'silero' && sileroInstalled) ||
        (selectedProvider === 'coqui' && coquiInstalled)) {
      refreshServerStatus()
      const interval = setInterval(refreshServerStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [selectedProvider, sileroInstalled, coquiInstalled])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Group voices by provider
  const voicesByProvider = voices.reduce((acc, voice) => {
    if (!acc[voice.provider]) {
      acc[voice.provider] = []
    }
    acc[voice.provider].push(voice)
    return acc
  }, {} as Record<string, VoiceInfo[]>)

  // Filter voices by selected provider
  const filteredVoices = voices.filter(v => v.provider === selectedProvider)

  // Check if Piper has any installed voices
  const hasPiperInstalledVoices = filteredVoices.some(v => v.provider === 'piper' && v.isInstalled !== false)

  // Check which providers have voices for current language
  const getProviderAvailability = (providerId: string) => {
    // Silero and Coqui should always be selectable (they show setup screen if not installed)
    if (providerId === 'silero' || providerId === 'coqui') {
      return true
    }
    return voices.some(v => v.provider === providerId)
  }

  // Check if RHVoice has any installed voices
  const hasRHVoiceInstalledVoices = filteredVoices.some(v => v.provider === 'rhvoice' && v.isInstalled === true)

  // Check if selected provider is ready to use (dependencies installed + voices available)
  const isProviderReady = (() => {
    switch (selectedProvider) {
      case 'silero':
        return sileroInstalled
      case 'coqui':
        return coquiInstalled
      case 'elevenlabs':
        return hasApiKey
      case 'piper':
        return piperInstalled
      case 'rhvoice':
        return rhvoiceCoreInstalled
      default:
        return true // system always available
    }
  })()

  // Check if selected voice is valid (installed for Piper/RHVoice)
  const isSelectedVoiceValid = (() => {
    if (!selectedVoice) return false
    if (selectedProvider !== 'piper' && selectedProvider !== 'rhvoice') return true
    const voice = filteredVoices.find(v => v.shortName === selectedVoice)
    return voice?.isInstalled !== false
  })()

  // Check if any installation is in progress
  const isAnyInstallationInProgress = isInstallingSilero || isInstallingCoqui || isInstallingPiperCore || isInstallingRHVoiceCore || installingVoice !== null || installingRHVoice !== null

  // Check if TTS model is loaded for current language (Silero/Coqui only)
  const isModelLoadedForLanguage = (() => {
    if (selectedProvider === 'silero') {
      // For Silero, check if model for selected language is loaded
      const langCode = language.startsWith('ru') ? 'ru' : 'en'
      if (langCode === 'ru') {
        return ttsServerStatus?.silero.ru_loaded === true
      } else {
        return ttsServerStatus?.silero.en_loaded === true
      }
    }
    if (selectedProvider === 'coqui') {
      // For Coqui, single multilingual model
      return ttsServerStatus?.coqui.loaded === true
    }
    // Other providers don't need model loading
    return true
  })()

  // Show loading while checking setup status
  if (needsSetup === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Show setup screen if needed
  if (needsSetup) {
    return <SetupScreen onSetupComplete={() => setNeedsSetup(false)} />
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileAudio className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Book to MP3</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">- Convert books to audio</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-8 w-8"
          >
            {getThemeIcon()}
          </Button>
        </div>

        {/* File Drop Zone */}
        <Card>
          <CardContent className="py-6">
            {!file ? (
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
                  ${isDragging ? 'border-primary bg-accent' : 'border-muted-foreground/25 hover:border-primary/50'}`}
                onClick={handleFileSelect}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  Drop your book here or click to browse
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports FB2, EPUB, TXT
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Book className="h-12 w-12 text-primary flex-shrink-0" />
                <div className="flex-grow min-w-0">
                  <h3 className="font-medium text-lg truncate">
                    {bookContent?.title || file.name}
                  </h3>
                  {bookContent?.author && (
                    <p className="text-base text-muted-foreground truncate">{bookContent.author}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <span className="uppercase">{file.extension}</span>
                    <span>•</span>
                    <span>{formatFileSize(file.size)}</span>
                    {bookContent && (
                      <>
                        <span>•</span>
                        <span>{bookContent.chapters.length} chapters</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  onClick={clearFile}
                  disabled={isConverting}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        {file && bookContent && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Languages className="h-4 w-4" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              {/* Provider Selection */}
              <div className="space-y-3">
                <Label className="text-sm">TTS Provider</Label>
                <div className="flex flex-wrap gap-2 lg:flex-nowrap">
                  {availableProviders.map(provider => {
                    const isAvailable = getProviderAvailability(provider.id)
                    const isSelected = selectedProvider === provider.id
                    return (
                      <button
                        key={provider.id}
                        onClick={() => isAvailable && !isConverting && !isAnyInstallationInProgress && setSelectedProvider(provider.id)}
                        disabled={!isAvailable || isConverting || isAnyInstallationInProgress}
                        className={`flex flex-col items-center gap-1 border rounded-lg p-3 transition-colors flex-1 min-w-[calc(50%-4px)] sm:min-w-0 ${
                          isSelected ? 'border-primary bg-accent' : 'border-border'
                        } ${
                          isAvailable && !isConverting && !isAnyInstallationInProgress ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {provider.icon}
                        <span className="text-xs font-medium">{provider.name}</span>
                      </button>
                    )
                  })}
                </div>
                {/* Provider Description */}
                {selectedProvider && (
                  <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-md border border-border/50 leading-relaxed mt-1">
                    {availableProviders.find(p => p.id === selectedProvider)?.description}
                  </div>
                )}
              </div>

              {/* ElevenLabs API Key Input */}
              {selectedProvider === 'elevenlabs' && (
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5" />
                    ElevenLabs API Key
                  </Label>
                  {!isEditingApiKey && hasApiKey ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-9 px-3 py-2 border rounded-md bg-muted text-sm text-muted-foreground flex items-center">
                        {showApiKey ? elevenLabsApiKey : '••••••••••••••••••••'}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => {
                          setTempApiKey(elevenLabsApiKey)
                          setIsEditingApiKey(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={tempApiKey}
                        onChange={(e) => setTempApiKey(e.target.value)}
                        placeholder="Enter your ElevenLabs API key"
                        className="flex-1 h-9 px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-9 w-9"
                        disabled={!tempApiKey.trim()}
                        onClick={async () => {
                          if (!window.electronAPI || !tempApiKey.trim()) return
                          await window.electronAPI.setElevenLabsApiKey(tempApiKey.trim())
                          setElevenLabsApiKey(tempApiKey.trim())
                          setHasApiKey(true)
                          setIsEditingApiKey(false)
                          setTempApiKey('')
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      {hasApiKey && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => {
                            setIsEditingApiKey(false)
                            setTempApiKey('')
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Get your API key from <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">elevenlabs.io</a>
                  </p>
                </div>
              )}

              {/* Silero Setup Notice */}
              {selectedProvider === 'silero' && !sileroInstalled && (
                <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Silero Setup Required</span>
                  </div>
                  {!pythonAvailable ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Silero requires Python 3.9+ to be installed on your system.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Download Python from{' '}
                        <a
                          href="https://www.python.org/downloads/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-foreground"
                        >
                          python.org
                        </a>
                        {' '}and restart the application.
                      </p>
                    </div>
                  ) : isInstallingSilero ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{sileroInstallProgress || 'Installing...'}</span>
                          <span className="font-medium">{sileroInstallPercent}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 ease-out"
                            style={{ width: `${sileroInstallPercent}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please wait, this may take several minutes...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>For Silero to work, the following will be installed:</p>
                        <ul className="list-disc list-inside text-xs space-y-0.5 ml-1">
                          <li>Python virtual environment</li>
                          <li>PyTorch CPU — ~150 MB</li>
                          <li>Dependencies (numpy, omegaconf) — ~5 MB</li>
                        </ul>
                      </div>
                      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded space-y-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="font-medium">Models downloaded on first use:</span>
                        </div>
                        <ul className="list-disc list-inside ml-5 space-y-0.5">
                          <li>Russian (v5_ru) — ~70 MB, 5 voices</li>
                          <li>English (v3_en) — ~100 MB, 118 voices</li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Initial download: ~155 MB</span>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            if (!window.electronAPI) return
                            setIsInstallingSilero(true)
                            setSileroInstallProgress('Starting installation...')
                            setSileroInstallPercent(0)

                            const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
                              setSileroInstallProgress(details)
                              setSileroInstallPercent(progress)
                            })

                            try {
                              const result = await window.electronAPI.installSilero()
                              if (result.success) {
                                setSileroInstalled(true)
                                setSileroInstallProgress('')
                                setSileroInstallPercent(0)
                              } else {
                                setError(result.error || 'Silero installation failed')
                              }
                            } catch (err) {
                              setError((err as Error).message)
                            } finally {
                              setIsInstallingSilero(false)
                              unsubscribe()
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Install Silero
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Coqui Setup Notice */}
              {selectedProvider === 'coqui' && !coquiInstalled && (
                <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Coqui XTTS-v2 Setup Required</span>
                  </div>
                  {!pythonAvailable ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Coqui requires Python 3.9+ to be installed on your system.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Download Python from{' '}
                        <a
                          href="https://www.python.org/downloads/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-foreground"
                        >
                          python.org
                        </a>
                        {' '}and restart the application.
                      </p>
                    </div>
                  ) : isInstallingCoqui ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{coquiInstallProgress || 'Installing...'}</span>
                          <span className="font-medium">{coquiInstallPercent}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 ease-out"
                            style={{ width: `${coquiInstallPercent}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please wait, this may take several minutes...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>For Coqui XTTS-v2 to work, the following will be installed:</p>
                        <ul className="list-disc list-inside text-xs space-y-0.5 ml-1">
                          {!coquiBuildToolsAvailable && (
                            <li className="text-yellow-500">Visual Studio Build Tools — ~7 GB (required for compilation)</li>
                          )}
                          <li>Python virtual environment</li>
                          <li>Coqui TTS library — ~500 MB</li>
                          <li>XTTS-v2 model — ~1.8 GB</li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Total download: ~{coquiBuildToolsAvailable ? '2.5' : '9.5'} GB
                          {!coquiBuildToolsAvailable && ' (includes Build Tools)'}
                        </span>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            if (!window.electronAPI) return
                            setIsInstallingCoqui(true)
                            setCoquiInstallProgress('Starting installation...')
                            setCoquiInstallPercent(0)

                            const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
                              setCoquiInstallProgress(details)
                              setCoquiInstallPercent(progress)
                            })

                            try {
                              let result = await window.electronAPI.installCoqui()

                              // If Build Tools are needed, install them first
                              if (result.needsBuildTools) {
                                setCoquiInstallProgress('Installing Visual Studio Build Tools (this may take 10-20 minutes)...')
                                setCoquiInstallPercent(0)

                                const buildToolsResult = await window.electronAPI.installBuildTools()

                                if (!buildToolsResult.success) {
                                  setError(buildToolsResult.error || 'Failed to install Build Tools')
                                  return
                                }

                                if (buildToolsResult.requiresRestart) {
                                  setError('Build Tools installed successfully. Please restart your computer and try again.')
                                  return
                                }

                                // Try installing Coqui again after Build Tools are installed
                                setCoquiInstallProgress('Retrying Coqui installation...')
                                setCoquiInstallPercent(0)
                                result = await window.electronAPI.installCoqui()
                              }

                              if (result.success) {
                                setCoquiInstalled(true)
                                setCoquiInstallProgress('')
                                setCoquiInstallPercent(0)
                              } else {
                                setError(result.error || 'Coqui installation failed')
                              }
                            } catch (err) {
                              setError((err as Error).message)
                            } finally {
                              setIsInstallingCoqui(false)
                              unsubscribe()
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Install Coqui
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TTS Model Management Panel - LM Studio style */}
              {((selectedProvider === 'silero' && sileroInstalled) ||
                (selectedProvider === 'coqui' && coquiInstalled)) && (
                <div className="space-y-3 p-3 border rounded-md bg-gradient-to-b from-muted/40 to-muted/20">
                  {/* Header with explanation */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Cpu className="h-3.5 w-3.5" />
                    <span>Load models into RAM for fast generation</span>
                  </div>

                  {/* Silero Models */}
                  {selectedProvider === 'silero' && (
                    <div className="space-y-2">
                      {/* Russian Model Card */}
                      <div className={`p-2.5 rounded-lg border ${ttsServerStatus?.silero.ru_loaded ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-background/50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${ttsServerStatus?.silero.ru_loaded ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-muted-foreground/30'}`} />
                            <div>
                              <div className="font-medium text-sm">Silero v5_ru</div>
                              <div className="text-xs text-muted-foreground">Russian</div>
                            </div>
                          </div>
                          <Button
                            variant={ttsServerStatus?.silero.ru_loaded ? "outline" : "default"}
                            size="sm"
                            className="h-8 text-xs px-3"
                            disabled={isLoadingModel !== null}
                            onClick={() => ttsServerStatus?.silero.ru_loaded
                              ? handleUnloadModel('silero', 'ru')
                              : handleLoadModel('silero', 'ru')
                            }
                          >
                            {isLoadingModel === 'silero-ru' ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                Loading...
                              </>
                            ) : ttsServerStatus?.silero.ru_loaded ? (
                              <>
                                <X className="h-3.5 w-3.5 mr-1.5" />
                                Eject
                              </>
                            ) : (
                              <>
                                <Cpu className="h-3.5 w-3.5 mr-1.5" />
                                Load to RAM
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* English Model Card */}
                      <div className={`p-2.5 rounded-lg border ${ttsServerStatus?.silero.en_loaded ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-background/50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${ttsServerStatus?.silero.en_loaded ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-muted-foreground/30'}`} />
                            <div>
                              <div className="font-medium text-sm">Silero v3_en</div>
                              <div className="text-xs text-muted-foreground">English</div>
                            </div>
                          </div>
                          <Button
                            variant={ttsServerStatus?.silero.en_loaded ? "outline" : "default"}
                            size="sm"
                            className="h-8 text-xs px-3"
                            disabled={isLoadingModel !== null}
                            onClick={() => ttsServerStatus?.silero.en_loaded
                              ? handleUnloadModel('silero', 'en')
                              : handleLoadModel('silero', 'en')
                            }
                          >
                            {isLoadingModel === 'silero-en' ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                Loading...
                              </>
                            ) : ttsServerStatus?.silero.en_loaded ? (
                              <>
                                <X className="h-3.5 w-3.5 mr-1.5" />
                                Eject
                              </>
                            ) : (
                              <>
                                <Cpu className="h-3.5 w-3.5 mr-1.5" />
                                Load to RAM
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Coqui Model */}
                  {selectedProvider === 'coqui' && (
                    <div className={`p-2.5 rounded-lg border ${ttsServerStatus?.coqui.loaded ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-background/50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${ttsServerStatus?.coqui.loaded ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-muted-foreground/30'}`} />
                          <div>
                            <div className="font-medium text-sm">Coqui XTTS-v2</div>
                            <div className="text-xs text-muted-foreground">Multilingual</div>
                          </div>
                        </div>
                        <Button
                          variant={ttsServerStatus?.coqui.loaded ? "outline" : "default"}
                          size="sm"
                          className="h-8 text-xs px-3"
                          disabled={isLoadingModel !== null}
                          onClick={() => ttsServerStatus?.coqui.loaded
                            ? handleUnloadModel('coqui')
                            : handleLoadModel('coqui')
                          }
                        >
                          {isLoadingModel === 'coqui' ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                              Loading...
                            </>
                          ) : ttsServerStatus?.coqui.loaded ? (
                            <>
                              <X className="h-3.5 w-3.5 mr-1.5" />
                              Eject
                            </>
                          ) : (
                            <>
                              <Cpu className="h-3.5 w-3.5 mr-1.5" />
                              Load to RAM
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Current Usage Status Bar */}
                  {ttsServerStatus?.running && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/70">Current usage:</span>
                        <span className="font-mono">RAM: {ttsServerStatus.memory_gb.toFixed(2)} GB</span>
                      </div>
                    </div>
                  )}

                  {/* Hint when no model loaded */}
                  {(!ttsServerStatus?.running || !isModelLoadedForLanguage) && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      Load the model for your language to enable voice preview and conversion
                    </p>
                  )}
                </div>
              )}

              {/* Piper Setup Notice */}
              {selectedProvider === 'piper' && !piperInstalled && (
                <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Piper TTS Setup Required</span>
                  </div>
                  {isInstallingPiperCore ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{piperCoreInstallProgress || 'Installing...'}</span>
                          <span className="font-medium">{piperCoreInstallPercent}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 ease-out"
                            style={{ width: `${piperCoreInstallPercent}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please wait...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>For Piper to work, the TTS engine will be installed.</p>
                      </div>
                      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded space-y-1">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="font-medium">Voice models installed separately (~20-60 MB each)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Initial download: ~22 MB</span>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            if (!window.electronAPI) return
                            setIsInstallingPiperCore(true)
                            setPiperCoreInstallProgress('Starting installation...')
                            setPiperCoreInstallPercent(0)

                            const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
                              setPiperCoreInstallProgress(details)
                              setPiperCoreInstallPercent(progress)
                            })

                            try {
                              const piperResult = await window.electronAPI.installPiper()
                              if (!piperResult.success) {
                                setError(piperResult.error || 'Piper installation failed')
                                return
                              }

                              setPiperInstalled(true)
                              setPiperCoreInstallProgress('')
                              setPiperCoreInstallPercent(0)
                            } catch (err) {
                              setError((err as Error).message)
                            } finally {
                              setIsInstallingPiperCore(false)
                              unsubscribe()
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Install Piper
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RHVoice Setup Notice */}
              {selectedProvider === 'rhvoice' && !rhvoiceCoreInstalled && (
                <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">RHVoice Setup Required</span>
                  </div>
                  {isInstallingRHVoiceCore ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{rhvoiceCoreInstallProgress || 'Installing...'}</span>
                          <span className="font-medium">{rhvoiceCoreInstallPercent}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 ease-out"
                            style={{ width: `${rhvoiceCoreInstallPercent}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please wait...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>For RHVoice to work, the SAPI addon will be installed (~10 MB).</p>
                      </div>
                      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded space-y-1">
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="font-medium">Voice packs installed separately (~15-25 MB each)</span>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            if (!window.electronAPI) return
                            setIsInstallingRHVoiceCore(true)
                            setRhvoiceCoreInstallProgress('Starting installation...')
                            setRhvoiceCoreInstallPercent(0)

                            const unsubscribe = window.electronAPI.onSetupProgress(({ progress, details }) => {
                              setRhvoiceCoreInstallProgress(details)
                              setRhvoiceCoreInstallPercent(progress)
                            })

                            try {
                              const rhResult = await window.electronAPI.installRHVoiceCore()
                              if (!rhResult.success) {
                                setError(rhResult.error || 'RHVoice installation failed')
                                return
                              }

                              setRhvoiceCoreInstalled(true)
                              setRhvoiceCoreInstallProgress('')
                              setRhvoiceCoreInstallPercent(0)
                            } catch (err) {
                              setError((err as Error).message)
                            } finally {
                              setIsInstallingRHVoiceCore(false)
                              unsubscribe()
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Install RHVoice
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Language & Voice Row - only show when provider is ready */}
              {isProviderReady && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Language Selection */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Language</Label>
                  <Select value={language} onValueChange={setLanguage} disabled={isConverting || isAnyInstallationInProgress || isLoadingVoices}>
                    <SelectTrigger className="h-9" showChevron={!isLoadingVoices}>
                      <SelectValue placeholder="Select language" />
                      {isLoadingVoices && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice Selection */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Voice</Label>
                  <div className="flex gap-1.5">
                    <Select
                      value={selectedVoice}
                      open={voiceSelectOpen}
                      onOpenChange={setVoiceSelectOpen}
                      onValueChange={(value) => {
                        // Only allow selecting installed voices for Piper and RHVoice
                        const voice = filteredVoices.find(v => v.shortName === value)
                        if (voice && (selectedProvider === 'piper' || selectedProvider === 'rhvoice') && voice.isInstalled === false) {
                          return // Don't select uninstalled voice
                        }
                        setSelectedVoice(value)
                      }}
                      disabled={!isProviderReady || !isModelLoadedForLanguage || isConverting || installingVoice !== null || installingRHVoice !== null}
                    >
                      <SelectTrigger className="flex-1 h-9" showChevron={installingVoice === null && installingRHVoice === null}>
                        <SelectValue placeholder={
                          !isProviderReady ? "Setup required" : !isModelLoadedForLanguage ? "Load model first" : "Select voice"
                        }>
                          {selectedVoice && (() => {
                            const voice = filteredVoices.find(v => v.shortName === selectedVoice)
                            if (voice) {
                              return <span className="flex items-center gap-1.5">{voice.gender === 'Male' ? <MaleIcon className="h-4 w-4" /> : <FemaleIcon className="h-4 w-4" />} {voice.name}</span>
                            }
                            return null
                          })()}
                        </SelectValue>
                        {(installingVoice !== null || installingRHVoice !== null) && (
                          <div className="relative w-4 h-4 flex-shrink-0">
                            <svg className="w-4 h-4 -rotate-90">
                              <circle
                                cx="8"
                                cy="8"
                                r="6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="opacity-20"
                              />
                              <circle
                                cx="8"
                                cy="8"
                                r="6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeDasharray={`${(installingVoice !== null ? voiceInstallProgress : rhvoiceInstallProgress) * 0.377} 37.7`}
                                className="text-primary"
                              />
                            </svg>
                          </div>
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingVoices ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-sm text-muted-foreground">Loading voices...</span>
                          </div>
                        ) : filteredVoices.length === 0 ? (
                          <div className="py-4 text-center text-sm text-muted-foreground">
                            No voices available
                          </div>
                        ) : filteredVoices.map(voice => {
                          const isPiper = selectedProvider === 'piper'
                          const isRHVoice = selectedProvider === 'rhvoice'
                          const isVoiceInstalled = voice.isInstalled !== false
                          const isInstallingPiper = installingVoice === voice.shortName
                          const isInstallingRH = installingRHVoice === voice.shortName

                          // RHVoice voices with install/installed indicator
                          if (isRHVoice) {
                            return (
                              <div
                                key={voice.shortName}
                                className={`flex items-center justify-between px-2 py-1.5 text-sm rounded-sm ${
                                  isVoiceInstalled
                                    ? 'cursor-pointer hover:bg-accent'
                                    : 'opacity-50 cursor-default'
                                }`}
                                onClick={() => {
                                  if (isVoiceInstalled && !isInstallingRH) {
                                    setSelectedVoice(voice.shortName)
                                    setVoiceSelectOpen(false)
                                  }
                                }}
                              >
                                <span className="flex items-center gap-1.5">
                                  {voice.gender === 'Male' ? <MaleIcon className="h-4 w-4" /> : <FemaleIcon className="h-4 w-4" />} {voice.name}
                                </span>
                                {isVoiceInstalled ? null : isInstallingRH ? (
                                  <div className="relative w-6 h-6">
                                    <svg className="w-6 h-6 -rotate-90">
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        className="opacity-20"
                                      />
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeDasharray={`${rhvoiceInstallProgress * 0.628} 62.8`}
                                        className="text-primary"
                                      />
                                    </svg>
                                  </div>
                                ) : (
                                  <button
                                    className="p-1 hover:bg-accent rounded disabled:opacity-50"
                                    disabled={installingRHVoice !== null}
                                    onClick={async (e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      if (!window.electronAPI) return

                                      // Save previous voice to restore on error
                                      const previousVoice = selectedVoice

                                      // Set voice as active and close dropdown at start of download
                                      setSelectedVoice(voice.shortName)
                                      setVoiceSelectOpen(false)
                                      setInstallingRHVoice(voice.shortName)
                                      setRHVoiceInstallProgress(0)

                                      const unsubscribe = window.electronAPI.onSetupProgress(({ progress }) => {
                                        setRHVoiceInstallProgress(progress)
                                      })

                                      try {
                                        const result = await window.electronAPI.installRHVoice(voice.shortName, language)

                                        if (result.success) {
                                          // Reload voices to update installed status
                                          const loadedVoices = await window.electronAPI.getVoices(language)
                                          setVoices(loadedVoices)
                                        } else {
                                          setError(result.error || 'Voice installation failed')
                                          // Restore previous voice on error
                                          setSelectedVoice(previousVoice)
                                        }
                                      } catch (err) {
                                        setError((err as Error).message)
                                        // Restore previous voice on error
                                        setSelectedVoice(previousVoice)
                                      } finally {
                                        setInstallingRHVoice(null)
                                        setRHVoiceInstallProgress(0)
                                        unsubscribe()
                                      }
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )
                          }

                          if (isPiper) {
                            // Show Piper voices with install/installed indicator
                            return (
                              <div
                                key={voice.shortName}
                                className={`flex items-center justify-between px-2 py-1.5 text-sm rounded-sm ${
                                  isVoiceInstalled
                                    ? 'cursor-pointer hover:bg-accent'
                                    : 'opacity-50 cursor-default'
                                }`}
                                onClick={() => {
                                  if (isVoiceInstalled && !isInstallingPiper) {
                                    setSelectedVoice(voice.shortName)
                                    setVoiceSelectOpen(false)
                                  }
                                }}
                              >
                                <span className="flex items-center gap-1.5">
                                  {voice.gender === 'Male' ? <MaleIcon className="h-4 w-4" /> : <FemaleIcon className="h-4 w-4" />} {voice.name}
                                </span>
                                {isVoiceInstalled ? null : isInstallingPiper ? (
                                  <div className="relative w-6 h-6">
                                    <svg className="w-6 h-6 -rotate-90">
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        className="opacity-20"
                                      />
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeDasharray={`${voiceInstallProgress * 0.628} 62.8`}
                                        className="text-primary"
                                      />
                                    </svg>
                                  </div>
                                ) : (
                                  <button
                                    className="p-1 hover:bg-accent rounded disabled:opacity-50"
                                    disabled={installingVoice !== null}
                                    onClick={async (e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      if (!window.electronAPI) return

                                      // Save previous voice to restore on error
                                      const previousVoice = selectedVoice

                                      // Set voice as active and close dropdown at start of download
                                      setSelectedVoice(voice.shortName)
                                      setVoiceSelectOpen(false)
                                      setInstallingVoice(voice.shortName)
                                      setVoiceInstallProgress(0)

                                      const unsubscribe = window.electronAPI.onSetupProgress(({ progress }) => {
                                        setVoiceInstallProgress(progress)
                                      })

                                      try {
                                        // Parse voice info from shortName and determine quality
                                        const voiceName = voice.shortName.replace('piper-', '')
                                        const lang = language === 'ru-RU' ? 'ru_RU' : 'en_US'
                                        // Amy uses 'low' quality, others use 'medium'
                                        const quality = voiceName === 'amy' ? 'low' : 'medium'

                                        const result = await window.electronAPI.installPiperVoice(lang, voiceName, quality)

                                        if (result.success) {
                                          // Reload voices to update installed status
                                          const loadedVoices = await window.electronAPI.getVoices(language)
                                          setVoices(loadedVoices)
                                        } else {
                                          setError(result.error || 'Voice installation failed')
                                          // Restore previous voice on error
                                          setSelectedVoice(previousVoice)
                                        }
                                      } catch (err) {
                                        setError((err as Error).message)
                                        // Restore previous voice on error
                                        setSelectedVoice(previousVoice)
                                      } finally {
                                        setInstallingVoice(null)
                                        setVoiceInstallProgress(0)
                                        unsubscribe()
                                      }
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )
                          }

                          return (
                            <SelectItem key={voice.shortName} value={voice.shortName}>
                              <span className="flex items-center gap-1.5">
                                {voice.gender === 'Male' ? <MaleIcon className="h-4 w-4" /> : <FemaleIcon className="h-4 w-4" />} {voice.name}
                              </span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={handlePreviewVoice}
                      disabled={!isProviderReady || !isModelLoadedForLanguage || !isSelectedVoiceValid || isConverting || isPreviewing || installingVoice !== null || installingRHVoice !== null}
                      title={!isModelLoadedForLanguage ? "Load model first" : "Preview voice"}
                    >
                      {isPreviewing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          disabled={isConverting || installingVoice !== null || installingRHVoice !== null}
                          title="Playback settings"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="end">
                        <div className="space-y-4">
                          <h4 className="font-medium text-sm">Playback Settings</h4>

                          {/* Speed Control */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm">Speed</Label>
                              <span className="text-xs text-muted-foreground">
                                {speed[0].toFixed(1)}x
                              </span>
                            </div>
                            <Slider
                              value={speed}
                              onValueChange={setSpeed}
                              min={0.5}
                              max={2.0}
                              step={0.1}
                              disabled={isConverting}
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                              <span>0.5x</span>
                              <span>1.0x</span>
                              <span>1.5x</span>
                              <span>2.0x</span>
                            </div>
                          </div>

                          {/* Sentence Pause (Piper only) */}
                          {selectedProvider === 'piper' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm">Sentence Pause</Label>
                                <span className="text-xs text-muted-foreground">
                                  {sentencePause[0].toFixed(1)}s
                                </span>
                              </div>
                              <Slider
                                value={sentencePause}
                                onValueChange={setSentencePause}
                                min={0}
                                max={2.0}
                                step={0.1}
                                disabled={isConverting}
                              />
                              <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                                <span>0s</span>
                                <span>0.5s</span>
                                <span>1.0s</span>
                                <span>1.5s</span>
                                <span>2.0s</span>
                              </div>
                            </div>
                          )}

                          {/* Preview Text */}
                          <div className="space-y-2">
                            <Label className="text-sm">Preview Text</Label>
                            <div
                              className={`relative text-xs italic border rounded-md transition-colors py-2 px-2 ${
                                isEditingPreview
                                  ? 'border-ring bg-background'
                                  : 'bg-muted/30 text-muted-foreground'
                              }`}
                            >
                              {!isEditingPreview ? (
                                <span className="block pr-8">{previewText}</span>
                              ) : (
                                <textarea
                                  value={tempPreviewText}
                                  onChange={(e) => setTempPreviewText(e.target.value.slice(0, 500))}
                                  maxLength={500}
                                  className="w-full pr-8 text-xs italic bg-transparent resize-none focus:outline-none text-foreground leading-[inherit] p-0 m-0 block"
                                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                                  rows={1}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault()
                                      savePreviewText()
                                    }
                                    if (e.key === 'Escape') {
                                      cancelEditingPreview()
                                    }
                                  }}
                                />
                              )}
                              <div className="absolute top-1 right-1 flex gap-0.5">
                                {!isEditingPreview ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-foreground hover:text-foreground hover:bg-transparent"
                                    onClick={startEditingPreview}
                                    disabled={isConverting || isPreviewing}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                                      onClick={cancelEditingPreview}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                                      onClick={savePreviewText}
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
              )}

              {/* Installation Warning */}
              {isAnyInstallationInProgress && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium">Installation in progress</p>
                    <p className="text-amber-600/80 dark:text-amber-400/80 mt-0.5">Please do not close the application until the installation is complete to avoid corrupted files.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {isConverting && (
          <Card>
            <CardContent className="py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary animate-pulse" />
                  <span className="text-sm font-medium">Converting...</span>
                </div>
                <span className="text-xs text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{status.split(' | ')[1] || status}</span>
                {status.includes(' | ') && <span>{status.split(' | ')[0]}</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="py-3">
              <p className="text-destructive text-center text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons - hidden when provider is not ready */}
        {file && bookContent && isProviderReady && (
          <div className="w-full">
            {!isConverting ? (
              <Button
                onClick={handleConvert}
                disabled={!isModelLoadedForLanguage || !isSelectedVoiceValid}
                className="w-full h-12 text-base gap-2"
                title={!isModelLoadedForLanguage ? "Load model first to convert" : ""}
              >
                <Play className="h-5 w-5" />
                {!isModelLoadedForLanguage ? "Load model to convert" : "Convert to MP3"}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleCancel}
                className="w-full h-12 text-base gap-2"
              >
                <X className="h-5 w-5" />
                Cancel
              </Button>
            )}
          </div>
        )}

        {/* Success Message */}
        {!isConverting && status === 'Conversion complete!' && (
          <Card className="border-primary">
            <CardContent className="py-3">
              <div className="flex items-center justify-center gap-2 text-primary text-sm">
                <Download className="h-4 w-4" />
                <span className="font-medium">Audio file saved successfully!</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default App
