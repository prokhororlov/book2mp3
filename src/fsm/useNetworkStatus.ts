import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to track network connectivity status
 * Uses navigator.onLine and window events for real-time updates
 */
export function useNetworkStatus(): {
  isOnline: boolean
  checkOnline: () => boolean
} {
  const [isOnline, setIsOnline] = useState(() => {
    // Initial state from navigator.onLine
    // In Electron, this may not be accurate, so we default to true
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine
    }
    return true
  })

  const checkOnline = useCallback((): boolean => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine
    }
    return true
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    // Listen to browser/Electron online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Also set up periodic check for Electron reliability
    // navigator.onLine can be unreliable in Electron
    const intervalId = setInterval(() => {
      const currentStatus = checkOnline()
      setIsOnline(prev => {
        if (prev !== currentStatus) {
          return currentStatus
        }
        return prev
      })
    }, 30000) // Check every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
    }
  }, [checkOnline])

  return { isOnline, checkOnline }
}
