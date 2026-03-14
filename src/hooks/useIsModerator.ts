import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'

/**
 * Checks whether the currently logged-in user is in the `moderators` table.
 * Uses the Supabase RPC function `is_moderator()`.
 */
export function useIsModerator() {
  const { user, loading: authLoading } = useAuth()
  const [isMod, setIsMod] = useState(false)
  const [isBroadcaster, setIsBroadcaster] = useState(false)
  const [isManual, setIsManual] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setIsMod(false)
        setIsBroadcaster(false)
        setIsManual(false)
        setLoading(false)
      })
      return
    }

    let cancelled = false
    ;(async () => {
      // Fetch both roles in parallel
      const twitchId = user.user_metadata?.sub || user.user_metadata?.provider_id
      const [modRes, broadcasterRes, manualRes] = await Promise.all([
        supabase.rpc('is_moderator'),
        supabase.rpc('is_broadcaster'),
        twitchId 
          ? supabase.from('moderators').select('is_manual').eq('twitch_user_id', twitchId).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ])

      if (!cancelled) {
        setIsMod(!modRes.error && modRes.data === true)
        setIsBroadcaster(!broadcasterRes.error && broadcasterRes.data === true)
        setIsManual(manualRes.data?.is_manual === true)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [user, authLoading])

  return { isMod, isBroadcaster, isManual, loading }
}
