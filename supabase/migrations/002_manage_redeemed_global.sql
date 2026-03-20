-- Migration: Manage redeemed_global cleanup and helper functions
-- 1) Clamp existing expires_at to max 30 days
-- 2) Deactivate already expired entries
-- 3) Provide RPC helpers to deactivate expired entries, deactivate per-session, or deactivate all

-- 1) Clamp existing expires_at values to at most now()+30 days
UPDATE redeemed_global
SET expires_at = LEAST(expires_at, now() + interval '30 days')
WHERE expires_at IS NOT NULL
  AND expires_at > now() + interval '30 days';

-- 2) Deactivate entries that are already expired
UPDATE redeemed_global
SET is_active = false
WHERE expires_at IS NOT NULL
  AND expires_at <= now()
  AND is_active = true;

-- 3) Helper RPC functions
-- Deactivate expired redeemed_global entries (can be scheduled)
CREATE OR REPLACE FUNCTION public.deactivate_expired_redeemed_global()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE redeemed_global
  SET is_active = false
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.deactivate_expired_redeemed_global() TO authenticated;

-- Deactivate redeemed_global entries for a specific stream session
CREATE OR REPLACE FUNCTION public.deactivate_redeemed_global_for_session(p_session_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE redeemed_global
  SET is_active = false
  WHERE is_active = true
    AND stream_id = p_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.deactivate_redeemed_global_for_session(text) TO authenticated;

-- Deactivate ALL active redeemed_global entries (useful as fallback)
CREATE OR REPLACE FUNCTION public.deactivate_all_active_redeemed_global()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE redeemed_global
  SET is_active = false
  WHERE is_active = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.deactivate_all_active_redeemed_global() TO authenticated;

-- End Migration

