import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBartclickerGame } from '../../hooks/useBartclickerGame';
import './BartclickerGame.css';

interface BartclickerGameProps {
  compact?: boolean;
}

export default function BartclickerGame({ compact = false }: BartclickerGameProps) {
  const { t } = useTranslation();
  const { gameState, isLoading, cps, handleClick, buyItem, activateBuff, performRebirth } =
    useBartclickerGame();

  const [activeTab, setActiveTab] = useState<'shop' | 'booster' | 'relics' | 'autobuyer' | 'stats'>('shop');
  const [shopTab, setShopTab] = useState<'passive' | 'click'>('passive');
  const [clickPulse, setClickPulse] = useState(false);
  const [bartScale, setBartScale] = useState(1);

  if (isLoading) {
    return (
      <div className="bartclicker-loading">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'b';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'm';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'k';
    return Math.floor(num).toString();
  };

  const handleBartClick = () => {
    handleClick();
    setClickPulse(true);
    setBartScale(1.1);
    setTimeout(() => setClickPulse(false), 300);
    setTimeout(() => setBartScale(1), 200);
  };

  // Berechne Bart-Länge basierend auf Rebirth-Count
  const bartLength = Math.min(100, 50 + gameState.rebirth_count * 5);

  const passiveItems = gameState.shop_items.filter((item) => item.type === 'passive');
  const clickItems = gameState.shop_items.filter((item) => item.type === 'click');

  const BOOSTERS = [
    { id: 0, name: 'Turbo-Boost', icon: '⚡', effect: '2x CPS für 1 Min', cost: 1000 },
    { id: 1, name: 'Klick-Wahnsinn', icon: '💪', effect: '3x Klicks für 45s', cost: 1500 },
  ];

  const RELICS = [
    { id: 0, name: 'Antiker Kamm', icon: '🏺', effect: '+10% CPS', cost: 25000000 },
    { id: 1, name: 'Magisches Bartöl', icon: '🧪', effect: '+15% Klicks', cost: 50000000 },
  ];

  return (
    <div className={`bartclicker-game ${compact ? 'compact' : ''}`}>
      {/* Header Stats */}
      <div className="bartclicker-header">
        <div className="stat-box">
          <h2 className="stat-value">{formatNumber(gameState.energy)}</h2>
          <p className="stat-label">Barthaare</p>
        </div>

        <div className="stat-box">
          <h3 className="stat-cps">{formatNumber(cps)}/s</h3>
          <p className="stat-label">Pro Sekunde</p>
        </div>

        <div className="stat-box">
          <h3 className="stat-rebirth">Rebirth: {gameState.rebirth_count}</h3>
          <p className="stat-label">×{gameState.rebirth_multiplier.toFixed(0)}</p>
        </div>
      </div>

      {/* Main Click Area with Animated Bart */}
      <div className="click-area">
        <button
          className={`click-button ${clickPulse ? 'pulse' : ''}`}
          onClick={handleBartClick}
          disabled={isLoading}
          style={{ transform: `scale(${bartScale})` }}
          title={`+Barthaare`}
        >
          <svg viewBox="25 15 75 75" xmlns="http://www.w3.org/2000/svg" className="beard-svg">
            {/* Kopf */}
            <rect x="30" y="30" width="40" height="40" rx="6" fill="#d4a373" />
            
            {/* Stirnband/Linie */}
            <rect x="25" y="32" width="50" height="5" rx="2" fill="#7C4DFF" />
            
            {/* Haare oben */}
            <path d="M30 32 L70 32 L70 25 Q 50 15 30 25 Z" fill="#7C4DFF" />
            <circle cx="50" cy="18" r="2" fill="#5c38cc" />
            
            {/* Augen */}
            <g stroke="#111" strokeWidth="1.2" fill="none">
              <rect x="34" y="42" width="10" height="7" rx="1" />
              <rect x="56" y="42" width="10" height="7" rx="1" />
            </g>
            <text x="39" y="47" fontSize="5" textAnchor="middle" fill="#000">o</text>
            <text x="61" y="47" fontSize="5" textAnchor="middle" fill="#000">o</text>
            
            {/* Mund */}
            <path d="M44 50 h12" stroke="#111" strokeWidth="1.2" fill="none" />
            
            {/* Bart - wächst mit Rebirths */}
            <path
              d={`M 30 60 Q 50 63 70 60 L 70 ${76 + bartLength * 0.2} Q 50 ${90 + bartLength * 0.2} 30 ${76 + bartLength * 0.2} Z`}
              fill="#3d2b1f"
              style={{ transition: 'all 0.2s ease' }}
            />
            
            {/* Bart-Details */}
            <g stroke="#2a1f15" strokeWidth="0.8" opacity="0.6">
              <path d="M 40 68 Q 40 72 42 76" />
              <path d="M 50 65 Q 50 70 50 76" />
              <path d="M 60 68 Q 60 72 58 76" />
            </g>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'shop' ? 'active' : ''}`}
          onClick={() => setActiveTab('shop')}
        >
          🛒 Shop
        </button>
        <button
          className={`tab-button ${activeTab === 'booster' ? 'active' : ''}`}
          onClick={() => setActiveTab('booster')}
        >
          ⚡ Booster
        </button>
        <button
          className={`tab-button ${activeTab === 'relics' ? 'active' : ''}`}
          onClick={() => setActiveTab('relics')}
        >
          💎 Relics
        </button>
        <button
          className={`tab-button ${activeTab === 'autobuyer' ? 'active' : ''}`}
          onClick={() => setActiveTab('autobuyer')}
        >
          🤖 Auto-Buyer
        </button>
        <button
          className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Stats
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
              💧 Passive Items
            </button>
            <button
              className={`shop-subtab ${shopTab === 'click' ? 'active' : ''}`}
              onClick={() => setShopTab('click')}
            >
              💪 Click Items
            </button>
          </div>

          {shopTab === 'passive' && (
            <div className="item-list">
              {passiveItems.map((item) => (
                <div key={item.id} className="shop-item">
                  <div className="item-header">
                    <span className="item-icon">{item.icon}</span>
                    <div className="item-info">
                      <h4>{item.name}</h4>
                      <p className="item-cps">{item.cps?.toFixed(1)}/s</p>
                    </div>
                    <span className="item-count">×{item.count}</span>
                  </div>
                  <button
                    className="buy-button"
                    onClick={() => buyItem(item.id)}
                    disabled={gameState.energy < item.cost}
                    title={`Kosten: ${formatNumber(item.cost)}`}
                  >
                    {formatNumber(item.cost)}
                  </button>
                </div>
              ))}
            </div>
          )}

          {shopTab === 'click' && (
            <div className="item-list">
              {clickItems.map((item) => (
                <div key={item.id} className="shop-item">
                  <div className="item-header">
                    <span className="item-icon">{item.icon}</span>
                    <div className="item-info">
                      <h4>{item.name}</h4>
                      <p className="item-power">+{item.clickPower}</p>
                    </div>
                    <span className="item-count">×{item.count}</span>
                  </div>
                  <button
                    className="buy-button"
                    onClick={() => buyItem(item.id)}
                    disabled={gameState.energy < item.cost}
                    title={`Kosten: ${formatNumber(item.cost)}`}
                  >
                    {formatNumber(item.cost)}
                  </button>
                </div>
              ))}
            </div>
          )}

          {gameState.rebirth_count === 0 && gameState.total_ever >= 1000000 && (
            <div className="rebirth-section">
              <button className="rebirth-button" onClick={performRebirth}>
                🔄 Rebirth
              </button>
              <p className="rebirth-info">
                Verdopple deine Multiplikatoren und starte von vorne! Dein Bart wird länger!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Booster Tab */}
      {activeTab === 'booster' && (
        <div className="booster-content">
          <div className="booster-grid">
            {BOOSTERS.map((booster) => (
              <div key={booster.id} className="booster-card">
                <div className="booster-icon">{booster.icon}</div>
                <h3>{booster.name}</h3>
                <p className="booster-effect">{booster.effect}</p>
                <button
                  className="buy-button"
                  onClick={() => activateBuff(booster.id)}
                  disabled={gameState.energy < booster.cost}
                >
                  {formatNumber(booster.cost)}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relics Tab */}
      {activeTab === 'relics' && (
        <div className="relics-content">
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
                      disabled={gameState.energy < relic.cost}
                      title={`Kosten: ${formatNumber(relic.cost)}`}
                    >
                      {formatNumber(relic.cost)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-Buyer Tab */}
      {activeTab === 'autobuyer' && (
        <div className="autobuyer-content">
          <div className="autobuyer-card">
            <h3>🤖 Auto-Klicker</h3>
            <p>Automatisches Klicken aktivieren (Coming Soon)</p>
            <div className="toggle-switch">
              <input type="checkbox" disabled />
              <span className="toggle-slider"></span>
            </div>
          </div>
          <div className="autobuyer-card">
            <h3>📈 Auto-Upgrade Käufer</h3>
            <p>Automatische Kauf von Upgrades (Coming Soon)</p>
            <div className="toggle-switch">
              <input type="checkbox" disabled />
              <span className="toggle-slider"></span>
            </div>
          </div>
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="stats-content">
          <div className="stat-row">
            <label>Total Ever:</label>
            <span>{formatNumber(gameState.total_ever)}</span>
          </div>
          <div className="stat-row">
            <label>Current Energy:</label>
            <span>{formatNumber(gameState.energy)}</span>
          </div>
          <div className="stat-row">
            <label>CPS:</label>
            <span>{formatNumber(cps)}</span>
          </div>
          <div className="stat-row">
            <label>Active Buffs:</label>
            <span>{gameState.active_buffs.length}</span>
          </div>
          <div className="stat-row">
            <label>Relics Unlocked:</label>
            <span>{gameState.relics.length}</span>
          </div>
          <div className="stat-row">
            <label>Rebirth Multiplier:</label>
            <span>×{gameState.rebirth_multiplier.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}



