-- ============================================================
--  Clip-Voting Schema  –  Clip des Monats / Clip des Jahres
-- ============================================================
-- Run this in the Supabase SQL Editor (or as a migration).

-- ── Enum types ──────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE voting_round_type   AS ENUM ('round1','round2','yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE voting_round_status AS ENUM ('pending','active','completed');  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── User Profiles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are public" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS voting_rounds (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       voting_round_type   NOT NULL,
  status     voting_round_status NOT NULL DEFAULT 'pending',
  year       integer NOT NULL,
  month      integer,                       -- NULL for yearly rounds
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clips (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twitch_clip_id     text UNIQUE NOT NULL,
  title              text NOT NULL DEFAULT '',
  creator_name       text NOT NULL DEFAULT '',
  thumbnail_url      text,
  embed_url          text NOT NULL,
  clip_url           text,
  view_count         integer DEFAULT 0,
  duration           real    DEFAULT 0,
  twitch_created_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many: which clips belong to which round
CREATE TABLE IF NOT EXISTS round_clips (
  round_id uuid NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
  clip_id  uuid NOT NULL REFERENCES clips(id)          ON DELETE CASCADE,
  PRIMARY KEY (round_id, clip_id)
);

CREATE TABLE IF NOT EXISTS votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   uuid NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
  clip_id    uuid NOT NULL REFERENCES clips(id)          ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT votes_one_per_user_per_round UNIQUE (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS monthly_winners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year       integer NOT NULL,
  month      integer NOT NULL,
  clip_id    uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_winners_unique UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS yearly_winners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year       integer NOT NULL UNIQUE,
  clip_id    uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── View: aggregated vote counts per clip per round ─────────

CREATE OR REPLACE VIEW clip_vote_counts AS
SELECT
  rc.round_id,
  rc.clip_id,
  c.twitch_clip_id,
  c.title,
  c.creator_name,
  c.thumbnail_url,
  c.embed_url,
  c.clip_url,
  c.view_count,
  c.duration,
  c.twitch_created_at,
  COALESCE(vc.cnt, 0)::integer AS vote_count
FROM round_clips rc
JOIN clips c ON c.id = rc.clip_id
LEFT JOIN (
  SELECT round_id, clip_id, count(*)::integer AS cnt
  FROM votes GROUP BY round_id, clip_id
) vc ON vc.round_id = rc.round_id AND vc.clip_id = rc.clip_id;

-- ── Row Level Security ──────────────────────────────────────

ALTER TABLE voting_rounds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_clips     ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE yearly_winners  ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "select" ON voting_rounds  FOR SELECT USING (true);
CREATE POLICY "select" ON clips           FOR SELECT USING (true);
CREATE POLICY "select" ON round_clips     FOR SELECT USING (true);
CREATE POLICY "select" ON votes           FOR SELECT USING (true);
CREATE POLICY "select" ON monthly_winners FOR SELECT USING (true);
CREATE POLICY "select" ON yearly_winners  FOR SELECT USING (true);

-- Writes happen through cast_vote (SECURITY DEFINER) or
-- GitHub Actions (service_role key → bypasses RLS).

GRANT SELECT ON clip_vote_counts TO anon, authenticated;

-- ── Function: cast_vote ─────────────────────────────────────

CREATE OR REPLACE FUNCTION cast_vote(p_round_id uuid, p_clip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_status  voting_round_status;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT status INTO v_status FROM voting_rounds WHERE id = p_round_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('error', 'round_not_found');
  END IF;
  IF v_status != 'active' THEN
    RETURN jsonb_build_object('error', 'round_not_active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM round_clips
    WHERE round_id = p_round_id AND clip_id = p_clip_id
  ) THEN
    RETURN jsonb_build_object('error', 'clip_not_in_round');
  END IF;

  BEGIN
    INSERT INTO votes (round_id, clip_id, user_id)
    VALUES (p_round_id, p_clip_id, v_user_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'already_voted');
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ═════════════════════════════════════════════════════════
--  Moderation — Zugriffssteuerung für Admin-Seiten
-- ═════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS moderators (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twitch_user_id  text UNIQUE NOT NULL,
  display_name    text,
  is_broadcaster  boolean DEFAULT false,
  is_manual       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Ensure column exists if table was already created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderators' AND column_name='is_broadcaster') THEN
        ALTER TABLE moderators ADD COLUMN is_broadcaster boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moderators' AND column_name='is_manual') THEN
        ALTER TABLE moderators ADD COLUMN is_manual boolean DEFAULT true;
    END IF;
END $$;

ALTER TABLE moderators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select" ON moderators FOR SELECT USING (true);

-- ── Ausschlussliste für manuell entfernte Mods ──
-- Mods, die manuell entfernt wurden, werden hier gespeichert und
-- beim nächsten Sync übersprungen.
CREATE TABLE IF NOT EXISTS mod_sync_excluded (
  twitch_user_id  text PRIMARY KEY,
  display_name    text,
  excluded_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mod_sync_excluded ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "select_mod_sync_excluded" ON mod_sync_excluded FOR SELECT USING (true);

-- ── Sync: Twitch-Mods automatisch übernehmen ──
-- Wird vom Frontend aufgerufen, wenn ein Mod/Broadcaster mit
-- provider_token eingeloggt ist.
-- Bootstrap: Wenn die Tabelle leer ist, darf jeder authentifizierte
-- User synchronisieren (Ersteinrichtung).
-- Nur der Broadcaster oder Moderatoren dürfen synchronisieren.

CREATE OR REPLACE FUNCTION sync_moderators(p_mods jsonb, p_broadcaster_twitch_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id   text;
  v_table_empty        boolean;
  v_count              integer;
  v_is_broadcaster     boolean;
  v_is_moderator       boolean;
  v_broadcaster_id     text;
BEGIN
  -- Twitch-ID des Aufrufers ermitteln
  SELECT coalesce(
    raw_user_meta_data->>'sub',
    raw_user_meta_data->>'provider_id'
  ) INTO v_caller_twitch_id
  FROM auth.users WHERE id = auth.uid();

  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated', 'message', 'Benutzer nicht authentifiziert.');
  END IF;

  -- Broadcaster-ID aus Parameter oder aus der Liste der Mods (erste ID = Broadcaster)
  v_broadcaster_id := COALESCE(
    p_broadcaster_twitch_id,
    (p_mods->0->>'user_id')::text
  );

  -- Prüfen: Ist der Aufrufer der Broadcaster?
  v_is_broadcaster := (v_caller_twitch_id = v_broadcaster_id);

  -- Prüfen: Ist der Aufrufer ein Moderator?
  SELECT EXISTS(
    SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id
  ) INTO v_is_moderator;

  -- Entscheidungslogik:
  -- 1. Wenn Tabelle leer ist (Bootstrap): Jeder authentifizierte User darf synchronisieren
  -- 2. Wenn Aufrufer = Broadcaster: Erlauben
  -- 3. Wenn Aufrufer = Moderator: Erlauben
  -- Alles andere: Forbidden
  SELECT NOT EXISTS(SELECT 1 FROM moderators) INTO v_table_empty;

  IF NOT v_table_empty THEN
    IF NOT (v_is_broadcaster OR v_is_moderator) THEN
      RETURN jsonb_build_object(
        'error', 'forbidden',
        'message', 'Nur der Broadcaster oder Moderatoren dürfen die Moderatorenliste synchronisieren.'
      );
    END IF;
  END IF;

  -- Alle bisherigen Einträge entfernen, die NICHT manuell hinzugefügt wurden
  DELETE FROM moderators WHERE is_manual = false;

  -- Mods einfügen, aber Ausschlüsse (mod_sync_excluded) überspringen.
  -- Der Broadcaster wird IMMER eingefügt, auch wenn er auf der Ausschlussliste steht.
  INSERT INTO moderators (twitch_user_id, display_name, is_broadcaster, is_manual)
  SELECT
    (m->>'user_id')::text,
    (m->>'user_name')::text,
    ((m->>'user_id')::text = v_broadcaster_id),
    false
  FROM jsonb_array_elements(p_mods) AS m
  WHERE (m->>'user_id')::text = v_broadcaster_id
     OR NOT EXISTS (SELECT 1 FROM mod_sync_excluded e WHERE e.twitch_user_id = (m->>'user_id')::text)
  ON CONFLICT (twitch_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_broadcaster = EXCLUDED.is_broadcaster,
    is_manual = EXCLUDED.is_manual;

  SELECT count(*) INTO v_count FROM moderators;
  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'excluded_count', (SELECT count(*) FROM mod_sync_excluded),
    'broadcaster_id', v_broadcaster_id,
    'caller_is_broadcaster', v_is_broadcaster
  );
END;
$$;

-- ── Helper: prüft ob der eingeloggte User Moderator ist ──

CREATE OR REPLACE FUNCTION is_moderator()
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
  );
END;
$$;

-- ═════════════════════════════════════════════════════════
--  Admin RPC functions (nur für Moderatoren)
-- ═════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_start_round2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM voting_rounds
  WHERE type = 'round2' AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('error', 'no_pending_round2');
  END IF;

  UPDATE voting_rounds SET
    status = 'active',
    starts_at = now(),
    ends_at = now() + interval '24 hours'
  WHERE id = v_round.id;

  RETURN jsonb_build_object('success', true, 'round_id', v_round.id);
END;
$$;

-- ── Runde 2 manuell beenden ──

CREATE OR REPLACE FUNCTION admin_end_round2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round  record;
  v_winner record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM voting_rounds
  WHERE type = 'round2' AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('error', 'no_active_round2');
  END IF;

  UPDATE voting_rounds SET status = 'completed' WHERE id = v_round.id;

  -- Gewinner ermitteln
  SELECT rc.clip_id INTO v_winner
  FROM round_clips rc
  LEFT JOIN (
    SELECT clip_id, count(*) AS cnt FROM votes WHERE round_id = v_round.id GROUP BY clip_id
  ) vc ON vc.clip_id = rc.clip_id
  WHERE rc.round_id = v_round.id
  ORDER BY coalesce(vc.cnt, 0) DESC, rc.clip_id
  LIMIT 1;

  IF v_winner IS NOT NULL THEN
    INSERT INTO monthly_winners (year, month, clip_id)
    VALUES (v_round.year, v_round.month, v_winner.clip_id)
    ON CONFLICT (year, month) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'winner_clip_id', v_winner.clip_id);
END;
$$;

-- ── Jahres-Voting manuell starten (7 Tage) ──

CREATE OR REPLACE FUNCTION admin_start_yearly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    integer := extract(year from now())::integer;
  v_round   record;
  v_winner  record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Prüfen ob bereits existiert
  SELECT * INTO v_round FROM voting_rounds
  WHERE type = 'yearly' AND year = v_year LIMIT 1;
  IF v_round IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'yearly_already_exists');
  END IF;

  -- Runde erstellen
  INSERT INTO voting_rounds (type, status, year, starts_at, ends_at)
  VALUES ('yearly', 'active', v_year, now(), now() + interval '7 days')
  RETURNING * INTO v_round;

  -- Monatsgewinner Dez(Vorjahr) bis Nov(Jahr) einfügen
  INSERT INTO round_clips (round_id, clip_id)
  SELECT v_round.id, mw.clip_id
  FROM monthly_winners mw
  WHERE (mw.year = v_year - 1 AND mw.month = 12)
     OR (mw.year = v_year     AND mw.month <= 11)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'round_id', v_round.id);
END;
$$;

-- ── Jahres-Voting manuell beenden ──

CREATE OR REPLACE FUNCTION admin_end_yearly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round  record;
  v_winner record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM voting_rounds
  WHERE type = 'yearly' AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('error', 'no_active_yearly');
  END IF;

  UPDATE voting_rounds SET status = 'completed' WHERE id = v_round.id;

  SELECT rc.clip_id INTO v_winner
  FROM round_clips rc
  LEFT JOIN (
    SELECT clip_id, count(*) AS cnt FROM votes WHERE round_id = v_round.id GROUP BY clip_id
  ) vc ON vc.clip_id = rc.clip_id
  WHERE rc.round_id = v_round.id
  ORDER BY coalesce(vc.cnt, 0) DESC, rc.clip_id
  LIMIT 1;

  IF v_winner IS NOT NULL THEN
    INSERT INTO yearly_winners (year, clip_id)
    VALUES (v_round.year, v_winner.clip_id)
    ON CONFLICT (year) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'winner_clip_id', v_winner.clip_id);
END;
$$;

-- ── Einzelnen Moderator manuell hinzufügen ──

CREATE OR REPLACE FUNCTION add_moderator(p_twitch_user_id text, p_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id text;
  v_table_empty      boolean;
BEGIN
  SELECT coalesce(raw_user_meta_data->>'sub', raw_user_meta_data->>'provider_id')
  INTO v_caller_twitch_id FROM auth.users WHERE id = auth.uid();
  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT NOT EXISTS(SELECT 1 FROM moderators) INTO v_table_empty;
  IF NOT v_table_empty AND NOT EXISTS(
    SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  INSERT INTO moderators (twitch_user_id, display_name, is_manual)
  VALUES (p_twitch_user_id, p_display_name, true)
  ON CONFLICT (twitch_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_manual = true;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Einzelnen Moderator entfernen ──

CREATE OR REPLACE FUNCTION remove_moderator(p_twitch_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id text;
BEGIN
  SELECT coalesce(raw_user_meta_data->>'sub', raw_user_meta_data->>'provider_id')
  INTO v_caller_twitch_id FROM auth.users WHERE id = auth.uid();
  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Sich selbst entfernen verhindern
  IF p_twitch_user_id = v_caller_twitch_id THEN
    RETURN jsonb_build_object('error', 'cannot_remove_self');
  END IF;

  -- Broadcaster kann nicht entfernt werden
  IF EXISTS(SELECT 1 FROM moderators WHERE twitch_user_id = p_twitch_user_id AND is_broadcaster = true) THEN
    RETURN jsonb_build_object('error', 'cannot_remove_broadcaster');
  END IF;

  -- In die Ausschlussliste eintragen, damit der Mod beim nächsten Sync nicht erneut hinzugefügt wird
  INSERT INTO mod_sync_excluded (twitch_user_id, display_name)
  SELECT twitch_user_id, display_name FROM moderators WHERE twitch_user_id = p_twitch_user_id
  ON CONFLICT (twitch_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    excluded_at = now();

  DELETE FROM moderators WHERE twitch_user_id = p_twitch_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Ausschlüsse zurücksetzen ──
-- Leert die mod_sync_excluded-Tabelle, sodass beim nächsten Sync
-- alle Twitch-Mods wieder übernommen werden.

CREATE OR REPLACE FUNCTION reset_mod_sync_exclusions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id text;
  v_deleted integer;
BEGIN
  SELECT coalesce(raw_user_meta_data->>'sub', raw_user_meta_data->>'provider_id')
  INTO v_caller_twitch_id FROM auth.users WHERE id = auth.uid();
  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  DELETE FROM mod_sync_excluded WHERE TRUE;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'cleared', v_deleted);
END;
$$;

-- ═════════════════════════════════════════════════════════
--  Page Views — anonymisiertes Tracking (nur bei Cookie-Consent)
-- ═════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS page_views (
  id            int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    text NOT NULL,
  page_path     text NOT NULL,
  viewed_at     timestamptz NOT NULL DEFAULT now(),
  redirect_info jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index für schnelle Abfragen nach Zeitraum und Pfad
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON page_views (viewed_at);
CREATE INDEX IF NOT EXISTS idx_page_views_path      ON page_views (page_path);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Jeder darf Zeilen einfügen (anon + authenticated), damit
-- das Frontend ohne Login tracken kann.
CREATE POLICY "insert_anon" ON page_views FOR INSERT WITH CHECK (true);

-- Lesen nur für Moderatoren (über RPC-Funktion).
CREATE POLICY "select_mod" ON page_views FOR SELECT
  USING (is_moderator());

-- ── RPC: Aggregierte Statistiken für das Dashboard ──

CREATE OR REPLACE FUNCTION get_page_view_stats(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total       integer;
  v_sessions    integer;
  v_per_page    jsonb;
  v_per_day     jsonb;
  v_top_referrers jsonb;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Gesamt-Aufrufe
  SELECT count(*) INTO v_total
  FROM page_views WHERE viewed_at BETWEEN p_from AND p_to;

  -- Einzigartige Sessions
  SELECT count(DISTINCT session_id) INTO v_sessions
  FROM page_views WHERE viewed_at BETWEEN p_from AND p_to;

  -- Aufrufe pro Seite
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_per_page
  FROM (
    SELECT page_path, count(*) AS views
    FROM page_views WHERE viewed_at BETWEEN p_from AND p_to
    GROUP BY page_path ORDER BY views DESC LIMIT 20
  ) t;

  -- Aufrufe pro Tag
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_per_day
  FROM (
    SELECT viewed_at::date AS day, count(*) AS views
    FROM page_views WHERE viewed_at BETWEEN p_from AND p_to
    GROUP BY day ORDER BY day
  ) t;

  -- Top Referrer
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_referrers
  FROM (
    SELECT redirect_info->>'referrer' AS referrer, count(*) AS views
    FROM page_views
    WHERE viewed_at BETWEEN p_from AND p_to
      AND redirect_info->>'referrer' IS NOT NULL
    GROUP BY referrer ORDER BY views DESC LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'total_views', v_total,
    'unique_sessions', v_sessions,
    'per_page', v_per_page,
    'per_day', v_per_day,
    'top_referrers', v_top_referrers
  );
END;
$$;

-- ═════════════════════════════════════════════════════════
--  Bartclicker Game – Scores & Progress
-- ═════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bartclicker_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  energy numeric DEFAULT 0,
  total_ever numeric DEFAULT 0,
  rebirth_count integer DEFAULT 0,
  rebirth_multiplier numeric DEFAULT 1,
  shop_items jsonb DEFAULT '[]'::jsonb,
  active_buffs jsonb DEFAULT '[]'::jsonb,
  active_debuffs jsonb DEFAULT '[]'::jsonb,
  relics jsonb DEFAULT '[]'::jsonb,
  offline_earning_upgrades integer DEFAULT 0,
  auto_click_buyer_enabled boolean DEFAULT false,
  click_upgrade_buyer_enabled boolean DEFAULT false,
  auto_click_buyer_items jsonb DEFAULT '[]'::jsonb,
  click_upgrade_buyer_items jsonb DEFAULT '[]'::jsonb,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bartclicker_user_id ON bartclicker_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_bartclicker_total_ever ON bartclicker_scores(total_ever DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bartclicker_user_unique ON bartclicker_scores(user_id);

ALTER TABLE bartclicker_scores ENABLE ROW LEVEL SECURITY;

-- Jeder kann Scores lesen (Leaderboard)
CREATE POLICY "select_public" ON bartclicker_scores FOR SELECT USING (true);

-- Nur Owner kann eigene Scores aktualisieren
CREATE POLICY "update_self" ON bartclicker_scores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Nur Owner kann eigene Scores einfügen
CREATE POLICY "insert_self" ON bartclicker_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Nur Moderatoren können löschen
CREATE POLICY "delete_moderator" ON bartclicker_scores FOR DELETE
  USING (is_moderator());

-- ── Helper-Funktion: Leaderboard abrufen ──
CREATE OR REPLACE FUNCTION get_bartclicker_leaderboard(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  total_ever numeric,
  rebirth_count integer,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY bs.total_ever DESC, bs.rebirth_count DESC) as rank,
    bs.user_id,
    bs.total_ever,
    bs.rebirth_count,
    bs.last_updated
  FROM bartclicker_scores bs
  WHERE bs.total_ever > 0 OR bs.rebirth_count > 0
  ORDER BY bs.total_ever DESC, bs.rebirth_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── Leaderboard mit Twitch-Usernames ──
CREATE OR REPLACE FUNCTION get_bartclicker_leaderboard_with_names(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  total_ever numeric,
  rebirth_count integer,
  last_updated timestamptz,
  display_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY bs.total_ever DESC, bs.rebirth_count DESC) as rank,
    bs.user_id,
    bs.total_ever,
    bs.rebirth_count,
    bs.last_updated,
    COALESCE(p.username, 'Player ' || ROW_NUMBER() OVER (ORDER BY bs.total_ever DESC, bs.rebirth_count DESC)::text)::text as display_name
  FROM bartclicker_scores bs
  LEFT JOIN profiles p ON p.id = bs.user_id
  WHERE bs.total_ever > 0 OR bs.rebirth_count > 0
  ORDER BY bs.total_ever DESC, bs.rebirth_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grants für bartclicker_scores
GRANT SELECT, INSERT, UPDATE ON bartclicker_scores TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_bartclicker_leaderboard(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_bartclicker_leaderboard_with_names(integer) TO anon, authenticated;
