import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/useAuth'
import { useIsModerator } from '../../hooks/useIsModerator'
import SubPage from '../SubPage/SubPage'
import '../ProtectedRoute/ProtectedRoute.css'

interface ModeratorRouteProps {
  children: ReactNode
}

export default function ModeratorRoute({ children }: ModeratorRouteProps) {
  const { user, loading: authLoading, signInWithTwitch } = useAuth()
  const { isMod, loading: modLoading } = useIsModerator()
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
        <div className="auth-gate">
          <div className="auth-gate-icon">🔒</div>
          <h1>{t('auth.loginRequired')}</h1>
          <p>{t('auth.loginHint')}</p>
          <button className="btn btn-twitch" onClick={signInWithTwitch}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
            </svg>
            {t('auth.loginWithTwitch')}
          </button>
        </div>
      </SubPage>
    )
  }

  if (!isMod) {
    return (
      <SubPage>
        <div className="auth-gate">
          <div className="auth-gate-icon">⛔</div>
          <h1>{t('moderate.forbidden')}</h1>
          <p>{t('moderate.forbiddenHint')}</p>
        </div>
      </SubPage>
    )
  }

  return <>{children}</>
}

