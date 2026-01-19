import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { parseBook } from '../../services/parser'
import { getMainWindow } from '../window'

export function registerFileHandlers() {
  ipcMain.handle('open-file-dialog', async () => {
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Books', extensions: ['fb2', 'epub', 'txt'] },
        { name: 'FB2', extensions: ['fb2'] },
        { name: 'EPUB', extensions: ['epub'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('save-file-dialog', async (_event, defaultName: string) => {
    const mainWindow = getMainWindow()
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [
        { name: 'MP3 Audio', extensions: ['mp3'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    return result.filePath
  })

  ipcMain.handle('parse-book', async (_event, filePath: string) => {
    try {
      const content = await parseBook(filePath)
      return { success: true, content }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('get-file-info', async (_event, filePath: string) => {
    try {
      const stats = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const name = path.basename(filePath, path.extname(filePath))

      return {
        success: true,
        info: {
          name,
          extension: ext,
          size: stats.size,
          path: filePath,
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
