import { useTranslation } from 'react-i18next'
import SubPage from '../components/SubPage/SubPage'
import { BartclickerGame } from '../components/Bartclicker/BartclickerGame'

export default function BartclickerPage() {
  const { t } = useTranslation()

  return (
    <SubPage>
      <h1>{t('bartclickerPage.title')}</h1>
      <BartclickerGame />
    </SubPage>
  )
}

