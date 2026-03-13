import type { PowerUp, GameState } from '../../types/bartclicker'
import './PowerUpShop.css'

interface PowerUpShopProps {
  powerUps: PowerUp[]
  gameState: GameState | null
  currentScore: number
  onBuyPowerUp: (powerUpId: string) => void
  isLoading?: boolean
}

export function PowerUpShop({
  powerUps,
  gameState,
  currentScore,
  onBuyPowerUp,
  isLoading
}: PowerUpShopProps) {
  const formatNumber = (num: number): string => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K'
    return Math.floor(num).toString()
  }

  const getUpgradeCost = (powerUp: PowerUp): number => {
    const currentLevel = gameState?.ownedPowerUps[powerUp.id] || 0
    return powerUp.cost * Math.pow(1.15, currentLevel)
  }

  return (
    <div className="power-up-shop">
      <h2>🛍️ Shop</h2>
      <div className="power-ups-grid">
        {powerUps.map(powerUp => {
          const cost = getUpgradeCost(powerUp)
          const level = gameState?.ownedPowerUps[powerUp.id] || 0
          const canAfford = currentScore >= cost && level < powerUp.maxLevel
          const maxed = level >= powerUp.maxLevel

          return (
            <div
              key={powerUp.id}
              className={`power-up-card ${!canAfford && !maxed ? 'disabled' : ''} ${maxed ? 'maxed' : ''}`}
            >
              <div className="power-up-icon">{powerUp.icon}</div>
              <div className="power-up-info">
                <h3>{powerUp.name}</h3>
                <p className="description">{powerUp.description}</p>
                <div className="level">
                  Level: <span>{level}</span>
                  {!maxed && <span className="max-level"> / {powerUp.maxLevel}</span>}
                </div>
              </div>
              <button
                className="buy-btn"
                onClick={() => onBuyPowerUp(powerUp.id)}
                disabled={!canAfford || isLoading || maxed}
                title={maxed ? 'Max Level erreicht' : canAfford ? 'Kaufen' : 'Nicht genug Score'}
              >
                {maxed ? '✓ MAX' : `${formatNumber(cost)}`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

