import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VotingRound, VotingPhase } from '../../types/clipVoting'

interface VotingStatusProps {
  round: VotingRound
  phase: VotingPhase
}

function useCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!endsAt) return

    function tick() {
      const diff = new Date(endsAt!).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('00:00:00')
        return
      }
      const d = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      setRemaining(d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  return remaining
}

export default function VotingStatus({ round, phase }: VotingStatusProps) {
  const { t } = useTranslation()
  const countdown = useCountdown(round.ends_at)

  const badgeClass =
    round.status === 'active'
      ? 'voting-status__badge--active'
      : round.status === 'pending'
        ? 'voting-status__badge--pending'
        : 'voting-status__badge--completed'

  const phaseLabel = t(`clipVoting.phase.${phase}`)

  return (
    <div className="voting-status">
      <span className={`voting-status__badge ${badgeClass}`}>
        {round.status === 'active' && '● '}
        {phaseLabel}
      </span>

      <span className="voting-status__info">
        {round.status === 'active' && t('clipVoting.voteNow')}
        {round.status === 'pending' && t('clipVoting.roundPending')}
        {round.status === 'completed' && t('clipVoting.roundCompleted')}
      </span>

      {countdown && (
        <span className="voting-status__countdown">
          ⏱ {countdown}
        </span>
      )}
    </div>
  )
}


