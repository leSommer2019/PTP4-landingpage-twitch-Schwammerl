import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/useAuth'
import { useConfirmModal } from '../context/useConfirmModal'
import { useToast } from '../context/useToast'
import { supabase } from '../lib/supabase'
import { useIsModerator } from '../hooks/useIsModerator'
import SubPage from '../components/SubPage/SubPage'
import { getErrorMessage } from '../lib/utils'


interface Reward {
    id?: string;
    name?: string;
    cost?: number;
    mediaurl?: string;
    showmedia?: boolean;
    description?: string;
    imageurl?: string;
    text?: string;
    duration?: number;
    onceperstream?: boolean;
    cooldown?: number;
    istts?: boolean;
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
  const { isBroadcaster, isMod } = useIsModerator()
  const { showConfirm } = useConfirmModal()

  // Rewards-Logik
  const [rewards, setRewards] = useState<Reward[]>([])
  const [rewardEdit, setRewardEdit] = useState<Reward | null>(null)
  // Default template for reward forms (used for new rewards and as fallback)
  const defaultReward: Reward = {
    name: '',
    cost: 0,
    mediaurl: '',
    showmedia: false,
    description: '',
    imageurl: '',
    text: '',
    duration: 0,
    onceperstream: false,
    cooldown: 0,
    istts: false
  }

  const [rewardForm, setRewardForm] = useState<Reward>(defaultReward)
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [rewardBusy, setRewardBusy] = useState(false)
  const [isWide, setIsWide] = useState<boolean>(false)

  // Merge a reward from DB with defaults, but don't let null values override defaults
  function mergeRewardWithDefaults(r?: Reward) {
    if (!r) return { ...defaultReward }
    const merged: Reward = { ...defaultReward }
    for (const key of Object.keys(defaultReward) as (keyof Reward)[]) {
      const val = r[key]
      if (val === undefined || val === null) continue
      // assign with explicit typing per known field to avoid `any`
      switch (key) {
        case 'name':
        case 'mediaurl':
        case 'description':
        case 'imageurl':
        case 'text':
          merged[key] = val as string
          break
        case 'cost':
        case 'duration':
        case 'cooldown':
          merged[key] = Number(val) as number
          break
        case 'showmedia':
        case 'onceperstream':
        case 'istts':
          merged[key] = Boolean(val) as boolean
          break
        default:
          // Unknown key — skip to keep typings strict
          break
      }
    }
    // preserve id if present
    if (r.id) merged.id = r.id
    return merged
  }

  // Bann-Liste laden
  async function fetchBanned() {
    const { data, error } = await supabase.from('banned_accounts').select('twitch_user_id')
    if (!error && data) setBanned(data.map((b: { twitch_user_id: string }) => b.twitch_user_id))
  }

  // Rewards laden
  const fetchRewards = useCallback(async () => {
    const { data, error } = await supabase.from('rewards').select('*')
    if (!error && data) setRewards(data)
    else showToast('Fehler beim Laden der Rewards')
  }, [showToast])
  useEffect(() => { fetchRewards() }, [fetchRewards])

  // Initial fetch
  React.useEffect(() => { fetchBanned() }, [])

  // Responsive: detect wide (desktop) screens to use 3-column layout
  useEffect(() => {
    const onResize = () => setIsWide(typeof window !== 'undefined' && window.innerWidth >= 1024)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  async function banAccount() {
    // Only moderators or broadcaster can perform bans
    if (!isBroadcaster && !isMod) {
      showToast('Keine Berechtigung!')
      return
    }
    setBusy(true)
    try {
      // Resolve twitch id for given input (either ID or username)
      let twitch_user_id = banName.trim()
      if (!/^\d+$/.test(twitch_user_id)) {
        const res = await fetch(`https://decapi.me/twitch/id/${encodeURIComponent(twitch_user_id)}`)
        if (!res.ok) {
          showToast('Konnte Twitch-ID nicht abrufen')
          return
        }
        twitch_user_id = (await res.text()).trim()
      }

      const myTwitchId = user?.user_metadata?.provider_id || user?.user_metadata?.sub || ''
      // Broadcaster may ban anyone except themselves
      if (isBroadcaster) {
        if (twitch_user_id === myTwitchId) {
          showToast('Du kannst dich nicht selbst bannen')
          return
        }
      }

      // Moderators (non-broadcaster) may only ban plain users (no mods, no broadcaster)
      if (isMod && !isBroadcaster) {
        // Check if target is a moderator or broadcaster
        const { data: modRow, error: modErr } = await supabase.from('moderators').select('twitch_user_id, is_broadcaster').eq('twitch_user_id', twitch_user_id).maybeSingle()
        if (modErr) {
          showToast('Fehler beim Prüfen des Benutzers: ' + getErrorMessage(modErr))
          return
        }
        if (modRow) {
          showToast('Moderatoren können nur normale Benutzer bannen')
          return
        }
      }

      const display_name = banName.trim()
      const banned_by = myTwitchId
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
      let targetUser = pointsName.trim()
      // Twitch-ID holen, falls kein reiner Zahlenwert
      if (!/^\d+$/.test(targetUser)) {
        const res = await fetch(`https://decapi.me/twitch/id/${encodeURIComponent(targetUser)}`)
        if (!res.ok) {
          showToast('Konnte Twitch-ID nicht abrufen')
          return
        }
        const id = (await res.text()).trim()
        if (!/^\d+$/.test(id)) {
          showToast('Ungültige Twitch-ID erhalten')
          return
        }
        targetUser = id
      }
      if (pointsAction === 'reset') {
        // Try to update existing row; if none updated, insert a new row
        const { data: updated, error: updateError } = await supabase
          .from('points')
          .update({ points: 0, reason: 'reset by mod' })
          .eq('twitch_user_id', targetUser)
          .select()
        if (updateError) {
          console.error('points reset update error', updateError)
          showToast('Fehler beim Punkte löschen: ' + getErrorMessage(updateError))
          return
        }
        console.debug('points reset update result', updated)
        if (!updated || (Array.isArray(updated) && updated.length === 0)) {
          const { data: inserted, error: insertError } = await supabase
            .from('points')
            .insert([{ twitch_user_id: targetUser, points: 0, reason: 'reset by mod' }]).select()
          if (insertError) {
            console.error('points reset insert error', insertError)
            showToast('Fehler beim Punkte löschen: ' + getErrorMessage(insertError))
            return
          }
          console.debug('points reset insert result', inserted)
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
        // Try to update first
        const { data: updatedRows, error: updateErr } = await supabase
          .from('points')
          .update({ points: newPoints, reason: 'added by mod' })
          .eq('twitch_user_id', targetUser)
          .select()
        if (updateErr) {
          console.error('points give update error', updateErr)
          showToast('Fehler beim Punkte vergeben: ' + getErrorMessage(updateErr))
          return
        }
        console.debug('points give update result', updatedRows)
        if (!updatedRows || (Array.isArray(updatedRows) && updatedRows.length === 0)) {
          const { data: insertedNew, error: insertErr } = await supabase
            .from('points')
            .insert([{ twitch_user_id: targetUser, points: newPoints, reason: 'added by mod' }]).select()
          if (insertErr) {
            console.error('points give insert error', insertErr)
            showToast('Fehler beim Punkte vergeben: ' + getErrorMessage(insertErr))
            return
          }
          console.debug('points give insert result', insertedNew)
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
      setRewardForm({ ...defaultReward })
      fetchRewards()
    } catch (e) {
      showToast('Fehler beim Speichern: ' + getErrorMessage(e))
    } finally {
      setRewardBusy(false)
    }
  }

  // Reward löschen
  async function deleteReward(id: string) {
    const confirmed = await showConfirm({
      title: t('moderate.deleteRewardConfirmTitle') || 'Belohnung löschen',
      message: t('moderate.deleteRewardConfirmMessage') || 'Soll die Belohnung wirklich gelöscht werden?',
      confirmLabel: t('moderate.deleteRewardConfirmConfirmLabel') || 'Löschen',
      cancelLabel: t('moderate.deleteRewardConfirmCancelLabel') || 'Abbrechen'
    })
    if (!confirmed) return
    setRewardBusy(true)
    try {
      // Call RPC that enforces admin permissions server-side (handles RLS)
      const { data, error } = await supabase.rpc('admin_delete_reward', { p_id: id })
      if (error) {
        showToast('Fehler beim Löschen: ' + getErrorMessage(error))
        return
      }
      if (data && typeof data === 'object' && 'error' in data) {
        const err = (data as { error?: string }).error
        showToast('Fehler beim Löschen: ' + (err ?? JSON.stringify(data)))
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
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <input
          type="text"
          value={banName}
          onChange={e => setBanName(e.target.value)}
          placeholder={t('moderate.banInputPlaceholder')}
          className="modal-input"
          style={{ minWidth: 220 }}
        />
        <button className="btn btn-danger" disabled={!banName.trim() || !isBroadcaster || busy} onClick={banAccount}>
          🚫 {t('moderate.banBtn')}
        </button>
      </div>
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

      {/* Kanalpunkte-Panel (responsive) */}
      <h2 style={{ marginTop: 32 }}>{t('moderate.channelPoints')}</h2>
      <div style={{
        display: 'flex',
        flexDirection: isWide ? 'row' : 'column',
        // On wide screens align children to the bottom so the action button
        // sits on the same vertical level as the input fields (not the labels)
        alignItems: isWide ? 'flex-end' : 'stretch',
        gap: 12,
        marginBottom: 8
      }}>
        <div style={{display:'flex',flexDirection:'column',gap:6, width: isWide ? 'auto' : '100%'}}>
          <label htmlFor="pointsName" style={{fontWeight:'bold'}}>{t('moderate.pointsInputLabel')}</label>
          <input
            id="pointsName"
            type="text"
            value={pointsName}
            onChange={e => setPointsName(e.target.value)}
            placeholder={t('moderate.pointsInputPlaceholder')}
            className="modal-input"
            style={{ width: isWide ? 220 : '100%' }}
          />
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:6, width: isWide ? 160 : '100%'}}>
          <label htmlFor="pointsAction" style={{fontWeight:'bold'}}>{t('moderate.pointsActionLabel')}</label>
          <select id="pointsAction" className="modal-input" value={pointsAction} onChange={e => setPointsAction(e.target.value as 'reset' | 'give')} style={{ width: '100%' }}>
            <option value="reset">{t('moderate.resetPoints')}</option>
            <option value="give">{t('moderate.givePoints')}</option>
          </select>
        </div>

        {pointsAction === 'give' && (
          <div style={{display:'flex',flexDirection:'column',gap:6, width: isWide ? 120 : '100%'}}>
            <label htmlFor="pointsValue" style={{fontWeight:'bold'}}>{t('moderate.pointsValueLabel')}</label>
            <input
              id="pointsValue"
              type="number"
              value={pointsValue}
              min={1}
              onChange={e => setPointsValue(Number(e.target.value))}
              placeholder={t('moderate.pointsValuePlaceholder')}
              className="modal-input"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ width: isWide ? 'auto' : '100%' }}>
          <button className="btn btn-primary" style={{ marginTop: isWide ? 0 : 8, width: isWide ? 'auto' : '100%' }} disabled={!pointsName.trim() || (pointsAction==='give' && (!pointsValue || pointsValue<=0)) || busy} onClick={handlePoints}>
            {pointsAction === 'reset' ? '🗑️' : '➕'} {pointsAction === 'reset' ? t('moderate.resetPoints') : t('moderate.givePoints')}
          </button>
        </div>
      </div>

      {/* Belohnungen-Panel */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:32}}>
        <h2 style={{ margin:0 }}>{t('moderate.rewards')}</h2>
      </div>
      <div style={{background:'var(--box-bg)',border:'1px solid var(--box-border)',borderRadius:8,padding:16,marginBottom:24}}>
        {/* Reward-Liste */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <b>{t('moderate.rewardsListTitle')}</b>
          <button
            className="btn btn-primary"
            onClick={() => {
              setRewardEdit(null);
              setRewardForm({ ...defaultReward });
              setRewardModalOpen(true);
            }}
          >
            {t('moderate.addRewardBtn')}
          </button>
        </div>

        <ul style={{margin:'8px 0',padding:0,listStyle:'none'}}>
          {rewards.length === 0 && <li style={{color:'#888'}}>{t('moderate.noRewards')}</li>}
          {rewards.map(r => (
            <li key={r.id} style={{display:'flex',flexDirection: isWide ? 'row' : 'column',justifyContent: 'space-between',alignItems: isWide ? 'center' : 'stretch',padding:'6px 0'}}>
              <div style={{minWidth:0, flex: 1}}>
                <b style={{display:'block', wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{r.name || ''}</b>
                <div style={{fontSize:12, color:'var(--muted-color, #666)', wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{r.description || ''}</div>
              </div>
              <div style={{display:'flex',gap:8, marginLeft: isWide ? 12 : 0, marginTop: isWide ? 0 : 8}}>
                <button className="btn btn-sm btn-secondary" onClick={() => { setRewardEdit(r); setRewardForm(mergeRewardWithDefaults(r)); setRewardModalOpen(true); }}>{t('moderate.editRewardBtn')}</button>
                <button className="btn btn-sm btn-danger" onClick={() => r.id && deleteReward(r.id)} disabled={rewardBusy}>{t('moderate.deleteRewardBtn')}</button>
              </div>
            </li>
          ))}
        </ul>
        {/* Reward-Formular als Modal */}
        {rewardModalOpen && (
          <div className="confirm-modal is-open">
            <div className="modal-backdrop" onClick={() => setRewardModalOpen(false)} />
            <div className="modal-card" style={{zIndex:10051, maxHeight: '80vh', overflow: 'auto', width: isWide ? 980 : 680}}>
              <b style={{fontSize:'1.2em'}}>{rewardEdit ? t('moderate.editRewardTitle') : t('moderate.newRewardTitle')}</b>
              <form style={{display:'grid',gridTemplateColumns: isWide ? 'repeat(3,1fr)' : 'repeat(2,1fr)',gap:18,marginTop:16}} onSubmit={e => {e.preventDefault();saveReward();setRewardModalOpen(false);}}>
                {/* name / i18n key */}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardName" style={{fontWeight:'bold'}}>{t('moderate.rewardNameLabel') || 'Name'}</label>
                  <input id="rewardName" type="text" className="modal-input" placeholder={t('moderate.rewardNamePlaceholder') || ''} value={rewardForm.name} onChange={e => setRewardForm((f: Reward) => ({...f, name: e.target.value}))} />
                </div>
                {/* removed i18n name key field */}

                {/* description / i18n descKey */}
                <div style={{display:'flex',flexDirection:'column',gap:6,gridColumn: isWide ? 'span 3' : 'span 2'}}>
                  <label htmlFor="rewardDescription" style={{fontWeight:'bold'}}>{t('moderate.rewardDescriptionLabel') || 'Beschreibung'}</label>
                  <textarea id="rewardDescription" className="modal-input" placeholder={t('moderate.rewardDescriptionPlaceholder') || ''} value={rewardForm.description} onChange={e => setRewardForm((f: Reward) => ({...f, description: e.target.value}))} style={{minHeight:80}} />
                </div>

                {/* cost / type */}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardCost" style={{fontWeight:'bold'}}>{t('moderate.rewardCostLabel')}</label>
                  <input id="rewardCost" type="number" className="modal-input" placeholder={t('moderate.rewardCostPlaceholder')} title={t('moderate.rewardCostHint')} value={rewardForm.cost} min={0} onChange={e => setRewardForm((f: Reward) => ({...f, cost: Number(e.target.value)}))} />
                </div>
                {/* mediaurl / showmedia / imageurl fields */}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardMediaurl" style={{fontWeight:'bold'}}>{t('moderate.rewardMediaurlLabel') || 'Media URL'}</label>
                  <input id="rewardMediaurl" type="text" className="modal-input" placeholder={t('moderate.rewardMediaurlPlaceholder') || ''} value={rewardForm.mediaurl} onChange={e => setRewardForm((f: Reward) => ({...f, mediaurl: e.target.value}))} />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6, gridColumn: isWide ? 'span 1' : 'span 2'}}>
                  <label style={{fontWeight:'bold'}}>{t('moderate.rewardShowMediaLabel') || 'Media anzeigen'}</label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" checked={!!rewardForm.showmedia} onChange={e => setRewardForm((f: Reward) => ({...f, showmedia: e.target.checked}))} />
                    <span style={{fontSize:12,color:'var(--muted-color,#666)'}}>{t('moderate.rewardShowMediaHint') || ''}</span>
                  </label>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardImage" style={{fontWeight:'bold'}}>{t('moderate.rewardImageLabel') || 'Image URL'}</label>
                  <input id="rewardImage" type="text" className="modal-input" placeholder={t('moderate.rewardImagePlaceholder') || ''} value={rewardForm.imageurl} onChange={e => setRewardForm((f: Reward) => ({...f, imageurl: e.target.value}))} />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardText" style={{fontWeight:'bold'}}>{t('moderate.rewardTextLabel') || 'Text'}</label>
                  <input id="rewardText" type="text" className="modal-input" placeholder={t('moderate.rewardTextPlaceholder') || ''} value={rewardForm.text} onChange={e => setRewardForm((f: Reward) => ({...f, text: e.target.value}))} />
                </div>

                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label style={{fontWeight:'bold'}}>{t('moderate.rewardIsTtsLabel') || 'Text-to-Speech'}</label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" checked={!!rewardForm.istts} onChange={e => setRewardForm((f: Reward) => ({...f, istts: e.target.checked}))} />
                    <span style={{fontSize:12,color:'var(--muted-color,#666)'}}>{t('moderate.rewardIsTtsHint') || ''}</span>
                  </label>
                </div>

                {/* duration / once per stream */}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardDuration" style={{fontWeight:'bold'}}>{t('moderate.rewardDurationLabel') || 'Duration (s)'}</label>
                  <input id="rewardDuration" type="number" className="modal-input" placeholder={t('moderate.rewardDurationPlaceholder') || ''} value={rewardForm.duration} min={0} onChange={e => setRewardForm((f: Reward) => ({...f, duration: Number(e.target.value)}))} />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6, gridColumn: isWide ? 'span 1' : 'span 2'}}>
                  <label style={{fontWeight:'bold'}}>{t('moderate.rewardOncePerStreamLabel') || 'Einmal pro Stream'}</label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" checked={!!rewardForm.onceperstream} onChange={e => setRewardForm((f: Reward) => ({...f, onceperstream: e.target.checked}))} />
                    <span style={{fontSize:12,color:'var(--muted-color,#666)'}}>{t('moderate.rewardOncePerStreamHint') || ''}</span>
                  </label>
                </div>

                {/* cooldown */}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label htmlFor="rewardCooldown" style={{fontWeight:'bold'}}>{t('moderate.rewardCooldownLabel')}</label>
                  <input id="rewardCooldown" type="number" className="modal-input" placeholder={t('moderate.rewardCooldownPlaceholder')} title={t('moderate.rewardCooldownHint')} value={rewardForm.cooldown} min={0} onChange={e => setRewardForm((f: Reward) => ({...f, cooldown: Number(e.target.value)}))} />
                </div>

                <div style={{display:'flex',flexDirection:'row',gap:12,alignItems:'center',marginTop:18,gridColumn: isWide ? 'span 3' : 'span 2'}}>
                  <button className="btn btn-primary" type="submit" disabled={rewardBusy || !rewardForm.name}>{t('moderate.saveRewardBtn')}</button>
                  <button className="btn btn-secondary" type="button" onClick={() => { setRewardEdit(null); setRewardForm({ ...defaultReward }); setRewardModalOpen(false); }}>{t('moderate.cancelRewardBtn')}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Anleitung entfernt auf Wunsch des Moderators */}
      </SubPage>
  )
}

