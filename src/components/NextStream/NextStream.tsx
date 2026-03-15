import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import {useNextStream} from '../../hooks/useNextStream'
import siteConfig from '../../config/siteConfig'
import './NextStream.css'

export default function NextStream() {
    const {t, i18n} = useTranslation()
    const {nextEvent, loading, error} = useNextStream(siteConfig.twitch.icsUrl)

    if (loading) {
        return <div className="next-stream-loading">{t('live.scheduleLoading')}</div>
    }

    if (error || !nextEvent) {
        return (
            <div className="next-stream-fallback">
                <Link to="/streamplan">
                    {t('live.seeSchedule')}
                </Link>
            </div>
        )
    }

    // Alle deutschen Varianten (inkl. Schweizerdeutsch) als Deutsch behandeln
    const isGerman = i18n.language.startsWith('de') || i18n.language.startsWith('gsw');
    const locale = isGerman ? 'de-DE' : 'en-US';

    const dateStr = nextEvent.start.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    const timeStr = nextEvent.start.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div className="next-stream">
            <div className="next-stream-label">{t('live.nextStream')}</div>
            <div className="next-stream-title">{nextEvent.summary}</div>
            <div className="next-stream-date">
                📅 {dateStr} · 🕐 {timeStr}
                {isGerman ? ' Uhr' : ''}
            </div>
            <Link className="next-stream-link" to="/streamplan">
                {t('live.seeSchedule')}
            </Link>
        </div>
    )
}


