import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'cookie-consent'
const SESSION_KEY = 'pv-session-id'

/** Erzeugt (oder holt) eine anonyme Session-ID für diesen Browser-Tab. */
function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

/**
 * Trackt Seitenaufrufe in der Supabase-Tabelle `page_views`,
 * aber NUR wenn der Nutzer Cookies im Banner akzeptiert hat.
 */
export default function PageTracker() {
  const location = useLocation()
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY)
    if (consent !== 'accepted') return

    const path = location.pathname
    // Doppeltes Tracking desselben Pfads direkt hintereinander vermeiden
    if (path === prevPath.current) return
    prevPath.current = path

    const sessionId = getSessionId()
    const redirectInfo: Record<string, string> = {}

    // document.referrer nur beim allerersten Aufruf sinnvoll
    if (document.referrer) {
      try {
        const ref = new URL(document.referrer)
        // Nur externe Referrer speichern
        if (ref.origin !== window.location.origin) {
          redirectInfo.referrer = document.referrer
        }
      } catch { /* invalid URL – ignore */ }
    }

    // UTM-Parameter o.ä. aus der Query übernehmen
    if (location.search) {
      redirectInfo.query = location.search
    }

    supabase
      .from('page_views')
      .insert({
        session_id: sessionId,
        page_path: path,
        viewed_at: new Date().toISOString(),
        redirect_info: Object.keys(redirectInfo).length > 0 ? redirectInfo : null,
      })
      .then(({ error }) => {
        if (error) console.warn('[PageTracker] insert failed:', error.message)
      })
  }, [location])

  return null
}

