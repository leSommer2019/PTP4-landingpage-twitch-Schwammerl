import { useTranslation } from 'react-i18next'
import SubPage from '../components/SubPage/SubPage'

export default function BartclickerPage() {
  const { t } = useTranslation()

  return (
    <SubPage>
      <h1>{t('bartclickerPage.title')}</h1>
      <p>{t('bartclickerPage.comingSoon')}</p>
      {/* TODO: Bartclicker Game – Supabase für Highscores/Sync */}
    </SubPage>
  )
}

