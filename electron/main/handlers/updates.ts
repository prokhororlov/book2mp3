import { ipcMain } from 'electron'
import { checkForUpdates, downloadUpdate, installUpdate, ReleaseInfo, DownloadProgress } from '../../services/updater'

export function registerUpdatesHandlers() {
  ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates()
  })

  ipcMain.handle('download-update', async (event, releaseInfo: ReleaseInfo) => {
    try {
      const installerPath = await downloadUpdate(releaseInfo, (progress: DownloadProgress) => {
        event.sender.send('update-download-progress', progress)
      })
      return { success: true, installerPath }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('install-update', async (_event, installerPath: string) => {
    try {
      await installUpdate(installerPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
