# VoiceCraft - Instructions for Claude

## About the Project

VoiceCraft is an Electron application for converting books (FB2, EPUB, TXT) to audiobooks using various TTS engines (RHVoice, Piper, Silero, Coqui, ElevenLabs).

## Project Structure

```
VoiceCraft/
├── electron/                 # Main process
│   ├── main.ts              # Entry point
│   ├── preload.ts           # IPC bridge
│   ├── main/
│   │   ├── window.ts        # Window management
│   │   └── handlers/        # IPC handlers
│   └── services/
│       ├── setup/           # Dependency installation
│       └── tts/             # Speech synthesis
├── src/                     # Renderer (React)
│   ├── App.tsx              # Main component
│   ├── i18n/                # Internationalization
│   │   ├── types.ts         # Translation types
│   │   ├── en.ts            # English translations
│   │   ├── ru.ts            # Russian translations
│   │   ├── index.ts         # i18n exports & context
│   │   └── I18nProvider.tsx # React context provider
│   └── components/          # UI components
└── docs/diagrams/           # Mermaid diagrams
```

## Key Files

- `electron/main.ts` - app initialization, orphan process cleanup
- `electron/services/setup/` - FFmpeg, Python, Silero, Coqui, Piper installation
- `electron/services/tts/` - text-to-speech conversion
- `src/App.tsx` - main UI, needsSetup check
- `src/components/SetupScreen.tsx` - initial setup screen
- `src/i18n/` - internationalization system

---

## Internationalization (i18n) Rules

### IMPORTANT: All UI text must use the i18n system

1. **Never hardcode user-facing text** - Always use `t.` translations
2. **Import useI18n hook**: `import { useI18n } from '@/i18n'`
3. **Get translations**: `const { t } = useI18n()`
4. **Use translations**: `{t.common.cancel}` instead of `"Cancel"`

### Adding New Translations

When adding new UI text:

1. Add the key to `src/i18n/types.ts` in the appropriate section
2. Add English translation to `src/i18n/en.ts`
3. Add Russian translation to `src/i18n/ru.ts`
4. Use the key in your component via `t.section.key`

### Translation Structure

```typescript
// In types.ts
interface Translations {
  common: {
    cancel: string;
    // Add new common keys here
  };
  // Add new sections here
}

// In en.ts
export const en: Translations = {
  common: {
    cancel: 'Cancel',
  },
};

// In ru.ts
export const ru: Translations = {
  common: {
    cancel: 'Отмена',
  },
};
```

### Exceptions

- **TTS preview text** in `src/utils/index.ts` - Returns text in the TTS target language (Russian/English) for voice preview
- **Technical error messages** from `electron/` services - Can remain in English as they are primarily for debugging
- **Console logs** - Can remain in English

---

## Diagram Update Rules

### When to Update Diagrams

Diagrams in `docs/diagrams/` **MUST** be updated when changing:

1. **setup-flow.mmd** - when modifying:
   - `electron/services/setup/` (any file)
   - `electron/main/handlers/setup.ts`
   - `src/components/SetupScreen.tsx`
   - Dependency check logic (`checkDependencies`)
   - Component installation logic (`installSilero`, `installCoqui`, `installPiper`, `installFFmpeg`)

2. **tts-conversion.mmd** - when modifying:
   - `electron/services/tts/` (any file)
   - `electron/main/handlers/tts.ts`
   - Conversion logic (`convertToSpeech`)
   - Adding/removing TTS providers
   - Voice preview logic (`previewVoice`)

3. **gpu-reinstall.mmd** - when modifying:
   - `electron/services/setup/gpu.ts`
   - `reinstallWithAccelerator` logic
   - New GPU support (AMD, Apple Silicon)
   - GPU detection logic

4. **error-handling.mmd** - when modifying:
   - Error handling in any scenario
   - Adding new error types
   - Recovery/retry logic

5. **architecture.mmd** - when modifying:
   - File/folder structure
   - Adding new services
   - Changing component interactions

### How to Update Diagrams

1. Open the corresponding file in `docs/diagrams/`
2. Find the diagram that needs updating
3. Modify the Mermaid code to reflect the new logic
4. Ensure the diagram renders correctly (VS Code preview)

### Checklist Before Commit

When changing user scenarios:

- [ ] Updated corresponding diagram in `docs/diagrams/`
- [ ] Diagram reflects all branches (success, errors, cancellation)
- [ ] Added new states/transitions if needed
- [ ] All UI text uses i18n translations

---

## Technical Details

### TTS Providers

| Provider | Type | GPU | Quality | Languages |
|----------|------|-----|---------|-----------|
| RHVoice | Windows SAPI | - | Low | RU, EN |
| Piper | Binary | - | Medium | Many |
| Silero | Python Server | CUDA/XPU | High | RU |
| Coqui | Python Server | CUDA/XPU | High | Many |
| ElevenLabs | Cloud API | - | Excellent | Many |

### GPU Acceleration

- **NVIDIA**: Requires CUDA Toolkit 11.8+
- **Intel**: Requires Intel GPU Runtime for OpenCL

### Important Patterns

1. **IPC Communication**: Renderer → Preload → Main via `contextBridge`
2. **Progress Events**: Main sends progress via `webContents.send()`
3. **Cleanup**: On exit - `stopTTSServer()` + `cleanupTempAudio()`
4. **Orphan Processes**: `killOrphanTTSServers()` on startup
5. **i18n**: All UI components use `useI18n()` hook for translations

---

## Development Commands

```bash
# Dev mode
npm run dev

# Build
npm run build

# Run production
npm run start
```

---

## Component i18n Checklist

When creating or modifying UI components:

- [ ] Import `useI18n`: `import { useI18n } from '@/i18n'`
- [ ] Call hook: `const { t } = useI18n()`
- [ ] Replace all hardcoded strings with `t.section.key`
- [ ] Add missing keys to `types.ts`, `en.ts`, and `ru.ts`
- [ ] Test in both English and Russian
