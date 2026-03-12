import ClipCard from './ClipCard'
import type { ClipWithVotes } from '../../types/clipVoting'

interface ClipGridProps {
  clips: ClipWithVotes[]
  userVoteClipId: string | null
  canVote: boolean
  showVoteBtn: boolean
  showResults: boolean
  onVote: (clipId: string) => void
}

export default function ClipGrid({
  clips,
  userVoteClipId,
  canVote,
  showVoteBtn,
  showResults,
  onVote,
}: ClipGridProps) {
  return (
    <div className="clip-grid">
      {clips.map((clip, i) => (
        <ClipCard
          key={clip.clip_id}
          clip={clip}
          rank={showResults ? i + 1 : undefined}
          isVoted={clip.clip_id === userVoteClipId}
          canVote={canVote}
          showVoteBtn={showVoteBtn}
          showResults={showResults}
          onVote={() => onVote(clip.clip_id)}
        />
      ))}
    </div>
  )
}

