import { ReactNode } from 'react'
import { Loader2, Download, Play, Square, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MaleIcon, FemaleIcon } from '@/components/icons/GenderIcons'
import type { VoiceInfo } from '@/types'
import { useI18n } from '@/i18n'

interface VoiceSelectorProps {
  language: string
  onLanguageChange: (lang: string) => void
  selectedVoice: string
  onVoiceChange: (voice: string) => void
  voices: VoiceInfo[]
  selectedProvider: string
  isLoadingVoices: boolean
  isConverting: boolean
  isAnyInstalling: boolean
  isProviderReady: boolean
  isModelLoadedForLanguage: boolean
  isSelectedVoiceValid: boolean
  isPreviewing: boolean
  installingVoice: string | null
  installingRHVoice: string | null
  voiceInstallProgress: number
  rhvoiceInstallProgress: number
  voiceSelectOpen: boolean
  onVoiceSelectOpenChange: (open: boolean) => void
  onPreview: () => void
  onStopPreview: () => void
  onInstallPiperVoice: (voice: VoiceInfo) => void
  onInstallRHVoice: (voice: VoiceInfo) => void
  settingsOpen: boolean
  onSettingsOpenChange: (open: boolean) => void
  settingsContent: ReactNode
}

export function VoiceSelector({
  language,
  onLanguageChange,
  selectedVoice,
  onVoiceChange,
  voices,
  selectedProvider,
  isLoadingVoices,
  isConverting,
  isAnyInstalling,
  isProviderReady,
  isModelLoadedForLanguage,
  isSelectedVoiceValid,
  isPreviewing,
  installingVoice,
  installingRHVoice,
  voiceInstallProgress,
  rhvoiceInstallProgress,
  voiceSelectOpen,
  onVoiceSelectOpenChange,
  onPreview,
  onStopPreview,
  onInstallPiperVoice,
  onInstallRHVoice,
  settingsOpen,
  onSettingsOpenChange,
  settingsContent,
}: VoiceSelectorProps) {
  const { t } = useI18n()
  const filteredVoices = voices.filter((v) => v.provider === selectedProvider)

  const handleVoiceSelect = (value: string) => {
    const voice = filteredVoices.find((v) => v.shortName === value)
    if (
      voice &&
      (selectedProvider === 'piper' || selectedProvider === 'rhvoice') &&
      voice.isInstalled === false
    ) {
      return
    }
    onVoiceChange(value)
  }

  const renderVoiceItem = (voice: VoiceInfo) => {
    const isPiper = selectedProvider === 'piper'
    const isRHVoice = selectedProvider === 'rhvoice'
    const isVoiceInstalled = voice.isInstalled !== false
    const isInstallingPiper = installingVoice === voice.shortName
    const isInstallingRH = installingRHVoice === voice.shortName

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
              onVoiceChange(voice.shortName)
              onVoiceSelectOpenChange(false)
            }
          }}
        >
          <span className="flex items-center gap-1.5">
            {voice.gender === 'Male' ? (
              <MaleIcon className="h-4 w-4" />
            ) : (
              <FemaleIcon className="h-4 w-4" />
            )}
            {voice.name}
          </span>
          {isVoiceInstalled ? null : isInstallingRH ? (
            <CircularProgressSmall progress={rhvoiceInstallProgress} />
          ) : (
            <button
              className="p-1 hover:bg-accent rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={installingRHVoice !== null}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onInstallRHVoice(voice)
              }}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      )
    }

    if (isPiper) {
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
              onVoiceChange(voice.shortName)
              onVoiceSelectOpenChange(false)
            }
          }}
        >
          <span className="flex items-center gap-1.5">
            {voice.gender === 'Male' ? (
              <MaleIcon className="h-4 w-4" />
            ) : (
              <FemaleIcon className="h-4 w-4" />
            )}
            {voice.name}
          </span>
          {isVoiceInstalled ? null : isInstallingPiper ? (
            <CircularProgressSmall progress={voiceInstallProgress} />
          ) : (
            <button
              className="p-1 hover:bg-accent rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={installingVoice !== null}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onInstallPiperVoice(voice)
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
          {voice.gender === 'Male' ? (
            <MaleIcon className="h-4 w-4" />
          ) : (
            <FemaleIcon className="h-4 w-4" />
          )}
          {voice.name}
        </span>
      </SelectItem>
    )
  }

  const selectedVoiceInfo = filteredVoices.find((v) => v.shortName === selectedVoice)

  // Get localized language names
  const getLanguageName = (code: string) => {
    if (code === 'ru-RU') return t.languages['ru-RU']
    if (code === 'en') return t.languages['en-US']
    return code
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-sm">{t.voice.language}</Label>
        <Select
          value={language}
          onValueChange={onLanguageChange}
          disabled={isConverting || isAnyInstalling || isLoadingVoices}
        >
          <SelectTrigger className="h-9" showChevron={!isLoadingVoices}>
            <SelectValue placeholder={t.voice.selectLanguage} />
            {isLoadingVoices && (
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ru-RU">{t.languages['ru-RU']}</SelectItem>
            <SelectItem value="en">{t.languages['en-US']}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">{t.voice.selectVoice}</Label>
        <div className="flex gap-1.5">
          <Select
            value={selectedVoice}
            open={voiceSelectOpen}
            onOpenChange={onVoiceSelectOpenChange}
            onValueChange={handleVoiceSelect}
            disabled={
              !isProviderReady ||
              !isModelLoadedForLanguage ||
              isConverting ||
              installingVoice !== null ||
              installingRHVoice !== null ||
              isAnyInstalling
            }
          >
            <SelectTrigger
              className="flex-1 h-9"
              showChevron={installingVoice === null && installingRHVoice === null}
            >
              <SelectValue
                placeholder={
                  !isProviderReady
                    ? t.voice.setupRequired
                    : !isModelLoadedForLanguage
                      ? t.voice.loadModelFirst
                      : t.voice.selectVoice
                }
              >
                {selectedVoice && selectedVoiceInfo && (
                  <span className="flex items-center gap-1.5">
                    {selectedVoiceInfo.gender === 'Male' ? (
                      <MaleIcon className="h-4 w-4" />
                    ) : (
                      <FemaleIcon className="h-4 w-4" />
                    )}
                    {selectedVoiceInfo.name}
                  </span>
                )}
              </SelectValue>
              {(installingVoice !== null || installingRHVoice !== null) && (
                <CircularProgressSmall
                  progress={
                    installingVoice !== null
                      ? voiceInstallProgress
                      : rhvoiceInstallProgress
                  }
                  size={16}
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {isLoadingVoices ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t.voice.loadingVoices}
                  </span>
                </div>
              ) : filteredVoices.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t.voice.noVoices}
                </div>
              ) : (
                filteredVoices.map(renderVoiceItem)
              )}
            </SelectContent>
          </Select>
          <Button
            variant={isPreviewing ? 'default' : 'ghost-icon'}
            size="icon"
            className="h-9 w-9"
            onClick={isPreviewing ? onStopPreview : onPreview}
            disabled={
              !isProviderReady ||
              !isModelLoadedForLanguage ||
              !isSelectedVoiceValid ||
              isConverting ||
              installingVoice !== null ||
              installingRHVoice !== null
            }
            title={
              isPreviewing
                ? t.voice.stopPreview
                : !isModelLoadedForLanguage
                  ? t.voice.loadModelFirst
                  : t.voice.previewVoice
            }
          >
            {isPreviewing ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Popover open={settingsOpen} onOpenChange={onSettingsOpenChange}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-9 w-9"
                disabled={
                  isConverting || installingVoice !== null || installingRHVoice !== null
                }
                title={t.voice.playbackSettings}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              {settingsContent}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}

function CircularProgressSmall({
  progress,
  size = 24,
}: {
  progress: number
  size?: number
}) {
  const r = size === 16 ? 6 : 10
  const circumference = 2 * Math.PI * r

  return (
    <div className={`relative flex-shrink-0`} style={{ width: size, height: size }}>
      <svg className={`-rotate-90`} style={{ width: size, height: size }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={`${(progress / 100) * circumference} ${circumference}`}
          className="text-primary"
        />
      </svg>
    </div>
  )
}
