-- Core user-owned tables: profiles, plans, requirement sets and requirements (SDD §7.1, §7.2, §19.2).
-- RLS, grants and policies for every public table live in 0008_rls.sql.

create type public.plan_status as enum ('draft', 'solving', 'ready', 'contracted', 'purchased', 'archived');
create type public.autonomy_preset as enum ('strict', 'balanced', 'flexible');
create type public.requirement_importance as enum ('hard', 'preference');
create type public.provenance_kind as enum ('user_stated', 'ai_inferred', 'user_selected', 'pack_default');

create or replace function internal.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function internal.touch_updated_at() from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  default_autonomy public.autonomy_preset not null default 'balanced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
for each row execute function internal.touch_updated_at();

-- Every auth user (including anonymous sessions) gets a profile row.
create or replace function internal.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function internal.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function internal.handle_new_user();

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  brief text check (char_length(brief) <= 4000),
  packs text[] not null default '{}',
  status public.plan_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_user_created_idx on public.plans (user_id, created_at desc);
create trigger plans_touch before update on public.plans
for each row execute function internal.touch_updated_at();

-- A requirement set is an immutable version. Edits insert a new version with parent_id set.
create table public.requirement_sets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  version integer not null check (version >= 1),
  parent_id uuid references public.requirement_sets (id) on delete set null,
  hash text not null check (hash ~ '^sha256:[0-9a-f]{64}$'),
  created_by text not null check (created_by ~ '^(user|ai|kit|system):'),
  created_at timestamptz not null default now(),
  unique (plan_id, version),
  check (parent_id is distinct from id)
);
create index requirement_sets_parent_idx on public.requirement_sets (parent_id);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.requirement_sets (id) on delete cascade,
  -- Requirement.id from the spec (e.g. r_usb_pd). Stable across set versions.
  requirement_key text not null check (requirement_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  importance public.requirement_importance not null,
  provenance_kind public.provenance_kind not null,
  confirmed boolean not null default false,
  -- SDD §7.2 invariant: an unconfirmed AI assumption is only ever a preference.
  effective_importance public.requirement_importance generated always as (
    case
      when provenance_kind = 'ai_inferred' and not confirmed then 'preference'::public.requirement_importance
      else importance
    end
  ) stored,
  created_at timestamptz not null default now(),
  unique (set_id, requirement_key),
  check (spec ->> 'id' is null or spec ->> 'id' = requirement_key)
);
