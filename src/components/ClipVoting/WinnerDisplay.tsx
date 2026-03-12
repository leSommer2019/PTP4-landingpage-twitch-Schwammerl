import { useTranslation } from 'react-i18next'
import ClipEmbed from './ClipEmbed'
import type { MonthlyWinner, YearlyWinner } from '../../types/clipVoting'

interface WinnerDisplayProps {
  type: 'monthly' | 'yearly'
  winner: MonthlyWinner | YearlyWinner
}

export default function WinnerDisplay({ type, winner }: WinnerDisplayProps) {
  const { t } = useTranslation()
  const clip = winner.clips
  if (!clip) return null

  const label =
    type === 'yearly'
      ? t('clipVoting.yearlyWinner', { year: (winner as YearlyWinner).year })
      : t('clipVoting.monthlyWinner', {
          month: (winner as MonthlyWinner).month,
          year: (winner as MonthlyWinner).year,
        })

  return (
    <div className="winner-display">
      <div className="winner-display__label">🏆 {label}</div>
      <div className="winner-display__title">{clip.title}</div>
      <ClipEmbed twitchClipId={clip.twitch_clip_id} />
    </div>
  )
}

