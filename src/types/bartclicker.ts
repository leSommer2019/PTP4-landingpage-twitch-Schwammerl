/**
 * Bartclicker Game Types
 * Migriert aus dem Legacy bartclicker.html Projekt
 */

export interface GameScore {
  userId: string
  clicks: number
  scoreEarned: number
  passiveIncome: number
  totalScore: number
  lastUpdated: string
  createdAt: string
}

export interface PowerUp {
  id: string
  name: string
  description: string
  cost: number
  level: number
  maxLevel: number
  incomePerSecond?: number
  clickMultiplier?: number
  icon?: string
}

export interface GameState {
  userId: string
  score: number
  clicks: number
  ownedPowerUps: Record<string, number> // powerUpId -> level
  lastClick: number
  offlineProgress: number
  sessionId: string
}

export interface LeaderboardEntry {
  userId: string
  displayName: string
  totalScore: number
  clicks: number
  rank: number
  lastUpdated: string
}

export interface OfflineProgress {
  duration: number // milliseconds offline
  passiveIncome: number
  message: string
}

