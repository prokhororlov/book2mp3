import { useState, useEffect, useCallback } from 'react'
import type { UpdateInfo } from '@/types'

export function useUpdates() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false)
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0)

  const checkForUpdates = useCallback(async (showModal = true) => {
    if (!window.electronAPI || isCheckingUpdate) return
    setIsCheckingUpdate(true)
    try {
      const result = await window.electronAPI.checkForUpdates()
      setUpdateInfo(result)
      if (result.hasUpdate && showModal) {
        setShowUpdateModal(true)
      }
    } catch (err) {
      console.error('Failed to check for updates:', err)
    } finally {
      setIsCheckingUpdate(false)
    }
  }, [isCheckingUpdate])

  // Check for updates on mount (silently)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const downloadAndInstallUpdate = useCallback(async () => {
    if (!window.electronAPI || !updateInfo?.releaseInfo || isDownloadingUpdate) return
    setIsDownloadingUpdate(true)
    setUpdateDownloadProgress(0)

    const unsubscribe = window.electronAPI.onUpdateDownloadProgress((data) => {
      setUpdateDownloadProgress(data.percent)
    })

    try {
      const result = await window.electronAPI.downloadUpdate(updateInfo.releaseInfo)
      if (result.success && result.installerPath) {
        await window.electronAPI.installUpdate(result.installerPath)
      } else {
        throw new Error(result.error || 'Failed to download update')
      }
    } catch (err) {
      console.error('Update download failed:', err)
    } finally {
      unsubscribe()
      setIsDownloadingUpdate(false)
    }
  }, [updateInfo, isDownloadingUpdate])

  return {
    updateInfo,
    isCheckingUpdate,
    showUpdateModal,
    setShowUpdateModal,
    isDownloadingUpdate,
    updateDownloadProgress,
    checkForUpdates,
    downloadAndInstallUpdate,
  }
}
