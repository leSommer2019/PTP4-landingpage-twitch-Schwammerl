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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setIsMod(false)
        setIsBroadcaster(false)
        setLoading(false)
      })
      return
    }

    let cancelled = false
    ;(async () => {
      // Fetch both roles in parallel
      const [modRes, broadcasterRes] = await Promise.all([
        supabase.rpc('is_moderator'),
        supabase.rpc('is_broadcaster'),
      ])

      if (!cancelled) {
        setIsMod(!modRes.error && modRes.data === true)
        setIsBroadcaster(!broadcasterRes.error && broadcasterRes.data === true)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [user, authLoading])

  return { isMod, isBroadcaster, loading }
}
