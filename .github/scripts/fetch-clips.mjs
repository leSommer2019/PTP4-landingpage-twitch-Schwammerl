#!/usr/bin/env node
// ──────────────────────────────────────────────────────────
//  fetch-clips.mjs  –  Twitch Clip Fetch + Round 1 creation
//  Runs on the 21st of each month via GitHub Actions.
// ──────────────────────────────────────────────────────────

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TWITCH_CHANNEL = 'hd1920x1080',
} = process.env

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

// ── Helpers ──────────────────────────────────────────────

async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`SB GET ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`SB POST ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Twitch OAuth ─────────────────────────────────────────

async function getTwitchToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Twitch token')
  return data.access_token
}

// ── Twitch API ───────────────────────────────────────────

async function getBroadcasterId(token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${TWITCH_CHANNEL}`,
    { headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID } },
  )
  const data = await res.json()
  return data.data?.[0]?.id
}

async function fetchAllClips(token, broadcasterId, startedAt, endedAt) {
  const clips = []
  let cursor = ''
  do {
    const params = new URLSearchParams({
      broadcaster_id: broadcasterId,
      started_at: startedAt,
      ended_at: endedAt,
      first: '100',
    })
    if (cursor) params.set('after', cursor)

    const res = await fetch(`https://api.twitch.tv/helix/clips?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID },
    })
    const data = await res.json()
    if (!data.data) break
    clips.push(...data.data)
    cursor = data.pagination?.cursor || ''
  } while (cursor)

  return clips
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1 // 1-based

  // Date range: 22nd of previous month → 21st of current month (EOD)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year

  const startedAt = `${prevYear}-${String(prevMonth).padStart(2, '0')}-22T00:00:00Z`
  const endedAt   = `${year}-${String(month).padStart(2, '0')}-21T23:59:59Z`

  console.log(`Fetching clips from ${startedAt} to ${endedAt}`)

  // Check if round already exists for this month
  const existing = await sbGet('voting_rounds',
    `year=eq.${year}&month=eq.${month}&type=eq.round1&select=id`)
  if (existing.length > 0) {
    console.log('Round 1 already exists for this month, skipping.')
    return
  }

  const token = await getTwitchToken()
  const broadcasterId = await getBroadcasterId(token)
  if (!broadcasterId) throw new Error(`Broadcaster "${TWITCH_CHANNEL}" not found`)

  const twitchClips = await fetchAllClips(token, broadcasterId, startedAt, endedAt)
  console.log(`Fetched ${twitchClips.length} clips from Twitch`)

  if (twitchClips.length === 0) {
    console.log('No clips found, skipping round creation.')
    return
  }

  // Calculate ends_at: 1st of next month 00:00 UTC
  const endsMonth = month === 12 ? 1 : month + 1
  const endsYear  = month === 12 ? year + 1 : year
  const endsAt = `${endsYear}-${String(endsMonth).padStart(2, '0')}-01T00:00:00Z`

  // Create voting round
  const [round] = await sbPost('voting_rounds', {
    type: 'round1',
    status: 'active',
    year,
    month,
    starts_at: now.toISOString(),
    ends_at: endsAt,
  })
  console.log(`Created round1: ${round.id}`)

  // Upsert clips (ignore duplicates via twitch_clip_id)
  for (const c of twitchClips) {
    try {
      const [clip] = await sbPost('clips', {
        twitch_clip_id: c.id,
        title: c.title,
        creator_name: c.creator_name,
        thumbnail_url: c.thumbnail_url,
        embed_url: c.embed_url,
        clip_url: c.url,
        view_count: c.view_count,
        duration: c.duration,
        twitch_created_at: c.created_at,
      })
      // Link clip to round
      await sbPost('round_clips', { round_id: round.id, clip_id: clip.id })
    } catch (err) {
      // Clip may already exist (duplicate) — fetch existing and link
      const [existing] = await sbGet('clips', `twitch_clip_id=eq.${encodeURIComponent(c.id)}&select=id`)
      if (existing) {
        try { await sbPost('round_clips', { round_id: round.id, clip_id: existing.id }) } catch { /* already linked */ }
      } else {
        console.warn(`Failed to insert clip ${c.id}:`, err.message)
      }
    }
  }

  console.log(`Done – ${twitchClips.length} clips linked to round ${round.id}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

