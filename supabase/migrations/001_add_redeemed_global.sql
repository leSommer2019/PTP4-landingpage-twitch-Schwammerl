-- Migration: Füge Tabelle redeemed_global hinzu für globale Einlösungen (cooldown / once-per-stream)
-- Legt auch optionale Tabelle stream_sessions an.

CREATE TABLE IF NOT EXISTS redeemed_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id text NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  redeemed_by text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  stream_id text,
  is_active boolean DEFAULT true,
  meta jsonb DEFAULT '{}'::jsonb
);

-- Indizes für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_redeemed_global_reward_id ON redeemed_global (reward_id);
CREATE INDEX IF NOT EXISTS idx_redeemed_global_reward_active ON redeemed_global (reward_id, is_active);
CREATE INDEX IF NOT EXISTS idx_redeemed_global_reward_stream ON redeemed_global (reward_id, stream_id);

-- Optionale Unique-Constraint für once-per-stream Verhalten (verhindert doppelte aktive Einträge pro reward+stream)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_stream_active_unique ON redeemed_global (reward_id, stream_id) WHERE is_active = true AND stream_id IS NOT NULL;

-- Optionale Tabelle für Stream-Sessions (kann später von TwitchBot befüllt werden)
CREATE TABLE IF NOT EXISTS stream_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_identifier text UNIQUE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_active boolean DEFAULT true
);

-- Ende Migration

