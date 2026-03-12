import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { useClipVoting } from '../hooks/useClipVoting'
import LoginButton from '../components/LoginButton/LoginButton'
import SubPage from '../components/SubPage/SubPage'
import ClipGrid from '../components/ClipVoting/ClipGrid'
import VotingStatus from '../components/ClipVoting/VotingStatus'
import WinnerDisplay from '../components/ClipVoting/WinnerDisplay'
import '../components/ClipVoting/ClipVoting.css'

export default function ClipVotingPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const {
    phase,
    round,
    clips,
    userVote,
    monthlyWinner,
    yearlyWinner,
    loading,
    castVote,
  } = useClipVoting()

  const roundActive = round?.status === 'active'
  const canVote = !!user && roundActive && !userVote

  async function handleVote(clipId: string) {
    const { error } = await castVote(clipId)
    if (error) {
      showToast(t(`clipVoting.error.${error}`, { defaultValue: error }))
    } else {
      showToast(t('clipVoting.voteSuccess'))
    }
  }

  if (loading) {
    return (
      <SubPage>
        <h1>{t('clipVotingPage.title')}</h1>
        <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
          {t('clipVoting.loading')}
        </p>
      </SubPage>
    )
  }

  return (
    <SubPage>
      <h1>{t('clipVotingPage.title')}</h1>
      <p>{t('clipVotingPage.intro')}</p>

      {/* ── Yearly winner banner ── */}
      {yearlyWinner && (
        <WinnerDisplay type="yearly" winner={yearlyWinner} />
      )}

      {/* ── Monthly winner (between rounds) ── */}
      {monthlyWinner && !roundActive && (
        <WinnerDisplay type="monthly" winner={monthlyWinner} />
      )}

      {/* ── Voting status bar ── */}
      {round && <VotingStatus round={round} phase={phase} />}

      {/* ── Login hint ── */}
      {!user && roundActive && (
        <div className="clip-voting__login">
          <p>{t('clipVoting.loginToVote')}</p>
          <LoginButton />
        </div>
      )}

      {/* ── User vote hint ── */}
      {user && roundActive && (
        <p className="clip-voting__user">
          {userVote
            ? `✅ ${t('clipVoting.alreadyVoted')}`
            : t('clipVoting.voteHint')}
        </p>
      )}

      {/* ── Clip grid ── */}
      {clips.length > 0 ? (
        <ClipGrid
          clips={clips}
          userVoteClipId={userVote}
          canVote={canVote}
          showVoteBtn={roundActive}
          showResults={!roundActive || !!userVote}
          onVote={handleVote}
        />
      ) : (
        phase === 'no-round' && (
          <p className="clip-voting__hint">{t('clipVoting.noRound')}</p>
        )
      )}
    </SubPage>
  )
}

