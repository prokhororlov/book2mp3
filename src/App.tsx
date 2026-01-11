import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Book, Upload, Volume2, Play, Download, X, FileAudio, Languages, Sun, Moon, Zap, Cpu, Sparkles, Cloud, Pencil, Check, Loader2, Key, Eye, EyeOff } from 'lucide-react'
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
  provider: 'rhvoice' | 'piper' | 'silero' | 'elevenlabs'
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
  rhvoice: <Zap className="h-4 w-4" />,
  piper: <Cpu className="h-4 w-4" />,
  silero: <Sparkles className="h-4 w-4" />,
  elevenlabs: <Cloud className="h-4 w-4" />,
}

function App() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [file, setFile] = useState<FileInfo | null>(null)
  const [bookContent, setBookContent] = useState<BookContent | null>(null)
  // Auto-detect system language, default to Russian
  const [language, setLanguage] = useState(() => {
    const systemLang = navigator.language
    if (systemLang.startsWith('ru')) return 'ru-RU'
    if (systemLang.startsWith('en')) return 'en'
    return 'ru-RU' // Default to Russian
  })

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
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('piper')
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([])
  const [speed, setSpeed] = useState([1.0])
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const getDefaultPreviewText = (lang: string) => {
    return lang.startsWith('en') ? 'Hello! This is an example of how the voice sounds.' : 'Привет! Это пример звучания голоса.'
  }
  const [previewText, setPreviewText] = useState(() => getDefaultPreviewText(navigator.language.startsWith('en') ? 'en' : 'ru-RU'))
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

    const checkSilero = async () => {
      if (!window.electronAPI) return
      try {
        const deps = await window.electronAPI.checkDependenciesAsync()
        setSileroInstalled(deps.silero)
        setPythonAvailable(deps.sileroAvailable)
      } catch (err) {
        console.error('Failed to check Silero status:', err)
      }
    }

    loadApiKey()
    checkSilero()
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

  // Load voices when language or provider changes
  useEffect(() => {
    const loadVoices = async () => {
      if (!window.electronAPI) return

      try {
        const loadedVoices = await window.electronAPI.getVoices(language)
        setVoices(loadedVoices)

        // Filter by provider
        const filteredVoices = loadedVoices.filter((v: VoiceInfo) => v.provider === selectedProvider)

        // Default to first available voice in filtered list
        if (filteredVoices.length > 0) {
          setSelectedVoice(filteredVoices[0].shortName)
        } else if (loadedVoices.length > 0) {
          // If no voices in selected provider, reset to all and select first
          setSelectedProvider('all')
          setSelectedVoice(loadedVoices[0].shortName)
        }
      } catch (error) {
        console.error('Failed to load voices:', error)
      }
    }

    loadVoices()
  }, [language, selectedProvider])

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

    const result = await window.electronAPI.convertToSpeech(
      bookContent.fullText,
      selectedVoice,
      outputPath,
      { rate }
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
      const result = await window.electronAPI.previewVoice(previewText, selectedVoice)

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

  // Check which providers have voices for current language
  const getProviderAvailability = (providerId: string) => {
    return voices.some(v => v.provider === providerId)
  }

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
          <CardContent className="py-4">
            {!file ? (
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
                  ${isDragging ? 'border-primary bg-accent' : 'border-muted-foreground/25 hover:border-primary/50'}`}
                onClick={handleFileSelect}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-base font-medium mb-1">
                  Drop your book here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports FB2, EPUB, TXT
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Book className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-grow min-w-0">
                  <h3 className="font-medium text-sm truncate">
                    {bookContent?.title || file.name}
                    {bookContent?.author && <span className="text-muted-foreground font-normal"> — {bookContent.author}</span>}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                  className="h-8 w-8"
                  onClick={clearFile}
                  disabled={isConverting}
                >
                  <X className="h-4 w-4" />
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
            <CardContent className="space-y-4">
              {/* Language & Provider Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Language Selection */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Language</Label>
                  <Select value={language} onValueChange={setLanguage} disabled={isConverting}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select language" />
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

                {/* Provider Selection */}
                <div className="space-y-1.5">
                  <Label className="text-sm">TTS Provider</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {availableProviders.map(provider => {
                      const isAvailable = getProviderAvailability(provider.id)
                      const isSelected = selectedProvider === provider.id
                      return (
                        <button
                          key={provider.id}
                          onClick={() => isAvailable && !isConverting && setSelectedProvider(provider.id)}
                          disabled={!isAvailable || isConverting}
                          title={provider.description}
                          className={`flex flex-col items-center gap-0.5 border rounded-md p-1.5 transition-colors ${
                            isSelected ? 'border-primary bg-accent' : 'border-border'
                          } ${
                            isAvailable && !isConverting ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {provider.icon}
                          <span className="text-[10px] font-medium leading-none">{provider.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
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
                <div className="space-y-2 p-3 border rounded-md bg-muted/50">
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
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Silero needs to download PyTorch and models (~500MB). This is a one-time setup.
                      </p>
                      {isInstallingSilero ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">{sileroInstallProgress || 'Installing...'}</span>
                        </div>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            if (!window.electronAPI) return
                            setIsInstallingSilero(true)
                            setSileroInstallProgress('Starting installation...')

                            const unsubscribe = window.electronAPI.onSetupProgress(({ details }) => {
                              setSileroInstallProgress(details)
                            })

                            try {
                              const result = await window.electronAPI.installSilero()
                              if (result.success) {
                                setSileroInstalled(true)
                                setSileroInstallProgress('')
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
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Voice & Speed Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Voice Selection */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Voice</Label>
                  <div className="flex gap-1.5">
                    <Select value={selectedVoice} onValueChange={setSelectedVoice} disabled={isConverting}>
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue placeholder="Select voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredVoices.map(voice => (
                          <SelectItem key={voice.shortName} value={voice.shortName}>
                            {voice.gender === 'Male' ? '👨' : '👩'} {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={handlePreviewVoice}
                      disabled={!selectedVoice || isConverting || isPreviewing}
                      title="Preview voice"
                    >
                      {isPreviewing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Speed Control */}
                <div className="space-y-1.5">
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
                    className="py-2"
                  />
                </div>
              </div>

              {/* Preview Text - collapsed */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="italic truncate flex-1">Preview: "{previewText}"</span>
                {!isEditingPreview ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditingPreview}
                    className="h-5 px-1.5 text-xs"
                    disabled={isConverting || isPreviewing}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
              {isEditingPreview && (
                <div className="space-y-1.5">
                  <textarea
                    value={tempPreviewText}
                    onChange={(e) => setTempPreviewText(e.target.value)}
                    className="w-full p-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    rows={2}
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
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={cancelEditingPreview} className="h-6 px-2 text-xs">
                      Cancel
                    </Button>
                    <Button variant="ghost" size="sm" onClick={savePreviewText} className="h-6 px-2 text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Save
                    </Button>
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

        {/* Action Buttons */}
        {file && bookContent && (
          <div className="flex justify-center gap-4">
            {!isConverting ? (
              <Button
                onClick={handleConvert}
                disabled={!selectedVoice}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Convert to MP3
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleCancel}
                className="gap-2"
              >
                <X className="h-4 w-4" />
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
