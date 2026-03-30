// ─── Site Configuration ─────────────────────────────────────────────
// Alle Texte, Links, Bilder und Codes an EINER Stelle änderbar.
// Kann später durch einen DB/API-Fetch ersetzt werden.
// ────────────────────────────────────────────────────────────────────

export interface LinkItem {
  id: string
  /** i18n key for the card title, e.g. "links.youtube.title" */
  titleKey: string
  /** i18n key for the card description */
  descKey?: string
  url: string
  icon: string
  /** '_blank' for external, '_self' for internal */
  target?: '_blank' | '_self'
  /** Optional discount code (shown + copied on click) */
  discountCode?: string
  /** If set, clicking the card triggers a download confirmation */
  downloadFile?: string
  /** Download file display name */
  downloadName?: string
}

export interface ProfileConfig {
  name: string
  subtitleKey: string
  image: string
}

export interface TwitchConfig {
  channel: string
  chatFallbackUrl: string
  /** ICS calendar URL used to show the next scheduled stream when offline */
  icsUrl: string
}

export interface Link {
  labelKey: string
  url: string
}

export interface DonationTrigger {
  id: string
  price: string
  /**
   * Numeric value for the donation link (e.g. 4.20).
   * If set, a "Donate {price}" button will be shown.
   */
  amountValue?: number
  descKey: string
  textKey?: string // Added textKey to fix TS errors
  audio?: string // Added audio to fix TS errors
}

export interface OnlyBartConfig { // New interface for OnlyBart settings
    title: string;
    logoUrl: string;
}

export interface ImpressumConfig {
  name: string
  company: string
  street: string
  city: string
  email: string
}

export interface StreamplanCategory {
  id: string
  labelKey: string
  url: string
  color: string
}

export interface StreamplanConfig {
  icsUrl: string
  categories: StreamplanCategory[]
}

export interface StreamElementsConfig {
  donationUrl: string
  triggers: DonationTrigger[]
}

export interface SiteConfig {
  profile: ProfileConfig
  twitch: TwitchConfig
  impressum: ImpressumConfig
  streamplan: StreamplanConfig
  streamelements: StreamElementsConfig
  links: LinkItem[]
  games: LinkItem[]
  clips: LinkItem[]
  partners: LinkItem[]
  footerLinks: Link[]
  moderatorLink: Link
  copyrightHolder: string
  onlyBart: OnlyBartConfig  // Should contain the default "OnlyBart" for this project
}

const siteConfig: SiteConfig = {
  // ── Profil ──
  profile: {
    name: 'Suppano_',
    subtitleKey: 'hero.subtitle',
    image: 'https://static-cdn.jtvnw.net/jtv_user_pictures/844b6c2d-847a-45e5-a218-988c990dad27-profile_image-70x70.png',
  },

  // ── Twitch ──
  twitch: {
    // Allow overriding the channel via Vite env var VITE_CHANNEL_NAME for different deployments.
    // If not present, fall back to the hardcoded username.
    channel: (import.meta.env.VITE_CHANNEL_NAME as string),

    // Allow overriding the chat fallback URL entirely via VITE_CHAT_FALLBACK_URL.
    // If not set, derive a sensible default from the channel name.
    chatFallbackUrl:
      `https://www.twitch.tv/${(import.meta.env.VITE_CHANNEL_NAME as string)}/chat`,

    icsUrl: '/api/calendar.ics',
  },

  // ── Impressum ──
  impressum: {
    name: 'Suppano_',
    company: 'C/o RAHFT Management GmbH',
    street: 'Schwalbenweg 15',
    city: '15806 Zossen',
    email: 'Schwammerlarmy@hotmail.com',
  },

  // ── Streamplan ──
  streamplan: {
    icsUrl: '',
    categories: [
      {
        id: 'gog',
        labelKey: 'streamplan.categories.gog',
        url: '',
        color: '#d4af37', // Gold/Classic
      },
      {
        id: 'justchatting',
        labelKey: 'streamplan.categories.justchatting',
        url: '',
        color: '#a970ff', // Twitch Purple
      },
      {
        id: 'grind',
        labelKey: 'streamplan.categories.grind',
        url: '',
        color: '#e91e63', // Pink/Red
      },
      {
        id: 'special',
        labelKey: 'streamplan.categories.special',
        url: '',
        color: '#ffd700', // Gold/Highlight
      },
      {
        id: 'multiplayer',
        labelKey: 'streamplan.categories.multiplayer',
        url: '',
        color: '#00bcd4', // Cyan
      },
      {
        id: 'action',
        labelKey: 'streamplan.categories.action',
        url: '',
        color: '#ff5722', // Orange
      },
    ],
  },

  // ── StreamElements / Donations ──
  streamelements: {
    donationUrl: 'https://streamelements.com/suppano_/tip',
    triggers: [
         ],
  },

  // ── Haupt-Links ──
  links: [
    {
      id: 'streamplan',
      titleKey: 'links.streamplan.title',
      descKey: 'links.streamplan.desc',
      url: '/streamplan',
      icon: '/img/logos/StreamPlan.webp',
      target: '_self',
    },
    {
      id: 'streamelements',
      titleKey: 'links.streamelements.title',
      descKey: 'links.streamelements.desc',
      url: '/streamelements',
      icon: '/img/logos/StreamElements.webp',
      target: '_self',
    },
    {
      id: 'clipdesmonats',
      titleKey: 'links.clipdesmonats.title',
      descKey: 'links.clipdesmonats.desc',
      url: '/clipdesmonats',
      icon: '/img/logos/cdm.webp',
      target: '_self',
    },
    {
      id: 'youtube',
      titleKey: 'links.youtube.title',
      descKey: 'links.youtube.desc',
      url: 'https://youtube.com/@suppano',
      icon: '/img/logos/youtube.svg',
      target: '_blank',
    },
    {
      id: 'tiktok',
      titleKey: 'links.tiktok.title',
      descKey: 'links.tiktok.desc',
      url: 'https://tiktok.com/@suppano',
      icon: '/img/logos/tiktok.svg',
      target: '_blank',
    },
    {
      id: 'instagram',
      titleKey: 'links.instagram.title',
      descKey: 'links.instagram.desc',
      url: 'https://www.instagram.com/xsuppanox/',
      icon: '/img/logos/instagram.svg',
      target: '_blank',
    },
    {
      id: 'onlybart',
      titleKey: 'links.onlybart.title',
      descKey: 'links.onlybart.desc',
      url: '/onlybart',
      icon: '/img/logos/OB.webp',
      target: '_self',
    },
    {
      id: 'discord',
      titleKey: 'links.discord.title',
      descKey: 'links.discord.desc',
      url: 'https://discord.gg/',
      icon: '/img/logos/discord.svg',
      target: '_blank',
    },
    {
      id: 'email',
      titleKey: 'links.email.title',
      descKey: 'links.email.desc',
      url: 'mailto:Schwammerlarmy@hotmail.com?subject=Kontaktanfrage',
      icon: '/img/logos/email.svg',
      target: '_self',
    },
  ],

  // ── Games ──
  games: [
    {
      id: 'bartclicker',
      titleKey: 'games.bartclicker.title',
      descKey: 'games.bartclicker.desc',
      url: '/bartclicker',
      icon: '/img/logos/bartclicker.svg',
      target: '_self',
    },
  ],

  // ── Clips & Shorts ──
  clips: [

  ],

  // ── Partner ──
  partners: [

  ],

  moderatorLink: { labelKey: 'profile.moderate', url: '/moderate' },

  // ── Footer ──
  footerLinks: [
    { labelKey: 'footer.impressum', url: '/impressum' },
    { labelKey: 'footer.datenschutz', url: '/datenschutz' }
  ],
  copyrightHolder: 'Suppano_',
  
  onlyBart: {
    title: 'Only<s>Bart</s>Flaum',
    logoUrl: '/img/logos/OB.webp'
  }
}

export default siteConfig
