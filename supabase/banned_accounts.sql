-- Tabelle für gebannte Accounts
CREATE TABLE IF NOT EXISTS banned_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twitch_user_id text NOT NULL UNIQUE,
  display_name text,
  banned_by text NOT NULL, -- Twitch-User-ID des Bannenden
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE banned_accounts ENABLE ROW LEVEL SECURITY;

-- Broadcaster darf alles, Mods dürfen nur lesen
CREATE POLICY "select_banned" ON banned_accounts FOR SELECT USING (is_moderator());
CREATE POLICY "insert_banned" ON banned_accounts FOR INSERT WITH CHECK (is_broadcaster());
CREATE POLICY "delete_banned" ON banned_accounts FOR DELETE USING (is_broadcaster());

-- Helper: Prüft ob der eingeloggte User Broadcaster ist
CREATE OR REPLACE FUNCTION is_broadcaster()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM moderators m
    JOIN auth.users u ON u.id = auth.uid()
    WHERE m.twitch_user_id = coalesce(
      u.raw_user_meta_data->>'sub',
      u.raw_user_meta_data->>'provider_id'
    )
    AND m.is_broadcaster = true
  );
END;
$$;

