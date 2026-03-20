import './PointsAndRewardSection.css';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';

interface Reward {
  id: string;
  name: string;
  cost: number;
  mediaurl?: string;
  showmedia?: boolean;
  description?: string;
  imageurl?: string;
  text?: string;
  duration?: number;
  onceperstream?: boolean;
  cooldown?: number; // Cooldown in Sekunden
  istts?: boolean;
}

interface RedeemRewardParams {
  p_twitch_user_id: string;
  p_reward_id: string;
  p_description?: string | null;
  p_cost?: number | null;
  p_ttstext?: string | null;
  p_stream_id?: string | null;
}

export default function PointsAndRewardSection({ isLive }: { isLive: boolean }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const [points, setPoints] = useState<number | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  // Änderung: Erlaubt null, damit wir zwischen Liste und Detail unterscheiden können
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [ttsText, setTtsText] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  const selectedReward = rewards.find(r => r.id === selectedRewardId) ?? null;

  // Cooldown prüfen, wenn Reward ausgewählt wird
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    async function checkCooldown() {
      setCooldownActive(false);
      setCooldownRemaining(0);
      if (!selectedRewardId || !user) return;
      const twitchUserId = user.user_metadata?.provider_id || user.user_metadata?.sub || user.id;
      // Lade letzte Einlösung für diesen User und Reward
      const { data, error } = await supabase
        .from('redeemed_rewards')
        .select('timestamp')
        .eq('twitch_user_id', twitchUserId)
        .eq('reward_id', selectedRewardId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return;
      const reward = rewards.find(r => r.id === selectedRewardId);
      if (!reward || !reward.cooldown) return;
      if (data && data.timestamp) {
        const last = new Date(data.timestamp).getTime();
        const now = Date.now();
        const cooldownMs = reward.cooldown * 1000;
        const remaining = last + cooldownMs - now;
        if (remaining > 0) {
          setCooldownActive(true);
          setCooldownRemaining(Math.ceil(remaining / 1000));
          // Starte Intervall für Restzeit
          interval = setInterval(() => {
            const newRemaining = last + cooldownMs - Date.now();
            if (newRemaining > 0) {
              setCooldownRemaining(Math.ceil(newRemaining / 1000));
            } else {
              setCooldownActive(false);
              setCooldownRemaining(0);
              clearInterval(interval);
            }
          }, 1000);
        }
      }
    }
    checkCooldown();
    return () => { if (interval) clearInterval(interval); };
  }, [selectedRewardId, user, rewards]);

  // Punkte laden
  useEffect(() => {
    if (loading || !user) return;

    const twitchUserId = user.user_metadata?.provider_id || user.user_metadata?.sub;
    if (!twitchUserId) return;

    supabase
        .from('points')
        .select('points')
        .eq('twitch_user_id', twitchUserId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            setPoints(0);
            setStatus({ type: 'error', msg: t('Fehler beim Laden der Punkte') });
          } else {
            setPoints(data?.points ?? 0);
          }
        });
  }, [user, loading, t]);

  // Rewards laden
  useEffect(() => {
    supabase
        .from('rewards')
        .select('*')
        .then(({ data, error }) => {
          if (error) {
            setStatus({ type: 'error', msg: t('Fehler beim Laden der Rewards') });
          }
          setRewards(data || []);
        });
  }, [t]);

  const handleRedeem = async () => {
    if (!selectedRewardId) return;
    const reward = rewards.find(r => r.id === selectedRewardId);
    if (!reward || !user) return;
    // Wenn reward.istts true ist, muss der Nutzer Text eingeben
    if (reward.istts && !ttsText) return;
    if (cooldownActive) return;
    setRedeemLoading(true);
    setStatus(null);

    const twitchUserId = user.user_metadata?.provider_id || user.user_metadata?.sub || user.id;
    const username = user.user_metadata?.user_login || user.user_metadata?.preferred_username || user.user_metadata?.full_name || user.email || twitchUserId;
    function replaceNamePlaceholders(s?: string) {
      if (!s) return s || '';
      return s.replace(/%name%/g, username);
    }

    const descriptionToInsert = (() => {
      if (reward.istts) {
        // Bei TTS: prefix aus reward.text voranstellen, dann Platzhalter ersetzen
        const prefix = reward.text || reward.description || '';
        const combined = prefix && ttsText ? `${prefix} ${ttsText}` : (prefix || ttsText);
        return replaceNamePlaceholders(combined);
      }
      return replaceNamePlaceholders(reward.description);
    })();

    // Verwende serverseitige RPC-Funktion 'redeem_reward' statt direktem Insert,
    // damit Cooldown / once-per-stream zentral auf dem Server geprüft werden können.
    try {
      // Versuche aktive Stream-Session aus der DB zu lesen und übergebe deren id an die RPC
      let streamId: string | null = null;
      try {
        const { data: sessions } = await supabase
          .from('stream_sessions')
          .select('id')
          .eq('is_active', true)
          .order('started_at', { ascending: false })
          .limit(1);
        if (sessions && Array.isArray(sessions) && sessions.length > 0) {
          streamId = sessions[0].id || null;
        }
      } catch {
        // ignore errors — RPC hat bereits Fallback, RPC selbst versucht ebenfalls, aktive Session zu ermitteln
      }

      const rpcParams: RedeemRewardParams = {
        p_twitch_user_id: twitchUserId,
        p_reward_id: reward.id,
        p_description: descriptionToInsert,
        p_cost: reward.cost,
        p_ttstext: ttsText || null,
        p_stream_id: streamId
      };
      const { data, error: rpcError } = await supabase.rpc('redeem_reward', rpcParams as object);
      if (rpcError) {
        setStatus({ type: 'error', msg: t('Fehler beim Einlösen: {{msg}}', { msg: rpcError.message }) });
      } else if (data && Array.isArray(data) && data.length > 0 && data[0].error) {
        // Die Funktion gibt kontrollierte Fehler zurück (z.B. cooldown_active)
        const info = data[0];
        if (info.error === 'cooldown_active') {
          const rem = info.remaining || 0;
          setStatus({ type: 'error', msg: t('Cooldown aktiv. Noch {{sec}}s', { sec: rem }) });
        } else if (info.error === 'once_per_stream_active') {
          setStatus({ type: 'error', msg: t('Diese Belohnung kann nur einmal pro Stream eingelöst werden.') });
        } else {
          setStatus({ type: 'error', msg: t('Ein unbekannter Fehler ist aufgetreten.') });
        }
      } else {
        setStatus({ type: 'success', msg: t('Erfolgreich eingelöst!') });
        if (points !== null) setPoints(points - reward.cost);
        setTtsText('');
        setCooldownActive(true);
        setCooldownRemaining(reward.cooldown || 0);
        setTimeout(() => {
          setSelectedRewardId(null);
          setStatus(null);
        }, 2000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: 'error', msg: t('Fehler beim Einlösen: {{msg}}', { msg }) });
    }
    setRedeemLoading(false);
  };

  if (loading || !user || !isLive) return null;

  return (
      <div className="points-reward-section">
        <div className="points-header">
          <span>{t('Deine Punkte')}</span>
          <div className="points-amount">{points?.toLocaleString() ?? '0'}</div>
        </div>

        {!selectedRewardId ? (
            /* GRID ANSICHT: 3 Spalten durch CSS */
            <div className="reward-grid">
              {rewards.map((r) => (
                  <button
                      key={r.id}
                      className="reward-card"
                      onClick={() => setSelectedRewardId(r.id)}
                  >
                    <div className="reward-card-title">{r.name}</div>
                    <div className="reward-card-cost">{t('{{cost}} Punkte', { cost: r.cost })}</div>
                  </button>
              ))}
            </div>
        ) : (
            /* DETAIL ANSICHT */
            <div className="reward-detail-view">
              <button
                  className="back-btn"
                  onClick={() => { setSelectedRewardId(null); setStatus(null); }}
              >
                ← {t('Zurück')}
              </button>

              <div className="selected-reward-info">
                <div className="reward-card-title" style={{ fontSize: '1.2rem' }}>
                  {selectedReward ? selectedReward.name : ''}
                </div>
                <div className="reward-card-cost">
                  {selectedReward ? t('{{cost}} Punkte', { cost: selectedReward.cost }) : ''}
                </div>
              </div>
              {selectedReward && selectedReward.istts && (
                  <textarea
                      className="tts-input"
                      placeholder={t('Deine Nachricht...')}
                      value={ttsText}
                      onChange={e => setTtsText(e.target.value)}
                      rows={3}
                      maxLength={200}
                  />
              )}
              <button
                  className="btn btn-primary redeem-btn"
                  onClick={handleRedeem}
                  disabled={
                      redeemLoading ||
                      !selectedReward ||
                      (selectedReward.istts && !ttsText) ||
                      (points !== null && selectedReward && points < selectedReward.cost ) ||
                      cooldownActive
                  }
              >
                {redeemLoading
                  ? t('Lädt...')
                  : cooldownActive
                    ? t('Cooldown: {{sec}}s', { sec: cooldownRemaining })
                    : t('Jetzt einlösen')}
              </button>
            </div>
        )}

        {status && (
            <div className={`${status.type}-msg`} style={{ marginTop: '12px' }}>
              {status.msg}
            </div>
        )}
      </div>
  );
}