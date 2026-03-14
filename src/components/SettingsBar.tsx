import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/useTheme'
import ProfileButton from './ProfileButton/ProfileButton'
import './SettingsBar.css'

const themeIcons: Record<string, string> = {
  light: '☀️',
  dark: '🌙',
  system: '💻',
}

const themeOrder = ['system', 'light', 'dark'] as const

const languageFlags: Record<string, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
}

export default function SettingsBar() {
  const { mode, setMode } = useTheme()
  const { t, i18n } = useTranslation()

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(mode)
    setMode(themeOrder[(idx + 1) % themeOrder.length])
  }

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  const currentLang = i18n.language?.startsWith('de') ? 'de' : 'en'
  const nextLang = currentLang === 'de' ? 'en' : 'de'

  return (
    <div className="settings-bar">
      <ProfileButton />

      <div className="settings-right">
        <button className="settings-btn" onClick={cycleTheme} title={t('settings.theme')}>
          {themeIcons[mode]} <span className="settings-btn-text">{t(`settings.${mode}`)}</span>
        </button>

        <select
          className="settings-select settings-select--desktop"
          value={currentLang}
          onChange={(e) => changeLanguage(e.target.value)}
          title={t('settings.language')}
        >
          <option value="de">🇩🇪 Deutsch</option>
          <option value="en">🇬🇧 English</option>
        </select>

        <button
          className="settings-btn settings-lang-btn--mobile"
          onClick={() => changeLanguage(nextLang)}
          title={t('settings.language')}
        >
          {languageFlags[currentLang]}
        </button>
      </div>
    </div>
  )
}

