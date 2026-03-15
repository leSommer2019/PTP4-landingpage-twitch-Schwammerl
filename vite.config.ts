import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const ICS_SOURCE_URL =
  'https://export.kalender.digital/ics/0/4ccef74582e0eb8d7026/twitchhd1920x1080.ics?past_months=0&future_months=36'

/**
 * Lies die Site-Config (als Text), extrahiert via Regex alle Streamplan-Kategorien (ID + URL)
 * und baut daraus Proxy-Regeln (Dev) und Download-Regeln (Build).
 */
function getCategoryCalendars(): Array<{ id: string; url: string }> {
  try {
    const configPath = path.resolve(__dirname, 'src/config/siteConfig.ts')
    if (!fs.existsSync(configPath)) return []

    const content = fs.readFileSync(configPath, 'utf-8')
    // Suche nach id: '...', ... url: '...' Blöcken im streamplan.categories Array
    // Da das Parsen von TS/JS regex-basiert schwierig ist, machen wir es etwas simpler:
    // Wir suchen alle Vorkommen von id: '...' gefolgt (irgendwann) von url: '...'
    
    // Besserer Ansatz: 
    // Wir suchen einfach nach dem Muster:  id: '([^']+)',[\s\S]*?url: '([^']+)'
    // Aber das könnte fehlschlagen, wenn die Reihenfolge anders ist.
    
    // Alternativ: Hardcoded Liste hier duplicated, falls das Parsen zu fragil ist.
    // Probiere Regex für Objekt-Literale in categories: [ ... ]
    
    const categoryBlockMatch = content.match(/categories:\s*\[([\s\S]*?)]/)
    if (!categoryBlockMatch) return []
    
    const block = categoryBlockMatch[1]
    const entries: Array<{ id: string; url: string }> = []
    
    // Splitte beim Start eines neuen Objekts "{"
    const objectChunks = block.split('{')
    
    for (const chunk of objectChunks) {
      const idMatch = chunk.match(/id:\s*'([^']+)'/)
      const urlMatch = chunk.match(/url:\s*'([^']+)'/)
      
      if (idMatch && urlMatch) {
        entries.push({ id: idMatch[1], url: urlMatch[1] })
      }
    }
    
    return entries
  } catch (e) {
    console.warn('Could not parse siteConfig for calendars:', e)
    return []
  }
}

/**
 * Vite-Plugin: stellt /api/calendar.ics bereit (Main)
 * UND /api/calendar-[id].ics für alle Kategorien.
 *  • Dev-Server  → proxied die Anfrage live (kein CORS-Problem)
 *  • Production  → holt die ICS zur Build-Zeit und legt sie als statische Datei ab
 */
function calendarIcsPlugin(): Plugin {
  const categoryCalendars = getCategoryCalendars()
  console.log('[calendar-ics] Found categories:', categoryCalendars.map(c => c.id))

  return {
    name: 'calendar-ics',

    /* ── Dev: Express-Middleware ── */
    configureServer(server) {
      // 1) Main Calendar
      server.middlewares.use('/api/calendar.ics', async (_req, res) => {
        try {
          const r = await fetch(ICS_SOURCE_URL)
          const text = await r.text()
          res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
          res.setHeader('Cache-Control', 'public, max-age=300')
          res.end(text)
        } catch {
          res.statusCode = 502
          res.end('')
        }
      })

      // 2) Category Calendars
      categoryCalendars.forEach(cat => {
        server.middlewares.use(`/api/calendar-${cat.id}.ics`, async (_req, res) => {
          try {
            const r = await fetch(cat.url)
            console.log(`[DevProxy] Fetching ${cat.id} -> ${cat.url} (${r.status})`)
            const text = await r.text()
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
            res.setHeader('Cache-Control', 'public, max-age=300')
            res.end(text)
          } catch (err) {
            console.error(`[DevProxy] Error fetching ${cat.id}:`, err)
            res.statusCode = 502
            res.end('')
          }
        })
      })
    },

    /* ── Build: als Asset emittieren ── */
    async generateBundle() {
      // 1) Main Calendar
      try {
        const r = await fetch(ICS_SOURCE_URL)
        const text = await r.text()
        this.emitFile({
          type: 'asset',
          fileName: 'api/calendar.ics',
          source: text,
        })
      } catch (e) {
        console.warn('[calendar-ics] Build-time fetch failed (main):', e)
      }

      // 2) Category Calendars
      for (const cat of categoryCalendars) {
        try {
          console.log(`[Build] Fetching calendar for category: ${cat.id}...`)
          const r = await fetch(cat.url)
          if (!r.ok) {
            console.warn(`[calendar-ics] Build-time fetch failed (${cat.id}): Status ${r.status}`)
            continue
          }
          const text = await r.text()
          this.emitFile({
            type: 'asset',
            fileName: `api/calendar-${cat.id}.ics`,
            source: text,
          })
        } catch (e) {
          console.warn(`[calendar-ics] Build-time fetch failed (${cat.id}):`, e)
        }
      }
    },
  }
}

/**
 * Copies index.html to 404.html after build for GitHub Pages SPA support
 */
function make404Plugin(): Plugin {
  return {
    name: 'make-404',
    writeBundle() {
      const distIndex = path.resolve(__dirname, 'dist/index.html')
      const dist404 = path.resolve(__dirname, 'dist/404.html')
      if (fs.existsSync(distIndex)) {
        fs.copyFileSync(distIndex, dist404)
        console.log('[make-404] Copied index.html to 404.html for SPA fallback.')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), calendarIcsPlugin(), make404Plugin()],
  // Für GitHub Pages mit Custom Domain (z.B. hd1920x1080.de): base: '/'
  // Für GitHub Pages OHNE Custom Domain: base: '/repo-name/'
  base: '/',
})
