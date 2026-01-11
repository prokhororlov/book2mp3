import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Book, Upload, Volume2, Play, Download, X, FileAudio, Languages, Sun, Moon, Zap, Cpu, Sparkles, Cloud, Pencil, Check, Loader2 } from 'lucide-react'

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

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'rhvoice',
    name: 'RHVoice',
    description: 'Windows SAPI (fastest)',
    icon: <Zap className="h-4 w-4" />
  },
  {
    id: 'piper',
    name: 'Piper',
    description: 'ONNX models (medium quality)',
    icon: <Cpu className="h-4 w-4" />
  },
  {
    id: 'silero',
    name: 'Silero',
    description: 'PyTorch models (best quality, slow)',
    icon: <Sparkles className="h-4 w-4" />
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Cloud API (premium quality, requires API key)',
    icon: <Cloud className="h-4 w-4" />
  },
]

function App() {
  const [file, setFile] = useState<FileInfo | null>(null)
  const [bookContent, setBookContent] = useState<BookContent | null>(null)
  // Auto-detect system language, default to Russian
  const [language, setLanguage] = useState(() => {
    const systemLang = navigator.language
    if (systemLang.startsWith('ru')) return 'ru-RU'
    if (systemLang.startsWith('en')) return 'en'
    return 'ru-RU' // Default to Russian
  })
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('piper')
  const [speed, setSpeed] = useState([1.0])
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [previewText, setPreviewText] = useState('Привет! Это пример звучания голоса.')
  const [isEditingPreview, setIsEditingPreview] = useState(false)
  const [tempPreviewText, setTempPreviewText] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('theme')
    return (stored === 'dark' || stored === 'light' || stored === 'system') ? stored : 'system'
  })

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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileAudio className="h-10 w-10 text-primary" />
              <h1 className="text-3xl font-bold">Book to MP3</h1>
            </div>
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="rounded-full"
            >
              {getThemeIcon()}
            </Button>
          </div>
          <p className="text-muted-foreground text-left">
            Convert your books to audio files with multiple TTS providers
          </p>
        </div>

        {/* File Drop Zone */}
        <Card>
          <CardContent className="pt-6">
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
                  Drop your book here
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports FB2, EPUB, TXT
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <Book className="h-12 w-12 text-primary" />
                </div>
                <div className="flex-grow min-w-0">
                  <h3 className="font-semibold truncate">
                    {bookContent?.title || file.name}
                  </h3>
                  {bookContent?.author && (
                    <p className="text-sm text-muted-foreground">
                      {bookContent.author}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5" />
                Settings
              </CardTitle>
              <CardDescription>
                Choose language, TTS provider and voice for audio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Language Selection */}
              <div className="space-y-2">
                <Label>Book Language</Label>
                <Select value={language} onValueChange={setLanguage} disabled={isConverting}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>TTS Provider</Label>
                <div className="grid grid-cols-1 gap-2">
                  <RadioGroup value={selectedProvider} onValueChange={setSelectedProvider} disabled={isConverting}>
                    {PROVIDERS.map(provider => {
                      const isAvailable = getProviderAvailability(provider.id)
                      return (
                        <div
                          key={provider.id}
                          className={`flex items-center space-x-2 border rounded-lg p-3 ${
                            isAvailable ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <RadioGroupItem
                            value={provider.id}
                            id={`provider-${provider.id}`}
                            disabled={!isAvailable || isConverting}
                          />
                          <Label
                            htmlFor={`provider-${provider.id}`}
                            className={`flex-1 ${isAvailable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                          >
                            <div className="flex items-center gap-2">
                              {provider.icon}
                              <span className="font-medium">{provider.name}</span>
                              {!isAvailable && <span className="text-xs text-muted-foreground">(не доступен)</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">{provider.description}</p>
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </div>
              </div>

              {/* Voice Selection */}
              <div className="space-y-3">
                <Label>Voice</Label>
                <div className="flex gap-2">
                  <Select value={selectedVoice} onValueChange={setSelectedVoice} disabled={isConverting}>
                    <SelectTrigger className="flex-1">
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

                {/* Preview Text */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Preview text</Label>
                    {!isEditingPreview ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={startEditingPreview}
                        className="h-6 px-2 text-xs"
                        disabled={isConverting || isPreviewing}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={savePreviewText}
                          className="h-6 px-2 text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditingPreview}
                          className="h-6 px-2 text-xs"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isEditingPreview ? (
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
                  ) : (
                    <p className="text-xs text-muted-foreground italic truncate">
                      "{previewText}"
                    </p>
                  )}
                </div>
              </div>

              {/* Speed Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Reading Speed</Label>
                  <span className="text-sm text-muted-foreground">
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
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {isConverting && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-primary animate-pulse" />
                  <span className="font-medium">Converting...</span>
                </div>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{status.split(' | ')[1] || status}</span>
                {status.includes(' | ') && <span>{status.split(' | ')[0]}</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-center">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {file && bookContent && (
          <div className="flex justify-center gap-4">
            {!isConverting ? (
              <Button
                size="lg"
                onClick={handleConvert}
                disabled={!selectedVoice}
                className="gap-2"
              >
                <Play className="h-5 w-5" />
                Convert to MP3
              </Button>
            ) : (
              <Button
                size="lg"
                variant="destructive"
                onClick={handleCancel}
                className="gap-2"
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
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Download className="h-5 w-5" />
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
