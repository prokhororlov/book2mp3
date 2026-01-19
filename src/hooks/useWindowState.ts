import { useState, useEffect } from 'react'

export function useWindowState() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.windowIsMaximized().then(setIsMaximized)

    const unsubscribe = window.electronAPI.onWindowMaximizedChange(setIsMaximized)
    return unsubscribe
  }, [])

  return { isMaximized }
}
