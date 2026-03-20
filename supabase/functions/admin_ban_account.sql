-- admin_unban_account.sql
-- RPC to unban a user. Run as DB owner in Supabase SQL editor.
DROP FUNCTION admin_unban_account(text);
DROP FUNCTION admin_ban_account(text,text,text);
create or replace function public.admin_unban_account(
  p_twitch_user_id text
) returns void as $$
begin
  if not is_moderator() then
    perform raise_exception('forbidden: caller is not a moderator');
end if;

delete from public.banned_accounts where twitch_user_id = p_twitch_user_id;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_unban_account(text) to authenticated;

-- admin_ban_account.sql
-- Creates an RPC to ban a user. Run this in the Supabase SQL editor as the DB owner.
-- The function runs as SECURITY DEFINER so it can bypass RLS for the insert,
-- but it still checks `is_moderator()` to ensure only allowed callers perform the action.

create or replace function public.admin_ban_account(
  p_twitch_user_id text,
  p_display_name text,
  p_banned_by text
) returns void as $$
begin
  -- Ensure caller is a moderator (this uses the existing RPC/is_moderator function)
  if not is_moderator() then
    -- raise a clear error that will be sent back to the client
    perform raise_exception('forbidden: caller is not a moderator');
end if;

insert into public.banned_accounts (twitch_user_id, display_name, banned_by)
values (p_twitch_user_id, p_display_name, p_banned_by)
    on conflict (twitch_user_id) do update
                                        set display_name = excluded.display_name,
                                        banned_by = excluded.banned_by,
                                        updated_at = now();
end;
$$ language plpgsql security definer;

-- Grant execute to authenticated role so logged-in users can call rpc (the function itself checks moderator rights)
grant execute on function public.admin_ban_account(text, text, text) to authenticated;

