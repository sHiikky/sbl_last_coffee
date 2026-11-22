-- OTP is transient and server-only. Never expose this table to app roles.
create table public.waitcall_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  phone text not null check (phone ~ '^\+7[0-9]{10}$'),
  call_number text,
  otp text,
  verified boolean not null default false,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
create index waitcall_auth_phone_created_idx on public.waitcall_auth_attempts(phone, created_at desc);
create index waitcall_auth_requester_created_idx on public.waitcall_auth_attempts(requester_id, created_at desc);
create unique index waitcall_auth_phone_minute_idx on public.waitcall_auth_attempts
  (phone, date_trunc('minute', created_at at time zone 'UTC'));
alter table public.waitcall_auth_attempts enable row level security;
revoke all on public.waitcall_auth_attempts from anon, authenticated;
grant all on public.waitcall_auth_attempts to service_role;
