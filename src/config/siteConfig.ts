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

export interface FooterLink {
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
  footerLinks: FooterLink[]
  copyrightHolder: string
  donationTriggers: DonationTrigger[]
  onlyBart: OnlyBartConfig  // Should contain the default "OnlyBart" for this project
}

const siteConfig: SiteConfig = {
  // ── Profil ──
  profile: {
    name: 'HD1920x1080',
    subtitleKey: 'hero.subtitle',
    image: '/img/logos/HDProfile.webp',
  },

  // ── Twitch ──
  twitch: {
    channel: 'hd1920x1080',
    chatFallbackUrl: 'https://www.twitch.tv/hd1920x1080/chat',
    icsUrl: '/api/calendar.ics',
  },

  // ── Impressum ──
  impressum: {
    name: 'Stefan Slapnik',
    company: 'FullHD Media',
    street: 'Kolpingstraße 9',
    city: '95615 Marktredwitz',
    email: 'Admin@HD1920x1080.de',
  },

  // ── Streamplan ──
  streamplan: {
    icsUrl: 'https://export.kalender.digital/ics/0/4ccef74582e0eb8d7026/twitchhd1920x1080.ics',
    categories: [
      {
        id: 'gog',
        labelKey: 'streamplan.categories.gog',
        url: 'https://export.kalender.digital/ics/4648294/4ccef74582e0eb8d7026/gog-goodoldgames.ics',
        color: '#d4af37', // Gold/Classic
      },
      {
        id: 'justchatting',
        labelKey: 'streamplan.categories.justchatting',
        url: 'https://export.kalender.digital/ics/4648295/4ccef74582e0eb8d7026/justchattingreactioncommunitygames.ics',
        color: '#a970ff', // Twitch Purple
      },
      {
        id: 'grind',
        labelKey: 'streamplan.categories.grind',
        url: 'https://export.kalender.digital/ics/4648296/4ccef74582e0eb8d7026/grindgames.ics',
        color: '#e91e63', // Pink/Red
      },
      {
        id: 'special',
        labelKey: 'streamplan.categories.special',
        url: 'https://export.kalender.digital/ics/4648297/4ccef74582e0eb8d7026/besonderesevent.ics',
        color: '#ffd700', // Gold/Highlight
      },
      {
        id: 'multiplayer',
        labelKey: 'streamplan.categories.multiplayer',
        url: 'https://export.kalender.digital/ics/4648298/4ccef74582e0eb8d7026/multi-playertime.ics',
        color: '#00bcd4', // Cyan
      },
      {
        id: 'action',
        labelKey: 'streamplan.categories.action',
        url: 'https://export.kalender.digital/ics/4649039/4ccef74582e0eb8d7026/actiongames.ics',
        color: '#ff5722', // Orange
      },
    ],
  },

  // ── StreamElements / Donations ──
  streamelements: {
    donationUrl: 'https://streamelements.com/hd1920x1080-5003/tip',
    triggers: [
      { id: 'taschengeld', price: '1€ – 1,19€', amountValue: 1.00, descKey: 'donations.taschengeld.desc', textKey: 'donations.taschengeld.text' },
      { id: 'tts', price: 'ab 1,20€', amountValue: 1.20, descKey: 'donations.tts.desc', textKey: 'donations.tts.text' },
      { id: 'knock', price: '4,20€', amountValue: 4.20, descKey: 'donations.knock.desc', textKey: 'donations.knock.text', audio: '/audio/knock.mp3' },
      { id: 'majortom', price: '5,00€', amountValue: 5.00, descKey: 'donations.majortom.desc', textKey: 'donations.majortom.text', audio: '/audio/MajorTom.mp3' },
      { id: 'scream', price: '6,66€', amountValue: 6.66, descKey: 'donations.scream.desc', textKey: 'donations.scream.text', audio: '/audio/scream.mp3' },
      { id: 'fliege1', price: '7,77€', amountValue: 7.77, descKey: 'donations.fliege1.desc', textKey: 'donations.fliege1.text', audio: '/audio/Fliege1.mp3' },
      { id: 'centershock', price: '9,20€', amountValue: 9.20, descKey: 'donations.centershock.desc', textKey: 'donations.centershock.text', audio: '/audio/CenterShock.mp3' },
      { id: 'yt-sound', price: '10,80€', amountValue: 10.80, descKey: 'donations.ytSound.desc', textKey: 'donations.ytSound.text', audio: '/audio/1080.mp3' },
      { id: 'fliege2', price: '14,44€', amountValue: 14.44, descKey: 'donations.fliege2.desc', textKey: 'donations.fliege2.text', audio: '/audio/Fliege2.mp3' },
      { id: '1920', price: '19,20€', amountValue: 19.20, descKey: 'donations.1920.desc', textKey: 'donations.1920.text', audio: '/audio/1920.mp3' },
      { id: 'fliege3', price: '19,66€', amountValue: 19.66, descKey: 'donations.fliege3.desc', textKey: 'donations.fliege3.text', audio: '/audio/Fliege3.mp3' },
      { id: 'konfetti', price: '22,22€', amountValue: 22.22, descKey: 'donations.konfetti.desc', textKey: 'donations.konfetti.text' },
      { id: 'hotnuts', price: '25,00€', amountValue: 25.00, descKey: 'donations.hotnuts.desc', textKey: 'donations.hotnuts.text', audio: '/audio/FIRE.mp3' },
      { id: 'sandwich', price: 'x66,66€', amountValue: 66.66, descKey: 'donations.sandwich.desc', textKey: 'donations.sandwich.text', audio: '/audio/Sandwich.mp3' },
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
      icon: '/img/logos/StreamElements.png',
      target: '_self',
    },
    {
      id: 'clipdesmonats',
      titleKey: 'links.clipdesmonats.title',
      descKey: 'links.clipdesmonats.desc',
      url: '/clipdesmonats',
      icon: '/img/logos/cdm.png',
      target: '_self',
    },
    {
      id: 'youtube',
      titleKey: 'links.youtube.title',
      descKey: 'links.youtube.desc',
      url: 'https://youtube.com/@hawedereplus',
      icon: '/img/logos/youtube.svg',
      target: '_blank',
    },
    {
      id: 'tiktok',
      titleKey: 'links.tiktok.title',
      descKey: 'links.tiktok.desc',
      url: 'https://tiktok.com/@hd1920x1080',
      icon: '/img/logos/tiktok.svg',
      target: '_blank',
    },
    {
      id: 'instagram',
      titleKey: 'links.instagram.title',
      descKey: 'links.instagram.desc',
      url: 'https://www.instagram.com/hd1920x1080/',
      icon: '/img/logos/instagram.svg',
      target: '_blank',
    },
    {
      id: 'onlybart',
      titleKey: 'links.onlybart.title',
      descKey: 'links.onlybart.desc',
      url: '/onlybart',
      icon: '/img/logos/OB.png',
      target: '_self',
    },
    {
      id: 'discord',
      titleKey: 'links.discord.title',
      descKey: 'links.discord.desc',
      url: 'https://discord.gg/Zp5KNqCHzc',
      icon: '/img/logos/discord.svg',
      target: '_blank',
    },
    {
      id: 'email',
      titleKey: 'links.email.title',
      descKey: 'links.email.desc',
      url: 'mailto:Admin@HD1920x1080.de?subject=Kontaktanfrage',
      icon: '/img/logos/email.svg',
      target: '_self',
    },
  ],

  // ── Games ──
  games: [
    {
      id: 'tanggle',
      titleKey: 'games.tanggle.title',
      descKey: 'games.tanggle.desc',
      url: 'http://tng.gl/c/hd1920x1080',
      icon: '/img/logos/Puzzle.svg',
      target: '_blank',
    },
    {
      id: 'resourcepack',
      titleKey: 'games.resourcepack.title',
      descKey: 'games.resourcepack.desc',
      url: 'https://github.com/HD1920x1080Media/Minecraft-Ressource-Pack/archive/refs/tags/latest.zip',
      icon: '/img/logos/MinecraftRessourcePack.webp',
      downloadFile:
        'https://github.com/HD1920x1080Media/Minecraft-Ressource-Pack/archive/refs/tags/latest.zip',
      downloadName: 'HD1920x1080_V1.10.zip',
    },
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
    {
      id: 'yt-shorts',
      titleKey: 'clips.ytShorts.title',
      descKey: 'clips.ytShorts.desc',
      url: 'https://www.youtube.com/@lesommer2019',
      icon: '/img/logos/youtube.svg',
      target: '_blank',
    },
    {
      id: 'tiktok-clips',
      titleKey: 'clips.tiktokClips.title',
      descKey: 'clips.tiktokClips.desc',
      url: 'https://www.tiktok.com/@hawedereshorts',
      icon: '/img/logos/tiktok.svg',
      target: '_blank',
    },
    {
      id: 'insta-clips',
      titleKey: 'clips.instaClips.title',
      descKey: 'clips.instaClips.desc',
      url: 'https://www.instagram.com/hawedereshorts/',
      icon: '/img/logos/instagram.svg',
      target: '_blank',
    },
  ],

  // ── Partner ──
  partners: [
    {
      id: 'yvolve',
      titleKey: 'partners.yvolve.title',
      descKey: 'partners.yvolve.desc',
      url: 'https://yvolve.shop/?bg_ref=cnbZIhbZxH',
      icon: '/img/logos/Evolve.png',
      target: '_blank',
      discountCode: 'FullHD',
    },
    {
      id: 'nclip',
      titleKey: 'partners.nclip.title',
      url: 'https://nclip.io/page/hd1920x1080',
      icon: '/img/logos/NClip.png',
      target: '_blank',
    },
    {
      id: 'frugends',
      titleKey: 'partners.frugends.title',
      descKey: 'partners.frugends.desc',
      url: 'https://frugends.com/?srsltid=AfmBOoqjyBjbK5TWs0tAS4ELgV93XqTXzl84OChVKd93OVkjeWfH8wFT',
      icon: '/img/logos/Frugends.png',
      target: '_blank',
      discountCode: 'FullHD',
    },
  ],

  // ── Footer ──
  footerLinks: [
    { labelKey: 'footer.impressum', url: '/impressum' },
    { labelKey: 'footer.datenschutz', url: '/datenschutz' },
    { labelKey: 'footer.moderate', url: '/moderate' },
  ],
  copyrightHolder: 'FullHD Media',
  donationTriggers: [
    { id: 'trigger1', price: '4.20 €', amountValue: 4.20, descKey: 'donations.trigger1' }, // 420
    { id: 'trigger2', price: '13.37 €', amountValue: 13.37, descKey: 'donations.trigger2' }, // Leet
    { id: 'trigger3', price: '69.69 €', amountValue: 69.69, descKey: 'donations.trigger3' }, // nice
  ],
  
  onlyBart: {
    title: 'OnlyBart',
    logoUrl: '/img/logos/OB.png'
  }
}

export default siteConfig
