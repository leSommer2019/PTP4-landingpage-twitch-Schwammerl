import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/useAuth'
import { useIsModerator } from '../../hooks/useIsModerator'
import SubPage from '../SubPage/SubPage'
import LoginButton from '../LoginButton/LoginButton'
import '../ProtectedRoute/ProtectedRoute.css'

interface BroadcasterRouteProps {
  children: ReactNode
}

export default function BroadcasterRoute({ children }: BroadcasterRouteProps) {
  const { user, loading: authLoading } = useAuth()
  const { isBroadcaster, loading: modLoading } = useIsModerator()
  const { t } = useTranslation()

  if (authLoading || modLoading) {
    return (
      <SubPage>
        <div className="auth-loading">
          <div className="auth-spinner" />
          <p>{t('auth.loading')}</p>
        </div>
      </SubPage>
    )
  }

  if (!user) {
    return (
      <SubPage>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>{t('auth.requiredTitle')}</h2>
          <p>{t('auth.requiredMsg')}</p>
          <div style={{ marginTop: 20 }}>
            <LoginButton />
          </div>
        </div>
      </SubPage>
    )
  }

  if (!isBroadcaster) {
    return (
      <SubPage>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>⛔ {t('error.title', { defaultValue: 'Zugriff verweigert' })}</h2>
          <p>{t('error.forbidden', { defaultValue: 'Diese Seite ist nur für den Broadcaster verfügbar.' })}</p>
        </div>
      </SubPage>
    )
  }

  return <>{children}</>
}
