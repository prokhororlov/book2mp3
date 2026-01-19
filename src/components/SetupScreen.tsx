import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Download, CheckCircle, Loader2, AlertCircle, Package, RefreshCw } from 'lucide-react'
import type { SetupInstallingState, SetupErrorState } from '@/fsm/types'
import { getRecoverySuggestion } from '@/fsm/errorClassifier'
import { useI18n } from '@/i18n'

interface SetupProgress {
  stage: string
  progress: number
  details: string
}

// FSM-aware props
interface SetupScreenProps {
  onSetupComplete: () => void
  // Optional FSM state for controlled mode
  fsmState?: 'SETUP_REQUIRED' | 'SETUP_INSTALLING' | 'SETUP_COMPLETE' | 'SETUP_ERROR'
  installingState?: SetupInstallingState
  errorState?: SetupErrorState
  onInstall?: () => void
  onRetry?: () => void
}

export function SetupScreen({
  onSetupComplete,
  fsmState,
  installingState,
  errorState,
  onInstall,
  onRetry
}: SetupScreenProps) {
  const { t } = useI18n()
  // Local state for standalone mode (when not controlled by FSM)
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  // Determine if we're in FSM-controlled mode
  const isFSMControlled = fsmState !== undefined

  // Derive state from FSM or local state
  const effectiveIsInstalling = isFSMControlled ? fsmState === 'SETUP_INSTALLING' : isInstalling
  const effectiveIsComplete = isFSMControlled ? fsmState === 'SETUP_COMPLETE' : isComplete
  const effectiveError = isFSMControlled ? errorState?.error?.message : error
  const effectiveCanRetry = isFSMControlled ? errorState?.canRetry : true
  const effectiveProgress = isFSMControlled && installingState
    ? { stage: installingState.stage, progress: installingState.progress, details: installingState.details }
    : progress

  useEffect(() => {
    // Listen for setup progress only in standalone mode
    if (!isFSMControlled && window.electronAPI) {
      const unsubscribe = window.electronAPI.onSetupProgress((data) => {
        setProgress(data)
        if (data.stage === 'complete') {
          setIsComplete(true)
          setIsInstalling(false)
        }
      })
      return () => unsubscribe()
    }
  }, [isFSMControlled])

  const handleInstall = async () => {
    // Use FSM action if available
    if (isFSMControlled && onInstall) {
      onInstall()
      return
    }

    // Standalone mode
    if (!window.electronAPI) return

    setIsInstalling(true)
    setError(null)

    try {
      // Install only FFmpeg (required for all providers)
      const result = await window.electronAPI.installFfmpeg()

      if (!result.success) {
        setError(result.error || 'FFmpeg installation failed')
        setIsInstalling(false)
        return
      }

      setIsComplete(true)
      setIsInstalling(false)
    } catch (err) {
      setError((err as Error).message)
      setIsInstalling(false)
    }
  }

  const handleRetry = () => {
    if (isFSMControlled && onRetry) {
      onRetry()
    } else {
      setError(null)
      handleInstall()
    }
  }

  // Get recovery suggestion for FSM errors
  const getErrorSuggestion = () => {
    if (isFSMControlled && errorState?.error) {
      return getRecoverySuggestion(errorState.error)
    }
    return t.setup.checkInternetAndRetry
  }

  if (effectiveIsComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 rounded-[10px] overflow-hidden">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>{t.setup.completed}</CardTitle>
            <CardDescription>
              {t.setup.ffmpegInstallSuccess}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onSetupComplete} className="w-full">
              {t.common.startWork}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 rounded-[10px] overflow-hidden">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>{t.setup.initialSetup}</CardTitle>
          <CardDescription>
            {t.setup.initialSetupDescription}<br/>
            {t.setup.oneTimeSetup}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!effectiveIsInstalling && !effectiveError && (
            <div className="text-center space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>{t.setup.willDownload}</p>
                <p className="font-medium text-foreground">{t.setup.ffmpegConverter}</p>

                <p className="text-xs text-muted-foreground/70">
                  {t.setup.ttsEnginesNote}
                </p>
              </div>

              <Button onClick={handleInstall} className="w-full gap-2">
                <Download className="h-4 w-4" />
                {t.common.downloadAndInstall}
              </Button>
            </div>
          )}

          {effectiveIsInstalling && effectiveProgress && (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  {t.setup.installingFFmpeg}
                </span>
              </div>

              <Progress value={effectiveProgress.progress} className="h-2" />

              <p className="text-xs text-muted-foreground">
                {effectiveProgress.details}
              </p>
            </div>
          )}

          {effectiveError && (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{t.setup.installationError}</span>
              </div>

              <p className="text-xs text-muted-foreground">{effectiveError}</p>

              <p className="text-xs text-muted-foreground/70">{getErrorSuggestion()}</p>

              {effectiveCanRetry && (
                <Button onClick={handleRetry} variant="outline" className="w-full gap-2">
                  <RefreshCw className="h-4 w-4" />
                  {t.setup.retrySetup}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
