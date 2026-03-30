import siteConfig from '../config/siteConfig'
import SubPage from '../components/SubPage/SubPage'
import {useTranslation, Trans} from "react-i18next";

export default function ImpressumPage() {
  const { t } = useTranslation()
  const { impressum } = siteConfig

  return (
    <SubPage>
      <h1>{t('impressumPage.title')}</h1>
      <p>
        <strong>{impressum.name}</strong><br />
        {impressum.company}<br />
        {impressum.street}<br />
        {impressum.city}
      </p>
      <p>
        <Trans i18nKey="impressumPage.contact" />:{' '}
        <a href={`mailto:${impressum.email}?subject=Anfrage%20Impressum`}>
          {impressum.email}
        </a>
      </p>
    </SubPage>
  )
}
