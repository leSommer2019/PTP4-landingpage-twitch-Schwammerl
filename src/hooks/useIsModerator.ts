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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setIsMod(false)
        setLoading(false)
      })
      return
    }

    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('is_moderator')
      if (!cancelled) {
        setIsMod(!error && data === true)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [user, authLoading])

  return { isMod, loading }
}

