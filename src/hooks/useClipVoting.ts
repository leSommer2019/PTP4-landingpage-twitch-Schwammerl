import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import type {
  VotingRound,
  ClipWithVotes,
  MonthlyWinner,
  YearlyWinner,
  VotingPhase,
  VotingState,
} from '../types/clipVoting'

/* ── Derive the UI phase from DB data ── */
function derivePhase(
  active: VotingRound | null,
  pending: VotingRound | null,
  completed: VotingRound | null,
): VotingPhase {
  if (active) {
    if (active.type === 'round1') return 'round1-active'
    if (active.type === 'round2') return 'round2-active'
    return 'yearly-active'
  }
  if (pending) {
    // round2 pending → show round1 results
    if (pending.type === 'round2') return 'round1-results'
    return 'no-round'
  }
  if (completed) {
    if (completed.type === 'round1') return 'round1-results'
    if (completed.type === 'round2') return 'round2-results'
    if (completed.type === 'yearly') return 'yearly-results'
  }
  return 'no-round'
}

export function useClipVoting(): VotingState & {
  castVote: (clipId: string) => Promise<{ error?: string }>
  refresh: () => void
} {
  const { user } = useAuth()
  const [state, setState] = useState<VotingState>({
    phase: 'loading',
    round: null,
    clips: [],
    userVote: null,
    monthlyWinner: null,
    yearlyWinner: null,
    loading: true,
    error: null,
  })

  /* ── Fetch everything the UI needs ── */
  const fetchState = useCallback(async () => {
    try {
      // 1 — Fetch the three most relevant rounds
      const { data: rounds } = await supabase
        .from('voting_rounds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      const list = (rounds ?? []) as VotingRound[]
      const active    = list.find((r) => r.status === 'active')    ?? null
      const pending   = list.find((r) => r.status === 'pending')   ?? null
      const completed = list.find((r) => r.status === 'completed') ?? null

      const phase = derivePhase(active, pending, completed)

      // The round we display clips for
      const displayRound: VotingRound | null = active ?? pending ?? completed

      // 2 — Clips for the display round
      let clips: ClipWithVotes[] = []
      if (displayRound) {
        // If the display round is pending (round2 not started yet)
        // show the completed round1 clips so users can see the top-10 results
        const roundIdForClips =
          displayRound.status === 'pending'
            ? list.find(
                (r) =>
                  r.type === 'round1' &&
                  r.status === 'completed' &&
                  r.year === displayRound!.year &&
                  r.month === displayRound!.month,
              )?.id ?? displayRound.id
            : displayRound.id

        const { data } = await supabase
          .from('clip_vote_counts')
          .select('*')
          .eq('round_id', roundIdForClips)
          .order('vote_count', { ascending: false })

        clips = (data ?? []) as ClipWithVotes[]
      }

      // 3 — User's vote in the active round
      let userVote: string | null = null
      if (active && user) {
        const { data } = await supabase
          .from('votes')
          .select('clip_id')
          .eq('round_id', active.id)
          .eq('user_id', user.id)
          .maybeSingle()
        userVote = (data as { clip_id: string } | null)?.clip_id ?? null
      }

      // 4 — Latest monthly winner
      const { data: mw } = await supabase
        .from('monthly_winners')
        .select('*, clips(*)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 5 — Latest yearly winner
      const { data: yw } = await supabase
        .from('yearly_winners')
        .select('*, clips(*)')
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle()

      setState({
        phase: phase === 'loading' ? 'no-round' : phase,
        round: displayRound,
        clips,
        userVote,
        monthlyWinner: (mw as MonthlyWinner | null) ?? null,
        yearlyWinner: (yw as YearlyWinner | null) ?? null,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'no-round',
        loading: false,
        error: err instanceof Error ? err.message : 'unknown',
      }))
    }
  }, [user])

  useEffect(() => {
    fetchState()
    const id = setInterval(fetchState, 30_000) // poll every 30 s
    return () => clearInterval(id)
  }, [fetchState])

  /* ── Cast a vote ── */
  const castVote = useCallback(
    async (clipId: string): Promise<{ error?: string }> => {
      if (!state.round || state.round.status !== 'active')
        return { error: 'round_not_active' }

      const { data, error } = await supabase.rpc('cast_vote', {
        p_round_id: state.round.id,
        p_clip_id: clipId,
      })

      if (error) return { error: error.message }
      const result = data as { error?: string; success?: boolean } | null
      if (result?.error) return { error: result.error }

      // Optimistic UI: set userVote immediately then refresh
      setState((prev) => ({ ...prev, userVote: clipId }))
      await fetchState()
      return {}
    },
    [state.round, fetchState],
  )

  return { ...state, castVote, refresh: fetchState }
}


