import { useState, useEffect } from 'react'
import { useAuth } from '../context/useAuth'
import { useIsModerator } from './useIsModerator'
import { supabase } from '../lib/supabase'
import siteConfig from "../config/siteConfig.ts";

export type OnlyBartRole = 'broadcaster' | 'moderator' | 'vip' | 'subscriber' | 'none'

export interface OnlyBartAccess {
  canView: boolean
  canPost: boolean
  canLike: boolean
  canSuperlike: boolean
  canComment: boolean
  canDeleteComment: boolean
  loading: boolean
  role: OnlyBartRole
}

// Global cache to avoid re-fetching on component re-mounts
const roleCache: Record<string, { role: OnlyBartRole, timestamp: number }> = {}
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Hardcoded Broadcaster Buffer
let cachedBroadcasterId: string | null = null

export function useOnlyBartAccess(): OnlyBartAccess {
  const { user, session, loading: authLoading } = useAuth()
  const { isMod, isBroadcaster: isBroadcasterFromHook, loading: modLoading } = useIsModerator()
  
  const [role, setRole] = useState<OnlyBartRole>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
        if (authLoading || modLoading) return
        
        if (!user || !session) {
            if (!cancelled) {
                setRole('none')
                setLoading(false)
            }
            return
        }

        // Check cache
        const cached = roleCache[user.id]
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            if (!cancelled) {
                setRole(cached.role)
                setLoading(false)
            }
            return
        }

        let detectedRole: OnlyBartRole = 'none'

        try {
            // 1. Broadcaster
            if (isBroadcasterFromHook) {
                detectedRole = 'broadcaster'
            }
            // 2. Moderator
            else if (isMod) {
                detectedRole = 'moderator'
            }
            else {
                // 2a. Check twitch_permissions (Synced Table) - Most reliable for VIP/Sub
                const twitchId = user.user_metadata.provider_id || user.user_metadata.sub
                if (twitchId) {
                    const { data: permData } = await supabase
                        .from('twitch_permissions')
                        .select('is_vip, is_subscriber')
                        .eq('twitch_id', twitchId)
                        .maybeSingle()
                    
                    if (permData) {
                        if (permData.is_vip) {
                            detectedRole = 'vip'
                            // Don't return yet, check if subscriber is higher precedence? No, VIP usually > Sub for features (Superlikes)
                            // But usually users are both. VIP role gives Superlike. Sub role gives view.
                            // If user is both, we should grant max permissions.
                            // My type is effectively an Enum. Let's say VIP > Subscriber.
                        } else if (permData.is_subscriber) {
                            detectedRole = 'subscriber'
                        }
                    }
                }

                // If found via synced table, we are good.
                if (detectedRole !== 'none') {
                    // Skip next steps
                } else {
                    // 3. Database Check (user_roles - UUID based)
                    const { data: roleData } = await supabase
                        .from('user_roles')
                        .select('is_vip, is_subscriber, is_moderator, is_broadcaster')
                        .eq('user_id', user.id)
                        .maybeSingle()

                    if (roleData) {
                        if (roleData.is_broadcaster) detectedRole = 'broadcaster'
                        else if (roleData.is_moderator) detectedRole = 'moderator'
                        else if (roleData.is_vip) detectedRole = 'vip'
                        else if (roleData.is_subscriber) detectedRole = 'subscriber'
                    }

                    // 4. Client-side Fallback
                    if (detectedRole === 'none' && session.provider_token) {
                        try {
                            // Fetch Broadcaster ID if needed (broadcaster)
                            if (!cachedBroadcasterId) {
                                const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${siteConfig.twitch.channel}`, {
                                    headers: {
                                        'Client-ID': import.meta.env.VITE_TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5',
                                        'Authorization': `Bearer ${session.provider_token}`
                                    }
                                })
                                const userData = await userRes.json()
                                if (userData.data?.[0]?.id) {
                                    cachedBroadcasterId = userData.data[0].id
                                }
                            }

                            if (cachedBroadcasterId) {
                                const subRes = await fetch(`https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${cachedBroadcasterId}&user_id=${user.user_metadata.provider_id}`, { // Using provider_id (Twitch ID)
                                    headers: {
                                        'Client-ID': import.meta.env.VITE_TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5',
                                        'Authorization': `Bearer ${session.provider_token}`
                                    }
                                })

                                if (subRes.ok) {
                                    detectedRole = 'subscriber'
                                } else {
                                    // ToDo: VIP check not possible via twitch api from user at the moment. Implement if feature gets added from twitch
                                }
                            }
                        } catch (e) {
                            console.warn('Twitch API Check failed', e)
                        }
                    }
                }
            } // Close the outer else block
        } catch (err) {
            console.error(err)
        }

        if (!cancelled) {
            setRole(detectedRole)
            if (detectedRole !== 'none') {
                roleCache[user.id] = { role: detectedRole, timestamp: Date.now() }
            }
            setLoading(false)
        }
    }

    checkAccess()

    return () => { cancelled = true }
  }, [user, session, isMod, isBroadcasterFromHook, authLoading, modLoading])

  const isAllowed = role !== 'none'
  const isBroadcaster = role === 'broadcaster'
  
  return {
    canView: isAllowed,
    canPost: isBroadcaster,
    canLike: isAllowed && !isBroadcaster,
    canSuperlike: role === 'vip', // Only VIPs
    canComment: isAllowed,
    canDeleteComment: isBroadcaster || role === 'moderator',
    loading,
    role
  }
}
