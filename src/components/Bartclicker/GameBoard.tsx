import { useState } from 'react'
import './GameBoard.css'

interface GameBoardProps {
  score: number
  clicks: number
  passiveIncome: number
  onClickBart: () => void
  isLoading?: boolean
}

export function GameBoard({ score, clicks, passiveIncome, onClickBart, isLoading }: GameBoardProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  const handleClick = () => {
    setIsAnimating(true)
    onClickBart()
    setTimeout(() => setIsAnimating(false), 200)
  }

  const formatNumber = (num: number): string => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K'
    return Math.floor(num).toString()
  }

  return (
    <div className="game-board">
      <div className="game-stats">
        <div className="stat-row">
          <span className="stat-label">Score:</span>
          <span className="stat-value">{formatNumber(score)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Clicks:</span>
          <span className="stat-value">{formatNumber(clicks)}</span>
        </div>
        {passiveIncome > 0 && (
          <div className="stat-row">
            <span className="stat-label">Income/s:</span>
            <span className="stat-value income">{formatNumber(passiveIncome)}</span>
          </div>
        )}
      </div>

      <button
        className={`bart-clicker ${isAnimating ? 'is-clicking' : ''}`}
        onClick={handleClick}
        disabled={isLoading}
        title="Bart anklicken!"
        aria-label="Bart anklicken zum Score erhöhen"
      >
        <span className="bart-face">🧔‍♂️</span>
      </button>

      <div className="game-hint">Klick auf den Bart!</div>
    </div>
  )
}

