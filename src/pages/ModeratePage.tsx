import {Link} from 'react-router-dom'
import {useTranslation} from 'react-i18next'
import {useAuth} from '../context/useAuth'
import {useIsModerator} from '../hooks/useIsModerator'
import SubPage from '../components/SubPage/SubPage'

export default function ModeratePage() {
    const {t} = useTranslation()
    const {user} = useAuth()
    const {isBroadcaster, isManual} = useIsModerator()
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
                {!isManual && (
                    <Link to="/moderate/twitch" className="btn btn-secondary">
                        📹 {t('moderate.twitchModeration')}
                    </Link>
                )}
                <Link to="/moderate/account" className="btn btn-secondary">
                    👤 {t('moderate.accountManagement', 'Account-Management')}
                </Link>
                {isBroadcaster && (
                    <Link to="/moderate/settings" className="btn btn-secondary">
                        ⚙️ {t('moderate.settings')}
                    </Link>
                )}
            </nav>
        </SubPage>
    )
}
