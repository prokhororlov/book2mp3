import { ipcMain } from 'electron'
import { getMainWindow } from '../window'

export function registerWindowControlsHandlers() {
  ipcMain.handle('window-minimize', () => {
    const mainWindow = getMainWindow()
    mainWindow?.minimize()
  })

  ipcMain.handle('window-maximize', () => {
    const mainWindow = getMainWindow()
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window-close', () => {
    const mainWindow = getMainWindow()
    mainWindow?.close()
  })

  ipcMain.handle('window-is-maximized', () => {
    const mainWindow = getMainWindow()
    return mainWindow?.isMaximized() ?? false
  })
}
