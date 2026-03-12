import type { RoundStatus, RoundType, VotingRound } from './clipVoting'

export type StatisticsRangeDays = 7 | 30 | 90

export interface TrendPoint {
  day: string
  value: number
}

export interface TopClipMetric {
  clipId: string
  twitchClipId: string
  title: string
  creatorName: string
  voteCount: number
}

export interface PageMetric {
  pagePath: string
  views: number
}

export interface ReferrerMetric {
  referrer: string
  views: number
}

export interface WinnerMetric {
  kind: 'monthly' | 'yearly'
  year: number
  month: number | null
  title: string
  creatorName: string
  createdAt: string
}

export interface RoundHealth {
  id: string
  type: RoundType
  status: RoundStatus
  year: number
  month: number | null
  startsAt: string | null
  endsAt: string | null
  clipCount: number
  totalVotes: number
  uniqueVoters: number
}

export interface ModerateStatisticsDashboard {
  rangeDays: StatisticsRangeDays
  generatedAt: string
  totalVotes: number
  uniqueVoters: number
  totalViews: number
  uniqueSessions: number
  voteToViewRate: number | null
  activeRound: RoundHealth | null
  recentRounds: VotingRound[]
  topClips: TopClipMetric[]
  votesPerDay: TrendPoint[]
  viewsPerDay: TrendPoint[]
  topPages: PageMetric[]
  topReferrers: ReferrerMetric[]
  latestWinners: WinnerMetric[]
}

export interface ModerateStatisticsState {
  rangeDays: StatisticsRangeDays
  loading: boolean
  error: string | null
  data: ModerateStatisticsDashboard | null
}

