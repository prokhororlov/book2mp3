import { useState, useEffect, ReactNode } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

interface TitleBarProps {
  title?: string
  actions?: ReactNode
}

export function TitleBar({ title = 'VoiceCraft', actions }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Get initial maximized state
    window.electronAPI.windowIsMaximized().then(setIsMaximized)

    // Listen for maximize/unmaximize changes
    const unsubscribe = window.electronAPI.onWindowMaximizedChange(setIsMaximized)
    return unsubscribe
  }, [])

  const handleMinimize = () => {
    window.electronAPI.windowMinimize()
  }

  const handleMaximize = () => {
    window.electronAPI.windowMaximize()
  }

  const handleClose = () => {
    window.electronAPI.windowClose()
  }

  return (
    <div className="flex items-center justify-between h-10 bg-background border-b border-border select-none shrink-0">
      {/* Draggable area with title */}
      <div
        className="flex items-center gap-1.5 h-full px-3 flex-1"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img src="/icon-no-bg.svg" alt="VoiceCraft" className="w-8 h-8" />
        <span className="text-sm font-medium text-foreground/80">
          {title}
        </span>
        <span className="text-sm text-muted-foreground">
          - Convert books to audio
        </span>
      </div>

      {/* Actions and window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {actions && (
          <div className="flex items-center gap-1 px-2">
            {actions}
          </div>
        )}
        <button
          onClick={handleMinimize}
          className="h-full w-11 flex items-center justify-center hover:bg-muted/50 transition-colors outline-none focus:outline-none"
          title="Minimize"
          tabIndex={-1}
        >
          <Minus className="w-4 h-4 text-foreground/70" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-11 flex items-center justify-center hover:bg-muted/50 transition-colors outline-none focus:outline-none"
          title={isMaximized ? 'Restore' : 'Maximize'}
          tabIndex={-1}
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 text-foreground/70" />
          ) : (
            <Square className="w-3.5 h-3.5 text-foreground/70" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-full w-11 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors outline-none focus:outline-none"
          title="Close"
          tabIndex={-1}
        >
          <X className="w-4 h-4 text-foreground/70 hover:text-white" />
        </button>
      </div>
    </div>
  )
}
