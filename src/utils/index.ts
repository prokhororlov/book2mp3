export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
    || 'audiobook'
}

export function detectLanguage(text: string): 'en' | 'ru-RU' {
  const sample = text.slice(0, 1000)
  let cyrillicCount = 0
  let latinCount = 0

  for (const char of sample) {
    if (/[а-яА-ЯёЁ]/.test(char)) {
      cyrillicCount++
    } else if (/[a-zA-Z]/.test(char)) {
      latinCount++
    }
  }

  return cyrillicCount > latinCount ? 'ru-RU' : 'en'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getDefaultPreviewText(lang: string): string {
  // Returns text in the target TTS language for voice preview
  return lang.startsWith('en')
    ? 'Hello! This is an example of how the voice sounds.'
    : 'Привет! Это пример того, как звучит голос.'
}

export function formatSpeedRate(rateValue: number): string {
  if (rateValue === 1.0) return '+0%'
  if (rateValue > 1.0) return `+${Math.round((rateValue - 1) * 100)}%`
  return `-${Math.round((1 - rateValue) * 100)}%`
}
