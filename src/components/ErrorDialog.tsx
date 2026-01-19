import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, RefreshCw, X, Settings } from 'lucide-react'
import type { ConversionError, ProviderError, SetupError } from '@/fsm/types'
import { getErrorMessage, getRecoverySuggestion } from '@/fsm/errorClassifier'
import { useI18n } from '@/i18n'

interface ErrorDialogProps {
  open: boolean
  error: ConversionError | ProviderError | SetupError | null
  canRetry?: boolean
  offerReinstall?: boolean
  onRetry?: () => void
  onReinstall?: () => void
  onDismiss: () => void
}

export function ErrorDialog({
  open,
  error,
  canRetry = false,
  offerReinstall = false,
  onRetry,
  onReinstall,
  onDismiss
}: ErrorDialogProps) {
  const { t } = useI18n()

  if (!error) return null

  const message = getErrorMessage(error)
  const suggestion = getRecoverySuggestion(error)

  const getErrorTitle = () => {
    switch (error.type) {
      case 'installation_error': return t.errors.setup
      case 'generation_error': return t.errors.generation
      case 'api_error': return t.errors.api
      case 'network_error': return t.errors.network
      case 'permission_error': return t.errors.access
      case 'disk_error': return t.errors.disk
      default: return t.common.error
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-left">
              {getErrorTitle()}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <DialogDescription className="text-left">
            {error.message}
          </DialogDescription>

          {error.details && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                {t.common.details}
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                {error.details}
              </pre>
            </details>
          )}

          <p className="text-sm text-muted-foreground">
            {suggestion}
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {offerReinstall && onReinstall && (
            <Button
              variant="default"
              onClick={onReinstall}
              className="w-full sm:w-auto gap-2"
            >
              <Settings className="h-4 w-4" />
              {t.common.install}
            </Button>
          )}

          {canRetry && onRetry && (
            <Button
              variant={offerReinstall ? 'outline' : 'default'}
              onClick={onRetry}
              className="w-full sm:w-auto gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {t.common.retry}
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
