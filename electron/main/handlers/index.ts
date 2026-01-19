import { registerFileHandlers } from './file'
import { registerTTSHandlers } from './tts'
import { registerSetupHandlers } from './setup'
import { registerSettingsHandlers } from './settings'
import { registerUpdatesHandlers } from './updates'
import { registerWindowControlsHandlers } from './window-controls'

export function registerHandlers() {
  registerFileHandlers()
  registerTTSHandlers()
  registerSetupHandlers()
  registerSettingsHandlers()
  registerUpdatesHandlers()
  registerWindowControlsHandlers()
}
