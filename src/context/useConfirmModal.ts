import { useContext } from 'react'
import { ConfirmModalContext } from './confirmModalContextDef'
export function useConfirmModal() {
  const ctx = useContext(ConfirmModalContext)
  if (!ctx) throw new Error('useConfirmModal must be used within ConfirmModalProvider')
  return ctx
}