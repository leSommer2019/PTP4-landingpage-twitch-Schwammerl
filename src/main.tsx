import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/i18n'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider } from './context/AuthContext'
import { ConfirmModalProvider } from './context/ConfirmModalContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <ConfirmModalProvider>
            <App />
          </ConfirmModalProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
