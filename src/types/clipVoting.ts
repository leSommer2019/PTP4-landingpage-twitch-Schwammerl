/* ── Clip-Voting type definitions ── */

export type RoundType   = 'round1' | 'round2' | 'yearly'
export type RoundStatus = 'pending' | 'active' | 'completed'

export interface VotingRound {
  id: string
  type: RoundType
  status: RoundStatus
  year: number
  month: number | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface Clip {
  id: string
  twitch_clip_id: string
  title: string
  creator_name: string
  thumbnail_url: string | null
  embed_url: string
  clip_url: string | null
  view_count: number
  duration: number
  twitch_created_at: string | null
}

export interface ClipWithVotes {
  round_id: string
  clip_id: string
  twitch_clip_id: string
  title: string
  creator_name: string
  thumbnail_url: string | null
  embed_url: string
  clip_url: string | null
  view_count: number
  duration: number
  twitch_created_at: string | null
  vote_count: number
}

export interface MonthlyWinner {
  id: string
  year: number
  month: number
  clip_id: string
  created_at: string
  clips: Clip | null
}

export interface YearlyWinner {
  id: string
  year: number
  clip_id: string
  created_at: string
  clips: Clip | null
}

/**
 * Describes the current UI phase derived from DB state.
 *
 *  loading          – data not yet fetched
 *  no-round         – nothing in DB
 *  round1-active    – community votes on all clips
 *  round1-results   – round 1 done, round 2 pending, showing top-10
 *  round2-active    – voting on top 10
 *  round2-results   – monthly winner determined
 *  yearly-active    – voting on clip of the year
 *  yearly-results   – yearly winner determined
 *  between-rounds   – waiting for next round 1
 */
export type VotingPhase =
  | 'loading'
  | 'no-round'
  | 'round1-active'
  | 'round1-results'
  | 'round2-active'
  | 'round2-results'
  | 'yearly-active'
  | 'yearly-results'
  | 'between-rounds'

export interface VotingState {
  phase: VotingPhase
  round: VotingRound | null
  clips: ClipWithVotes[]
  /** Clip-ID the current user voted for in this round (null if not voted / not logged in) */
  userVote: string | null
  monthlyWinner: MonthlyWinner | null
  yearlyWinner: YearlyWinner | null
  loading: boolean
  error: string | null
}

