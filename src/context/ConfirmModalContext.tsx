import { useCallback, useState, useRef, type ReactNode } from 'react'
import { ConfirmModalContext, type ConfirmModalOptions } from './confirmModalContextDef'
import './ConfirmModal.css'

interface ModalState extends ConfirmModalOptions {
  mode: 'confirm' | 'alert' | 'prompt'
}

export function ConfirmModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const [closing, setClosing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const resolveRef = useRef<((value: unknown) => void) | null>(null)

  const open = useCallback((options: ModalState): Promise<unknown> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setInputValue('')
      setClosing(false)
      setModal(options)
    })
  }, [])

  const close = useCallback((result: unknown) => {
    setClosing(true)
    setTimeout(() => {
      setModal(null)
      setClosing(false)
      if (resolveRef.current) {
        resolveRef.current(result)
        resolveRef.current = null
      }
    }, 180)
  }, [])

  const showConfirm = useCallback(
    (options: ConfirmModalOptions) => open({ ...options, mode: 'confirm' }) as Promise<boolean>,
    [open],
  )

  const showAlert = useCallback(
    (options: Omit<ConfirmModalOptions, 'alertOnly'>) =>
      open({ ...options, alertOnly: true, mode: 'alert' }).then(() => {}),
    [open],
  )

  const showPrompt = useCallback(
    (options: ConfirmModalOptions) =>
      open({ ...options, mode: 'prompt' }) as Promise<string | null>,
    [open],
  )

  const handleConfirm = () => {
    if (modal?.mode === 'prompt') {
      close(inputValue || null)
    } else if (modal?.mode === 'alert') {
      close(undefined)
    } else {
      close(true)
    }
  }

  const handleCancel = () => {
    if (modal?.mode === 'prompt') {
      close(null)
    } else if (modal?.mode === 'alert') {
      close(undefined)
    } else {
      close(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') handleCancel()
  }

  return (
    <ConfirmModalContext.Provider value={{ showConfirm, showAlert, showPrompt }}>
      {children}
      {modal && (
        <div
          className={`confirm-modal is-open ${closing ? 'is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          onKeyDown={handleKeyDown}
        >
          <div className="modal-backdrop" onClick={handleCancel} />
          <div className="modal-card">
            <h3 className="modal-title">{modal.title}</h3>
            <p className="modal-message">{modal.message}</p>
            {modal.mode === 'prompt' && (
              <input
                className="modal-input"
                type="text"
                placeholder={modal.inputPlaceholder ?? ''}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
              />
            )}
            <div className="modal-actions">
              {!modal.alertOnly && (
                <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                  {modal.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={handleConfirm} autoFocus={modal.mode !== 'prompt'}>
                {modal.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmModalContext.Provider>
  )
}

