-- ============================================================
--  Clip-Voting Schema  –  Clip des Monats / Clip des Jahres
-- ============================================================
-- Run this in the Supabase SQL Editor (or as a migration).

-- ── Enum types ──────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE voting_round_type   AS ENUM ('round1','round2','yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE voting_round_status AS ENUM ('pending','active','completed');  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE moderators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select" ON moderators FOR SELECT USING (true);

-- ── Sync: Twitch-Mods automatisch übernehmen ──
-- Wird vom Frontend aufgerufen, wenn ein Mod/Broadcaster mit
-- provider_token eingeloggt ist.
-- Bootstrap: Wenn die Tabelle leer ist, darf jeder authentifizierte
-- User synchronisieren (Ersteinrichtung).

CREATE OR REPLACE FUNCTION sync_moderators(p_mods jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id text;
  v_table_empty      boolean;
  v_count            integer;
BEGIN
  -- Twitch-ID des Aufrufers ermitteln
  SELECT coalesce(
    raw_user_meta_data->>'sub',
    raw_user_meta_data->>'provider_id'
  ) INTO v_caller_twitch_id
  FROM auth.users WHERE id = auth.uid();

  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Prüfen: Tabelle leer (Bootstrap) oder Aufrufer ist Moderator?
  SELECT NOT EXISTS(SELECT 1 FROM moderators) INTO v_table_empty;
  IF NOT v_table_empty AND NOT EXISTS(
    SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Alle bisherigen Einträge entfernen und neu befüllen
  DELETE FROM moderators;

  INSERT INTO moderators (twitch_user_id, display_name)
  SELECT (m->>'user_id')::text, (m->>'user_name')::text
  FROM jsonb_array_elements(p_mods) AS m
  ON CONFLICT (twitch_user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

  SELECT count(*) INTO v_count FROM moderators;
  RETURN jsonb_build_object('success', true, 'count', v_count);
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

-- ── Runde 2 manuell starten (24 h) ──

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

  INSERT INTO moderators (twitch_user_id, display_name)
  VALUES (p_twitch_user_id, p_display_name)
  ON CONFLICT (twitch_user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

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

  DELETE FROM moderators WHERE twitch_user_id = p_twitch_user_id;
  RETURN jsonb_build_object('success', true);
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

