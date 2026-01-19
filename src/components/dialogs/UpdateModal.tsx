import { RefreshCw, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { UpdateInfo } from '@/types'
import { useI18n } from '@/i18n'

interface UpdateModalProps {
  updateInfo: UpdateInfo
  isDownloading: boolean
  downloadProgress: number
  onDownload: () => void
  onClose: () => void
}

export function UpdateModal({
  updateInfo,
  isDownloading,
  downloadProgress,
  onDownload,
  onClose,
}: UpdateModalProps) {
  const { t } = useI18n()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            {updateInfo.hasUpdate ? t.updates.available : t.updates.noUpdates}
          </CardTitle>
          <CardDescription>
            {updateInfo.hasUpdate
              ? t.updates.versionAvailable.replace('{version}', updateInfo.latestVersion || '').replace('{current}', updateInfo.currentVersion || '')
              : t.updates.latestVersion.replace('{version}', updateInfo.currentVersion || '')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {updateInfo.hasUpdate && updateInfo.releaseInfo && (
            <>
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={() =>
                  window.open(
                    `https://github.com/prokhororlov/book2mp3/compare/v${updateInfo.currentVersion}...v${updateInfo.latestVersion}`,
                    '_blank'
                  )
                }
              >
                {t.updates.fullChangelog}
              </Button>
              {isDownloading && (
                <div className="space-y-2">
                  <Progress value={downloadProgress} />
                  <p className="text-sm text-muted-foreground text-center">
                    {t.updates.downloading} {downloadProgress}%
                  </p>
                </div>
              )}
            </>
          )}
          {updateInfo.error && (
            <p className="text-sm text-destructive select-text">{updateInfo.error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={isDownloading}>
              {updateInfo.hasUpdate ? t.common.later : t.common.close}
            </Button>
            {updateInfo.hasUpdate && updateInfo.releaseInfo && (
              <Button onClick={onDownload} disabled={isDownloading}>
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t.updates.downloading}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    {t.updates.downloadAndInstall}
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
