import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Download, CheckCircle, Loader2, AlertCircle, Package } from 'lucide-react'

interface SetupProgress {
  stage: string
  progress: number
  details: string
}

interface SetupScreenProps {
  onSetupComplete: () => void
}

export function SetupScreen({ onSetupComplete }: SetupScreenProps) {
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    // Listen for setup progress
    if (window.electronAPI) {
      const unsubscribe = window.electronAPI.onSetupProgress((data) => {
        setProgress(data)
        if (data.stage === 'complete') {
          setIsComplete(true)
          setIsInstalling(false)
        }
      })
      return () => unsubscribe()
    }
  }, [])

  const handleInstall = async () => {
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

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Setup Complete!</CardTitle>
            <CardDescription>
              FFmpeg has been installed successfully.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onSetupComplete} className="w-full">
              Start Using App
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>First-Time Setup</CardTitle>
          <CardDescription>
            Book to MP3 needs to download a component to work.<br/>
            This is a one-time setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isInstalling && !error && (
            <div className="text-center space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>The following will be downloaded:</p>
                <p className="font-medium text-foreground">FFmpeg audio converter — 101 MB</p>
                
                <p className="text-xs text-muted-foreground/70">
                  TTS engines and voice packs will be installed when you select them.
                </p>
              </div>

              <Button onClick={handleInstall} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Download & Install
              </Button>
            </div>
          )}

          {isInstalling && progress && (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Installing FFmpeg...
                </span>
              </div>

              <Progress value={progress.progress} className="h-2" />

              <p className="text-xs text-muted-foreground">
                {progress.details}
              </p>
            </div>
          )}

          {error && (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Installation Failed</span>
              </div>

              <p className="text-xs text-muted-foreground">{error}</p>

              <Button onClick={handleInstall} variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                Retry Installation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
