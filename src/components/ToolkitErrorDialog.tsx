import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Download, Cpu, RefreshCw, X } from 'lucide-react'
import type { ToolkitError } from '@/fsm/types'
import { useI18n } from '@/i18n'

interface ToolkitErrorDialogProps {
  open: boolean
  error: ToolkitError | null
  requiresRestart?: boolean
  onDownload?: () => void
  onUseCpu?: () => void
  onRetry?: () => void
  onDismiss: () => void
}

export function ToolkitErrorDialog({
  open,
  error,
  requiresRestart = false,
  onDownload,
  onUseCpu,
  onRetry,
  onDismiss
}: ToolkitErrorDialogProps) {
  const { t } = useI18n()

  if (!error) return null

  const toolkitName = error.toolkit === 'cuda' ? 'NVIDIA CUDA Toolkit' : 'Intel oneAPI Base Toolkit'

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <DialogTitle className="text-left">
              {error.title || `${t.toolkit.required}: ${toolkitName}`}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <DialogDescription className="text-left select-text">
            {error.description || (
              requiresRestart
                ? `${toolkitName} ${t.toolkit.restartRequired}`
                : `${t.reinstall.cudaRequired}`
            )}
          </DialogDescription>

          {error.steps && error.steps.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">{t.toolkit.installSteps}</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside select-text">
                {error.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {requiresRestart && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {t.toolkit.afterInstall}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {error.downloadUrl && onDownload && (
            <Button
              variant="default"
              onClick={() => {
                window.electronAPI?.openExternal(error.downloadUrl!)
                onDownload()
              }}
              className="w-full sm:w-auto gap-2"
            >
              <Download className="h-4 w-4" />
              {error.toolkit === 'cuda' ? t.toolkit.downloadCuda : t.toolkit.downloadOneApi}
            </Button>
          )}

          {requiresRestart && onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              className="w-full sm:w-auto gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {t.common.retry}
            </Button>
          )}

          {onUseCpu && (
            <Button
              variant="outline"
              onClick={onUseCpu}
              className="w-full sm:w-auto gap-2"
            >
              <Cpu className="h-4 w-4" />
              {t.toolkit.useCpu}
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={onDismiss}
            className="w-full sm:w-auto gap-2"
          >
            <X className="h-4 w-4" />
            {t.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
