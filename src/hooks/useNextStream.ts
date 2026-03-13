import { useState, useEffect } from 'react'

export interface NextStreamEvent {
  summary: string
  description?: string
  start: Date
  end?: Date
}

/* ── ICS date parser ── */
function parseIcsDate(raw: string): Date {
  const s = raw.trim()
  const y = parseInt(s.substring(0, 4))
  const m = parseInt(s.substring(4, 6)) - 1
  const d = parseInt(s.substring(6, 8))

  if (s.length >= 15 && s.charAt(8) === 'T') {
    const hh = parseInt(s.substring(9, 11))
    const mm = parseInt(s.substring(11, 13))
    const ss = parseInt(s.substring(13, 15))
    if (s.endsWith('Z')) return new Date(Date.UTC(y, m, d, hh, mm, ss))
    return new Date(y, m, d, hh, mm, ss)
  }
  return new Date(y, m, d)
}

/* ── Minimal ICS parser (handles VEVENT blocks) ── */
function parseIcs(text: string): NextStreamEvent[] {
  const events: NextStreamEvent[] = []
  const blocks = text.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0]
    // Unfold long lines (RFC 5545 §3.1): continuation lines start with a space/tab
    const unfolded = block.replace(/\r?\n[ \t]/g, '')
    const lines = unfolded.split(/\r?\n/)

    let summary = ''
    let description = ''
    let dtstart: Date | null = null
    let dtend: Date | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('SUMMARY')) {
        const idx = trimmed.indexOf(':')
        if (idx !== -1) summary = trimmed.substring(idx + 1).trim()
      } else if (trimmed.startsWith('DESCRIPTION')) {
        const idx = trimmed.indexOf(':')
        if (idx !== -1) description = trimmed.substring(idx + 1).trim()
      } else if (trimmed.startsWith('DTSTART')) {
        const idx = trimmed.indexOf(':')
        if (idx !== -1) dtstart = parseIcsDate(trimmed.substring(idx + 1))
      } else if (trimmed.startsWith('DTEND')) {
        const idx = trimmed.indexOf(':')
        if (idx !== -1) dtend = parseIcsDate(trimmed.substring(idx + 1))
      }
    }

    if (summary && dtstart) {
      events.push({ summary, description: description || undefined, start: dtstart, end: dtend ?? undefined })
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/* ── Hook ── */
export function useNextStream(icsUrl: string) {
  const [nextEvent, setNextEvent] = useState<NextStreamEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCalendar() {
      try {
        const res = await fetch(icsUrl)
        if (!res.ok) {
          if (!cancelled) setError(`HTTP ${res.status}`)
          return
        }
        const text = await res.text()
        if (cancelled) return

        const events = parseIcs(text)
        const now = new Date()
        const feiertagRegex = /feiertag/i
        const upcoming = events.find((e) => {
          if (e.start <= now) return false
          const isHoliday = feiertagRegex.test(e.summary) || feiertagRegex.test(e.description || '')
          return !isHoliday
        })
        setNextEvent(upcoming ?? null)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fetch failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchCalendar()
    return () => { cancelled = true }
  }, [icsUrl])

  return { nextEvent, loading, error }
}

