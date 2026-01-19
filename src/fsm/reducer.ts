import type {
  FSMContext,
  AppAction,
  AppState,
  ReadyState,
  OfflineState,
  SetupInstallingState,
  InstallingProviderState,
  ReinstallingAcceleratorState,
  ToolkitError
} from './types'

/**
 * Helper to create a READY state from context
 */
function createReadyState(context: FSMContext, isOnline: boolean): ReadyState {
  return {
    type: 'READY',
    dependencies: context.dependencies!,
    accelerators: context.accelerators!,
    currentAccelerators: context.currentAccelerators,
    isOnline
  }
}

/**
 * Helper to create an OFFLINE state from context
 */
function createOfflineState(context: FSMContext): OfflineState {
  return {
    type: 'OFFLINE',
    dependencies: context.dependencies!,
    accelerators: context.accelerators!,
    currentAccelerators: context.currentAccelerators
  }
}

/**
 * Check if toolkit error
 */
function isToolkitError(error: unknown): error is ToolkitError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as ToolkitError).type === 'toolkit_error'
  )
}

/**
 * FSM Reducer - manages state transitions based on actions
 */
export function appReducer(context: FSMContext, action: AppAction): FSMContext {
  const { state } = context

  switch (action.type) {
    // ========== STARTUP ==========
    case 'STARTUP_CHECK_COMPLETE': {
      if (action.needsSetup) {
        return {
          ...context,
          state: {
            type: 'SETUP_REQUIRED',
            missingDependencies: { ffmpeg: true }
          }
        }
      }

      const isOnline = action.isOnline ?? true
      const newContext: FSMContext = {
        ...context,
        dependencies: action.dependencies || null,
        accelerators: action.accelerators || null,
        currentAccelerators: action.currentAccelerators || context.currentAccelerators,
        isOnline
      }

      if (!isOnline) {
        return {
          ...newContext,
          state: createOfflineState(newContext)
        }
      }

      return {
        ...newContext,
        state: createReadyState(newContext, true)
      }
    }

    // ========== SETUP FLOW ==========
    case 'START_SETUP': {
      if (state.type !== 'SETUP_REQUIRED' && state.type !== 'SETUP_ERROR') {
        console.warn('Invalid transition: START_SETUP from', state.type)
        return context
      }
      return {
        ...context,
        state: {
          type: 'SETUP_INSTALLING',
          progress: 0,
          details: 'Начало установки...',
          stage: 'downloading'
        }
      }
    }

    case 'SETUP_PROGRESS': {
      if (state.type !== 'SETUP_INSTALLING') return context
      // Never decrease progress visually (prevents jumpy progress bar)
      const newProgress = Math.max(state.progress, action.progress)
      return {
        ...context,
        state: {
          ...state,
          progress: newProgress,
          details: action.details,
          stage: action.stage
        }
      }
    }

    case 'SETUP_SUCCESS': {
      if (state.type !== 'SETUP_INSTALLING') return context
      return {
        ...context,
        state: { type: 'SETUP_COMPLETE' }
      }
    }

    case 'SETUP_FAILED': {
      if (state.type !== 'SETUP_INSTALLING') return context
      return {
        ...context,
        state: {
          type: 'SETUP_ERROR',
          error: action.error,
          canRetry: action.error.type !== 'permission_error'
        },
        errorHistory: [...context.errorHistory, action.error]
      }
    }

    case 'RETRY_SETUP': {
      if (state.type !== 'SETUP_ERROR') return context
      return {
        ...context,
        state: {
          type: 'SETUP_REQUIRED',
          missingDependencies: { ffmpeg: true }
        }
      }
    }

    case 'COMPLETE_SETUP': {
      if (state.type !== 'SETUP_COMPLETE') return context
      const newContext: FSMContext = {
        ...context,
        dependencies: action.dependencies,
        accelerators: action.accelerators,
        currentAccelerators: action.currentAccelerators
      }
      return {
        ...newContext,
        state: createReadyState(newContext, context.isOnline)
      }
    }

    // ========== CONVERSION FLOW ==========
    case 'START_CONVERSION': {
      if (state.type !== 'READY' && state.type !== 'OFFLINE') return context
      return {
        ...context,
        lastConversionParams: { outputPath: action.outputPath },
        state: {
          type: 'CONVERTING',
          progress: 0,
          status: 'Начало конвертации...',
          canCancel: true,
          outputPath: action.outputPath
        }
      }
    }

    case 'CONVERSION_PROGRESS': {
      if (state.type !== 'CONVERTING') return context
      // Never decrease progress visually (prevents jumpy progress bar)
      const newProgress = Math.max(state.progress, action.progress)
      return {
        ...context,
        state: {
          ...state,
          progress: newProgress,
          status: action.status
        }
      }
    }

    case 'CONVERSION_SUCCESS': {
      if (state.type !== 'CONVERTING') return context
      return {
        ...context,
        lastConversionParams: undefined,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    case 'CONVERSION_FAILED': {
      if (state.type !== 'CONVERTING') return context
      return {
        ...context,
        state: {
          type: 'CONVERSION_ERROR',
          error: action.error,
          canRetry: !action.error.isInstallationRelated,
          offerReinstall: action.error.isInstallationRelated
        },
        errorHistory: [...context.errorHistory, action.error]
      }
    }

    case 'CANCEL_CONVERSION': {
      if (state.type !== 'CONVERTING') return context
      return {
        ...context,
        lastConversionParams: undefined,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    case 'RETRY_CONVERSION': {
      if (state.type !== 'CONVERSION_ERROR') return context
      if (!context.lastConversionParams) {
        return {
          ...context,
          state: context.isOnline
            ? createReadyState(context, true)
            : createOfflineState(context)
        }
      }
      return {
        ...context,
        state: {
          type: 'CONVERTING',
          progress: 0,
          status: 'Повторная конвертация...',
          canCancel: true,
          outputPath: context.lastConversionParams.outputPath
        }
      }
    }

    case 'DISMISS_CONVERSION_ERROR': {
      if (state.type !== 'CONVERSION_ERROR') return context
      return {
        ...context,
        lastConversionParams: undefined,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    // ========== PROVIDER INSTALLATION ==========
    case 'START_PROVIDER_INSTALL': {
      if (state.type !== 'READY' && state.type !== 'PROVIDER_ERROR' && state.type !== 'OFFLINE') {
        return context
      }
      return {
        ...context,
        state: {
          type: 'INSTALLING_PROVIDER',
          provider: action.provider,
          accelerator: action.accelerator,
          progress: 0,
          details: 'Начало установки...'
        }
      }
    }

    case 'PROVIDER_INSTALL_PROGRESS': {
      if (state.type !== 'INSTALLING_PROVIDER') return context
      // Never decrease progress visually (prevents jumpy progress bar)
      const newProgress = Math.max(state.progress, action.progress)
      return {
        ...context,
        state: {
          ...state,
          progress: newProgress,
          details: action.details
        }
      }
    }

    case 'PROVIDER_INSTALL_SUCCESS': {
      if (state.type !== 'INSTALLING_PROVIDER') return context
      const newContext: FSMContext = {
        ...context,
        dependencies: action.dependencies,
        accelerators: action.accelerators,
        currentAccelerators: action.currentAccelerators
      }
      return {
        ...newContext,
        state: context.isOnline
          ? createReadyState(newContext, true)
          : createOfflineState(newContext)
      }
    }

    case 'PROVIDER_INSTALL_FAILED': {
      if (state.type !== 'INSTALLING_PROVIDER') return context
      const installingState = state as InstallingProviderState
      return {
        ...context,
        state: {
          type: 'PROVIDER_ERROR',
          provider: installingState.provider,
          error: action.error,
          canRetry: true,
          offerSetupScreen: action.error.type === 'installation_error'
        },
        errorHistory: [...context.errorHistory, action.error]
      }
    }

    case 'RETRY_PROVIDER_INSTALL': {
      if (state.type !== 'PROVIDER_ERROR') return context
      return {
        ...context,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    case 'DISMISS_PROVIDER_ERROR': {
      if (state.type !== 'PROVIDER_ERROR') return context
      return {
        ...context,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    case 'GO_TO_SETUP': {
      if (state.type !== 'PROVIDER_ERROR' && state.type !== 'CONVERSION_ERROR') {
        return context
      }
      return {
        ...context,
        state: {
          type: 'SETUP_REQUIRED',
          missingDependencies: { ffmpeg: false }
        }
      }
    }

    // ========== ACCELERATOR REINSTALL ==========
    case 'START_ACCELERATOR_REINSTALL': {
      if (state.type !== 'READY' && state.type !== 'OFFLINE') return context
      return {
        ...context,
        state: {
          type: 'REINSTALLING_ACCELERATOR',
          engine: action.engine,
          targetAccelerator: action.accelerator,
          progress: { stage: 'installing', message: 'Подготовка к установке...' }
        }
      }
    }

    case 'REINSTALL_PROGRESS': {
      if (state.type !== 'REINSTALLING_ACCELERATOR') return context
      return {
        ...context,
        state: {
          ...state,
          progress: action.progress
        }
      }
    }

    case 'REINSTALL_SUCCESS': {
      if (state.type !== 'REINSTALLING_ACCELERATOR') return context
      const newContext: FSMContext = {
        ...context,
        currentAccelerators: action.currentAccelerators
      }
      return {
        ...newContext,
        state: context.isOnline
          ? createReadyState(newContext, true)
          : createOfflineState(newContext)
      }
    }

    case 'REINSTALL_FAILED': {
      if (state.type !== 'REINSTALLING_ACCELERATOR') return context
      const reinstallState = state as ReinstallingAcceleratorState

      // Check if it's a toolkit error
      if (isToolkitError(action.error)) {
        return {
          ...context,
          state: {
            type: 'TOOLKIT_ERROR',
            toolkit: action.error.toolkit,
            error: action.error,
            downloadUrl: action.error.downloadUrl || '',
            requiresRestart: action.error.subtype === 'toolkit_restart_required'
          },
          errorHistory: [...context.errorHistory, action.error]
        }
      }

      // Regular provider error
      return {
        ...context,
        state: {
          type: 'PROVIDER_ERROR',
          provider: reinstallState.engine,
          error: action.error,
          canRetry: true,
          offerSetupScreen: true
        },
        errorHistory: [...context.errorHistory, action.error]
      }
    }

    case 'TOOLKIT_ERROR_OCCURRED': {
      if (state.type !== 'REINSTALLING_ACCELERATOR') return context
      return {
        ...context,
        state: {
          type: 'TOOLKIT_ERROR',
          toolkit: action.error.toolkit,
          error: action.error,
          downloadUrl: action.error.downloadUrl || '',
          requiresRestart: action.error.subtype === 'toolkit_restart_required'
        },
        errorHistory: [...context.errorHistory, action.error]
      }
    }

    case 'DISMISS_TOOLKIT_ERROR': {
      if (state.type !== 'TOOLKIT_ERROR') return context
      return {
        ...context,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    case 'RETRY_AFTER_TOOLKIT': {
      if (state.type !== 'TOOLKIT_ERROR') return context
      // Go back to READY state - user should try reinstall again
      return {
        ...context,
        state: context.isOnline
          ? createReadyState(context, true)
          : createOfflineState(context)
      }
    }

    case 'USE_CPU_FALLBACK': {
      if (state.type !== 'TOOLKIT_ERROR') return context
      // Start CPU reinstall
      return {
        ...context,
        state: {
          type: 'REINSTALLING_ACCELERATOR',
          engine: action.engine,
          targetAccelerator: 'cpu',
          progress: { stage: 'installing', message: 'Переключение на CPU...' }
        }
      }
    }

    // ========== NETWORK ==========
    case 'NETWORK_ONLINE': {
      const newContext: FSMContext = { ...context, isOnline: true }

      // If we're in OFFLINE state, transition to READY
      if (state.type === 'OFFLINE') {
        return {
          ...newContext,
          state: createReadyState(newContext, true)
        }
      }

      return newContext
    }

    case 'NETWORK_OFFLINE': {
      const newContext: FSMContext = { ...context, isOnline: false }

      // If we're in READY state, transition to OFFLINE
      if (state.type === 'READY') {
        return {
          ...newContext,
          state: createOfflineState(newContext)
        }
      }

      return newContext
    }

    // ========== REFRESH ==========
    case 'REFRESH_DEPENDENCIES': {
      const newContext: FSMContext = {
        ...context,
        dependencies: action.dependencies
      }

      // Update state if we're in READY or OFFLINE
      if (state.type === 'READY') {
        return {
          ...newContext,
          state: { ...state, dependencies: action.dependencies }
        }
      }
      if (state.type === 'OFFLINE') {
        return {
          ...newContext,
          state: { ...state, dependencies: action.dependencies }
        }
      }

      return newContext
    }

    case 'REFRESH_ACCELERATORS': {
      const newContext: FSMContext = {
        ...context,
        accelerators: action.accelerators,
        currentAccelerators: action.currentAccelerators
      }

      // Update state if we're in READY or OFFLINE
      if (state.type === 'READY') {
        return {
          ...newContext,
          state: {
            ...state,
            accelerators: action.accelerators,
            currentAccelerators: action.currentAccelerators
          }
        }
      }
      if (state.type === 'OFFLINE') {
        return {
          ...newContext,
          state: {
            ...state,
            accelerators: action.accelerators,
            currentAccelerators: action.currentAccelerators
          }
        }
      }

      return newContext
    }

    default:
      return context
  }
}
