import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import siteConfig from '../config/siteConfig'
import SubPage from '../components/SubPage/SubPage'

const TWITCH_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID as string | undefined

/* ── Twitch API helpers ── */

async function twitchGet<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': TWITCH_CLIENT_ID ?? '',
    },
  })
  if (!res.ok) throw new Error(`Twitch ${res.status}: ${await res.text()}`)
  return await res.json() as Promise<T>
}

interface TwitchUser { id: string; login: string; display_name: string }
interface TwitchMod { user_id: string; user_name: string }

async function fetchTwitchMods(providerToken: string, channel: string) {
  const users = await twitchGet<{ data: TwitchUser[] }>(
    `users?login=${channel}`, providerToken,
  )
  const broadcaster = users.data[0]
  if (!broadcaster) throw new Error('Broadcaster not found')

  const mods: TwitchMod[] = []
  let cursor = ''
  do {
    const params = new URLSearchParams({ broadcaster_id: broadcaster.id, first: '100' })
    if (cursor) params.set('after', cursor)
    const page = await twitchGet<{
      data: TwitchMod[]; pagination: { cursor?: string }
    }>(`moderation/moderators?${params}`, providerToken)
    mods.push(...page.data)
    cursor = page.pagination?.cursor ?? ''
  } while (cursor)

  return {
    mods: [
      { user_id: broadcaster.id, user_name: broadcaster.display_name },
      ...mods,
    ],
    broadcaster_id: broadcaster.id,
  }
}

async function lookupTwitchUser(providerToken: string, login: string): Promise<TwitchUser | null> {
  const res = await twitchGet<{ data: TwitchUser[] }>(
    `users?login=${encodeURIComponent(login.trim().toLowerCase())}`, providerToken,
  )
  return res.data[0] ?? null
}

interface ModRow { twitch_user_id: string; display_name: string | null; is_broadcaster: boolean }

/* ── OnlyBart Broadcaster Sync (VIPs/Subs) ── */
async function fetchOnlyBartRoles(providerToken: string, broadcasterId: string) {
    // 1. Fetch VIPs
    // Requires scope 'channel:read:vips' (or similar). If not available, might fail.
    // Try https://dev.twitch.tv/docs/api/reference/#get-vips
    const vips: string[] = []
    try {
        let cursor = ''
        do {
            const params: Record<string, string> = { broadcaster_id: broadcasterId, first: '100' }
            if (cursor) params.after = cursor
            
            const q = new URLSearchParams(params).toString()
            const res = await twitchGet<{ data: { user_id: string }[], pagination: { cursor?: string } }>(
                `channels/vips?${q}`, providerToken
            )
            vips.push(...res.data.map(v => v.user_id))
            cursor = res.pagination?.cursor || ''
        } while (cursor)
    } catch (e) {
        console.warn('Failed to fetch VIPs', e)
    }

    // 2. Fetch Subscribers
    // Requires scope 'channel:read:subscriptions'
    const subs: string[] = []
    try {
        let cursor = ''
        do {
            const params: Record<string, string> = { broadcaster_id: broadcasterId, first: '100' }
            if (cursor) params.after = cursor
            
            const q = new URLSearchParams(params).toString()
            const res = await twitchGet<{ data: { user_id: string }[], pagination: { cursor?: string } }>(
                `subscriptions?${q}`, providerToken
            )
            subs.push(...res.data.map(u => u.user_id))
            cursor = res.pagination?.cursor || ''
        } while (cursor)
    } catch (e) {
        console.warn('Failed to fetch Subs', e)
    }

    return { vips, subs }
}

/* ═════════════════════════════════════════════════════════ */

export default function ModerateSettingsPage() {
  const { t } = useTranslation()
  const { user, session } = useAuth()
  const { showToast } = useToast()
  const [mods, setMods] = useState<ModRow[]>([])
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [addName, setAddName] = useState('')

  const providerToken = session?.provider_token

  /* ── Daten laden ── */
  useEffect(() => {
    (async () => {
      const [modsRes] = await Promise.all([
        supabase.from('moderators').select('twitch_user_id, display_name, is_broadcaster').order('display_name'),
      ])
      setMods((modsRes.data ?? []) as ModRow[])
    })()
  }, [refreshKey])



  /* ── Auto-Sync ── */
  async function syncMods() {
    if (!providerToken) return
    if (!TWITCH_CLIENT_ID) { showToast('❌ VITE_TWITCH_CLIENT_ID nicht gesetzt'); return }
    setBusy(true)
    try {
      // 1. Sync Moderators
      const { mods: modsArr, broadcaster_id } = await fetchTwitchMods(providerToken, siteConfig.twitch.channel)
      const { data, error } = await supabase.rpc('sync_moderators', { 
        p_mods: modsArr,
        p_broadcaster_twitch_id: broadcaster_id,
      })
      const result = data as { error?: string; message?: string; count?: number; caller_is_broadcaster?: boolean } | null
      
      let modMsg: string
        if (error || result?.error) {
        const errorMsg = result?.message ?? error?.message ?? result?.error ?? 'Unbekannter Fehler'
         modMsg = `❌ Mods: ${errorMsg}`
      } else {
        const isBroadcaster = result?.caller_is_broadcaster ? ' (als Broadcaster)' : ''
        modMsg = `✅ ${result?.count ?? 0} Mods${isBroadcaster}`
      }

      // 2. Sync OnlyBart (VIPs + Subs) - if broadcaster
      // We only attempt this if the user is broadcaster, as scopes channel:read:vips/subs require it.
      // But we can try anyway and catch errors.
      let obMsg: string
      try {
          const { vips, subs } = await fetchOnlyBartRoles(providerToken, broadcaster_id)
          
          const uniqueIds = new Set([...vips, ...subs])
          const updates = Array.from(uniqueIds).map(tid => ({
            twitch_id: tid,
            is_vip: vips.includes(tid),
            is_subscriber: subs.includes(tid),
            last_updated: new Date().toISOString()
          }))

          if (updates.length > 0) {
            const batchSize = 1000
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize)
                const { error: obError } = await supabase.from('twitch_permissions').upsert(batch, { onConflict: 'twitch_id' })
                if (obError) console.error(obError)
            }
          }
          obMsg = ` | ✅ OnlyBart: ${vips.length} VIPs, ${subs.length} Subs`
      } catch (e) {
          console.warn('OnlyBart sync failed', e)
          obMsg = ' | ⚠️ OnlyBart Sync skipped (fehlende Rechte?)'
      }

      showToast(modMsg + obMsg)
      setRefreshKey((k) => k + 1)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync fehlgeschlagen'
      if (msg.includes('401') && msg.toLowerCase().includes('missing scope')) {
        showToast(`❌ ${t('moderate.syncMissingScope')}`)
      } else {
        showToast(`❌ ${msg}`)
      }
    }
    setBusy(false)
  }

  /* ── Re-Login mit moderation:read ── */
  async function loginForSync() {
    await supabase.auth.signInWithOAuth({
      provider: 'twitch',
      options: {
        // Standard-Scopes von Supabase + moderation:read + channel:manage:moderators für Mod-Liste
        // AND channel:read:vips + channel:read:subscriptions for OnlyBart
        scopes: 'user:read:email moderation:read channel:manage:moderators channel:read:vips channel:read:subscriptions',
        redirectTo: window.location.origin + '/moderate/settings',
        queryParams: { force_verify: 'true' },
      },
    })
  }

  /* ── Manuell hinzufügen ── */
  async function addMod() {
    const name = addName.trim()
    if (!name) return
    setBusy(true)
    try {
      let twitchId = name
      let displayName = name
      if (!/^\d+$/.test(name)) {
        if (!providerToken) {
          showToast('❌ Bitte Twitch-User-ID (Zahl) eingeben oder zuerst mit Twitch einloggen')
          setBusy(false)
          return
        }
        if (!TWITCH_CLIENT_ID) {
          showToast('❌ VITE_TWITCH_CLIENT_ID nicht gesetzt')
          setBusy(false)
          return
        }
        const twitchUser = await lookupTwitchUser(providerToken, name)
        if (!twitchUser) { showToast(`❌ Twitch-User „${name}" nicht gefunden`); setBusy(false); return }
        twitchId = twitchUser.id
        displayName = twitchUser.display_name
      }
      const { data, error } = await supabase.rpc('add_moderator', {
        p_twitch_user_id: twitchId, p_display_name: displayName,
      })
      const result = data as { error?: string } | null
      if (error || result?.error) showToast(`❌ ${error?.message ?? result?.error}`)
      else showToast(`✅ ${displayName} hinzugefügt`)
      setAddName('')
      setRefreshKey((k) => k + 1)
    } catch (err) { showToast(`❌ ${err instanceof Error ? err.message : 'Fehler'}`) }
    setBusy(false)
  }

  /* ── Manuell entfernen ── */
  async function removeMod(twitchUserId: string) {
    setBusy(true)
    const { data, error } = await supabase.rpc('remove_moderator', { p_twitch_user_id: twitchUserId })
    const result = data as { error?: string } | null
    if (error || result?.error) {
      const errKey = result?.error
      if (errKey === 'cannot_remove_self') showToast(`❌ ${t('moderate.cannotRemoveSelf')}`)
      else if (errKey === 'cannot_remove_broadcaster') showToast(`❌ ${t('moderate.cannotRemoveBroadcaster')}`)
      else showToast(`❌ ${error?.message ?? errKey}`)
    } else showToast('✅ Entfernt')
    setRefreshKey((k) => k + 1)
    setBusy(false)
  }

  const myTwitchId: string = user?.user_metadata?.sub ?? user?.user_metadata?.provider_id ?? ''

  return (
    <SubPage>
      <h1>🛡️ {t('moderate.settingsTitle')}</h1>

      {/* ── Mod-Sync ── */}
      <h2>{t('moderate.modSync')}</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '0 0 10px' }}>
        {t('moderate.modSyncHint')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {providerToken ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={syncMods}>
              🔄 {t('moderate.syncNow')}
            </button>
            <button className="btn btn-secondary" onClick={loginForSync}>
              🔑 {t('moderate.loginForSync')}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={loginForSync}>
            🔑 {t('moderate.loginForSync')}
          </button>
        )}
      </div>

      {/* ── Manuell hinzufügen ── */}
      <h2>{t('moderate.manualAdd')}</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '0 0 10px' }}>
        {providerToken ? t('moderate.manualAddHintWithToken') : t('moderate.manualAddHintNoToken')}
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMod()}
          placeholder={providerToken ? 'Twitch-Username' : 'Twitch-User-ID (Zahl)'}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--box-border)',
            background: 'var(--color-btn-bg)', color: 'var(--color-text)',
            fontSize: '0.9rem', minWidth: 220,
          }}
        />
        <button className="btn btn-primary" disabled={busy || !addName.trim()} onClick={addMod}>
          ➕ {t('moderate.addBtn')}
        </button>
      </div>

      {/* ── Aktuelle Moderatoren ── */}
      <h2>{t('moderate.currentMods', { count: mods.length })}</h2>
      {mods.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{t('moderate.noMods')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--box-border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>Name</th>
                <th style={{ padding: '8px 6px' }}>Twitch-ID</th>
                <th style={{ padding: '8px 6px', width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {mods.map((m) => (
                <tr key={m.twitch_user_id} style={{ borderBottom: '1px solid var(--box-border)' }}>
                  <td style={{ padding: '8px 6px' }}>{m.display_name ?? '—'}</td>
                  <td style={{ padding: '8px 6px', opacity: 0.6 }}>{m.twitch_user_id}</td>
                  <td style={{ padding: '8px 6px' }}>
                    {m.is_broadcaster || m.twitch_user_id === myTwitchId ? (
                      <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>
                        {m.is_broadcaster ? '🎙️' : '👤'}
                      </span>
                    ) : (
                      <button className="btn btn-secondary" disabled={busy}
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        onClick={() => removeMod(m.twitch_user_id)}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SubPage>
  )
}
