import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import ClipEmbed from './ClipEmbed'
import type { ClipWithVotes } from '../../types/clipVoting'

interface ClipCardProps {
  clip: ClipWithVotes
  rank?: number
  isVoted: boolean
  canVote: boolean
  showVoteBtn: boolean
  showResults: boolean
  onVote: () => void
}

export default function ClipCard({
  clip,
  rank,
  isVoted,
  canVote,
  showVoteBtn,
  showResults,
  onVote,
}: ClipCardProps) {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleVoteClick = () => {
    setShowConfirm(true)
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    onVote()
  }

  const handleCancel = () => {
    setShowConfirm(false)
  }

  return (
    <div className={`clip-card${isVoted ? ' clip-card--voted' : ''}`}>
      <ClipEmbed twitchClipId={clip.twitch_clip_id} />

      <div className="clip-card__body">
        <div className="clip-card__title" title={clip.title}>
          {clip.title}
        </div>
        <div className="clip-card__creator">{clip.creator_name}</div>
        <div className="clip-card__meta">
          {rank != null && <span className="clip-card__rank">#{rank}</span>}
          {showResults && (
            <span className="clip-card__votes">
              {clip.vote_count} {t('clipVoting.votes')}
            </span>
          )}
          <span>{clip.view_count} views</span>
        </div>
      </div>

      {showVoteBtn && (
        <>
          <button
            className={`clip-card__vote-btn${isVoted ? ' clip-card__vote-btn--active' : ''}`}
            disabled={!canVote && !isVoted}
            onClick={handleVoteClick}
          >
            {isVoted ? `✓ ${t('clipVoting.voted')}` : t('clipVoting.vote')}
          </button>
          {showConfirm && (
            <div className="clip-card__confirm-modal">
              <div className="clip-card__confirm-modal-content">
                <div className="clip-card__confirm-modal-text">
                  {t('clipVoting.confirmVote')}
                </div>
                <div className="clip-card__confirm-modal-actions">
                  <button className="clip-card__confirm-btn" onClick={handleConfirm}>
                    {t('clipVoting.confirm')}
                  </button>
                  <button className="clip-card__cancel-btn" onClick={handleCancel}>
                    {t('clipVoting.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

