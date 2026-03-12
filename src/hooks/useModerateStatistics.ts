import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ClipWithVotes, VotingRound } from '../types/clipVoting'
import type {
  ModerateStatisticsDashboard,
  ModerateStatisticsState,
  StatisticsRangeDays,
  TrendPoint,
  WinnerMetric,
} from '../types/moderateStatistics'

interface VoteRow {
  created_at: string
  user_id: string
}

interface PageViewRpcPerDay {
  day: string
  views: number
}

interface PageViewRpcPerPage {
  page_path: string
  views: number
}

interface PageViewRpcReferrer {
  referrer: string | null
  views: number
}

interface PageViewRpcResult {
  error?: string
  total_views?: number
  unique_sessions?: number
  per_page?: PageViewRpcPerPage[]
  per_day?: PageViewRpcPerDay[]
  top_referrers?: PageViewRpcReferrer[]
}

interface WinnerClip {
  title?: string
  creator_name?: string
}

interface MonthlyWinnerRow {
  year: number
  month: number
  created_at: string
  clips: WinnerClip | WinnerClip[] | null
}

interface YearlyWinnerRow {
  year: number
  created_at: string
  clips: WinnerClip | WinnerClip[] | null
}

function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function makeDateKeys(rangeDays: StatisticsRangeDays): string[] {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - (rangeDays - 1))

  const keys: string[] = []
  const cursor = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()))
  const endUtc = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()))

  while (cursor <= endUtc) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return keys
}

function buildTrendPoints(
  rangeDays: StatisticsRangeDays,
  items: Array<{ created_at?: string; day?: string; views?: number }>,
  useViews = false,
): TrendPoint[] {
  const dateKeys = makeDateKeys(rangeDays)
  const map = new Map<string, number>()

  for (const key of dateKeys) map.set(key, 0)

  for (const item of items) {
    const key = (item.created_at ?? item.day ?? '').slice(0, 10)
    if (!map.has(key)) continue

    if (useViews) {
      map.set(key, (map.get(key) ?? 0) + Number(item.views ?? 0))
    } else {
      map.set(key, (map.get(key) ?? 0) + 1)
    }
  }

  return dateKeys.map((key) => ({ day: formatDayLabel(key), value: map.get(key) ?? 0 }))
}

function normalizeWinnerClip(winner: MonthlyWinnerRow | YearlyWinnerRow): WinnerClip | null {
  if (!winner.clips) return null
  return Array.isArray(winner.clips) ? winner.clips[0] ?? null : winner.clips
}

function normalizeWinnerTitle(winner: MonthlyWinnerRow | YearlyWinnerRow): string {
  return normalizeWinnerClip(winner)?.title ?? 'Unbekannter Clip'
}

function normalizeWinnerCreator(winner: MonthlyWinnerRow | YearlyWinnerRow): string {
  return normalizeWinnerClip(winner)?.creator_name ?? 'Unbekannt'
}

export function useModerateStatistics() {
  const [state, setState] = useState<ModerateStatisticsState>({
    rangeDays: 30,
    loading: true,
    error: null,
    data: null,
  })

  const fetchDashboard = useCallback(async (rangeDays: StatisticsRangeDays) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('supabase_not_configured')
    }

    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setDate(toDate.getDate() - (rangeDays - 1))

    const fromIso = fromDate.toISOString()
    const toIso = toDate.toISOString()

    const [
      roundsRes,
      votesRes,
      monthlyRes,
      yearlyRes,
      pageViewRes,
    ] = await Promise.all([
      supabase
        .from('voting_rounds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('votes')
        .select('created_at, user_id')
        .gte('created_at', fromIso)
        .lte('created_at', toIso),
      supabase
        .from('monthly_winners')
        .select('id, year, month, created_at, clip_id, clips(title, creator_name)')
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('yearly_winners')
        .select('id, year, created_at, clip_id, clips(title, creator_name)')
        .order('year', { ascending: false })
        .limit(2),
      supabase.rpc('get_page_view_stats', { p_from: fromIso, p_to: toIso }),
    ])

    if (roundsRes.error) throw roundsRes.error
    if (votesRes.error) throw votesRes.error
    if (monthlyRes.error) throw monthlyRes.error
    if (yearlyRes.error) throw yearlyRes.error
    if (pageViewRes.error) throw pageViewRes.error

    const rounds = (roundsRes.data ?? []) as VotingRound[]
    const votes = (votesRes.data ?? []) as VoteRow[]
    const monthlyWinners = (monthlyRes.data ?? []) as MonthlyWinnerRow[]
    const yearlyWinners = (yearlyRes.data ?? []) as YearlyWinnerRow[]

    const pageViews = (pageViewRes.data ?? {}) as PageViewRpcResult
    if (pageViews.error) throw new Error(pageViews.error)

    const referenceRound = rounds.find((round) => round.status === 'active') ?? rounds[0] ?? null

    let topClips: ModerateStatisticsDashboard['topClips'] = []
    let activeRound: ModerateStatisticsDashboard['activeRound'] = null

    if (referenceRound) {
      const { data: roundClips, error: roundClipsError } = await supabase
        .from('clip_vote_counts')
        .select('*')
        .eq('round_id', referenceRound.id)
        .order('vote_count', { ascending: false })

      if (roundClipsError) throw roundClipsError

      const clipRows = (roundClips ?? []) as ClipWithVotes[]
      topClips = clipRows.slice(0, 5).map((clip) => ({
        clipId: clip.clip_id,
        twitchClipId: clip.twitch_clip_id,
        title: clip.title,
        creatorName: clip.creator_name,
        voteCount: clip.vote_count,
      }))

      const { data: roundVotes, error: roundVotesError } = await supabase
        .from('votes')
        .select('created_at, user_id')
        .eq('round_id', referenceRound.id)

      if (roundVotesError) throw roundVotesError

      const roundVoteRows = (roundVotes ?? []) as VoteRow[]
      activeRound = {
        id: referenceRound.id,
        type: referenceRound.type,
        status: referenceRound.status,
        year: referenceRound.year,
        month: referenceRound.month,
        startsAt: referenceRound.starts_at,
        endsAt: referenceRound.ends_at,
        clipCount: clipRows.length,
        totalVotes: roundVoteRows.length,
        uniqueVoters: new Set(roundVoteRows.map((vote) => vote.user_id)).size,
      }
    }

    const winnerFeed: WinnerMetric[] = [
      ...monthlyWinners.map((winner) => ({
        kind: 'monthly' as const,
        year: winner.year,
        month: winner.month,
        title: normalizeWinnerTitle(winner),
        creatorName: normalizeWinnerCreator(winner),
        createdAt: winner.created_at,
      })),
      ...yearlyWinners.map((winner) => ({
        kind: 'yearly' as const,
        year: winner.year,
        month: null,
        title: normalizeWinnerTitle(winner),
        creatorName: normalizeWinnerCreator(winner),
        createdAt: winner.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalVotes = votes.length
    const uniqueVoters = new Set(votes.map((vote) => vote.user_id)).size

    const totalViews = Number(pageViews.total_views ?? 0)
    const uniqueSessions = Number(pageViews.unique_sessions ?? 0)

    return {
      rangeDays,
      generatedAt: new Date().toISOString(),
      totalVotes,
      uniqueVoters,
      totalViews,
      uniqueSessions,
      voteToViewRate: totalViews > 0 ? totalVotes / totalViews : null,
      activeRound,
      recentRounds: rounds,
      topClips,
      votesPerDay: buildTrendPoints(rangeDays, votes),
      viewsPerDay: buildTrendPoints(rangeDays, pageViews.per_day ?? [], true),
      topPages: (pageViews.per_page ?? []).map((entry) => ({
        pagePath: entry.page_path,
        views: Number(entry.views ?? 0),
      })),
      topReferrers: (pageViews.top_referrers ?? [])
        .filter((entry) => Boolean(entry.referrer))
        .map((entry) => ({
          referrer: entry.referrer ?? 'unbekannt',
          views: Number(entry.views ?? 0),
        })),
      latestWinners: winnerFeed.slice(0, 6),
    } satisfies ModerateStatisticsDashboard
  }, [])

  const load = useCallback(
    async (rangeDays: StatisticsRangeDays) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const data = await fetchDashboard(rangeDays)
        setState((prev) => ({ ...prev, loading: false, error: null, data }))
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'unknown_error',
        }))
      }
    },
    [fetchDashboard],
  )

  const refresh = useCallback(async () => {
    await load(state.rangeDays)
  }, [load, state.rangeDays])

  useEffect(() => {
    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [refresh])

  const setRangeDays = useCallback((rangeDays: StatisticsRangeDays) => {
    setState((prev) => ({ ...prev, rangeDays }))
  }, [])

  return {
    ...state,
    refresh,
    setRangeDays,
  }
}


