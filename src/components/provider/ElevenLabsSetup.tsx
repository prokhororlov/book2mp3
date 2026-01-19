import { useState } from 'react'
import { Key, Pencil, Eye, EyeOff, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/i18n'

interface ElevenLabsSetupProps {
  apiKey: string
  hasApiKey: boolean
  onSaveApiKey: (key: string) => void
}

export function ElevenLabsSetup({
  apiKey,
  hasApiKey,
  onSaveApiKey,
}: ElevenLabsSetupProps) {
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [tempKey, setTempKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleSave = () => {
    if (tempKey.trim()) {
      onSaveApiKey(tempKey.trim())
      setIsEditing(false)
      setTempKey('')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setTempKey('')
  }

  const handleStartEdit = () => {
    setTempKey(apiKey)
    setIsEditing(true)
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm flex items-center gap-1.5">
        <Key className="h-3.5 w-3.5" />
        {t.providers.elevenlabs.apiKeyLabel}
      </Label>
      {!isEditing && hasApiKey ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-9 px-3 py-2 border rounded-md bg-muted text-sm text-muted-foreground flex items-center">
            {showKey ? apiKey : '••••••••••••••••••••'}
          </div>
          <Button
            variant="ghost-icon"
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost-icon"
            size="icon"
            className="h-9 w-9"
            onClick={handleStartEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={tempKey}
            onChange={(e) => setTempKey(e.target.value)}
            placeholder={t.providers.elevenlabs.apiKeyPlaceholder}
            className="flex-1 h-9 px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            variant="ghost-icon"
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="default"
            size="icon"
            className="h-9 w-9"
            disabled={!tempKey.trim()}
            onClick={handleSave}
          >
            <Check className="h-4 w-4" />
          </Button>
          {hasApiKey && (
            <Button
              variant="ghost-icon"
              size="icon"
              className="h-9 w-9"
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t.providers.elevenlabs.getApiKey}{' '}
        <a
          href="https://elevenlabs.io"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground cursor-pointer"
        >
          elevenlabs.io
        </a>
      </p>
    </div>
  )
}
