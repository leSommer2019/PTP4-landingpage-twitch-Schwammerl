import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBartclickerGame, MAX_OFFLINE_UPGRADES, BASE_REBIRTH_COST } from '../../hooks/useBartclickerGame';
import { useBartclickerLeaderboard } from '../../hooks/useBartclickerLeaderboard';
import { BeardSVG } from './BeardSVG';
import './BartclickerGame.css';

interface BartclickerGameProps {
  compact?: boolean;
}

export default function BartclickerGame({ compact = false }: BartclickerGameProps) {
  const { t, i18n } = useTranslation();
  const { gameState, isLoading, cps, clickBlocked, handleClick, buyItem, buyMaxItems, activateBuff, performRebirth, buyAutobuyer, buyUpgradeAutobuyer, unlockRelic, buyOfflineUpgrade, offlineEarnings, dismissOfflineEarnings, handCps, handCpsAvg } =
    useBartclickerGame();
  const { entries: leaderboardEntries, isLoading: leaderboardLoading } = useBartclickerLeaderboard();

  const [activeTab, setActiveTab] = useState<'shop' | 'leaderboard' | 'stats'>('shop');
  const [shopTab, setShopTab] = useState<'passive' | 'click' | 'booster' | 'relics' | 'autobuyer' | 'offline'>('passive');
  const [clickPulse, setClickPulse] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so buff/debuff timers update without calling Date.now() during render
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) {
    return (
      <div className="bartclicker-loading">
        <p>{t('common.loading')}</p>
      </div>
    );
  }
  // Custom language-aware unit formatter that provides more compact units
  // und eine drastisch erweiterte Skala (bis 10^99 und mehr)
  const formatWithUnits = (num: number, maximumFractionDigits = 2): string => {
    const locale = i18n?.language || undefined;
    const isNegative = num < 0;
    const abs = Math.abs(num);

    // Sehr kleine Zahlen: ganzzahlig anzeigen
    if (abs < 1000) return (isNegative ? '-' : '') + Math.floor(abs).toString();

    // Drastisch erweiterte Einheitenlisten
    const enUnits = [
      '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
      'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod',
      'Vg', 'Uvg', 'Dvg', 'Tvg', 'Qavg', 'Qivg', 'Sxvg', 'Spvg', 'Ocvg', 'Novg',
      'Tg', 'Utg', 'Dtg', 'Ttg', 'Qatg', 'Qitg', 'Sxtg', 'Sptg', 'Octg', 'Notg',
      'Qag', 'Uqag', 'Dqag', 'Tqag', 'Qaqag', 'Qiqag', 'Sxqag', 'Spqag', 'Ocqag', 'Noqag',
      'H', 'Uh', 'Dh', 'Th', 'Qah', 'Qih', 'Sxh', 'Sph', 'Och', 'Noh',
      'C', 'Uc', 'Dc', 'Tc', 'Qac', 'Qic', 'Sxc', 'Spc', 'Occ', 'Noc',
      'Ic', 'Uic', 'Dic', 'Tic', 'Qaic', 'Qiic', 'Sxic', 'Spic', 'Ocic', 'Noic',
      'L', 'Ul', 'Dl', 'Tl', 'Qal', 'Qil', 'Sxl', 'Spl', 'Ocl', 'Nol',
      'AL', 'UAL', 'DAL', 'TAL', 'QAL', 'QIAL', 'SXAL', 'SPAL', 'OCAL', 'NOAL',
      '∞'
    ];
    const deUnits = [
      '', 'k', 'Mio', 'Mrd', 'Bio', 'Billi', 'Tril', 'Quadr', 'Quint', 'Sext', 'Sept', 'Okt', 'Non',
      'Dezi', 'Undezi', 'Duodezi', 'Tredezi', 'Quattuord', 'Quindezi', 'Sexdezi', 'Septdezi', 'Oktdezi', 'Nondezi',
      'Vigint', 'Unvigint', 'Duovigint', 'Trevigint', 'Quattuorvigint', 'Quinvigint', 'Sexvigint', 'Septvigint', 'Oktvigint', 'Nonvigint',
      'Trigint', 'Untrigint', 'Duotrigint', 'Tretrigint', 'Quattuortrigint', 'Quintrigint', 'Sextrigint', 'Septtrigint', 'Okttrigint', 'Nontrigint',
      'Quadragint', 'Unquadragint', 'Duoquadragint', 'Trequadragint', 'Quattuorquadragint', 'Quinquadragint', 'Sexquadragint', 'Septquadragint', 'Oktquadragint', 'Nonquadragint',
      'Quinquagint', 'Unquinquagint', 'Duoquinquagint', 'Trequinquagint', 'Quattuorquinquagint', 'Quinquinquagint', 'Sexquinquagint', 'Septquinquagint', 'Oktquinquagint', 'Nonquinquagint',
      'Sexagint', 'Unsexagint', 'Duosexagint', 'Tresexagint', 'Quattuorsexagint', 'Quinsexagint', 'Sexsexagint', 'Septsexagint', 'Oktsexagint', 'Nonsexagint',
      'Septuagint', 'Unseptuagint', 'Duoseptuagint', 'Treseptuagint', 'Quattuorseptuagint', 'Quinseptuagint', 'Sexseptuagint', 'Septseptuagint', 'Oktseptuagint', 'Nonseptuagint',
      'Octogint', 'Unoctogint', 'Duooctogint', 'Treoctogint', 'Quattuoroctogint', 'Quinoctogint', 'Sexoctogint', 'Septoctogint', 'Oktoctogint', 'Nonoctogint',
      'Nonagint', 'Unnonagint', 'Duononagint', 'Trenonagint', 'Quattuornonagint', 'Quinnonagint', 'Sexnonagint', 'Septnonagint', 'Oktononagint', 'Nonnonagint',
      '∞'
    ];
    const units = (i18n?.language || '').startsWith('de') ? deUnits : enUnits;

    // Index berechnen (je 10^3)
    const exp = Math.floor(Math.log10(abs) / 3);
    const index = Math.min(exp, units.length - 1);
    const value = abs / Math.pow(1000, index);

    // Präzision je nach Größe
    let fractionDigits = maximumFractionDigits;
    if (value >= 100) fractionDigits = 0;
    else if (value >= 10) fractionDigits = Math.min(1, maximumFractionDigits);

    try {
      const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 }).format(value);
      const unit = units[index];
      return (isNegative ? '-' : '') + (unit ? `${formatted} ${unit}` : formatted);
    } catch {
      // Fallback: manuell
      const fixed = value.toFixed(fractionDigits);
      const unit = units[index];
      return (isNegative ? '-' : '') + (unit ? `${fixed} ${unit}` : fixed);
    }
  };

  const formatNumber = (num: number) => formatWithUnits(num, 2);

  const formatCPS = (num: number) => {
    // For small CPS, show with 2 decimals
    if (Math.abs(num) < 1000) return num.toFixed(2);
    return formatWithUnits(num, 2);
  };

  const formatOfflineTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return t('bartclicker.offline.timeHoursMinutes', { hours: h, minutes: m });
    return t('bartclicker.offline.timeMinutes', { minutes: Math.max(1, m) });
  };

  // Calculate current offline earnings rate for display
  const offlineRate = Math.round(
    (0.1 + gameState.offline_earning_upgrades * 0.1 +
      gameState.relics.reduce((sum, r) => (r.effect === 'offlineBonus' ? sum + (r.value || 0) : sum), 0)) * 100
  );
  const OFFLINE_UPGRADE_REBIRTH_COST = 5;
  const rebirthCost = BASE_REBIRTH_COST * Math.pow(2, gameState.rebirth_count);
  const canRebirth = gameState.energy >= rebirthCost;

  const handleBartClick = () => {
    handleClick();
    setClickPulse(true);
    setClickCount(prev => prev + 1);
    setTimeout(() => setClickPulse(false), 300);
  };

  // Berechne Bart-Länge basierend auf vorhandener Energie (Barthaare)
  // Bei 0: Basis 50, bei 1M Barthaare: Maximum 100
  const bartLength = Math.min(100, 50 + Math.log10(gameState.energy + 1) * 10);

  const passiveItems = gameState.shop_items.filter((item) => item.type === 'passive');
  const clickItems = gameState.shop_items.filter((item) => item.type === 'click');

  // Boosters (Temporary buffs)
  const BOOSTERS = [
    { id: 0, name: 'Turbo-Boost', icon: '⚡', effect: '2x CPS für 1 Min', baseCost: 1000 },
    { id: 1, name: 'Klick-Wahnsinn', icon: '💪', effect: '3x Klicks für 45s', baseCost: 1500 },
    { id: 2, name: 'Glücksbonus', icon: '🍀', effect: '+50% für 30s', baseCost: 2000 },
  ];

  // Relics (Permanent bonuses)
  const RELICS = [
    { id: 0, name: 'Antiker Kamm', icon: '🏺', effect: '+10% CPS', baseCost: 25000000 },
    { id: 1, name: 'Magisches Bartöl', icon: '🧪', effect: '+15% Klicks', baseCost: 50000000 },
    { id: 2, name: 'Goldener Bart', icon: '✨', effect: '+25% alles', baseCost: 100000000 },
    { id: 3, name: 'Zeitreisendes Bartöl', icon: '⏳', effect: '+50% Offline', baseCost: 200000000 },
  ];

  return (
    <div className={`bartclicker-game ${compact ? 'compact' : ''}`}>
      {/* Offline Earnings Notification */}
      {offlineEarnings && (
        <div className="offline-earnings-banner">
          <span className="offline-earnings-icon">🌙</span>
          <div className="offline-earnings-text">
            <strong>{t('bartclicker.offline.welcomeBack')}</strong>
            <span>{t('bartclicker.offline.earned', { amount: formatNumber(offlineEarnings.amount), time: formatOfflineTime(offlineEarnings.seconds) })}</span>
          </div>
          <button className="offline-earnings-dismiss" onClick={dismissOfflineEarnings}>✕</button>
        </div>
      )}
      {/* Header Stats */}
      <div className="bartclicker-header">
        <div className="stat-box">
          <h3 className="stat-value">{formatNumber(gameState.energy)}</h3>
          <p className="stat-label">{t('bartclicker.stats.beards')}</p>
        </div>

        <div className="stat-box">
          <h3 className="stat-cps">{formatCPS(cps)}/s</h3>
          <p className="stat-label">{t('bartclicker.stats.perSecond')}</p>
        </div>

        <div className="stat-box">
          <h3 className="stat-rebirth">Rebirth: {gameState.rebirth_count}</h3>
          <p className="stat-label">×{gameState.rebirth_multiplier.toFixed(0)}</p>
        </div>
      </div>

      {/* Main Click Area with Animated Bart */}
      <div className="click-area">
        {clickBlocked && (
          <div className="click-blocked-warning">
            🚫 Zu schnell geklickt! Kurze Pause…
          </div>
        )}
        <button
          className={`click-button ${clickPulse ? 'pulse' : ''} ${clickBlocked ? 'blocked' : ''}`}
          onClick={handleBartClick}
          disabled={isLoading || clickBlocked}
          title={`+Barthaare`}
        >
          <BeardSVG bartLength={bartLength} clickCount={clickCount} />
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'shop' ? 'active' : ''}`}
          onClick={() => setActiveTab('shop')}
        >
          {t('bartclicker.tabs.shop')}
        </button>
        <button
          className={`tab-button ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          {t('bartclicker.tabs.leaderboard')}
        </button>
        <button
          className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          {t('bartclicker.tabs.stats')}
        </button>
      </div>

      {/* Shop Tab with Sub-Tabs */}
      {activeTab === 'shop' && (
        <div className="shop-content">
          <div className="shop-subtabs">
            <button
              className={`shop-subtab ${shopTab === 'passive' ? 'active' : ''}`}
              onClick={() => setShopTab('passive')}
            >
              {t('bartclicker.shopTabs.passive')}
            </button>
            <button
              className={`shop-subtab ${shopTab === 'click' ? 'active' : ''}`}
              onClick={() => setShopTab('click')}
            >
              {t('bartclicker.shopTabs.click')}
            </button>
            <button
              className={`shop-subtab ${shopTab === 'booster' ? 'active' : ''}`}
              onClick={() => setShopTab('booster')}
            >
              {t('bartclicker.shopTabs.booster')}
            </button>
            <button
              className={`shop-subtab ${shopTab === 'relics' ? 'active' : ''}`}
              onClick={() => setShopTab('relics')}
            >
              {t('bartclicker.shopTabs.relics')}
            </button>
            <button
              className={`shop-subtab ${shopTab === 'autobuyer' ? 'active' : ''}`}
              onClick={() => setShopTab('autobuyer')}
            >
              {t('bartclicker.shopTabs.autobuyer')}
            </button>
            <button
              className={`shop-subtab ${shopTab === 'offline' ? 'active' : ''}`}
              onClick={() => setShopTab('offline')}
            >
              {t('bartclicker.shopTabs.offline')}
            </button>
          </div>

          {shopTab === 'passive' && (
            <div className="item-list">
              {passiveItems.map((item) => {
                return (
                  <div key={item.id} className="shop-item">
                    <div className="item-header">
                      <span className="item-icon">{item.icon}</span>
                      <div className="item-info">
                        <h4>{item.name}</h4>
                        <p className="item-cps">{item.cps?.toFixed(1)}/s</p>
                      </div>
                      <span className="item-count">×{item.count}</span>
                    </div>
                    <div className="button-group">
                      <button
                        className="buy-button"
                        onClick={() => buyItem(item.id)}
                        disabled={gameState.energy < item.cost}
                        title={`Kosten: ${formatNumber(item.cost)}`}
                      >
                        {formatNumber(item.cost)}
                      </button>
                      <button
                        className="max-button"
                        onClick={() => buyMaxItems(item.id)}
                        disabled={gameState.energy < item.cost}
                        title="Max kaufen"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {shopTab === 'click' && (
            <div className="item-list">
              {clickItems.map((item) => {
                return (
                  <div key={item.id} className="shop-item">
                    <div className="item-header">
                      <span className="item-icon">{item.icon}</span>
                      <div className="item-info">
                        <h4>{item.name}</h4>
                        <p className="item-power">+{item.clickPower}</p>
                      </div>
                      <span className="item-count">×{item.count}</span>
                    </div>
                    <div className="button-group">
                      <button
                        className="buy-button"
                        onClick={() => buyItem(item.id)}
                        disabled={gameState.energy < item.cost}
                        title={`Kosten: ${formatNumber(item.cost)}`}
                      >
                        {formatNumber(item.cost)}
                      </button>
                      <button
                        className="max-button"
                        onClick={() => buyMaxItems(item.id)}
                        disabled={gameState.energy < item.cost}
                        title="Max kaufen"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {shopTab === 'booster' && (
            <div className="booster-content-wrapper">
              {gameState.active_debuffs.length > 0 && (
                <div className="active-debuffs-banner">
                  {gameState.active_debuffs.map((debuff, idx) => {
                    const remainingSecs = Math.max(0, Math.ceil((debuff.endTime - now) / 1000));
                    return (
                      <div key={idx} className="debuff-pill">
                        ⚠️ {debuff.description} ({remainingSecs}s)
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="booster-grid">
                {BOOSTERS.map((booster) => {
                  const boosterCost = booster.baseCost * Math.pow(2, gameState.rebirth_count);
                  const activeBuff = gameState.active_buffs.find((b) => b.id === booster.id);
                  const remainingSecs = activeBuff?.endTime ? Math.max(0, Math.ceil((activeBuff.endTime - now) / 1000)) : 0;
                  return (
                    <div key={booster.id} className={`booster-card ${activeBuff ? 'booster-active' : ''}`}>
                      <div className="booster-icon">{booster.icon}</div>
                      <h3>{booster.name}</h3>
                      <p className="booster-effect">{booster.effect}</p>
                      <p className="booster-risk">{t('bartclicker.booster.riskWarning')}</p>
                      {activeBuff ? (
                        <div className="booster-timer">⏱ {remainingSecs}s</div>
                      ) : (
                        <button
                          className="buy-button"
                          onClick={() => activateBuff(booster.id)}
                          disabled={gameState.energy < boosterCost}
                        >
                          {formatNumber(boosterCost)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {shopTab === 'relics' && (
            <div className="relics-grid">
              {RELICS.map((relic) => {
                const isUnlocked = gameState.relics.some((r) => r.id === relic.id);
                return (
                  <div key={relic.id} className={`relic-card ${isUnlocked ? 'unlocked' : ''}`}>
                    <div className="relic-icon">{relic.icon}</div>
                    <h3>{relic.name}</h3>
                    <p className="relic-effect">{relic.effect}</p>
                    {isUnlocked ? (
                      <div className="relic-unlocked">✅ Freigeschaltet</div>
                    ) : (
                      <button
                        className="buy-button"
                        onClick={() => unlockRelic(relic.id)}
                        disabled={gameState.energy < relic.baseCost}
                        title={`Kosten: ${formatNumber(relic.baseCost)}`}
                      >
                        {formatNumber(relic.baseCost)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {shopTab === 'autobuyer' && (
            <div className="autobuyer-content">
              <p className="highlight-warning" style={{ fontSize: '0.85rem', marginBottom: '10px' }}>
                ⚠️ Rebirths ausgeben senkt deinen Multiplier! (Aktuell: ×{formatNumber(gameState.rebirth_multiplier)})
              </p>
              <div className="autobuyer-card">
                <h3>{t('bartclicker.autobuyer.autoClicker')}</h3>
                <p>{t('bartclicker.autobuyer.autoClickerDesc')}</p>
                <p className="muted-text" style={{ fontSize: '0.9rem' }}>{t('bartclicker.autobuyer.youHave', { count: gameState.rebirth_count })}</p>
                {gameState.rebirth_count >= 10 && (
                  <p className="highlight-warning" style={{ fontSize: '0.8rem' }}>
                    Multiplier nach Kauf: ×{formatNumber(Math.pow(2, gameState.rebirth_count - 10))}
                  </p>
                )}
                {/* Autobuyer-Button: Nach Kauf als Toggle anzeigen, sonst Kauf-Button */}
                {!gameState.auto_click_buyer_unlocked ? (
                  <button
                    className="buy-button"
                    onClick={() => buyAutobuyer()}
                    disabled={gameState.rebirth_count < 10}
                    style={{ marginTop: '10px' }}
                  >
                    {t('bartclicker.autobuyer.autoClickerEnable')} (10 Rebirths)
                  </button>
                ) : (
                  <button
                    className="buy-button"
                    onClick={() => buyAutobuyer()}
                    style={{
                      marginTop: '10px',
                      background: gameState.auto_click_buyer_enabled ? '#4caf50' : '#888',
                      color: 'white'
                    }}
                  >
                    {gameState.auto_click_buyer_enabled ? t('bartclicker.autobuyer.autoClickerDisable') : t('bartclicker.autobuyer.autoClickerEnable')}
                  </button>
                )}
              </div>
              <div className="autobuyer-card">
                <h3>{t('bartclicker.autobuyer.upgradebuyer')}</h3>
                <p>{t('bartclicker.autobuyer.upgradebuyerDesc')}</p>
                <p className="muted-text" style={{ fontSize: '0.9rem' }}>{t('bartclicker.autobuyer.youHave', { count: gameState.rebirth_count })}</p>
                {gameState.rebirth_count >= 10 && (
                  <p className="highlight-warning" style={{ fontSize: '0.8rem' }}>
                    Multiplier nach Kauf: ×{formatNumber(Math.pow(2, gameState.rebirth_count - 10))}
                  </p>
                )}
                {/* Upgrade-Buyer-Button: Nach Kauf als Toggle anzeigen, sonst Kauf-Button */}
                {!gameState.click_upgrade_buyer_unlocked ? (
                  <button
                    className="buy-button"
                    onClick={() => buyUpgradeAutobuyer()}
                    disabled={gameState.rebirth_count < 10}
                    style={{ marginTop: '10px' }}
                  >
                    {t('bartclicker.autobuyer.autoClickerEnable')} (10 Rebirths)
                  </button>
                ) : (
                  <button
                    className="buy-button"
                    onClick={() => buyUpgradeAutobuyer()}
                    style={{
                      marginTop: '10px',
                      background: gameState.click_upgrade_buyer_enabled ? '#4caf50' : '#888',
                      color: 'white'
                    }}
                  >
                    {gameState.click_upgrade_buyer_enabled ? t('bartclicker.autobuyer.autoClickerDisable') : t('bartclicker.autobuyer.autoClickerEnable')}
                  </button>
                )}
              </div>
            </div>
          )}

          {shopTab === 'offline' && (
            <div className="autobuyer-content">
              <p className="highlight-warning" style={{ fontSize: '0.85rem', marginBottom: '10px' }}>
                ⚠️ Rebirths ausgeben senkt deinen Multiplier! (Aktuell: ×{formatNumber(gameState.rebirth_multiplier)})
              </p>
              <div className="autobuyer-card">
                <h3>{t('bartclicker.offline.shopTitle')}</h3>
                <p>{t('bartclicker.offline.shopDesc')}</p>
                <p className="muted-text" style={{ fontSize: '0.9rem', marginTop: '6px' }}>
                  {t('bartclicker.offline.currentRate', { rate: offlineRate })}
                </p>
                <p className="muted-text" style={{ fontSize: '0.9rem' }}>
                  {t('bartclicker.offline.maxTime')}
                </p>
                <p className="muted-text" style={{ fontSize: '0.9rem' }}>
                  {t('bartclicker.offline.upgradesOwned', { current: gameState.offline_earning_upgrades, max: MAX_OFFLINE_UPGRADES })}
                </p>
                <p className="muted-text" style={{ fontSize: '0.9rem' }}>{t('bartclicker.offline.youHave', { count: gameState.rebirth_count })}</p>
                {gameState.offline_earning_upgrades < MAX_OFFLINE_UPGRADES ? (
                  <button
                    className="buy-button"
                    onClick={() => buyOfflineUpgrade()}
                    disabled={gameState.rebirth_count < OFFLINE_UPGRADE_REBIRTH_COST}
                    style={{ marginTop: '10px' }}
                    title={`${t('bartclicker.offline.upgradeEffect')}`}
                  >
                    {t('bartclicker.offline.buyUpgrade', { cost: OFFLINE_UPGRADE_REBIRTH_COST })}
                  </button>
                ) : (
                  <div style={{ marginTop: '10px' }}>
                    <span className="gold-text">✅ {t('bartclicker.offline.maxUpgrades')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div className="leaderboard-content">
          <div className="leaderboard-header">
            <h3>{t('bartclicker.leaderboard.title')}</h3>
            <p className="leaderboard-subtitle">{t('bartclicker.leaderboard.subtitle')}</p>
          </div>
          <div className="leaderboard-list">
            <div className="leaderboard-item-header">
              <span className="rank-col">{t('bartclicker.leaderboard.rank')}</span>
              <span className="name-col">{t('bartclicker.leaderboard.player')}</span>
              <span className="score-col">{t('bartclicker.leaderboard.score')}</span>
              <span className="rebirth-col">{t('bartclicker.leaderboard.rebirths')}</span>
            </div>
            {leaderboardLoading ? (
              <div className="leaderboard-placeholder">
                <p>{t('bartclicker.leaderboard.loading')}</p>
              </div>
            ) : leaderboardEntries.length === 0 ? (
              <div className="leaderboard-placeholder">
                <p>{t('bartclicker.leaderboard.empty')}</p>
              </div>
            ) : (
              leaderboardEntries.map((entry) => (
                <div key={entry.user_id} className="leaderboard-item">
                  <span className="rank-col">
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </span>
                  <span className="name-col">{entry.display_name}</span>
                  <span className="score-col">{formatNumber(entry.total_ever)}</span>
                  <span className="rebirth-col">×{entry.rebirth_count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="stats-content">
          <div className="stat-row">
            <label>{t('bartclicker.stats.totalEver')}:</label>
            <span>{formatNumber(gameState.total_ever)}</span>
          </div>
          <div className="stat-row">
            <label>{t('bartclicker.stats.currentEnergy')}:</label>
            <span>{formatNumber(gameState.energy)}</span>
          </div>
          <div className="stat-row">
            <label>{t('bartclicker.stats.cps')}:</label>
            <span>{formatNumber(cps)}</span>
          </div>
          <div className="stat-row">
            <label>Hand-CPS (live):</label>
            <span>{Math.floor(handCps)}</span>
          </div>
          <div className="stat-row">
            <label>Hand-CPS (Ø):</label>
            <span>{formatCPS(handCpsAvg)}</span>
          </div>
          <div className="stat-row">
            <label>{t('bartclicker.stats.activeBuffs')}:</label>
            <span>{gameState.active_buffs.length}</span>
          </div>
          <div className="stat-row">
            <label>{t('bartclicker.stats.relicsUnlocked')}:</label>
            <span>{gameState.relics.length}</span>
          </div>
          <div className="stat-row">
            <label>{t('bartclicker.stats.rebirthMultiplier')}:</label>
            <span>×{gameState.rebirth_multiplier.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Rebirth Section - Below Shops + Leaderboard + Stats */}
      <div className="rebirth-section">
        <button className="rebirth-button" onClick={performRebirth} disabled={!canRebirth}>
          {t('bartclicker.rebirth.button')} ({gameState.rebirth_count})
        </button>
        <p className="rebirth-info">
          {t('bartclicker.rebirth.cost', { cost: formatNumber(rebirthCost) })}
        </p>
        <p className="rebirth-info">
          {t('bartclicker.rebirth.description')} {t('bartclicker.rebirth.multiplierBoost', { multiplier: (gameState.rebirth_multiplier * 2).toFixed(0) })}
        </p>
      </div>
    </div>
  );
}

