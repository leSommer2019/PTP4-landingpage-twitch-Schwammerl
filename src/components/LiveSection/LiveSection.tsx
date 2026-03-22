import {useState, useEffect, useRef} from 'react'
import {useTranslation} from 'react-i18next'
import siteConfig from '../../config/siteConfig'
import NextStream from '../NextStream/NextStream'
import CurrentGame from '../CurrentGame/CurrentGame'
import PointsAndRewardSection from './PointsAndRewardSection'
import {supabase} from '../../lib/supabase'
import './LiveSection.css'

/* ── Twitch Player SDK types ── */
interface TwitchPlayerInstance {
    addEventListener(event: string, cb: () => void): void
}

declare global {
    interface Window {
        Twitch?: {
            Player: {
                new(
                    el: string | HTMLElement,
                    opts: Record<string, unknown>,
                ): TwitchPlayerInstance
                ONLINE: string
                OFFLINE: string
                READY: string
            }
        }
    }
}

export default function LiveSection() {
    const {t} = useTranslation()
    const {channel} = siteConfig.twitch
    const parent =
        typeof window !== 'undefined' ? window.location.hostname : 'localhost'

    const [isLive, setIsLive] = useState(false)
    const playerContainerRef = useRef<HTMLDivElement>(null)
    const playerCreated = useRef(false)

    /* ── Load Twitch Player SDK & listen for ONLINE / OFFLINE ── */
    useEffect(() => {
        function createPlayer() {
            if (
                !window.Twitch?.Player ||
                !playerContainerRef.current ||
                playerCreated.current
            )
                return
            playerCreated.current = true

            console.log('Player wird erstellt', playerContainerRef.current, window.Twitch?.Player)
            const player = new window.Twitch.Player(playerContainerRef.current, {
                channel,
                parent: [parent],
                width: '100%',
                height: '100%',
                autoplay: true,
            })
            console.log('Player Instanz:', player)

            player.addEventListener(window.Twitch.Player.ONLINE, () => {
                console.log('Twitch Player ONLINE Event')
                setIsLive(true)
            })
            player.addEventListener(window.Twitch.Player.OFFLINE, () => {
                console.log('Twitch Player OFFLINE Event')
                setIsLive(false)
            })
        }

        // SDK already available
        if (window.Twitch?.Player) {
            createPlayer()
            return
        }

        // Script tag exists but SDK not ready yet
        const existing = document.querySelector(
            'script[src*="player.twitch.tv"]',
        )
        if (existing) {
            const id = setInterval(() => {
                if (window.Twitch?.Player) {
                    clearInterval(id)
                    createPlayer()
                }
            }, 200)
            return () => clearInterval(id)
        }

        // Load script for the first time
        const script = document.createElement('script')
        script.src = 'https://player.twitch.tv/js/embed/v1.js'
        script.async = true
        script.onload = createPlayer
        document.head.appendChild(script)
    }, [channel, parent])

    // Fallback: Prüfe alle 30s per Supabase-Function, ob der Stream live ist
    useEffect(() => {
        let cancelled = false
        type TwitchGameResponse = { isLive: boolean }

        async function checkLiveStatus() {
            try {
                const {data} = await supabase.functions.invoke<TwitchGameResponse>('twitch-game')
                if (!cancelled && data?.isLive) setIsLive(true)
            } catch {
                // Fehler beim Live-Check ignorieren (z.B. Netzwerkfehler)
            }
        }

        checkLiveStatus()
        const interval = setInterval(checkLiveStatus, 30000)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [])

    const showStream = isLive

    return (
        <section className="live-section" aria-label="Live Stream">
            <div className="embed-card">
                <a
                    href={`https://www.twitch.tv/${channel}`}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <div className="embed-title">
                        {showStream ? t('live.title') : t('live.offlineTitle')}
                    </div>
                </a>

                {/* ── Offline → nächster Termin ── */}
                {!showStream && <NextStream/>}

                {/* ── Current Game (only while live) ── */}
                <CurrentGame isLive={showStream}/>
                <p></p>
                {/* ── Player + Chat nur wenn live ── */}
                {/* Entferne das {showStream && ( ... )} um die embed-row */}
                <div className={`embed-row ${!showStream ? 'embed-row--hidden' : ''}`}>
                    <div
                        className="embed-player"
                        ref={playerContainerRef}
                        style={{ minHeight: 400 }}
                    ></div>

                    {/* Der Chat kann bedingt bleiben, da er ein einfaches Iframe ist */}
                    {showStream && (
                        <div className="embed-chat">
                            <iframe
                                src={`https://www.twitch.tv/embed/${channel}/chat?parent=${parent}&darkpopout`}
                                title="Twitch Chat"
                                allow="autoplay; fullscreen"
                            />
                        </div>
                    )}
                </div>
                <p></p>
                {/* Punkte & Rewards auf exakt gleicher Breite wie embed-row */}
                <div className="points-reward-section-wrapper">
                    <PointsAndRewardSection isLive={showStream}/>
                </div>
            </div>
        </section>
    )
}
