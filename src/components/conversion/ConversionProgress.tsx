import { Volume2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/i18n'

interface ConversionProgressProps {
  progress: number
  status: string
}

export function ConversionProgress({ progress, status }: ConversionProgressProps) {
  const { t } = useI18n()
  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm font-medium">{t.conversion.converting}</span>
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{status.split(' | ')[1] || status}</span>
          {status.includes(' | ') && <span>{status.split(' | ')[0]}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
