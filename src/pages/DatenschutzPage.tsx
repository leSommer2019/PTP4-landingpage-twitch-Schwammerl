import { useTranslation } from 'react-i18next'
import siteConfig from '../config/siteConfig'
import SubPage from '../components/SubPage/SubPage'

export default function DatenschutzPage() {
  const { t } = useTranslation()
  const { impressum } = siteConfig

  return (
    <SubPage>
      <h1>{t('datenschutzPage.title')}</h1>

      <h2>{t('datenschutzPage.responsible')}</h2>
      <p>
        <strong>{impressum.name}</strong><br />
        {impressum.company}<br />
        {impressum.street}<br />
        {impressum.city}
      </p>
      <p>
        {t('datenschutzPage.contact')}:{' '}
        <a href={`mailto:${impressum.email}?subject=Anfrage%20Datenschutz`}>
          {impressum.email}
        </a>
      </p>

      <h2>{t('datenschutzPage.votingTitle')}</h2>
      <p>{t('datenschutzPage.votingIntro')}</p>

      <h3>{t('datenschutzPage.processingTitle')}</h3>
      <p>{t('datenschutzPage.processingText')}</p>

      <h3>{t('datenschutzPage.purposeTitle')}</h3>
      <p>{t('datenschutzPage.purposeText')}</p>

      <h3>{t('datenschutzPage.retentionTitle')}</h3>
      <p>{t('datenschutzPage.retentionText')}</p>

      <h3>{t('datenschutzPage.legalBasisTitle')}</h3>
      <p>{t('datenschutzPage.legalBasisText')}</p>

      <h2>{t('datenschutzPage.onlyBartTitle')}</h2>
      <p>{t('datenschutzPage.onlyBartIntro')}</p>
      <h3>{t('datenschutzPage.onlyBartPurposeTitle')}</h3>
      <p>{t('datenschutzPage.onlyBartPurposeText')}</p>
      <h3>{t('datenschutzPage.onlyBartRetentionTitle')}</h3>
      <p>{t('datenschutzPage.onlyBartRetentionText')}</p>

      <h2>{t('datenschutzPage.bartclickerTitle')}</h2>
      <p>{t('datenschutzPage.bartclickerIntro')}</p>
      <h3>{t('datenschutzPage.bartclickerPurposeTitle')}</h3>
      <p>{t('datenschutzPage.bartclickerPurposeText')}</p>
      <h3>{t('datenschutzPage.bartclickerRetentionTitle')}</h3>
      <p>{t('datenschutzPage.bartclickerRetentionText')}</p>

      <h2>{t('datenschutzPage.analyticsTitle')}</h2>
      <p>{t('datenschutzPage.analyticsIntro')}</p>

      <h3>{t('datenschutzPage.analyticsProcessingTitle')}</h3>
      <p>{t('datenschutzPage.analyticsProcessingText')}</p>

      <h3>{t('datenschutzPage.analyticsPurposeTitle')}</h3>
      <p>{t('datenschutzPage.analyticsPurposeText')}</p>

      <h3>{t('datenschutzPage.analyticsLegalTitle')}</h3>
      <p>{t('datenschutzPage.analyticsLegalText')}</p>

      <h3>{t('datenschutzPage.revokeTitle')}</h3>
      <p>{t('datenschutzPage.revokeText')}</p>

      <h2>{t('datenschutzPage.rightsTitle')}</h2>
      <p>{t('datenschutzPage.rightsText')}</p>
    </SubPage>
  )
}

