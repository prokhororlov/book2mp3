import { Cpu, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

interface PiperSetupProps {
  isInstalling: boolean
  installProgress: string
  installPercent: number
  onInstall: () => void
}

export function PiperSetup({
  isInstalling,
  installProgress,
  installPercent,
  onInstall,
}: PiperSetupProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-3 p-4 border rounded-md bg-muted/50">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{t.providers.piper.setupRequired}</span>
      </div>
      {isInstalling ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {installProgress || t.setup.installing}
              </span>
              <span className="font-medium">{installPercent}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${installPercent}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t.common.pleaseWait}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{t.providers.piper.forPiperWork}</p>
          </div>
          <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded space-y-1">
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="font-medium">
                {t.providers.piper.voicesSeparately}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t.providers.piper.initialDownload}
            </span>
            <Button variant="default" size="sm" onClick={onInstall}>
              <Download className="h-4 w-4 mr-2" />
              {t.common.install} Piper
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
