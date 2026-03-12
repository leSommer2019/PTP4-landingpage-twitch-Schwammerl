import { createContext } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeContextType {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

