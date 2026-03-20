/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Channel name exposed to the client (use VITE_ prefix to expose via Vite)
  readonly CHANNEL_NAME?: string
  // Optional: override the chat fallback URL entirely
  readonly VITE_CHAT_FALLBACK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

