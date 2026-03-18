import { createContext } from 'react'

export interface ConfirmModalOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** If set, a text input field is shown (prompt mode). Value is the placeholder. */
  inputPlaceholder?: string
  /** If true, no cancel button is shown (alert mode). */
  alertOnly?: boolean
}

export interface ConfirmModalContextType {
  /** Like window.confirm – resolves true/false */
  showConfirm: (options: ConfirmModalOptions) => Promise<boolean>
  /** Like window.alert – resolves when dismissed */
  showAlert: (options: Omit<ConfirmModalOptions, 'alertOnly'>) => Promise<void>
  /** Like window.prompt – resolves with string or null */
  showPrompt: (options: ConfirmModalOptions) => Promise<string | null>
}

export const ConfirmModalContext = createContext<ConfirmModalContextType | undefined>(undefined)

