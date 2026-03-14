
import { createClient } from '@supabase/supabase-js'

// ── Environment Variables ──
// Required in GitHub Secrets
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET
const TWITCH_REFRESH_TOKEN = process.env.TWITCH_REFRESH_TOKEN

// Config
const CHANNEL_NAME = 'hd1920x1080' // Hardcoded or from env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_REFRESH_TOKEN) {
  console.error('Missing environment variables. Please check GitHub Secrets.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Types ──
interface TwitchUser { id: string; login: string; display_name: string }
interface TwitchMod { user_id: string; user_name: string }

// ── Helpers ──

async function getAccessToken() {
  console.log('Refreshing Twitch Token...')
  const params = new URLSearchParams()
  params.append('client_id', TWITCH_CLIENT_ID!)
  params.append('client_secret', TWITCH_CLIENT_SECRET!)
  params.append('grant_type', 'refresh_token')
  params.append('refresh_token', TWITCH_REFRESH_TOKEN!)

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: params,
  })

  if (!res.ok) {
    throw new Error(`Failed to refresh token: ${await res.text()}`)
  }

  const data = await res.json()
  return data.access_token as string
}

async function twitchGet<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': TWITCH_CLIENT_ID!,
    },
  })
  if (!res.ok) {
      const text = await res.text()
      // If 401, maybe try re-refresh? For simplicity, just fail script.
      throw new Error(`Twitch API Error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Main Logic ──

async function main() {
  try {
    const accessToken = await getAccessToken()
    
    // 1. Get Broadcaster ID
    const users = await twitchGet<{ data: TwitchUser[] }>(`users?login=${CHANNEL_NAME}`, accessToken)
    const broadcaster = users.data[0]
    if (!broadcaster) throw new Error(`Broadcaster ${CHANNEL_NAME} not found`)
    
    console.log(`Broadcaster: ${broadcaster.display_name} (${broadcaster.id})`)

    // ── SYNC MODS ──
    console.log('Fetching Moderators...')
    const mods: TwitchMod[] = []
    let cursor = ''
    do {
        const p = new URLSearchParams({ broadcaster_id: broadcaster.id, first: '100' })
        if (cursor) p.set('after', cursor)
        
        const page = await twitchGet<{ data: TwitchMod[]; pagination: { cursor?: string } }>(
            `moderation/moderators?${p}`, accessToken
        )
        mods.push(...page.data)
        cursor = page.pagination?.cursor || ''
    } while (cursor)

    console.log(`Found ${mods.length} moderators.`)

    // Upsert Mods (Using existing RPC logic locally or replicate strict upsert?)
    // The RPC `sync_moderators` cleans up removed mods too. Let's call it via RPC.
    // Note: RPC requires `p_mods` as JSON array.
    
    const modsPayload = [
        { user_id: broadcaster.id, user_name: broadcaster.display_name }, // Add Broadcaster as Mod
        ...mods
    ]
    
    const { error: modError, data: modResult } = await supabase.rpc('sync_moderators', {
        p_mods: modsPayload,
        p_broadcaster_twitch_id: broadcaster.id
    })

    if (modError) {
        console.error('Suppbase sync_moderators failed:', modError)
    } else {
        console.log('Moderators synced:', modResult)
    }

    // ── SYNC VIPs & SUBs (OnlyBart) ──
    console.log('Fetching VIPs...')
    const vips: string[] = []
    cursor = ''
    try {
        do {
            const p = new URLSearchParams({ broadcaster_id: broadcaster.id, first: '100' })
            if (cursor) p.set('after', cursor)
            const page = await twitchGet<{ data: { user_id: string }[], pagination: { cursor?: string } }>(
                `channels/vips?${p}`, accessToken
            )
            vips.push(...page.data.map(v => v.user_id))
            cursor = page.pagination?.cursor || ''
        } while (cursor)
    } catch (e) {
        console.warn('Error fetching VIPs (maybe no scope?):', e)
    }

    console.log(`Found ${vips.length} VIPs.`)

    console.log('Fetching Subscribers...')
    const subs: string[] = []
    cursor = ''
    try {
        do {
            const p = new URLSearchParams({ broadcaster_id: broadcaster.id, first: '100' })
            if (cursor) p.set('after', cursor)
            const page = await twitchGet<{ data: { user_id: string }[], pagination: { cursor?: string } }>(
                `subscriptions?${p}`, accessToken
            )
            subs.push(...page.data.map(u => u.user_id))
            cursor = page.pagination?.cursor || ''
        } while (cursor)
    } catch (e) {
        console.warn('Error fetching Subs (maybe no scope?):', e)
    }
    
    console.log(`Found ${subs.length} Subscribers.`)

    // Upsert into `twitch_permissions`
    // We want to combine lists.
    const uniqueIds = new Set([...vips, ...subs])
    const updates = Array.from(uniqueIds).map(id => ({
        twitch_id: id,
        is_vip: vips.includes(id),
        is_subscriber: subs.includes(id),
        last_updated: new Date().toISOString()
    }))

    console.log(`Updating ${updates.length} permission records...`)
    
    // Batch upsert (Supabase handles large batches well, but safe to chunk)
    const BATCH_SIZE = 1000
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('twitch_permissions').upsert(batch, { onConflict: 'twitch_id' })
        if (error) {
            console.error('Error batch upserting permissions:', error)
            throw error // Fail action
        }
    }
    
    console.log('Sync completed successfully.')

  } catch (err) {
    console.error('Script failed:', err)
    process.exit(1)
  }
}

main()

