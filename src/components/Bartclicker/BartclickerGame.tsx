import { useBarclickerGame } from '../../hooks/useBarclickerGame'
import { GameBoard } from './GameBoard'
import { PowerUpShop } from './PowerUpShop'
import './BartclickerGame.css'

export function BartclickerGame() {
  const { gameState, loading, error, handleClick, buyPowerUp, calculatePassiveIncome, powerUps } =
    useBarclickerGame()

  if (loading) {
    return (
      <div className="bartclicker-game loading">
        <div className="game-spinner" />
        <p>Spiel wird geladen...</p>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="bartclicker-game error">
        <p>❌ Fehler beim Laden des Spielstands</p>
        {error && <p className="error-detail">{error}</p>}
      </div>
    )
  }

  const passiveIncome = calculatePassiveIncome(gameState)

  return (
    <div className="bartclicker-game">
      <div className="game-container">
        <GameBoard
          score={gameState.score}
          clicks={gameState.clicks}
          passiveIncome={passiveIncome}
          onClickBart={handleClick}
          isLoading={loading}
        />

        <PowerUpShop
          powerUps={powerUps}
          gameState={gameState}
          currentScore={gameState.score}
          onBuyPowerUp={buyPowerUp}
          isLoading={loading}
        />
      </div>

      {error && <div className="game-error">{error}</div>}
    </div>
  )
}

