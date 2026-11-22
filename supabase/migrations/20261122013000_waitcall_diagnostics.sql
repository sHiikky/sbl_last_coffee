-- Keep a server-only diagnostic code for failed OTP completion attempts.
-- The table remains inaccessible to anon/authenticated roles.
alter table public.waitcall_auth_attempts
  add column if not exists last_error text;
