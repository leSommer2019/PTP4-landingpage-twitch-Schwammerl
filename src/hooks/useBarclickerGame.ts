import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import type { GameState, PowerUp } from '../types/bartclicker'

// Vordefinierte PowerUps basierend auf Legacy-Code
const POWER_UPS: PowerUp[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    description: '+1 Click pro Sekunde',
    cost: 10,
    level: 0,
    maxLevel: 100,
    incomePerSecond: 1,
    icon: '🖱️'
  },
  {
    id: 'grandma',
    name: 'Grandma',
    description: '+5 Clicks pro Sekunde',
    cost: 100,
    level: 0,
    maxLevel: 100,
    incomePerSecond: 5,
    icon: '👵'
  },
  {
    id: 'farm',
    name: 'Farm',
    description: '+10 Clicks pro Sekunde',
    cost: 1000,
    level: 0,
    maxLevel: 100,
    incomePerSecond: 10,
    icon: '🌾'
  },
  {
    id: 'bank',
    name: 'Bank',
    description: '+50 Clicks pro Sekunde',
    cost: 10000,
    level: 0,
    maxLevel: 100,
    incomePerSecond: 50,
    icon: '🏦'
  },
  {
    id: 'wizard',
    name: 'Wizard',
    description: '+100 Clicks pro Sekunde',
    cost: 100000,
    level: 0,
    maxLevel: 100,
    incomePerSecond: 100,
    icon: '🧙'
  }
]

export function useBarclickerGame() {
  const { user } = useAuth()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const gameStateRef = useRef<GameState | null>(null)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncRef = useRef<number>(0)

  // Initiales Laden des Spielstands
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const loadGameState = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from('bartclicker_scores')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (fetchError) {
          console.error(`Failed to fetch game state: ${fetchError.message}`)
        }

        const newState: GameState = data
          ? {
              userId: data.user_id,
              score: data.total_score || 0,
              clicks: data.clicks || 0,
              ownedPowerUps: data.owned_power_ups || {},
              lastClick: Date.now(),
              offlineProgress: 0,
              sessionId: user.id
            }
          : {
              userId: user.id,
              score: 0,
              clicks: 0,
              ownedPowerUps: {},
              lastClick: Date.now(),
              offlineProgress: 0,
              sessionId: user.id
            }

        gameStateRef.current = newState
        setGameState(newState)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load game state'
        setError(errorMsg)
        console.error('[useBarclickerGame] Load error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadGameState()
  }, [user])

  // Click Handler
  const handleClick = useCallback(() => {
    if (!gameStateRef.current) return

    const currentState = gameStateRef.current
    const clickValue = calculateClickValue(currentState)

    const newState: GameState = {
      ...currentState,
      score: currentState.score + clickValue,
      clicks: currentState.clicks + 1,
      lastClick: Date.now()
    }

    gameStateRef.current = newState
    setGameState(newState)

    // Verzögertes Syncing nach Click
    scheduleSync()
  }, [])

  // Berechne den Wert eines Clicks basierend auf PowerUps
  const calculateClickValue = (state: GameState): number => {
    let value = 1
    Object.entries(state.ownedPowerUps).forEach(([powerUpId, level]) => {
      const powerUp = POWER_UPS.find(p => p.id === powerUpId)
      if (powerUp?.clickMultiplier) {
        value *= powerUp.clickMultiplier ** level
      }
    })
    return Math.max(1, Math.floor(value))
  }

  // Passive Income berechnen
  const calculatePassiveIncome = (state: GameState): number => {
    let income = 0
    Object.entries(state.ownedPowerUps).forEach(([powerUpId, level]) => {
      const powerUp = POWER_UPS.find(p => p.id === powerUpId)
      if (powerUp?.incomePerSecond) {
        income += powerUp.incomePerSecond * level
      }
    })
    return income
  }

  // PowerUp kaufen
  const buyPowerUp = useCallback(async (powerUpId: string) => {
    if (!gameStateRef.current || !user) return

    const currentState = gameStateRef.current
    const powerUp = POWER_UPS.find(p => p.id === powerUpId)
    if (!powerUp) return

    const cost = powerUp.cost * Math.pow(1.15, currentState.ownedPowerUps[powerUpId] || 0)
    if (currentState.score < cost) {
      setError('Not enough score to buy this power-up')
      return
    }

    const newLevel = (currentState.ownedPowerUps[powerUpId] || 0) + 1
    if (newLevel > powerUp.maxLevel) {
      setError('Max level reached for this power-up')
      return
    }

    const newState: GameState = {
      ...currentState,
      score: currentState.score - cost,
      ownedPowerUps: {
        ...currentState.ownedPowerUps,
        [powerUpId]: newLevel
      }
    }

    gameStateRef.current = newState
    setGameState(newState)

    // Sofort synken nach Kauf
    await syncToDatabase(newState)
  }, [user])

  // Sync mit Datenbank
  const syncToDatabase = useCallback(async (state: GameState) => {
    if (!user) return

    try {
      const { error: upsertError } = await supabase.from('bartclicker_scores').upsert(
        {
          user_id: state.userId,
          clicks: state.clicks,
          total_score: state.score,
          owned_power_ups: state.ownedPowerUps,
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )

      if (upsertError) {
        console.error(upsertError)
      }

      lastSyncRef.current = Date.now()
    } catch (err) {
      console.error('[useBarclickerGame] Sync error:', err)
      // Fehler sind nicht kritisch - Offline-Fortschritt wird lokal gespeichert
    }
  }, [user])

  // Verzögertes Syncing
  const scheduleSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      if (gameStateRef.current) {
        syncToDatabase(gameStateRef.current)
      }
    }, 3000) // Sync nach 3 Sekunden Inaktivität
  }, [syncToDatabase])

  // Cleanup
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
      // Final sync bevor Component unmount
      if (gameStateRef.current && user) {
        syncToDatabase(gameStateRef.current)
      }
    }
  }, [user, syncToDatabase])

  return {
    gameState,
    loading,
    error,
    handleClick,
    buyPowerUp,
    calculatePassiveIncome,
    calculateClickValue,
    powerUps: POWER_UPS
  }
}





