import {Link} from 'react-router-dom'
import {useTranslation} from 'react-i18next'
import {useAuth} from '../context/useAuth'
import SubPage from '../components/SubPage/SubPage'

export default function ModeratePage() {
    const {t} = useTranslation()
    const {user} = useAuth()
    const userName =
        user?.user_metadata?.full_name ??
        user?.user_metadata?.preferred_username ??
        user?.email ??
        t('moderate.unknownUser')

    return (
        <SubPage>
            <h1>🛡️ {t('moderate.landingTitle')}</h1>
            <p style={{color: 'var(--muted)', marginBottom: 24}}>
                {t('moderate.welcome', {name: userName})}
            </p>

            <nav style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <Link to="/moderate/voting" className="btn btn-secondary">
                    🗳️ {t('moderate.votingTitle')}
                </Link>
                <Link to="/moderate/statistics" className="btn btn-secondary">
                    📊 {t('moderate.statisticsTitle')}
                </Link>
                <Link to="/moderate/settings" className="btn btn-secondary">
                    ⚙️ {t('moderate.settings')}
                </Link>
            </nav>
        </SubPage>
    )
}
