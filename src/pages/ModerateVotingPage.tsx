import {useState, useEffect} from 'react'
import {useTranslation} from 'react-i18next'
import {supabase} from '../lib/supabase'
import {useAuth} from '../context/useAuth'
import {useToast} from '../context/useToast'
import SubPage from '../components/SubPage/SubPage'
import type {VotingRound} from '../types/clipVoting'

/* ═════════════════════════════════════════════════════════ */

export default function ModerateVotingPage() {
    const {t} = useTranslation()
    const {user} = useAuth()
    const {showToast} = useToast()
    const [rounds, setRounds] = useState<VotingRound[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    /* ── Daten laden ── */
    useEffect(() => {
        (async () => {
            const [roundsRes] = await Promise.all([
                supabase.from('voting_rounds').select('*').order('created_at', {ascending: false}).limit(10),
            ])
            setRounds((roundsRes.data ?? []) as VotingRound[])
            setLoading(false)
        })()
    }, [refreshKey])

    /* ── RPC (Voting-Actions) ── */
    async function callRpc(fn: string) {
        setBusy(true)
        const {data, error} = await supabase.rpc(fn)
        setBusy(false)
        const result = data as { error?: string; success?: boolean } | null
        if (error || result?.error) showToast(`❌ ${error?.message ?? result?.error}`)
        else {
            showToast(`✅ ${fn} ${t('moderate.success')}`);
            setRefreshKey((k) => k + 1)
        }
    }

    const active = rounds.find((r) => r.status === 'active')
    const pending = rounds.find((r) => r.status === 'pending')
    const hasPendingR2 = pending?.type === 'round2'
    const hasActiveR2 = active?.type === 'round2'
    const hasActiveYearly = active?.type === 'yearly'
    const userName = user?.user_metadata?.full_name ?? user?.email ?? ''

    function fmtDate(iso: string | null) {
        if (!iso) return '—'
        return new Date(iso).toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
    }

    return (
        <SubPage>
            <h1>🛡️ {t('moderate.votingTitle')}</h1>
            <p style={{color: 'var(--muted)', marginBottom: 4}}>
                {t('moderate.loggedInAs', {name: userName})}
            </p>

            {/* ── Voting Actions ── */}
            <h2>{t('moderate.actions')}</h2>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, margin: '8px 0 20px'}}>
                <button className="btn btn-primary" disabled={busy || !hasPendingR2}
                        onClick={() => callRpc('admin_start_round2')}>▶️ {t('moderate.startRound2')}</button>
                <button className="btn btn-primary" disabled={busy || !hasActiveR2}
                        onClick={() => callRpc('admin_end_round2')}>⏹️ {t('moderate.endRound2')}</button>
                <button className="btn btn-primary" disabled={busy || hasActiveYearly}
                        onClick={() => callRpc('admin_start_yearly')}>🏆 {t('moderate.startYearly')}</button>
                <button className="btn btn-primary" disabled={busy || !hasActiveYearly}
                        onClick={() => callRpc('admin_end_yearly')}>🏁 {t('moderate.endYearly')}</button>
            </div>

            {/* ── Round overview ── */}
            <h2>{t('moderate.roundOverview')}</h2>
            {loading ? (
                <p style={{color: 'var(--muted)'}}>Laden…</p>
            ) : rounds.length === 0 ? (
                <p style={{color: 'var(--muted)'}}>{t('moderate.noRounds')}</p>
            ) : (
                <div style={{overflowX: 'auto', marginBottom: 24}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem'}}>
                        <thead>
                        <tr style={{borderBottom: '1px solid var(--box-border)', textAlign: 'left'}}>
                            <th style={{padding: '8px 6px'}}>Typ</th>
                            <th style={{padding: '8px 6px'}}>Status</th>
                            <th style={{padding: '8px 6px'}}>Monat</th>
                            <th style={{padding: '8px 6px'}}>Start</th>
                            <th style={{padding: '8px 6px'}}>Ende</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rounds.map((r) => (
                            <tr key={r.id} style={{borderBottom: '1px solid var(--box-border)'}}>
                                <td style={{padding: '8px 6px'}}>{r.type}</td>
                                <td style={{padding: '8px 6px'}}>
                    <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700,
                        background: r.status === 'active' ? 'rgba(76,175,80,.18)' :
                            r.status === 'pending' ? 'rgba(255,193,7,.18)' : 'rgba(124,77,255,.18)',
                        color: r.status === 'active' ? '#4caf50' :
                            r.status === 'pending' ? '#ffc107' : 'var(--accent)',
                    }}>{r.status}</span>
                                </td>
                                <td style={{padding: '8px 6px'}}>{r.month ?? '—'}/{r.year}</td>
                                <td style={{padding: '8px 6px'}}>{fmtDate(r.starts_at)}</td>
                                <td style={{padding: '8px 6px'}}>{fmtDate(r.ends_at)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SubPage>
    )
}

