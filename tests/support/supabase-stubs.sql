-- Reproduit, pour PGlite, ce que Supabase Cloud fournit avant la première migration :
-- rôles, schémas auth / storage / vault, droits par défaut et publication temps réel.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
create schema auth;
create schema storage;
create schema vault;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  mime_type text,
  content text,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to authenticated, service_role;

create function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  secret text not null
);

create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid
language sql
as $$ insert into vault.secrets (name, secret) values (new_name, new_secret) returning id $$;

create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null)
returns void
language sql
as $$ update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;

create view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret from vault.secrets;

create publication supabase_realtime;
