// Supabase Edge Function: twitch-game
// Returns the current game for the configured Twitch channel.
// Required Supabase secrets (set via `supabase secrets set`):
//   TWITCH_CLIENT_ID     – Twitch App Client ID
//   TWITCH_CLIENT_SECRET – Twitch App Client Secret
//   TWITCH_CHANNEL       – Twitch channel login (default: hd1920x1080)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface TwitchStream {
  game_id: string
  game_name: string
  title: string
  type: string
}

interface TwitchGame {
  id: string
  name: string
  box_art_url: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAppToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status}`)
  }

  const data = (await res.json()) as TokenResponse
  // Cache with a 60-second safety buffer before actual expiry
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.token
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const clientId = Deno.env.get('TWITCH_CLIENT_ID')
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET')
  const channel = Deno.env.get('TWITCH_CHANNEL') ?? 'hd1920x1080'

  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: 'Twitch credentials not configured' }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  try {
    const token = await getAppToken(clientId, clientSecret)
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId,
    }

    // Fetch the live stream
    const streamRes = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`,
      { headers: authHeaders },
    )
    if (!streamRes.ok) {
      throw new Error(`Streams API ${streamRes.status}`)
    }
    const streamData = (await streamRes.json()) as { data: TwitchStream[] }

    if (!streamData.data?.length || streamData.data[0].type !== 'live') {
      return new Response(JSON.stringify({ isLive: false }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const stream = streamData.data[0]

    // Fetch game box art if a game is set
    let boxArtUrl = ''
    if (stream.game_id) {
      const gameRes = await fetch(
        `https://api.twitch.tv/helix/games?id=${encodeURIComponent(stream.game_id)}`,
        { headers: authHeaders },
      )
      if (gameRes.ok) {
        const gameData = (await gameRes.json()) as { data: TwitchGame[] }
        if (gameData.data?.length) {
          // Replace placeholder dimensions (138×190 px – standard Twitch box art size)
          boxArtUrl = gameData.data[0].box_art_url
            .replace('{width}', '138')
            .replace('{height}', '190')
        }
      }
    }

    return new Response(
      JSON.stringify({
        isLive: true,
        gameId: stream.game_id,
        gameName: stream.game_name,
        boxArtUrl,
        streamTitle: stream.title,
      }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
