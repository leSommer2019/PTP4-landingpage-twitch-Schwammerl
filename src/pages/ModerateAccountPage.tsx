import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { supabase } from '../lib/supabase'
import { useIsModerator } from '../hooks/useIsModerator'
import SubPage from '../components/SubPage/SubPage'
import { getErrorMessage } from '../lib/utils'


interface Reward {
  id?: string;
  nameKey: string;
  descKey: string;
  cost: number;
  type: string;
  cooldown?: number;
}


export default function ModerateAccountPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [banName, setBanName] = useState('')
  const [pointsName, setPointsName] = useState('')
  const [pointsAction, setPointsAction] = useState<'reset' | 'give'>('reset')
  const [pointsValue, setPointsValue] = useState<number>(0)
  const [banned, setBanned] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const { isBroadcaster } = useIsModerator()

  // Rewards-Logik
  const [rewards, setRewards] = useState<Reward[]>([])
  const [rewardEdit, setRewardEdit] = useState<Reward | null>(null)
  const [rewardForm, setRewardForm] = useState<Reward>({ nameKey: '', descKey: '', cost: 0, type: '', cooldown: 0 })
  const [rewardBusy, setRewardBusy] = useState(false)

  // Bann-Liste laden
  async function fetchBanned() {
    const { data, error } = await supabase.from('banned_accounts').select('twitch_user_id')
    if (!error && data) setBanned(data.map((b: { twitch_user_id: string }) => b.twitch_user_id))
  }

  // Rewards laden
  async function fetchRewards() {
    const { data, error } = await supabase.from('rewards').select('*')
    if (!error && data) setRewards(data)
    else showToast('Fehler beim Laden der Rewards')
  }
  useEffect(() => { fetchRewards() }, [fetchRewards])

  // Initial fetch
  React.useEffect(() => { fetchBanned() }, [])

  async function banAccount() {
    if (!isBroadcaster) return
    setBusy(true)
    try {
      // Annahme: banName ist Twitch-User-ID oder Username
      const twitch_user_id = banName.trim()
      const display_name = banName.trim()
      const banned_by = user?.user_metadata?.provider_id || user?.user_metadata?.sub || ''
      const { error } = await supabase.from('banned_accounts').insert([{ twitch_user_id, display_name, banned_by }])
      if (error) {
        showToast('Fehler beim Bannen: ' + getErrorMessage(error))
        return
      }
      showToast('Account gebannt!')
      setBanName('')
      fetchBanned()
    } catch (e: unknown) {
      showToast('Fehler beim Bannen: ' + getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function unbanAccount(twitch_user_id: string) {
    if (!isBroadcaster) return
    setBusy(true)
    try {
      const { error } = await supabase.from('banned_accounts').delete().eq('twitch_user_id', twitch_user_id)
      if (error) {
        showToast('Fehler beim Entbannen: ' + getErrorMessage(error))
        return
      }
      showToast('Account entbannt!')
      fetchBanned()
    } catch (e: unknown) {
      showToast('Fehler beim Entbannen: ' + getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handlePoints() {
    if (!pointsName.trim()) return
    setBusy(true)
    try {
      const targetUser = pointsName.trim()
      if (pointsAction === 'reset') {
        const { error } = await supabase
          .from('points')
          .update({ points: 0, reason: 'reset by mod' })
          .eq('twitch_user_id', targetUser)
        if (error) {
          showToast('Fehler beim Punkte löschen: ' + getErrorMessage(error))
          return
        }
        showToast('Punkte gelöscht!')
      } else if (pointsAction === 'give') {
        if (!pointsValue || isNaN(pointsValue)) {
          showToast('Bitte gültigen Punktewert eingeben')
          return
        }
        const { data, error: fetchError } = await supabase
          .from('points')
          .select('points')
          .eq('twitch_user_id', targetUser)
          .maybeSingle()
        if (fetchError) {
          showToast('Fehler beim Punkte holen: ' + getErrorMessage(fetchError))
          return
        }
        let newPoints = pointsValue
        if (data && typeof data.points === 'number') {
          newPoints += data.points
        }
        const { error } = await supabase
          .from('points')
          .update({ points: newPoints, reason: 'added by mod' })
          .eq('twitch_user_id', targetUser)
        if (error) {
          showToast('Fehler beim Punkte vergeben: ' + getErrorMessage(error))
          return
        }
        showToast('Punkte vergeben!')
      }
      setPointsName('')
      setPointsValue(0)
    } catch (e) {
      showToast('Fehler bei Punkte-Aktion: ' + getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Reward speichern (neu/ändern)
  async function saveReward() {
    setRewardBusy(true)
    try {
      const upsert = { ...rewardForm }
      if (rewardEdit && rewardEdit.id) upsert.id = rewardEdit.id
      const { error } = await supabase.from('rewards').upsert([upsert], { onConflict: 'id' })
      if (error) {
        showToast('Fehler beim Speichern: ' + getErrorMessage(error))
        return
      }
      showToast('Reward gespeichert!')
      setRewardEdit(null)
      setRewardForm({ nameKey: '', descKey: '', cost: 0, type: '', cooldown: 0 })
      fetchRewards()
    } catch (e) {
      showToast('Fehler beim Speichern: ' + getErrorMessage(e))
    } finally {
      setRewardBusy(false)
    }
  }

  // Reward löschen
  async function deleteReward(id: string) {
    if (!window.confirm('Wirklich löschen?')) return
    setRewardBusy(true)
    try {
      const { error } = await supabase.from('rewards').delete().eq('id', id)
      if (error) {
        showToast('Fehler beim Löschen: ' + getErrorMessage(error))
        return
      }
      showToast('Reward gelöscht!')
      fetchRewards()
    } catch (e) {
      showToast('Fehler beim Löschen: ' + getErrorMessage(e))
    } finally {
      setRewardBusy(false)
    }
  }

  return (
    <SubPage>
      <h1>👤 {t('moderate.accountManagement')}</h1>


      {/* Bann-Panel */}
      <h2>{t('moderate.banAccount')}</h2>
      <input
        type="text"
        value={banName}
        onChange={e => setBanName(e.target.value)}
        placeholder={t('moderate.banInputPlaceholder')}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--box-border)', marginRight: 8 }}
      />
      <button className="btn btn-danger" disabled={!banName.trim() || !isBroadcaster || busy} onClick={banAccount}>
        🚫 {t('moderate.banBtn')}
      </button>
      <div style={{marginTop:12}}>
        <b>{t('moderate.bannedAccountsTitle')}</b>
        <ul style={{margin:'8px 0'}}>
          {banned.length === 0 && <li style={{color:'#888'}}>{t('moderate.noBannedAccounts')}</li>}
          {banned.map((id) => (
            <li key={id} style={{display:'flex',alignItems:'center',gap:8}}>
              <span>{id}</span>
              {isBroadcaster && (
                <button className="btn btn-sm btn-secondary" onClick={() => unbanAccount(id)} disabled={busy}>{t('moderate.unbanBtn')}</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Kanalpunkte-Panel */}
      <h2 style={{ marginTop: 32 }}>{t('moderate.channelPoints')}</h2>
      <input
        type="text"
        value={pointsName}
        onChange={e => setPointsName(e.target.value)}
        placeholder={t('moderate.pointsInputPlaceholder')}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--box-border)', marginRight: 8 }}
      />
      <select value={pointsAction} onChange={e => setPointsAction(e.target.value as 'reset' | 'give')} style={{ marginRight: 8 }}>
        <option value="reset">{t('moderate.resetPoints')}</option>
        <option value="give">{t('moderate.givePoints')}</option>
      </select>
      {pointsAction === 'give' && (
        <input
          type="number"
          value={pointsValue}
          min={1}
          onChange={e => setPointsValue(Number(e.target.value))}
          placeholder={t('moderate.pointsValuePlaceholder')}
          style={{ width: 100, marginRight: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--box-border)' }}
        />
      )}
      <button className="btn btn-primary" disabled={!pointsName.trim() || (pointsAction==='give' && (!pointsValue || pointsValue<=0)) || busy} onClick={handlePoints}>
        {pointsAction === 'reset' ? '🗑️' : '➕'} {pointsAction === 'reset' ? t('moderate.resetPoints') : t('moderate.givePoints')}
      </button>

      {/* Belohnungen-Panel */}
      <h2 style={{ marginTop: 32 }}>{t('moderate.rewards')}</h2>
      <div style={{background:'#f4f4f4',border:'1px solid #ccc',borderRadius:8,padding:16,marginBottom:24}}>
        {/* Reward-Liste */}
        <b>{t('moderate.rewardsListTitle')}</b>
        <ul style={{margin:'8px 0',padding:0,listStyle:'none'}}>
          {rewards.length === 0 && <li style={{color:'#888'}}>{t('moderate.noRewards')}</li>}
          {rewards.map(r => (
            <li key={r.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{flex:1}}>
                <b>{t(r.nameKey)}</b> ({r.cost} {t('pointsAndRewardSection.punkte')}) – {r.type} {r.cooldown ? `/ CD: ${r.cooldown}s` : ''}
                <div style={{fontSize:'0.95em',color:'var(--color-muted)'}}>{t(r.descKey)}</div>
              </span>
              <button className="btn btn-sm btn-secondary" onClick={() => { setRewardEdit(r); setRewardForm(r); }}>{t('moderate.editRewardBtn')}</button>
              <button className="btn btn-sm btn-danger" onClick={() => r.id && deleteReward(r.id)} disabled={rewardBusy}>{t('moderate.deleteRewardBtn')}</button>
            </li>
          ))}
        </ul>
        {/* Reward-Formular */}
        <div style={{marginTop:16}}>
          <b>{rewardEdit ? t('moderate.editRewardTitle') : t('moderate.newRewardTitle')}</b>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
            <input type="text" placeholder={t('moderate.rewardNameKeyPlaceholder')} value={rewardForm.nameKey} onChange={e => setRewardForm((f: Reward) => ({...f, nameKey: e.target.value}))} style={{flex:1}} />
            <input type="text" placeholder={t('moderate.rewardDescKeyPlaceholder')} value={rewardForm.descKey} onChange={e => setRewardForm((f: Reward) => ({...f, descKey: e.target.value}))} style={{flex:2}} />
            <input type="number" placeholder={t('moderate.rewardCostPlaceholder')} value={rewardForm.cost} min={0} onChange={e => setRewardForm((f: Reward) => ({...f, cost: Number(e.target.value)}))} style={{width:100}} />
            <input type="text" placeholder={t('moderate.rewardTypePlaceholder')} value={rewardForm.type} onChange={e => setRewardForm((f: Reward) => ({...f, type: e.target.value}))} style={{width:100}} />
            <input type="number" placeholder={t('moderate.rewardCooldownPlaceholder')} value={rewardForm.cooldown} min={0} onChange={e => setRewardForm((f: Reward) => ({...f, cooldown: Number(e.target.value)}))} style={{width:120}} />
            <button className="btn btn-primary" onClick={saveReward} disabled={rewardBusy || !rewardForm.nameKey || !rewardForm.type}>{t('moderate.saveRewardBtn')}</button>
            {rewardEdit && <button className="btn btn-secondary" onClick={() => { setRewardEdit(null); setRewardForm({ nameKey: '', descKey: '', cost: 0, type: '', cooldown: 0 }) }}>{t('moderate.cancelRewardBtn')}</button>}
          </div>
        </div>
      </div>

      {/* Anleitung */}
      <div style={{background:'#f8f8f8',border:'1px solid #ddd',borderRadius:8,padding:16,marginBottom:32}}>
        <h2 style={{marginTop:0}}>{t('moderate.instructionsTitle')}</h2>
        <ul style={{marginBottom:8}}>
          <li><b>{t('moderate.instructionsBan')}</b> {t('moderate.instructionsBanDesc')}</li>
          <li><b>{t('moderate.instructionsPoints')}</b> {t('moderate.instructionsPointsDesc')}</li>
          <li><b>{t('moderate.instructionsRewards')}</b> {t('moderate.instructionsRewardsDesc')}</li>
        </ul>
        <b>{t('moderate.technicalHint')}</b>
        <ul>
          <li>{t('moderate.technicalHintPoints')}</li>
          <li>{t('moderate.technicalHintRewards')}</li>
          <li>{t('moderate.technicalHintBanned')}</li>
        </ul>
      </div>
    </SubPage>
  )
}
