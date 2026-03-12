import { useTranslation } from 'react-i18next'
import SubPage from '../components/SubPage/SubPage'
import { useModerateStatistics } from '../hooks/useModerateStatistics'
import type { StatisticsRangeDays, TrendPoint } from '../types/moderateStatistics'
import './ModerateStatisticsPage.css'

const RANGE_OPTIONS: StatisticsRangeDays[] = [7, 30, 90]

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRoundLabel(month: number | null, year: number): string {
  return month ? `${month.toString().padStart(2, '0')}/${year}` : `${year}`
}

function TrendBars({ points }: { points: TrendPoint[] }) {
  const maxValue = Math.max(...points.map((point) => point.value), 1)

  return (
    <div className="moderate-stats-bars" aria-hidden="true">
      {points.map((point) => {
        const height = Math.max((point.value / maxValue) * 100, point.value > 0 ? 10 : 3)
        return (
          <div key={point.day} className="moderate-stats-bar-wrap" title={`${point.day}: ${point.value}`}>
            <div className="moderate-stats-bar" style={{ height: `${height}%` }} />
            <span>{point.day}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ModerateStatisticsPage() {
  const { t } = useTranslation()
  const { data, loading, error, rangeDays, setRangeDays, refresh } = useModerateStatistics()

  return (
    <SubPage>
      <h1>{t('moderate.statisticsTitle')}</h1>
      <p className="moderate-stats-intro">{t('moderate.statisticsDescription')}</p>

      <div className="moderate-stats-toolbar">
        <div className="moderate-stats-range" role="group" aria-label={t('moderate.statisticsRange')}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`btn ${rangeDays === option ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRangeDays(option)}
              disabled={loading}
            >
              {t('moderate.statisticsLastDays', { days: option })}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t('moderate.statisticsRefresh')}
        </button>
      </div>

      {loading && !data ? <p className="moderate-stats-note">{t('moderate.statisticsLoading')}</p> : null}

      {error ? (
        <p className="moderate-stats-error">{t('moderate.statisticsError', { error })}</p>
      ) : null}

      {data ? (
        <>
          <p className="moderate-stats-note">
            {t('moderate.statisticsUpdatedAt', { timestamp: formatDateTime(data.generatedAt) })}
          </p>

          <section className="moderate-stats-kpis">
            <article className="moderate-stats-card">
              <span>{t('moderate.statisticsKpiVotes')}</span>
              <strong>{data.totalVotes}</strong>
            </article>
            <article className="moderate-stats-card">
              <span>{t('moderate.statisticsKpiVoters')}</span>
              <strong>{data.uniqueVoters}</strong>
            </article>
            <article className="moderate-stats-card">
              <span>{t('moderate.statisticsKpiViews')}</span>
              <strong>{data.totalViews}</strong>
            </article>
            <article className="moderate-stats-card">
              <span>{t('moderate.statisticsKpiSessions')}</span>
              <strong>{data.uniqueSessions}</strong>
            </article>
            <article className="moderate-stats-card">
              <span>{t('moderate.statisticsKpiConversion')}</span>
              <strong>
                {data.voteToViewRate === null ? '-' : `${(data.voteToViewRate * 100).toFixed(1)}%`}
              </strong>
            </article>
          </section>

          <section className="moderate-stats-grid">
            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsRoundHealth')}</h2>
              {!data.activeRound ? (
                <p className="moderate-stats-note">{t('moderate.statisticsNoRound')}</p>
              ) : (
                <dl className="moderate-stats-dl">
                  <div>
                    <dt>{t('moderate.statisticsRound')}</dt>
                    <dd>{data.activeRound.type}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsStatus')}</dt>
                    <dd>{data.activeRound.status}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsMonth')}</dt>
                    <dd>{formatRoundLabel(data.activeRound.month, data.activeRound.year)}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsClips')}</dt>
                    <dd>{data.activeRound.clipCount}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsVotes')}</dt>
                    <dd>{data.activeRound.totalVotes}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsKpiVoters')}</dt>
                    <dd>{data.activeRound.uniqueVoters}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsStartsAt')}</dt>
                    <dd>{formatDateTime(data.activeRound.startsAt)}</dd>
                  </div>
                  <div>
                    <dt>{t('moderate.statisticsEndsAt')}</dt>
                    <dd>{formatDateTime(data.activeRound.endsAt)}</dd>
                  </div>
                </dl>
              )}
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsTopClips')}</h2>
              {data.topClips.length === 0 ? (
                <p className="moderate-stats-note">{t('moderate.statisticsNoData')}</p>
              ) : (
                <table className="moderate-stats-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('moderate.statisticsClip')}</th>
                      <th>{t('moderate.statisticsVotes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topClips.map((clip, index) => (
                      <tr key={clip.clipId}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{clip.title}</strong>
                          <span> @{clip.creatorName}</span>
                        </td>
                        <td>{clip.voteCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsVoteTrend')}</h2>
              <TrendBars points={data.votesPerDay} />
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsViewsTrend')}</h2>
              <TrendBars points={data.viewsPerDay} />
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsTopPages')}</h2>
              {data.topPages.length === 0 ? (
                <p className="moderate-stats-note">{t('moderate.statisticsNoData')}</p>
              ) : (
                <table className="moderate-stats-table">
                  <thead>
                    <tr>
                      <th>{t('moderate.statisticsPage')}</th>
                      <th>{t('moderate.statisticsViews')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.slice(0, 8).map((entry) => (
                      <tr key={entry.pagePath}>
                        <td>{entry.pagePath}</td>
                        <td>{entry.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsTopReferrers')}</h2>
              {data.topReferrers.length === 0 ? (
                <p className="moderate-stats-note">{t('moderate.statisticsNoData')}</p>
              ) : (
                <table className="moderate-stats-table">
                  <thead>
                    <tr>
                      <th>{t('moderate.statisticsReferrer')}</th>
                      <th>{t('moderate.statisticsViews')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReferrers.slice(0, 8).map((entry) => (
                      <tr key={entry.referrer}>
                        <td>{entry.referrer}</td>
                        <td>{entry.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsLatestWinners')}</h2>
              {data.latestWinners.length === 0 ? (
                <p className="moderate-stats-note">{t('moderate.statisticsNoData')}</p>
              ) : (
                <ul className="moderate-stats-list">
                  {data.latestWinners.map((winner) => (
                    <li key={`${winner.kind}-${winner.createdAt}`}>
                      <strong>
                        {winner.kind === 'yearly'
                          ? `Jahr ${winner.year}`
                          : `${winner.month?.toString().padStart(2, '0')}/${winner.year}`}
                      </strong>
                      <span>{winner.title}</span>
                      <small>@{winner.creatorName}</small>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="moderate-stats-panel">
              <h2>{t('moderate.statisticsRecentRounds')}</h2>
              {data.recentRounds.length === 0 ? (
                <p className="moderate-stats-note">{t('moderate.statisticsNoRound')}</p>
              ) : (
                <table className="moderate-stats-table">
                  <thead>
                    <tr>
                      <th>{t('moderate.statisticsRound')}</th>
                      <th>{t('moderate.statisticsStatus')}</th>
                      <th>{t('moderate.statisticsMonth')}</th>
                      <th>{t('moderate.statisticsStartsAt')}</th>
                      <th>{t('moderate.statisticsEndsAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRounds.slice(0, 8).map((round) => (
                      <tr key={round.id}>
                        <td>{round.type}</td>
                        <td>{round.status}</td>
                        <td>{formatRoundLabel(round.month, round.year)}</td>
                        <td>{formatDateTime(round.starts_at)}</td>
                        <td>{formatDateTime(round.ends_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          </section>
        </>
      ) : null}
    </SubPage>
  )
}

