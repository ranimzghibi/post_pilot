-- ============================================================================
-- PostPilot : migration de la Release 1 (sprints 1 à 3)
--
-- À exécuter une seule fois sur un projet Supabase Cloud vierge :
--   Dashboard > SQL Editor > coller ce fichier > Run
--   ou : supabase db push (projet lié)
--
-- La section 15, à la fin, prépare un compte de démonstration. Si le reste de ce
-- fichier a déjà été exécuté, ne collez que cette section : elle fonctionne seule.
--
-- Principes appliqués (rapport, sections 2.4 et 2.6.2) :
--   * chaque ligne métier porte organization_id ;
--   * RLS activée sur 100 % des tables du schéma public ;
--   * les jetons des réseaux sociaux vivent dans Supabase Vault, jamais en clair ;
--   * les colonnes sensibles (forfait, statut d'une publication, état d'un
--     compte social) ne sont modifiables que par le serveur.
-- ============================================================================

create extension if not exists vector with schema extensions;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension if not exists supabase_vault with schema vault;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Types
-- ----------------------------------------------------------------------------

create type public.org_role as enum ('owner', 'admin', 'editor', 'validator', 'viewer');
create type public.plan_code as enum ('trial', 'starter', 'pro', 'agency');
create type public.autopilot_mode as enum ('manual', 'semi_auto', 'auto');
create type public.post_status as enum ('draft', 'in_review', 'approved', 'scheduled', 'publishing', 'published', 'failed');
create type public.document_status as enum ('pending', 'processing', 'ready', 'failed');
create type public.social_status as enum ('active', 'expiring', 'expired', 'error');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.strategy_status as enum ('draft', 'active', 'archived');
create type public.idea_status as enum ('idea', 'drafted', 'skipped');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Forfaits, espaces de travail, profils, membres, invitations
-- ----------------------------------------------------------------------------

create table public.plans (
  code public.plan_code primary key,
  name text not null,
  price_tnd numeric(10, 2) not null default 0,
  max_brands integer not null,
  max_social_accounts integer not null,
  max_members integer not null,
  posts_per_month integer not null,
  images_per_month integer not null
);

-- Prix et quotas : tableau 1.6 du rapport. L'essai (14 jours) n'y figure pas :
-- ses limites sont un choix de départ, modifiable ici sans changer le code.
insert into public.plans (code, name, price_tnd, max_brands, max_social_accounts, max_members, posts_per_month, images_per_month) values
  ('trial',   'Essai',   0,   3,  6,  3,  30,  20),
  ('starter', 'Starter', 49,  1,  2,  1,  30,  20),
  ('pro',     'Pro',     99,  1,  5,  3,  90,  60),
  ('agency',  'Agence',  349, 10, 30, 10, 300, 200);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  plan public.plan_code not null default 'trial' references public.plans (code),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text check (char_length(full_name) <= 120),
  avatar_url text,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  timezone text not null default 'Africa/Tunis',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role public.org_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index invitations_pending_idx
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

-- Fonctions d'appui des politiques RLS : chaque politique s'y réfère (rapport 2.6.2).
create function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.memberships where user_id = (select auth.uid());
$$;

create function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = p_org
      and user_id = (select auth.uid())
      and role = any (p_roles)
  );
$$;

create function public.is_org_owner(p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select public.has_org_role(p_org, array['owner']::public.org_role[]); $$;

create function public.can_manage(p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]); $$;

create function public.can_edit(p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select public.has_org_role(p_org, array['owner', 'admin', 'editor']::public.org_role[]); $$;

-- Création automatique du profil et de l'espace de travail à l'inscription (BF-10).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_name text;
  v_locale text;
begin
  v_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'PostPilot'
  ), 120);
  v_locale := case
    when new.raw_user_meta_data ->> 'locale' in ('fr', 'ar', 'en') then new.raw_user_meta_data ->> 'locale'
    else 'fr'
  end;

  insert into public.profiles (id, email, full_name, avatar_url, locale)
  values (new.id, coalesce(new.email, ''), v_name, new.raw_user_meta_data ->> 'avatar_url', v_locale);

  insert into public.organizations (name, created_by)
  values (v_name, new.id)
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- Protection des rôles : seul un propriétaire touche à un propriétaire,
-- et un espace garde toujours au moins un propriétaire (BF-13).
create function public.protect_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.user_id <> old.user_id) then
    raise exception 'membership_immutable' using errcode = 'P0001';
  end if;

  if v_actor is not null
     and ((tg_op = 'UPDATE' and (old.role = 'owner' or new.role = 'owner'))
       or (tg_op = 'DELETE' and old.role = 'owner' and old.user_id <> v_actor))
     and not exists (
       select 1 from public.memberships
       where organization_id = old.organization_id and user_id = v_actor and role = 'owner'
     ) then
    raise exception 'owner_required' using errcode = 'P0001';
  end if;

  -- Une suppression en cascade (compte ou espace supprimé) échappe à ce contrôle.
  if pg_trigger_depth() = 1
     and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.memberships
       where organization_id = old.organization_id and role = 'owner' and id <> old.id
     ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_protect
  before update or delete on public.memberships
  for each row execute function public.protect_membership();

-- Limites de forfait appliquées par la base : aucune course possible côté application.
create function public.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := tg_argv[0];
  v_max integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('plan:' || v_kind || ':' || new.organization_id::text));

  select case v_kind
           when 'brands' then p.max_brands
           when 'members' then p.max_members
           when 'social' then p.max_social_accounts
         end
    into v_max
    from public.organizations o
    join public.plans p on p.code = o.plan
   where o.id = new.organization_id;

  if v_kind = 'brands' then
    select count(*) into v_count from public.brands where organization_id = new.organization_id;
  elsif v_kind = 'social' then
    select count(*) into v_count from public.social_accounts where organization_id = new.organization_id;
  else
    select (select count(*) from public.memberships where organization_id = new.organization_id)
         + (select count(*) from public.invitations
             where organization_id = new.organization_id
               and accepted_at is null and revoked_at is null and expires_at > now())
      into v_count;
    -- Une invitation acceptée libère sa place au moment de créer le membre.
    if tg_table_name = 'memberships' then
      select count(*) into v_count from public.memberships where organization_id = new.organization_id;
    end if;
  end if;

  if v_count >= v_max then
    raise exception 'plan_limit_%', v_kind using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger memberships_plan_limit
  before insert on public.memberships
  for each row execute function public.enforce_plan_limit('members');

create trigger invitations_plan_limit
  before insert on public.invitations
  for each row execute function public.enforce_plan_limit('members');

-- Le jeton d'invitation n'est jamais stocké en clair : seule son empreinte l'est.
create function public.get_invitation_preview(p_token text)
returns table (organization_name text, role public.org_role, email text, is_expired boolean, is_used boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name,
         i.role,
         i.email,
         i.expires_at <= now(),
         (i.accepted_at is not null or i.revoked_at is not null)
    from public.invitations i
    join public.organizations o on o.id = i.organization_id
   where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update;

  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select lower(email) into v_email from auth.users
   where id = v_uid and email_confirmed_at is not null;

  if v_email is distinct from v_inv.email then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.memberships (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  return v_inv.organization_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Marques et ADN de marque
-- ----------------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  website_url text check (char_length(website_url) <= 2048),
  industry text check (char_length(industry) <= 120),
  description text check (char_length(description) <= 4000),
  timezone text not null default 'Africa/Tunis',
  languages text[] not null default array['fr'],
  autopilot_mode public.autopilot_mode not null default 'manual',
  onboarding_completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index brands_org_idx on public.brands (organization_id);

create trigger brands_plan_limit
  before insert on public.brands
  for each row execute function public.enforce_plan_limit('brands');

create table public.brand_onboarding (
  brand_id uuid primary key,
  organization_id uuid not null,
  answers jsonb not null default '{}'::jsonb,
  website_snapshot jsonb,
  recent_posts jsonb,
  current_step smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade
);

-- Fiche ADN : chaque modification crée une nouvelle version (BF-25), rien n'est écrasé.
create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  version integer not null default 0,
  summary text not null default '' check (char_length(summary) <= 2000),
  audience text not null default '' check (char_length(audience) <= 2000),
  tone text not null default '' check (char_length(tone) <= 2000),
  vocabulary text[] not null default '{}',
  avoid text[] not null default '{}',
  emoji_usage text not null default 'rare' check (emoji_usage in ('none', 'rare', 'moderate', 'frequent')),
  examples jsonb not null default '[]'::jsonb,
  visual_identity jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('ai', 'manual', 'correction', 'restore')),
  change_note text check (char_length(change_note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (brand_id, version),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade
);

create function public.next_brand_profile_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('brand_profile:' || new.brand_id::text));
  select coalesce(max(version), 0) + 1 into new.version
    from public.brand_profiles where brand_id = new.brand_id;
  return new;
end;
$$;

create trigger brand_profiles_version
  before insert on public.brand_profiles
  for each row execute function public.next_brand_profile_version();

-- Actualité de l'entreprise, intégrée aux prochains contenus (BF-26).
create table public.brand_news (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  kind text not null default 'other' check (kind in ('new_product', 'promotion', 'closure', 'event', 'other')),
  title text not null check (char_length(title) between 1 and 200),
  details text not null default '' check (char_length(details) <= 2000),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index brand_news_brand_idx on public.brand_news (brand_id, is_active);

-- ----------------------------------------------------------------------------
-- 4. Base de connaissances
-- ----------------------------------------------------------------------------

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  source_type text not null check (source_type in ('file', 'url', 'text', 'faq')),
  title text not null check (char_length(title) between 1 and 200),
  status public.document_status not null default 'pending',
  storage_path text,
  raw_text text,
  mime_type text,
  size_bytes bigint,
  char_count integer not null default 0,
  chunk_count integer not null default 0,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  -- Ce chemin est relu avec la clé de service : un client ne doit pas pouvoir en sortir.
  check (
    storage_path is null
    or (storage_path ~ ('^' || organization_id::text || '/' || brand_id::text || '/[\w./-]+$') and storage_path !~ '(^|/)\.\.(/|$)')
  )
);
create index knowledge_documents_brand_idx on public.knowledge_documents (brand_id, created_at desc);

-- La dimension 1024 convient à bge-m3, multilingual-e5-large, voyage-3 et aux
-- modèles dont la dimension se règle. embedding_model permet de détecter un
-- changement de modèle et de réindexer.
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  document_id uuid not null,
  chunk_index integer not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding extensions.vector(1024),
  embedding_model text,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  foreign key (document_id, organization_id) references public.knowledge_documents (id, organization_id) on delete cascade,
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade
);
-- Recherche filtrée par marque : quelques centaines de lignes triées exactement,
-- plus précis et aussi rapide qu'un index approximatif à cette échelle.
create index knowledge_chunks_brand_idx on public.knowledge_chunks (brand_id);
create index knowledge_chunks_tsv_idx on public.knowledge_chunks using gin (tsv);

-- Recherche hybride (vecteurs + plein texte) fusionnée par rang réciproque.
-- security invoker : les politiques RLS s'appliquent à l'appelant.
create function public.match_knowledge(
  p_brand uuid,
  p_query_embedding extensions.vector(1024),
  p_query_text text,
  p_limit integer default 8
)
returns table (chunk_id uuid, document_id uuid, document_title text, content text, score double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select nullif(replace(plainto_tsquery('simple', coalesce(p_query_text, ''))::text, '&', '|'), '')::tsquery as query
  ),
  semantic as (
    select c.id, row_number() over (order by c.embedding <=> p_query_embedding) as rnk
      from knowledge_chunks c
     where c.brand_id = p_brand and c.embedding is not null
     order by c.embedding <=> p_query_embedding
     limit 40
  ),
  lexical as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q.query) desc) as rnk
      from knowledge_chunks c, q
     where c.brand_id = p_brand and q.query is not null and c.tsv @@ q.query
     order by ts_rank_cd(c.tsv, q.query) desc
     limit 40
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           coalesce(1.0 / (60 + s.rnk), 0) + coalesce(1.0 / (60 + l.rnk), 0) as score
      from semantic s
      full join lexical l on l.id = s.id
  )
  select c.id, c.document_id, d.title, c.content, f.score::double precision
    from fused f
    join knowledge_chunks c on c.id = f.id
    join knowledge_documents d on d.id = c.document_id
   order by f.score desc
   limit least(greatest(p_limit, 1), 20);
$$;

-- ----------------------------------------------------------------------------
-- 5. Comptes sociaux et secrets
-- ----------------------------------------------------------------------------

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  network text not null check (network ~ '^[a-z_]{2,32}$'),
  external_id text not null,
  provider_user_id text,
  display_name text not null,
  username text,
  avatar_url text,
  status public.social_status not null default 'active',
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  is_test boolean not null default false,
  is_sandbox boolean not null default false,
  last_checked_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (brand_id, network, external_id),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade
);
create index social_accounts_brand_idx on public.social_accounts (brand_id);

create trigger social_accounts_plan_limit
  before insert on public.social_accounts
  for each row execute function public.enforce_plan_limit('social');

-- Aucune politique sur cette table : seul le serveur (service_role) y accède.
create table public.social_account_secrets (
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('access', 'user_access')),
  secret_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (account_id, kind)
);

-- Suppression immédiate des jetons à la déconnexion (BF-37), quel qu'en soit le chemin.
create function public.purge_social_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets
   where id in (select secret_id from public.social_account_secrets where account_id = old.id);
  delete from public.social_account_secrets where account_id = old.id;
  return old;
end;
$$;

create trigger social_accounts_purge
  before delete on public.social_accounts
  for each row execute function public.purge_social_secrets();

-- Session OAuth entre le retour de Meta et le choix des pages à connecter.
create table public.social_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  candidates jsonb not null default '[]'::jsonb,
  secret_id uuid,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade
);

create function public.purge_oauth_session_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end;
$$;

create trigger social_oauth_sessions_purge
  before delete on public.social_oauth_sessions
  for each row execute function public.purge_oauth_session_secret();

-- Accès au Vault, réservé au service_role (voir les droits en fin de fichier).
create function public.vault_put(p_name text, p_value text)
returns uuid
language sql
security definer
set search_path = ''
as $$ select vault.create_secret(p_value, p_name); $$;

create function public.vault_replace(p_id uuid, p_value text)
returns void
language sql
security definer
set search_path = ''
as $$ select vault.update_secret(p_id, p_value); $$;

create function public.vault_read(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where id = p_id; $$;

create function public.vault_delete(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$ delete from vault.secrets where id = p_id; $$;

-- ----------------------------------------------------------------------------
-- 6. Temps forts locaux, stratégie, calendrier, contenus
-- ----------------------------------------------------------------------------

create table public.local_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  event_date date not null,
  end_date date,
  country text not null default 'TN',
  category text not null check (category in ('religious', 'national', 'commercial', 'seasonal', 'international')),
  names jsonb not null,
  sectors text[] not null default '{}',
  is_estimated boolean not null default false,
  unique (slug, event_date)
);
create index local_events_date_idx on public.local_events (event_date);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  period date not null,
  summary text not null default '',
  objectives jsonb not null default '[]'::jsonb,
  pillars jsonb not null default '[]'::jsonb,
  tone text not null default '',
  frequency jsonb not null default '{}'::jsonb,
  format_mix jsonb not null default '{}'::jsonb,
  status public.strategy_status not null default 'draft',
  brand_profile_version integer,
  ai_generation_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (brand_id, period),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  check (period = date_trunc('month', period)::date)
);

create table public.calendar_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  strategy_id uuid not null,
  planned_on date not null,
  networks text[] not null default '{}',
  pillar text not null,
  format text not null default 'image' check (format in ('text', 'image', 'carousel')),
  title text not null check (char_length(title) between 1 and 200),
  angle text not null default '' check (char_length(angle) <= 1000),
  local_event_id uuid references public.local_events (id) on delete set null,
  news_id uuid,
  status public.idea_status not null default 'idea',
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (strategy_id, organization_id) references public.strategies (id, organization_id) on delete cascade,
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  foreign key (news_id, organization_id) references public.brand_news (id, organization_id) on delete set null (news_id)
);
create index calendar_ideas_brand_date_idx on public.calendar_ideas (brand_id, planned_on);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  idea_id uuid,
  pillar text,
  idea text not null default '' check (char_length(idea) <= 2000),
  brief text not null default '' check (char_length(brief) <= 4000),
  language text not null default 'fr' check (language in ('fr', 'ar', 'en', 'tn')),
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  sensitive_topics text[] not null default '{}',
  brand_profile_version integer,
  ai_generation_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  foreign key (idea_id, organization_id) references public.calendar_ideas (id, organization_id) on delete set null (idea_id)
);
create index posts_brand_created_idx on public.posts (brand_id, created_at desc);

create table public.post_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  post_id uuid not null,
  network text not null check (network ~ '^[a-z_]{2,32}$'),
  option_index smallint not null default 0 check (option_index between 0 and 2),
  is_selected boolean not null default false,
  caption text not null default '' check (char_length(caption) <= 63206),
  hashtags text[] not null default '{}',
  cta text not null default '',
  format text not null default 'image' check (format in ('text', 'image', 'carousel')),
  visual_brief text not null default '',
  compliance_score smallint check (compliance_score between 0 and 100),
  compliance_issues jsonb not null default '[]'::jsonb,
  edited_by_user boolean not null default false,
  ai_generation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (post_id, network, option_index),
  foreign key (post_id, organization_id) references public.posts (id, organization_id) on delete cascade,
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade
);
create unique index post_variants_selected_idx on public.post_variants (post_id, network) where is_selected;

-- ----------------------------------------------------------------------------
-- 7. Médias et studio visuel
-- ----------------------------------------------------------------------------

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  kind text not null default 'image' check (kind in ('image', 'logo')),
  source text not null check (source in ('ai', 'template', 'upload')),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  alt text not null default '' check (char_length(alt) <= 500),
  prompt text check (char_length(prompt) <= 4000),
  ai_generation_id uuid,
  project_id uuid,
  position smallint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  check (storage_path ~ ('^' || organization_id::text || '/' || brand_id::text || '/[\w./-]+$') and storage_path !~ '(^|/)\.\.(/|$)')
);
create index media_assets_brand_idx on public.media_assets (brand_id, created_at desc);

create table public.visual_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  post_id uuid,
  name text not null default '' check (char_length(name) <= 120),
  kind text not null default 'single' check (kind in ('single', 'carousel')),
  template_id text not null,
  format text not null default 'square' check (format in ('square', 'portrait', 'landscape', 'story')),
  slides jsonb not null default '[]'::jsonb check (jsonb_array_length(slides) <= 10),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  foreign key (post_id, organization_id) references public.posts (id, organization_id) on delete set null (post_id)
);

alter table public.media_assets
  add foreign key (project_id, organization_id) references public.visual_projects (id, organization_id) on delete set null (project_id);

create table public.post_media (
  post_id uuid not null,
  media_asset_id uuid not null,
  organization_id uuid not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (post_id, media_asset_id),
  foreign key (post_id, organization_id) references public.posts (id, organization_id) on delete cascade,
  foreign key (media_asset_id, organization_id) references public.media_assets (id, organization_id) on delete cascade
);

-- ----------------------------------------------------------------------------
-- 8. Publication, traçabilité de l'IA, quotas, limitation de débit
-- ----------------------------------------------------------------------------

create table public.publication_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null,
  social_account_id uuid,
  post_variant_id uuid,
  status public.job_status not null default 'queued',
  run_at timestamptz not null default now(),
  attempts smallint not null default 0,
  idempotency_key text not null unique,
  caption text not null default '',
  media_paths text[] not null default '{}',
  external_post_id text,
  external_url text,
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id) on delete cascade,
  foreign key (social_account_id, organization_id) references public.social_accounts (id, organization_id) on delete set null (social_account_id),
  foreign key (post_variant_id, organization_id) references public.post_variants (id, organization_id) on delete set null (post_variant_id)
);
create index publication_jobs_brand_idx on public.publication_jobs (brand_id, created_at desc);

-- Garde-fou (iv) du rapport : chaque génération conserve consigne, modèle et version de l'ADN.
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid,
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  brand_profile_version integer,
  prompt text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index ai_generations_org_idx on public.ai_generations (organization_id, created_at desc);

create table public.usage_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period date not null,
  posts_generated integer not null default 0,
  images_generated integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, period)
);

create function public.consume_quota(p_org uuid, p_kind text, p_amount integer default 1)
returns table (used integer, quota integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'Africa/Tunis')::date;
  v_quota integer;
  v_used integer;
begin
  if p_kind not in ('posts', 'images') or p_amount < 1 then
    raise exception 'invalid_quota_kind' using errcode = 'P0001';
  end if;

  select case p_kind when 'posts' then p.posts_per_month else p.images_per_month end
    into v_quota
    from public.organizations o
    join public.plans p on p.code = o.plan
   where o.id = p_org;

  insert into public.usage_counters (organization_id, period)
  values (p_org, v_period)
  on conflict (organization_id, period) do nothing;

  if p_kind = 'posts' then
    update public.usage_counters
       set posts_generated = posts_generated + p_amount, updated_at = now()
     where organization_id = p_org and period = v_period and posts_generated + p_amount <= v_quota
    returning posts_generated into v_used;
  else
    update public.usage_counters
       set images_generated = images_generated + p_amount, updated_at = now()
     where organization_id = p_org and period = v_period and images_generated + p_amount <= v_quota
    returning images_generated into v_used;
  end if;

  if v_used is null then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return query select v_used, v_quota;
end;
$$;

-- Rend une unité consommée lorsqu'une génération échoue.
create function public.refund_quota(p_org uuid, p_kind text, p_amount integer default 1)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usage_counters
     set posts_generated = case when p_kind = 'posts' then greatest(posts_generated - p_amount, 0) else posts_generated end,
         images_generated = case when p_kind = 'images' then greatest(images_generated - p_amount, 0) else images_generated end,
         updated_at = now()
   where organization_id = p_org
     and period = date_trunc('month', now() at time zone 'Africa/Tunis')::date;
$$;

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Horodatage automatique
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and c.column_name = 'updated_at' and t.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      r.table_name || '_set_updated_at', r.table_name
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 10. Sécurité au niveau des lignes
-- ----------------------------------------------------------------------------

-- 100 % des tables du schéma public, sans exception.
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- Données de référence, en lecture seule.
create policy plans_select on public.plans for select to authenticated using (true);
create policy local_events_select on public.local_events for select to authenticated using (true);

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select public.user_org_ids()));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships m
       where m.user_id = profiles.id and m.organization_id in (select public.user_org_ids())
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_select on public.memberships for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy memberships_update on public.memberships for update to authenticated
  using (public.can_manage(organization_id)) with check (public.can_manage(organization_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.can_manage(organization_id) or user_id = (select auth.uid()));

create policy invitations_select on public.invitations for select to authenticated
  using (public.can_manage(organization_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.can_manage(organization_id) and invited_by = (select auth.uid()));
create policy invitations_update on public.invitations for update to authenticated
  using (public.can_manage(organization_id)) with check (public.can_manage(organization_id));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.can_manage(organization_id));

create policy brands_select on public.brands for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy brands_insert on public.brands for insert to authenticated
  with check (public.can_manage(organization_id));
create policy brands_update on public.brands for update to authenticated
  using (public.can_manage(organization_id)) with check (public.can_manage(organization_id));
create policy brands_delete on public.brands for delete to authenticated
  using (public.is_org_owner(organization_id));

-- Tables de contenu : lecture pour les membres, écriture pour éditeur et plus.
do $$
declare
  t text;
begin
  foreach t in array array[
    'brand_onboarding', 'brand_news', 'strategies', 'calendar_ideas', 'posts',
    'post_variants', 'post_media', 'media_assets', 'visual_projects', 'knowledge_documents'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select public.user_org_ids()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit(organization_id)) with check (public.can_edit(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit(organization_id))', t || '_delete', t);
  end loop;
end $$;

-- ADN de marque : versions immuables, on ne fait qu'en ajouter.
create policy brand_profiles_select on public.brand_profiles for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy brand_profiles_insert on public.brand_profiles for insert to authenticated
  with check (public.can_edit(organization_id));

-- Lecture seule pour les utilisateurs : l'écriture passe par le serveur.
create policy knowledge_chunks_select on public.knowledge_chunks for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy publication_jobs_select on public.publication_jobs for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy ai_generations_select on public.ai_generations for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy usage_counters_select on public.usage_counters for select to authenticated
  using (organization_id in (select public.user_org_ids()));

create policy social_accounts_select on public.social_accounts for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy social_accounts_update on public.social_accounts for update to authenticated
  using (public.can_manage(organization_id)) with check (public.can_manage(organization_id));
create policy social_accounts_delete on public.social_accounts for delete to authenticated
  using (public.can_manage(organization_id));

create policy social_oauth_sessions_select on public.social_oauth_sessions for select to authenticated
  using (user_id = (select auth.uid()));

-- social_account_secrets et rate_limits : RLS active, aucune politique, donc aucun accès client.

-- Droits par colonne : forfait, statut de publication et état de connexion
-- restent hors de portée d'un appel direct à l'API.
revoke update on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, locale, timezone) on public.profiles to authenticated;

revoke update on public.brands from authenticated;
grant update (name, website_url, industry, description, timezone, languages, onboarding_completed_at) on public.brands to authenticated;

revoke update on public.memberships from authenticated;
grant update (role) on public.memberships to authenticated;

revoke update on public.invitations from authenticated;
grant update (role, token_hash, expires_at, revoked_at) on public.invitations to authenticated;

revoke update on public.social_accounts from authenticated;
grant update (is_test) on public.social_accounts to authenticated;

revoke update on public.posts from authenticated;
grant update (pillar, idea, brief, language, sensitive_topics, brand_profile_version, ai_generation_id) on public.posts to authenticated;

revoke update on public.knowledge_documents from authenticated;
grant update (title) on public.knowledge_documents to authenticated;

-- Une publication naît toujours brouillon : rien ne part sans approbation.
drop policy posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (public.can_edit(organization_id) and status = 'draft');

-- Passé le brouillon, un texte ne change plus et une publication ne se supprime plus.
drop policy posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (public.can_edit(organization_id) and status = 'draft');

drop policy post_variants_update on public.post_variants;
create policy post_variants_update on public.post_variants for update to authenticated
  using (public.can_edit(organization_id) and exists (select 1 from public.posts p where p.id = post_id and p.status = 'draft'))
  with check (public.can_edit(organization_id));

drop policy post_variants_delete on public.post_variants;
create policy post_variants_delete on public.post_variants for delete to authenticated
  using (public.can_edit(organization_id) and exists (select 1 from public.posts p where p.id = post_id and p.status = 'draft'));

drop policy knowledge_documents_insert on public.knowledge_documents;
create policy knowledge_documents_insert on public.knowledge_documents for insert to authenticated
  with check (public.can_edit(organization_id) and status = 'pending');

-- ----------------------------------------------------------------------------
-- 11. Stockage privé, chemins préfixés par l'identifiant de l'espace
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', false, 26214400, array['image/jpeg', 'image/png', 'image/webp']),
  ('knowledge', 'knowledge', false, 20971520, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv', 'text/markdown'
  ])
on conflict (id) do nothing;

create function public.path_org_id(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_path, '/', 1)::uuid
  end;
$$;

create policy tenant_files_select on storage.objects for select to authenticated
  using (bucket_id in ('media', 'knowledge') and public.path_org_id(name) in (select public.user_org_ids()));

create policy tenant_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('media', 'knowledge') and public.can_edit(public.path_org_id(name)));

create policy tenant_files_update on storage.objects for update to authenticated
  using (bucket_id in ('media', 'knowledge') and public.can_edit(public.path_org_id(name)));

create policy tenant_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('media', 'knowledge') and public.can_edit(public.path_org_id(name)));

-- ----------------------------------------------------------------------------
-- 12. Temps réel
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.knowledge_documents;

-- ----------------------------------------------------------------------------
-- 13. Droits d'exécution et accès anonyme
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.user_org_ids() to authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated, service_role;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;
grant execute on function public.can_manage(uuid) to authenticated, service_role;
grant execute on function public.can_edit(uuid) to authenticated, service_role;
grant execute on function public.path_org_id(text) to authenticated, service_role;
grant execute on function public.accept_invitation(text) to authenticated, service_role;
grant execute on function public.match_knowledge(uuid, extensions.vector, text, integer) to authenticated, service_role;
grant execute on function public.get_invitation_preview(text) to anon, authenticated, service_role;

grant execute on function public.vault_put(text, text) to service_role;
grant execute on function public.vault_replace(uuid, text) to service_role;
grant execute on function public.vault_read(uuid) to service_role;
grant execute on function public.vault_delete(uuid) to service_role;
grant execute on function public.consume_quota(uuid, text, integer) to service_role;
grant execute on function public.refund_quota(uuid, text, integer) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ----------------------------------------------------------------------------
-- 14. Calendrier des temps forts tunisiens (novembre 2026 à décembre 2027)
-- Les dates du calendrier hégirien et des soldes sont estimées (is_estimated) :
-- à confirmer par le back-office de la release 2 selon les annonces officielles.
-- ----------------------------------------------------------------------------

insert into public.local_events (slug, event_date, end_date, category, names, sectors, is_estimated) values
  ('black-friday', '2026-11-27', null, 'commercial', '{"fr":"Black Friday","ar":"الجمعة السوداء","en":"Black Friday"}', array['retail','ecommerce','fashion'], false),
  ('revolution', '2026-12-17', null, 'national', '{"fr":"Fête de la Révolution","ar":"عيد الثورة","en":"Revolution Day"}', '{}', false),
  ('new-year-eve', '2026-12-31', null, 'seasonal', '{"fr":"Réveillon du Nouvel An","ar":"ليلة رأس السنة","en":"New Year''s Eve"}', '{}', false),
  ('new-year', '2027-01-01', null, 'seasonal', '{"fr":"Nouvel An","ar":"رأس السنة الميلادية","en":"New Year''s Day"}', '{}', false),
  ('winter-sales', '2027-02-01', '2027-03-07', 'commercial', '{"fr":"Soldes d''hiver","ar":"التخفيضات الشتوية","en":"Winter sales"}', array['retail','ecommerce','fashion'], true),
  ('ramadan', '2027-02-08', '2027-03-09', 'religious', '{"fr":"Ramadan","ar":"رمضان","en":"Ramadan"}', '{}', true),
  ('valentine', '2027-02-14', null, 'commercial', '{"fr":"Saint-Valentin","ar":"عيد الحب","en":"Valentine''s Day"}', array['restaurant','retail','beauty','ecommerce'], false),
  ('women-day-intl', '2027-03-08', null, 'international', '{"fr":"Journée internationale des femmes","ar":"اليوم العالمي للمرأة","en":"International Women''s Day"}', '{}', false),
  ('eid-fitr', '2027-03-10', '2027-03-11', 'religious', '{"fr":"Aïd el-Fitr","ar":"عيد الفطر","en":"Eid al-Fitr"}', '{}', true),
  ('independence', '2027-03-20', null, 'national', '{"fr":"Fête de l''Indépendance","ar":"عيد الاستقلال","en":"Independence Day"}', '{}', false),
  ('youth-day', '2027-03-21', null, 'national', '{"fr":"Fête de la Jeunesse","ar":"عيد الشباب","en":"Youth Day"}', '{}', false),
  ('martyrs', '2027-04-09', null, 'national', '{"fr":"Journée des Martyrs","ar":"عيد الشهداء","en":"Martyrs'' Day"}', '{}', false),
  ('labour-day', '2027-05-01', null, 'national', '{"fr":"Fête du Travail","ar":"عيد الشغل","en":"Labour Day"}', '{}', false),
  ('eid-adha', '2027-05-16', '2027-05-18', 'religious', '{"fr":"Aïd el-Adha","ar":"عيد الأضحى","en":"Eid al-Adha"}', '{}', true),
  ('mothers-day', '2027-05-30', null, 'commercial', '{"fr":"Fête des Mères","ar":"عيد الأم","en":"Mother''s Day"}', array['restaurant','retail','beauty','ecommerce'], false),
  ('hijri-new-year', '2027-06-06', null, 'religious', '{"fr":"Ras el-Am el-Hijri","ar":"رأس السنة الهجرية","en":"Islamic New Year"}', '{}', true),
  ('fathers-day', '2027-06-20', null, 'commercial', '{"fr":"Fête des Pères","ar":"عيد الأب","en":"Father''s Day"}', array['restaurant','retail','ecommerce'], false),
  ('republic', '2027-07-25', null, 'national', '{"fr":"Fête de la République","ar":"عيد الجمهورية","en":"Republic Day"}', '{}', false),
  ('summer-sales', '2027-08-02', '2027-09-05', 'commercial', '{"fr":"Soldes d''été","ar":"التخفيضات الصيفية","en":"Summer sales"}', array['retail','ecommerce','fashion'], true),
  ('women-day-tn', '2027-08-13', null, 'national', '{"fr":"Fête de la Femme","ar":"عيد المرأة","en":"Women''s Day"}', '{}', false),
  ('mouled', '2027-08-15', null, 'religious', '{"fr":"Mouled","ar":"المولد النبوي","en":"Mawlid"}', '{}', true),
  ('back-to-school', '2027-09-15', null, 'seasonal', '{"fr":"Rentrée scolaire","ar":"العودة المدرسية","en":"Back to school"}', array['retail','ecommerce','training','fashion'], false),
  ('evacuation', '2027-10-15', null, 'national', '{"fr":"Fête de l''Évacuation","ar":"عيد الجلاء","en":"Evacuation Day"}', '{}', false),
  ('black-friday', '2027-11-26', null, 'commercial', '{"fr":"Black Friday","ar":"الجمعة السوداء","en":"Black Friday"}', array['retail','ecommerce','fashion'], false),
  ('revolution', '2027-12-17', null, 'national', '{"fr":"Fête de la Révolution","ar":"عيد الثورة","en":"Revolution Day"}', '{}', false),
  ('new-year-eve', '2027-12-31', null, 'seasonal', '{"fr":"Réveillon du Nouvel An","ar":"ليلة رأس السنة","en":"New Year''s Eve"}', '{}', false);

-- ----------------------------------------------------------------------------
-- 15. Données prêtes à l'emploi pour ranimzghibi5@gmail.com
--
-- Trois marques fictives complètes : ADN versionné, base de connaissances,
-- actualités, comptes bac à sable, stratégies, calendrier, publications, équipe.
-- Le compte se crée normalement (inscription ou Google) : aucun mot de passe ici.
--   * il existe déjà : les données sont ajoutées dès l'exécution de cette section ;
--   * il n'existe pas encore : elles sont ajoutées à son inscription.
--
-- Cette section peut être exécutée seule, et relancée sans créer de doublon.
-- Les dates sont relatives au jour d'exécution : le calendrier n'est jamais vide.
-- Les fichiers (logos, photos) ne sont pas inclus : SQL ne dépose rien dans Storage.
-- À retirer avant la mise en production.
-- ----------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.seed_text_array(p_values jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(value order by ordinality), '{}')
    from jsonb_array_elements_text(coalesce(p_values, '[]'::jsonb)) with ordinality;
$$;

create or replace function private.seed_post(
  p_org uuid,
  p_user uuid,
  p_brand uuid,
  p_version integer,
  p_idea uuid,
  p_pillar text,
  p_title text,
  p_format text,
  p_day date,
  p_post jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_created timestamptz := now() - make_interval(days => coalesce((p_post ->> 'age')::integer, 0));
  v_status public.post_status := coalesce(p_post ->> 'status', 'draft')::public.post_status;
  v_selected integer := coalesce((p_post ->> 'selected')::integer, 0);
  v_run_at timestamptz := (p_day + time '12:30') at time zone 'Africa/Tunis';
  v_generation uuid;
  v_post uuid;
  v_variant uuid;
  v_account uuid;
  v_option record;
  v_entry record;
  v_hashtags text[];
begin
  insert into public.ai_generations (organization_id, brand_id, user_id, feature, provider, model, prompt_version, brand_profile_version, prompt, created_at)
  values (p_org, p_brand, p_user, 'post', 'demo', 'demo', 'post.v1', p_version, concat_ws('. ', p_title, p_post ->> 'brief'), v_created)
  returning id into v_generation;

  insert into public.posts (organization_id, brand_id, idea_id, pillar, idea, brief, language, status, scheduled_at, sensitive_topics, brand_profile_version, ai_generation_id, created_by, created_at)
  values (
    p_org, p_brand, p_idea, p_pillar, coalesce(p_title, ''), coalesce(p_post ->> 'brief', ''),
    coalesce(p_post ->> 'language', 'fr'), v_status,
    case when v_status = 'scheduled' then (p_day + time '18:30') at time zone 'Africa/Tunis' end,
    private.seed_text_array(p_post -> 'sensitive'), p_version, v_generation, p_user, v_created
  )
  returning id into v_post;

  for v_option in
    select value, (ordinality - 1)::integer as position from jsonb_array_elements(p_post -> 'options') with ordinality
  loop
    for v_entry in select key, value from jsonb_each(v_option.value -> 'variants') loop
      v_hashtags := private.seed_text_array(v_entry.value -> 'hashtags');

      insert into public.post_variants (organization_id, brand_id, post_id, network, option_index, is_selected, caption, hashtags, cta, format, visual_brief, compliance_score, compliance_issues, ai_generation_id, created_at)
      values (
        p_org, p_brand, v_post, v_entry.key, v_option.position, v_option.position = v_selected,
        v_entry.value ->> 'caption', v_hashtags, coalesce(v_entry.value ->> 'cta', ''), coalesce(p_format, 'image'),
        coalesce(v_option.value ->> 'visual', ''), coalesce((v_entry.value ->> 'score')::smallint, 100),
        coalesce(v_entry.value -> 'issues', '[]'::jsonb), v_generation, v_created
      )
      returning id into v_variant;

      -- Historique des envois : uniquement vers des comptes bac à sable.
      if v_status in ('published', 'failed') and v_option.position = v_selected then
        select id into v_account from public.social_accounts where brand_id = p_brand and network = v_entry.key;

        insert into public.publication_jobs (organization_id, brand_id, social_account_id, post_variant_id, status, run_at, attempts, idempotency_key, caption, external_post_id, last_error, created_by, created_at)
        values (
          p_org, p_brand, v_account, v_variant,
          (case when v_status = 'published' then 'succeeded' else 'failed' end)::public.job_status,
          v_run_at, 1, v_account::text || ':' || gen_random_uuid()::text,
          concat_ws(E'\n\n', v_entry.value ->> 'caption', nullif(v_entry.value ->> 'cta', ''), (select string_agg('#' || tag, ' ') from unnest(v_hashtags) as tag)),
          case when v_status = 'published' then 'sandbox_' || gen_random_uuid()::text end,
          case when v_status = 'failed' then p_post ->> 'error' end,
          p_user, v_run_at
        );
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function private.seed_brand(p_org uuid, p_user uuid, p_data jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Tunis')::date;
  v_month date := date_trunc('month', (now() at time zone 'Africa/Tunis'))::date;
  v_created timestamptz := now() - make_interval(days => (p_data ->> 'age')::integer);
  v_language text := p_data -> 'languages' ->> 0;
  v_strategy_data jsonb := p_data -> 'strategy';
  v_brand uuid;
  v_profile jsonb := '{}'::jsonb;
  v_version integer;
  v_news uuid[] := '{}';
  v_news_id uuid;
  v_document uuid;
  v_text text;
  v_parts text[];
  v_generation uuid;
  v_strategy uuid;
  v_period date;
  v_day date;
  v_idea uuid;
  v_item record;
  v_event record;
begin
  if exists (select 1 from public.brands where organization_id = p_org and name = p_data ->> 'name') then
    return;
  end if;

  insert into public.brands (organization_id, name, website_url, industry, description, languages, onboarding_completed_at, created_by, created_at)
  values (p_org, p_data ->> 'name', p_data ->> 'website_url', p_data ->> 'industry', p_data ->> 'description', private.seed_text_array(p_data -> 'languages'), v_created, p_user, v_created)
  returning id into v_brand;

  insert into public.brand_onboarding (brand_id, organization_id, answers, current_step, created_at)
  values (v_brand, p_org, p_data -> 'onboarding', 4, v_created);

  -- Chaque version complète la précédente, comme dans l'éditeur de fiche.
  for v_item in select value from jsonb_array_elements(p_data -> 'profiles') with ordinality order by ordinality loop
    v_profile := v_profile || v_item.value;
    insert into public.brand_profiles (organization_id, brand_id, summary, audience, tone, vocabulary, avoid, emoji_usage, examples, visual_identity, source, change_note, created_by, created_at)
    values (
      p_org, v_brand, v_profile ->> 'summary', v_profile ->> 'audience', v_profile ->> 'tone',
      private.seed_text_array(v_profile -> 'vocabulary'), private.seed_text_array(v_profile -> 'avoid'), v_profile ->> 'emoji_usage',
      coalesce(v_profile -> 'examples', '[]'::jsonb), coalesce(v_profile -> 'visual_identity', '{}'::jsonb),
      v_profile ->> 'source', v_item.value ->> 'change_note', p_user,
      now() - make_interval(days => (v_item.value ->> 'age')::integer)
    );
  end loop;
  select max(version) into v_version from public.brand_profiles where brand_id = v_brand;

  for v_item in select value from jsonb_array_elements(p_data -> 'news') with ordinality order by ordinality loop
    insert into public.brand_news (organization_id, brand_id, kind, title, details, starts_on, ends_on, is_active, created_by, created_at)
    values (
      p_org, v_brand, v_item.value ->> 'kind', v_item.value ->> 'title', v_item.value ->> 'details',
      v_today + (v_item.value ->> 'starts_in')::integer, v_today + (v_item.value ->> 'ends_in')::integer,
      coalesce((v_item.value ->> 'is_active')::boolean, true), p_user,
      now() - make_interval(days => (v_item.value ->> 'age')::integer)
    )
    returning id into v_news_id;
    v_news := v_news || v_news_id;
  end loop;

  -- Un paragraphe par passage. Recherche plein texte : les vecteurs se calculent à l'indexation.
  for v_item in select value from jsonb_array_elements(p_data -> 'documents') with ordinality order by ordinality loop
    v_text := v_item.value ->> 'text';
    v_parts := array(select trim(part) from regexp_split_to_table(v_text, E'\n\n+') as part where trim(part) <> '');

    insert into public.knowledge_documents (organization_id, brand_id, source_type, title, status, raw_text, char_count, chunk_count, created_by, created_at)
    values (p_org, v_brand, v_item.value ->> 'source_type', v_item.value ->> 'title', 'ready', v_text, char_length(v_text), cardinality(v_parts), p_user, now() - make_interval(days => (v_item.value ->> 'age')::integer))
    returning id into v_document;

    insert into public.knowledge_chunks (organization_id, brand_id, document_id, chunk_index, content)
    select p_org, v_brand, v_document, (ordinality - 1)::integer, part
      from unnest(v_parts) with ordinality as chunk(part, ordinality);
  end loop;

  insert into public.social_accounts (organization_id, brand_id, network, external_id, display_name, username, status, token_expires_at, is_test, is_sandbox, last_checked_at, connected_by, created_at)
  select
    p_org, v_brand, value ->> 'network', 'sandbox-' || gen_random_uuid()::text, value ->> 'display_name', value ->> 'username',
    coalesce(value ->> 'status', 'active')::public.social_status,
    now() + make_interval(days => (value ->> 'expires_in')::integer),
    true, true, now(), p_user, v_created
  from jsonb_array_elements(p_data -> 'accounts');

  -- Mois précédent, mois en cours, mois suivant : le calendrier est rempli des deux côtés.
  for v_item in select generate_series(-1, 1) as shift loop
    v_period := (v_month + make_interval(months => v_item.shift))::date;

    insert into public.ai_generations (organization_id, brand_id, user_id, feature, provider, model, prompt_version, brand_profile_version, prompt, created_at)
    values (p_org, v_brand, p_user, 'strategy', 'demo', 'demo', 'strategy.v1', v_version, 'Stratégie éditoriale du mois ' || v_period::text, least(now(), v_period::timestamptz))
    returning id into v_generation;

    insert into public.strategies (organization_id, brand_id, period, summary, objectives, pillars, tone, frequency, format_mix, status, brand_profile_version, ai_generation_id, created_by, created_at)
    values (
      p_org, v_brand, v_period, v_strategy_data ->> 'summary', v_strategy_data -> 'objectives', v_strategy_data -> 'pillars', v_strategy_data ->> 'tone',
      v_strategy_data -> 'frequency', v_strategy_data -> 'format_mix',
      (case v_item.shift when -1 then 'archived' when 0 then 'active' else 'draft' end)::public.strategy_status,
      v_version, v_generation, p_user, least(now(), v_period::timestamptz)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_data -> 'ideas') with ordinality order by ordinality loop
    v_day := v_today + (v_item.value ->> 'offset')::integer;
    select id into v_strategy from public.strategies where brand_id = v_brand and period = date_trunc('month', v_day::timestamp)::date;

    insert into public.calendar_ideas (organization_id, brand_id, strategy_id, planned_on, networks, pillar, format, title, angle, news_id, status, is_locked)
    values (
      p_org, v_brand, v_strategy, v_day, private.seed_text_array(v_item.value -> 'networks'), v_item.value ->> 'pillar', v_item.value ->> 'format',
      v_item.value ->> 'title', v_item.value ->> 'angle', v_news[(v_item.value ->> 'news')::integer + 1],
      (case when v_item.value ? 'post' then 'drafted' else coalesce(v_item.value ->> 'status', 'idea') end)::public.idea_status,
      coalesce((v_item.value ->> 'locked')::boolean, false)
    )
    returning id into v_idea;

    if v_item.value ? 'post' then
      perform private.seed_post(p_org, p_user, v_brand, v_version, v_idea, v_item.value ->> 'pillar', v_item.value ->> 'title', v_item.value ->> 'format', v_day, v_item.value -> 'post');
    end if;
  end loop;

  -- Temps forts à venir, filtrés par secteur comme le fait le générateur de calendrier.
  for v_event in
    select e.id, e.event_date, coalesce(e.names ->> (case when v_language = 'tn' then 'ar' else v_language end), e.names ->> 'fr') as label
      from public.local_events e
     where e.event_date >= v_today
       and e.event_date < (v_month + interval '2 months')
       and (cardinality(e.sectors) = 0 or (p_data ->> 'industry') = any (e.sectors))
     order by e.event_date
  loop
    select id into v_strategy from public.strategies where brand_id = v_brand and period = date_trunc('month', v_event.event_date::timestamp)::date;

    insert into public.calendar_ideas (organization_id, brand_id, strategy_id, planned_on, networks, pillar, format, title, angle, local_event_id)
    values (p_org, v_brand, v_strategy, v_event.event_date, array['facebook', 'instagram'], v_strategy_data -> 'pillars' -> -1 ->> 'name', 'image', format(p_data ->> 'event_title', v_event.label), p_data ->> 'event_angle', v_event.id);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_data -> 'posts', '[]'::jsonb)) with ordinality order by ordinality loop
    perform private.seed_post(p_org, p_user, v_brand, v_version, null, null, null, 'text', v_today, v_item.value);
  end loop;

  insert into public.visual_projects (organization_id, brand_id, name, kind, template_id, format, slides, created_by)
  select p_org, v_brand, value ->> 'name', value ->> 'kind', value ->> 'template', value ->> 'format', value -> 'slides', p_user
    from jsonb_array_elements(p_data -> 'projects');
end;
$$;

-- Tout le contenu est ici. Les nombres sont relatifs à aujourd'hui, en jours :
-- age dans le passé, offset / starts_in / ends_in / expires_in vers l'avenir.
-- Prix, horaires et téléphones cités par une publication figurent dans les documents
-- ou les actualités de sa marque, sinon le contrôle de conformité les signale.
create or replace function private.seed_data()
returns jsonb
language sql
immutable
set search_path = ''
as $seed_fn$
select $seed_json$[
{
  "name": "Maison Yasmina",
  "website_url": "https://maison-yasmina.example",
  "industry": "restaurant",
  "description": "Restaurant familial de cuisine tunisienne à La Marsa : recettes de famille, produits du marché et pain cuit sur place.",
  "languages": ["fr", "ar"],
  "age": 60,
  "event_title": "%s : notre message à nos clients",
  "event_angle": "Un message simple et sincère, puis une invitation à passer à table.",
  "onboarding": {
    "sector": "restaurant",
    "offer": "Cuisine tunisienne familiale, couscous du vendredi, brunch du dimanche et menu du midi.",
    "audience": "Familles et jeunes actifs de La Marsa, Carthage et Gammarth, de 25 à 55 ans.",
    "goals": ["traffic", "loyalty"],
    "difference": "Recettes de famille, produits du marché de La Marsa, pain cuit sur place",
    "tones": ["warm", "inspiring"],
    "languages": ["fr", "ar"],
    "avoid": ["pas cher", "low cost"],
    "emoji_usage": "rare",
    "example_post": "Ce matin, le mérou est arrivé du port de La Goulette. Ce soir, il est dans votre couscous."
  },
  "profiles": [
    {
      "age": 58,
      "source": "ai",
      "summary": "Restaurant familial de La Marsa qui sert une cuisine tunisienne maison, généreuse et sans détour.",
      "audience": "Familles et jeunes actifs du nord de Tunis qui aiment les tables simples et vraies.",
      "tone": "Chaleureux et simple.",
      "vocabulary": ["fait maison", "marché", "famille"],
      "avoid": ["pas cher", "low cost"],
      "emoji_usage": "rare",
      "examples": [{"text": "Ce matin, le mérou est arrivé du port de La Goulette. Ce soir, il est dans votre couscous.", "note": ""}],
      "visual_identity": {}
    },
    {
      "age": 45,
      "source": "manual",
      "change_note": "Couleurs de la maison et police à empattements",
      "visual_identity": {"colors": {"primary": "#B3472D", "secondary": "#1F3A34", "accent": "#E2A63B", "background": "#FFF9F0", "text": "#2A211C"}, "heading_font": "serif"}
    },
    {
      "age": 20,
      "source": "correction",
      "change_note": "Ton plus proche, vocabulaire de la maison",
      "tone": "Chaleureux, généreux, comme une invitation à table. On raconte le produit avant le prix.",
      "vocabulary": ["fait maison", "marché de La Marsa", "la Maison", "à table", "recette de famille"],
      "examples": [
        {"text": "Ce matin, le mérou est arrivé du port de La Goulette. Ce soir, il est dans votre couscous.", "note": ""},
        {"text": "Le vendredi, à la Maison, ça sent le couscous.", "note": "Phrase d'accroche préférée"}
      ]
    }
  ],
  "news": [
    {"kind": "promotion", "age": 3, "title": "Le brunch du dimanche revient", "details": "Chaque dimanche de 11h à 15h : pain maison, œufs fermiers, bsissa, fromage de Béja et citronnade. 35 DT par personne.", "starts_in": -3, "ends_in": 60},
    {"kind": "new_product", "age": 1, "title": "La carte d'hiver arrive", "details": "Chorba frik, mloukhia au bœuf et assida aux pignons rejoignent la carte jusqu'à la fin de l'hiver.", "starts_in": -1},
    {"kind": "event", "age": 2, "title": "Soirée malouf", "details": "Un trio de musiciens de la médina joue à partir de 20h. Menu complet à 55 DT, réservation conseillée.", "starts_in": 6, "ends_in": 6},
    {"kind": "closure", "age": 42, "title": "Fermeture pour travaux", "details": "Cuisine fermée trois jours pour rénovation.", "starts_in": -40, "ends_in": -37, "is_active": false}
  ],
  "documents": [
    {"source_type": "text", "age": 58, "title": "Carte et prix", "text": "Entrées : salade méchouia 9 DT, brik à l'œuf 6 DT, chorba frik 9 DT.\n\nPlats : couscous au mérou 42 DT, servi le vendredi midi. Ojja aux merguez 18 DT, lablabi 12 DT, mloukhia au bœuf 26 DT.\n\nDesserts et boissons : makroudh maison 5 DT, assida aux pignons 8 DT, citronnade 6 DT, thé aux amandes 5 DT.\n\nMenu du midi : 29 DT, du mardi au vendredi, avec entrée, plat et dessert."},
    {"source_type": "text", "age": 57, "title": "Horaires, adresse et réservations", "text": "Maison Yasmina est ouverte du mardi au dimanche, de 12h à 15h et de 19h à 23h. Fermeture le lundi.\n\nAdresse : 12 rue des Orangers, La Marsa. Stationnement gratuit dans la rue voisine.\n\nRéservation par message privé ou au 71 000 000. Groupes jusqu'à 30 personnes sur réservation.\n\nLe pain est cuit sur place chaque matin à 7h."},
    {"source_type": "faq", "age": 40, "title": "Questions fréquentes", "text": "Proposez-vous des plats végétariens ? Oui : lablabi, salade méchouia et chorba sur demande.\n\nAcceptez-vous les cartes bancaires ? Oui, à partir de 20 DT.\n\nPeut-on privatiser la salle ? Oui, du mardi au jeudi soir, à partir de 20 personnes.\n\nLivrez-vous ? Non, sur place ou à emporter uniquement."},
    {"source_type": "url", "age": 56, "title": "Notre histoire (site web)", "text": "Maison Yasmina a ouvert dans la maison familiale de La Marsa. Yasmina cuisine encore chaque jour avec sa fille Amel.\n\nLes légumes viennent du marché de La Marsa, le poisson du port de La Goulette."}
  ],
  "accounts": [
    {"network": "facebook", "display_name": "Maison Yasmina"},
    {"network": "instagram", "display_name": "maison.yasmina", "username": "maison.yasmina"}
  ],
  "strategy": {
    "summary": "Faire de Maison Yasmina le rendez-vous des familles de La Marsa : des coulisses vraies, des plats montrés de près et un rendez-vous fixe chaque dimanche.",
    "tone": "Chaleureux, généreux, simple, comme une invitation à table.",
    "objectives": [
      {"title": "Remplir le brunch du dimanche", "metric": "Réservations reçues en message privé"},
      {"title": "Faire connaître la carte d'hiver", "metric": "Portée mensuelle autour de La Marsa"},
      {"title": "Fidéliser les familles du quartier", "metric": "Commentaires et partages"}
    ],
    "pillars": [
      {"name": "À table", "description": "Les plats, montrés de près, avec leur histoire.", "share": 40},
      {"name": "En cuisine", "description": "Le marché, la famille, les gestes.", "share": 25},
      {"name": "Nos rendez-vous", "description": "Brunch, soirées et menu du midi.", "share": 20},
      {"name": "Entre voisins", "description": "Les clients, La Marsa et les temps forts locaux.", "share": 15}
    ],
    "frequency": {"facebook": 3, "instagram": 4},
    "format_mix": {
      "facebook": {"text": 20, "image": 60, "carousel": 20},
      "instagram": {"text": 0, "image": 55, "carousel": 45}
    }
  },
  "ideas": [
    {"offset": -12, "pillar": "À table", "format": "image", "networks": ["facebook"], "title": "Le couscous au mérou du vendredi", "angle": "Raconter le plat, du port à l'assiette.", "post": {
      "status": "published", "age": 14, "language": "fr", "brief": "Couscous au mérou du vendredi midi, 42 DT.",
      "options": [{"visual": "Plat de couscous au mérou fumant sur une table en bois, lumière de midi.", "variants": {
        "facebook": {"caption": "Le vendredi, à la Maison, ça sent le couscous.\n\nLe mérou arrive du port de La Goulette, la semoule est roulée à la main et la sauce mijote depuis le matin.\n\nCouscous au mérou, 42 DT, servi tous les vendredis midi.", "cta": "Réservez votre table en message privé", "hashtags": ["MaisonYasmina", "LaMarsa", "CuisineTunisienne"]}
      }}]
    }},
    {"offset": -5, "pillar": "Nos rendez-vous", "format": "image", "networks": ["facebook"], "title": "Le menu du midi à 29 DT", "angle": "Un repas complet sans perdre de temps.", "post": {
      "status": "published", "age": 7, "language": "fr", "brief": "Menu du midi à 29 DT, du mardi au vendredi.",
      "options": [{"visual": "Trois assiettes alignées : salade méchouia, ojja aux merguez, makroudh.", "variants": {
        "facebook": {"caption": "Entrée, plat, dessert : le menu du midi est à 29 DT, du mardi au vendredi.\n\nCette semaine, salade méchouia, ojja aux merguez et makroudh maison. Et vous repartez à l'heure au bureau, promis.", "cta": "On vous garde une place ?", "hashtags": ["MaisonYasmina", "MenuDuMidi", "LaMarsa"]}
      }}]
    }},
    {"offset": -2, "pillar": "En cuisine", "format": "text", "networks": ["facebook"], "title": "Le pain cuit chaque matin", "angle": "Montrer ce que personne ne voit.", "post": {
      "status": "failed", "age": 3, "language": "fr", "brief": "Le pain cuit sur place chaque matin à 7h.", "error": "Délai dépassé lors de l'envoi à la plateforme (simulation).",
      "options": [{"visual": "Mains enfarinées devant le four, tôt le matin.", "variants": {
        "facebook": {"caption": "Chaque matin à 7h, le four de la Maison est déjà chaud.\n\nAmel pétrit, façonne, enfourne. Quand vous arrivez à table, le pain n'a pas encore eu le temps de refroidir.", "cta": "Venez le goûter", "hashtags": ["MaisonYasmina", "FaitMaison"]}
      }}]
    }},
    {"offset": -1, "pillar": "Entre voisins", "format": "image", "networks": ["facebook", "instagram"], "title": "Merci aux voisins de La Marsa", "angle": "Un remerciement simple, sans rien vendre.", "status": "skipped"},
    {"offset": 2, "pillar": "Nos rendez-vous", "format": "carousel", "networks": ["facebook", "instagram"], "title": "Le brunch du dimanche revient", "angle": "Donner envie, puis pousser à réserver tôt.", "news": 0, "post": {
      "status": "in_review", "age": 1, "language": "fr", "brief": "Retour du brunch du dimanche, de 11h à 15h, 35 DT.",
      "options": [{"visual": "Grande table de brunch vue de dessus, pain maison et bsissa au centre.", "variants": {
        "facebook": {"caption": "Le brunch du dimanche revient !\n\nPain maison, œufs fermiers, bsissa, fromage de Béja et citronnade. De 11h à 15h, pour 35 DT par personne.\n\nLes tables partent vite : pensez à réserver.", "cta": "Réservez votre table", "hashtags": ["MaisonYasmina", "Brunch", "LaMarsa"]},
        "instagram": {"caption": "Dimanche, on prend son temps.\n\nPain maison, œufs fermiers, bsissa et citronnade. De 11h à 15h, 35 DT.", "cta": "Réservez en message privé", "hashtags": ["MaisonYasmina", "BrunchTunis", "LaMarsa", "Dimanche", "FaitMaison"]}
      }}]
    }},
    {"offset": 4, "pillar": "À table", "format": "image", "networks": ["facebook", "instagram"], "title": "La brik à l'œuf, version maison", "angle": "Le geste qui fait tout : le pliage.", "locked": true},
    {"offset": 6, "pillar": "Nos rendez-vous", "format": "image", "networks": ["facebook", "instagram"], "title": "Soirée malouf à la Maison", "angle": "Une soirée rare, à réserver maintenant.", "news": 2, "post": {
      "status": "scheduled", "age": 1, "language": "fr", "brief": "Soirée malouf, à partir de 20h, menu complet à 55 DT.",
      "options": [{"visual": "Trio de musiciens dans la cour de la maison, lumière chaude.", "variants": {
        "facebook": {"caption": "Ce soir-là, la Maison chante.\n\nUn trio de musiciens de la médina joue les grands classiques du malouf à partir de 20h. Menu complet à 55 DT.\n\nLes places sont comptées.", "cta": "Réservez votre soirée", "hashtags": ["MaisonYasmina", "Malouf", "LaMarsa"]},
        "instagram": {"caption": "Malouf, bougies et cuisine de famille. À partir de 20h, menu complet à 55 DT.", "cta": "Réservez en message privé", "hashtags": ["MaisonYasmina", "Malouf", "SoireeTunis", "LaMarsa"]}
      }}]
    }},
    {"offset": 9, "pillar": "À table", "format": "carousel", "networks": ["facebook", "instagram"], "title": "La nouvelle carte d'hiver", "angle": "Trois plats de saison, un par image.", "news": 1, "post": {
      "status": "draft", "age": 0, "language": "fr", "brief": "Annoncer la carte d'hiver : chorba frik, mloukhia au bœuf, assida aux pignons.",
      "options": [
        {"visual": "Trois plats d'hiver sur une table sombre, vapeur visible.", "variants": {
          "facebook": {"caption": "L'hiver arrive à La Marsa, et la cuisine change de rythme.\n\nChorba frik à 9 DT, mloukhia au bœuf à 26 DT, assida aux pignons à 8 DT : trois plats de saison rejoignent la carte jusqu'à la fin de l'hiver.", "cta": "Réservez votre table", "hashtags": ["MaisonYasmina", "CarteHiver", "LaMarsa"]},
          "instagram": {"caption": "Trois plats de saison rejoignent la carte.\n\nChorba frik, mloukhia au bœuf, assida aux pignons. On vous garde une place ?", "cta": "Réservez en message privé", "hashtags": ["MaisonYasmina", "CarteHiver", "CuisineTunisienne", "LaMarsa"]}
        }},
        {"visual": "Gros plan sur un bol de chorba frik, cuillère en bois.", "variants": {
          "facebook": {"caption": "Quel plat vous réchauffe le mieux quand il fait froid ?\n\nChez nous, c'est la chorba frik de Yasmina, servie bien chaude avec le pain du matin. Elle revient à la carte, avec la mloukhia au bœuf et l'assida aux pignons.", "cta": "Dites-nous en commentaire", "hashtags": ["MaisonYasmina", "Chorba"]},
          "instagram": {"caption": "Chorba, mloukhia ou assida ?\n\nDites-nous quel plat d'hiver vous attendiez le plus.", "cta": "Répondez en commentaire", "hashtags": ["MaisonYasmina", "CarteHiver", "Chorba", "Mloukhia"]}
        }},
        {"visual": "Assida aux pignons servie dans un bol de terre cuite.", "variants": {
          "facebook": {"caption": "La chorba frik est de retour. La mloukhia aussi. Et l'assida aux pignons ferme la marche.\n\nLa carte d'hiver vous attend à la Maison.", "cta": "Passez à table", "hashtags": ["MaisonYasmina", "CarteHiver"]},
          "instagram": {"caption": "La carte d'hiver est là. Venez avec votre appétit.", "cta": "Réservez", "hashtags": ["MaisonYasmina", "CarteHiver", "LaMarsa"]}
        }}
      ]
    }},
    {"offset": 11, "pillar": "En cuisine", "format": "image", "networks": ["instagram"], "title": "Trois secrets de la harissa maison", "angle": "Une recette transmise, un secret par image."},
    {"offset": 13, "pillar": "À table", "format": "image", "networks": ["facebook", "instagram"], "title": "Le makroudh de la fin de repas", "angle": "Le dessert dont on reparle le lendemain.", "post": {
      "status": "draft", "age": 0, "language": "fr", "brief": "Mettre en avant le makroudh maison.",
      "options": [{"visual": "Assiette de makroudh dorés, sirop brillant.", "variants": {
        "facebook": {"caption": "Notre makroudh pas cher, seulement 3 DT ! Aux dattes et au miel, comme à Kairouan.", "cta": "À goûter", "hashtags": ["MaisonYasmina", "Makroudh"], "score": 40, "issues": [{"code": "avoided_word", "severity": "high", "detail": "pas cher"}, {"code": "unverified_fact", "severity": "high", "detail": "3 DT"}]},
        "instagram": {"caption": "Makroudh maison pas cher, 3 DT seulement.", "cta": "À goûter", "hashtags": ["MaisonYasmina", "Makroudh", "Dessert"], "score": 40, "issues": [{"code": "avoided_word", "severity": "high", "detail": "pas cher"}, {"code": "unverified_fact", "severity": "high", "detail": "3 DT"}]}
      }}]
    }},
    {"offset": 16, "pillar": "Entre voisins", "format": "image", "networks": ["facebook", "instagram"], "title": "Un client, une histoire", "angle": "Un habitué raconte sa première visite."},
    {"offset": 20, "pillar": "En cuisine", "format": "carousel", "networks": ["facebook", "instagram"], "title": "Une journée avec Yasmina", "angle": "Du marché au service du soir."},
    {"offset": 24, "pillar": "Nos rendez-vous", "format": "text", "networks": ["facebook"], "title": "Réserver pour un groupe", "angle": "Répondre aux questions les plus fréquentes."}
  ],
  "posts": [
    {"status": "draft", "age": 2, "language": "fr", "brief": "Recrutement d'un serveur ou d'une serveuse pour les week-ends.",
      "options": [{"visual": "L'équipe de salle souriante, devant la porte de la maison.", "variants": {
        "facebook": {"caption": "La Maison s'agrandit !\n\nNous cherchons un serveur ou une serveuse pour les week-ends : le sens de l'accueil compte plus que l'expérience.", "cta": "Écrivez-nous en message privé", "hashtags": ["MaisonYasmina", "Recrutement", "LaMarsa"]}
      }}]
    }
  ],
  "projects": [
    {"name": "Brunch du dimanche", "kind": "single", "template": "offer", "format": "square", "slides": [{"kicker": "Chaque dimanche", "title": "Le brunch revient", "body": "Pain maison, œufs fermiers et citronnade, de 11h à 15h.", "badge": "35 DT", "footer": "La Marsa"}]}
  ]
},
{
  "name": "Atelier Nour",
  "website_url": "https://atelier-nour.example",
  "industry": "crafts",
  "description": "Bijoux en argent faits main dans la médina de Tunis : filigrane, pièces sur mesure et collections inspirées du patrimoine tunisien.",
  "languages": ["fr", "en"],
  "age": 45,
  "event_title": "%s : notre message à nos clients",
  "event_angle": "Un message sobre, en lien avec le patrimoine tunisien.",
  "onboarding": {
    "sector": "crafts",
    "offer": "Bijoux en argent 925 faits main, collections inspirées du patrimoine et commandes sur mesure.",
    "audience": "Femmes de 28 à 60 ans, amateurs d'artisanat, visiteurs de la médina et diaspora tunisienne.",
    "goals": ["awareness", "sales"],
    "difference": "Filigrane réalisé à la main, atelier ouvert au public, gravure personnalisée",
    "tones": ["premium", "inspiring"],
    "languages": ["fr", "en"],
    "avoid": ["bon marché", "promo choc"],
    "emoji_usage": "none",
    "example_post": "Un fil d'argent, deux mains, une journée de travail."
  },
  "profiles": [
    {
      "age": 44,
      "source": "ai",
      "summary": "Atelier de bijoux en argent de la médina de Tunis, attaché au geste et au patrimoine.",
      "audience": "Amateurs d'artisanat, en Tunisie et dans la diaspora, qui offrent et se font plaisir.",
      "tone": "Précis, élégant, sobre. On décrit le geste avant le prix.",
      "vocabulary": ["filigrane", "argent 925", "fait main", "atelier", "médina"],
      "avoid": ["bon marché", "promo choc"],
      "emoji_usage": "none",
      "examples": [{"text": "Un fil d'argent, deux mains, une journée de travail.", "note": ""}],
      "visual_identity": {"colors": {"primary": "#2B3A67", "secondary": "#171B2E", "accent": "#C9A227", "background": "#F7F5F0", "text": "#171B2E"}, "heading_font": "serif"}
    },
    {
      "age": 12,
      "source": "manual",
      "change_note": "Ajout du vocabulaire de la Collection Carthage",
      "vocabulary": ["filigrane", "argent 925", "fait main", "atelier", "médina", "Collection Carthage"]
    }
  ],
  "news": [
    {"kind": "new_product", "age": 6, "title": "Collection Carthage", "details": "Six pièces inspirées des mosaïques du Bardo, dont le pendentif Didon à 140 DT.", "starts_in": -6},
    {"kind": "promotion", "age": 2, "title": "Gravure offerte pour les fêtes", "details": "Gravure offerte pour toute commande passée avant la fin de l'année. Valeur : 20 DT.", "starts_in": -2, "ends_in": 45},
    {"kind": "event", "age": 1, "title": "Démonstration de filigrane", "details": "Nour montre le travail du filigrane à l'atelier, de 15h à 17h. Entrée libre.", "starts_in": 8, "ends_in": 8}
  ],
  "documents": [
    {"source_type": "text", "age": 44, "title": "Collections et prix", "text": "Bracelet Khomsa en argent 925 : 120 DT. Un bracelet Khomsa demande une journée de travail. Boucles d'oreilles Fibule : 85 DT. Bague Jasmin : 65 DT. Collier Médina : 190 DT.\n\nCollection Carthage, inspirée des mosaïques du Bardo : pendentif Didon 140 DT, manchette Salammbô 230 DT.\n\nCoffret cadeau : 15 DT. Gravure personnalisée : 20 DT."},
    {"source_type": "text", "age": 43, "title": "Atelier, livraison et commandes", "text": "L'atelier se trouve au Souk El Berka, dans la médina de Tunis. Ouvert du lundi au samedi, de 10h à 18h.\n\nLivraison partout en Tunisie : 8 DT, offerte dès 150 DT. Expédition internationale sur devis.\n\nCommandes sur mesure : compter trois semaines. Contact : bonjour@atelier-nour.example ou 71 000 001."},
    {"source_type": "faq", "age": 30, "title": "Questions fréquentes", "text": "Vos bijoux sont-ils en argent massif ? Oui, argent 925 poinçonné.\n\nComment entretenir un bijou en argent ? Avec un chiffon doux, à l'abri de l'humidité.\n\nPeut-on faire réparer un bijou ? Oui, la réparation est offerte pendant un an.\n\nDo you ship abroad? Yes, international shipping is available on request."}
  ],
  "accounts": [
    {"network": "facebook", "display_name": "Atelier Nour"},
    {"network": "instagram", "display_name": "atelier.nour", "username": "atelier.nour"}
  ],
  "strategy": {
    "summary": "Installer Atelier Nour comme la référence du bijou en argent fait main : montrer le geste, raconter le patrimoine et accompagner les cadeaux de fin d'année.",
    "tone": "Précis, élégant et sobre.",
    "objectives": [
      {"title": "Faire connaître la Collection Carthage", "metric": "Portée des publications de la collection"},
      {"title": "Développer les commandes de fin d'année", "metric": "Demandes reçues en message privé"},
      {"title": "Attirer du public à l'atelier", "metric": "Visites et démonstrations"}
    ],
    "pillars": [
      {"name": "Savoir-faire", "description": "Le filigrane, les outils, le temps du geste.", "share": 35},
      {"name": "Collections", "description": "Les pièces, présentées une par une.", "share": 30},
      {"name": "Histoires de bijoux", "description": "Les symboles et le patrimoine tunisien.", "share": 20},
      {"name": "À offrir", "description": "Idées de cadeaux, coffrets et gravures.", "share": 15}
    ],
    "frequency": {"facebook": 2, "instagram": 3},
    "format_mix": {
      "facebook": {"text": 10, "image": 60, "carousel": 30},
      "instagram": {"text": 0, "image": 50, "carousel": 50}
    }
  },
  "ideas": [
    {"offset": -15, "pillar": "Savoir-faire", "format": "image", "networks": ["facebook"], "title": "Le filigrane, fil après fil", "angle": "Expliquer le geste en une image.", "post": {
      "status": "published", "age": 16, "language": "fr", "brief": "Mettre en avant le geste du filigrane et le bracelet Khomsa à 120 DT.",
      "options": [{"visual": "Gros plan sur des mains qui torsadent un fil d'argent.", "variants": {
        "facebook": {"caption": "Le filigrane, c'est de l'argent filé plus fin qu'un cheveu, torsadé puis soudé à la main.\n\nAu Souk El Berka, un bracelet Khomsa demande une journée de travail. Il est à découvrir à l'atelier, à 120 DT.", "cta": "Venez le voir à l'atelier", "hashtags": ["AtelierNour", "Filigrane", "FaitMain"]}
      }}]
    }},
    {"offset": -6, "pillar": "Collections", "format": "image", "networks": ["facebook"], "title": "La Collection Carthage arrive", "angle": "Du Bardo à l'atelier.", "news": 0, "post": {
      "status": "published", "age": 6, "language": "fr", "brief": "Lancement de la Collection Carthage, pendentif Didon à 140 DT.",
      "options": [{"visual": "Pendentif Didon posé sur une mosaïque.", "variants": {
        "facebook": {"caption": "Six pièces, une seule inspiration : les mosaïques du Bardo.\n\nLa Collection Carthage est arrivée à l'atelier. Le pendentif Didon, à 140 DT, en est la pièce maîtresse.", "cta": "Découvrez la collection", "hashtags": ["AtelierNour", "CollectionCarthage", "Tunis"]}
      }}]
    }},
    {"offset": -3, "pillar": "À offrir", "format": "text", "networks": ["facebook", "instagram"], "title": "Idées de cadeaux pour les fêtes", "angle": "Trois budgets, trois idées."},
    {"offset": 1, "pillar": "À offrir", "format": "carousel", "networks": ["facebook", "instagram"], "title": "La gravure offerte pour les fêtes", "angle": "Un mot gravé rend le cadeau unique.", "news": 1, "post": {
      "status": "approved", "age": 2, "language": "fr", "brief": "Gravure offerte, d'une valeur de 20 DT, pour toute commande avant la fin de l'année.",
      "options": [{"visual": "Bague retournée montrant un prénom gravé à l'intérieur.", "variants": {
        "facebook": {"caption": "Un prénom, une date, un mot qui compte.\n\nPour les fêtes, la gravure est offerte sur toute commande passée avant la fin de l'année. Une attention d'une valeur de 20 DT, réalisée à l'atelier.", "cta": "Écrivez-nous votre mot", "hashtags": ["AtelierNour", "Cadeau", "Gravure"]},
        "instagram": {"caption": "Un prénom, une date, un mot qui compte.\n\nLa gravure est offerte pour les fêtes, sur toute commande passée avant la fin de l'année.", "cta": "Écrivez-nous en message privé", "hashtags": ["AtelierNour", "Gravure", "CadeauFaitMain", "Tunis"]}
      }}]
    }},
    {"offset": 6, "pillar": "Savoir-faire", "format": "image", "networks": ["facebook", "instagram"], "title": "Démonstration de filigrane à l'atelier", "angle": "Inviter à voir le geste en vrai.", "news": 2, "post": {
      "status": "scheduled", "age": 1, "language": "fr", "brief": "Démonstration de filigrane à l'atelier, de 15h à 17h, entrée libre.",
      "options": [{"visual": "Établi de l'atelier, chalumeau allumé.", "variants": {
        "facebook": {"caption": "Comment naît un bijou en filigrane ?\n\nNour vous montre le geste à l'atelier, de 15h à 17h, au Souk El Berka. L'entrée est libre.", "cta": "Venez nous voir", "hashtags": ["AtelierNour", "Filigrane", "Medina"]},
        "instagram": {"caption": "Venez voir naître un bijou en filigrane, de 15h à 17h, au Souk El Berka.", "cta": "Entrée libre", "hashtags": ["AtelierNour", "Filigrane", "MedinaDeTunis", "FaitMain"]}
      }}]
    }},
    {"offset": 8, "pillar": "À offrir", "format": "carousel", "networks": ["facebook", "instagram"], "title": "Que glisser dans un coffret cadeau ?", "angle": "Aider à choisir sans hésiter.", "post": {
      "status": "draft", "age": 0, "language": "fr", "brief": "Idées pour le coffret cadeau à 15 DT.",
      "options": [
        {"visual": "Coffret ouvert, bague Jasmin au centre.", "variants": {
          "facebook": {"caption": "Un cadeau qui se garde toute une vie.\n\nLa bague Jasmin, à 65 DT, dans son coffret à 15 DT, avec un mot gravé à l'intérieur. Trois gestes simples pour dire beaucoup.", "cta": "Composez votre coffret", "hashtags": ["AtelierNour", "Cadeau", "BagueJasmin"]},
          "instagram": {"caption": "La bague Jasmin, son coffret, un mot gravé. Un cadeau qui se garde toute une vie.", "cta": "Écrivez-nous en message privé", "hashtags": ["AtelierNour", "Cadeau", "BijouxTunis", "FaitMain"]}
        }},
        {"visual": "Boucles d'oreilles Fibule sur fond de lin.", "variants": {
          "facebook": {"caption": "Que glisser dans un coffret cadeau ?\n\nNotre réponse préférée : les boucles d'oreilles Fibule, à 85 DT, inspirées des bijoux de nos grands-mères.", "cta": "Dites-nous pour qui c'est", "hashtags": ["AtelierNour", "Fibule"]},
          "instagram": {"caption": "Bague Jasmin ou boucles Fibule ?\n\nDites-nous ce que vous aimeriez recevoir.", "cta": "Répondez en commentaire", "hashtags": ["AtelierNour", "Fibule", "BagueJasmin"]}
        }},
        {"visual": "Pile de coffrets noués d'un fil d'argent.", "variants": {
          "facebook": {"caption": "Offrir de l'argent travaillé à la main, c'est offrir des heures d'atelier.\n\nLes coffrets sont disponibles à l'atelier, du lundi au samedi, de 10h à 18h.", "cta": "Passez à l'atelier", "hashtags": ["AtelierNour", "Cadeau"]},
          "instagram": {"caption": "Des heures d'atelier, dans un petit coffret.", "cta": "Découvrez les coffrets", "hashtags": ["AtelierNour", "Coffret", "FaitMain"]}
        }}
      ]
    }},
    {"offset": 12, "pillar": "Collections", "format": "image", "networks": ["facebook", "instagram"], "title": "The Khomsa bracelet, handmade in Tunis", "angle": "For customers abroad: the piece and the time it takes.", "post": {
      "status": "draft", "age": 0, "language": "en", "brief": "Present the Khomsa bracelet, 120 DT, to customers abroad.",
      "options": [{"visual": "Khomsa bracelet on a dark wooden workbench.", "variants": {
        "facebook": {"caption": "Every Khomsa bracelet starts as a length of silver wire.\n\nIt takes a full day of work at our workshop in the Tunis medina to shape, twist and solder it by hand. Available now at 120 DT.", "cta": "Send us a message", "hashtags": ["AtelierNour", "HandmadeInTunisia", "Filigree"]},
        "instagram": {"caption": "One bracelet. One full day of handwork in the Tunis medina.", "cta": "Message us to order", "hashtags": ["AtelierNour", "HandmadeInTunisia", "SilverJewelry", "Filigree"]}
      }}]
    }},
    {"offset": 15, "pillar": "Histoires de bijoux", "format": "carousel", "networks": ["facebook", "instagram"], "title": "La khomsa : ce qu'elle raconte", "angle": "Un symbole expliqué simplement.", "locked": true},
    {"offset": 19, "pillar": "Savoir-faire", "format": "image", "networks": ["instagram"], "title": "Une journée à l'atelier", "angle": "Du premier fil à la dernière soudure."},
    {"offset": 22, "pillar": "Histoires de bijoux", "format": "image", "networks": ["facebook", "instagram"], "title": "La fibule, bijou des grands-mères", "angle": "Faire appel aux souvenirs de famille."},
    {"offset": 26, "pillar": "Collections", "format": "image", "networks": ["facebook", "instagram"], "title": "La manchette Salammbô", "angle": "La pièce la plus ambitieuse de la collection."}
  ],
  "projects": [
    {"name": "Entretenir son argent", "kind": "carousel", "template": "tips", "format": "portrait", "slides": [{"kicker": "Bon à savoir", "title": "Entretenir un bijou en argent", "body": "Un chiffon doux\nÀ l'abri de l'humidité\nRéparation offerte pendant un an", "footer": "Atelier Nour"}]}
  ]
},
{
  "name": "Beldi Box",
  "website_url": "https://beldi-box.example",
  "industry": "ecommerce",
  "description": "متجر إلكتروني يوصل منتوجات الجهات التونسية إلى كل الولايات: زيت زيتون وهريسة وعسل، مباشرة من المنتجين.",
  "languages": ["ar", "fr", "tn"],
  "age": 30,
  "event_title": "%s: رسالتنا إلى زبائننا",
  "event_angle": "رسالة بسيطة وقريبة من الناس، مع منتوج واحد في الصورة.",
  "onboarding": {
    "sector": "ecommerce",
    "offer": "منتوجات الجهات التونسية: زيت زيتون بكر ممتاز، هريسة عربي، عسل جبلي وصندوق بلدي.",
    "audience": "عائلات المدن الكبرى والتونسيون بالخارج الذين يبحثون عن مذاق البلاد.",
    "goals": ["sales", "launch"],
    "difference": "شراء مباشر من المنتجين، توصيل لكامل الولايات، منتوجات موسمية",
    "tones": ["warm", "direct"],
    "languages": ["ar", "fr", "tn"],
    "avoid": ["رخيص"],
    "emoji_usage": "moderate",
    "example_post": "من صفاقس لدارك، زيت الموسم وصل."
  },
  "profiles": [
    {
      "age": 29,
      "source": "ai",
      "summary": "متجر إلكتروني يجمع أفضل منتوجات الجهات التونسية ويوصلها مباشرة من المنتجين إلى البيوت.",
      "audience": "عائلات المدن الكبرى والتونسيون بالخارج.",
      "tone": "قريب وصادق وبسيط، باللغة العربية أو باللهجة التونسية.",
      "vocabulary": ["بلدي", "من المنتج", "موسم الجني", "مذاق البلاد"],
      "avoid": ["رخيص"],
      "emoji_usage": "moderate",
      "examples": [{"text": "من صفاقس لدارك، زيت الموسم وصل.", "note": ""}],
      "visual_identity": {"colors": {"primary": "#3F6B2E", "secondary": "#22331B", "accent": "#D9822B", "background": "#FAF7EE", "text": "#22331B"}, "heading_font": "sans"}
    },
    {
      "age": 9,
      "source": "manual",
      "change_note": "إضافة اللهجة التونسية إلى الأسلوب",
      "tone": "قريب وصادق وبسيط. نستعمل اللهجة التونسية في المنشورات الخفيفة والعربية في المعلومات."
    }
  ],
  "news": [
    {"kind": "new_product", "age": 4, "title": "زيت الموسم الجديد وصل", "details": "أول قوارير زيت الموسم الجديد من صفاقس متوفرة الآن بسعر 28 د.ت للتر.", "starts_in": -4},
    {"kind": "promotion", "age": 1, "title": "تخفيض 20 % على صندوق بلدي", "details": "صندوق بلدي بسعر 52 د.ت عوضا عن 65 د.ت لمدة خمسة أيام.", "starts_in": 14, "ends_in": 18},
    {"kind": "other", "age": 10, "title": "شراكة جديدة مع نحالين من زغوان", "details": "عسل جبلي جديد من زغوان يدخل مجموعتنا."}
  ],
  "documents": [
    {"source_type": "text", "age": 29, "title": "المنتجات والأسعار", "text": "زيت زيتون بكر ممتاز من صفاقس، قارورة لتر واحد: 28 د.ت.\n\nهريسة عربي محضّرة في نابل: 9 د.ت. عسل جبلي من زغوان: 35 د.ت. طماطم مجففة: 12 د.ت.\n\nصندوق بلدي يجمع زيت الزيتون والهريسة والعسل: 65 د.ت."},
    {"source_type": "text", "age": 28, "title": "التوصيل والطلبات", "text": "التوصيل لكامل ولايات الجمهورية خلال يومين إلى ثلاثة أيام، بسعر 7 د.ت، ومجانا ابتداء من 100 د.ت.\n\nالدفع عند الاستلام أو بالبطاقة البنكية.\n\nللطلب: رسالة خاصة أو واتساب على الرقم 20 000 000."},
    {"source_type": "faq", "age": 20, "title": "أسئلة متكررة", "text": "من أين تأتي منتوجاتكم؟ نعمل مباشرة مع فلاحين وحرفيين من صفاقس ونابل وزغوان.\n\nهل زيت الزيتون معصور على البارد؟ نعم، نقطف الزيتون باليد ونعصره على البارد في نفس اليوم.\n\nهل يمكن إرجاع الطلب؟ نعم، خلال سبعة أيام إذا كان المنتوج مغلقا."},
    {"source_type": "text", "age": 15, "title": "Beldi Box en bref", "text": "Beldi Box livre partout en Tunisie des produits du terroir, choisis directement chez les producteurs.\n\nLa Beldi Box réunit une huile d'olive de Sfax, une harissa de Nabeul et un miel de montagne de Zaghouan. Prix : 65 DT."}
  ],
  "accounts": [
    {"network": "facebook", "display_name": "Beldi Box", "status": "expiring", "expires_in": 5},
    {"network": "instagram", "display_name": "beldi.box", "username": "beldi.box"}
  ],
  "strategy": {
    "summary": "جعل موسم الزيت الجديد مناسبة للتعريف ببلدي بوكس: حكايات المنتجين، وصفات بسيطة، وعرض واضح لصندوق بلدي.",
    "tone": "قريب وصادق وبسيط.",
    "objectives": [
      {"title": "إطلاق زيت الموسم الجديد", "metric": "عدد الطلبات عبر الرسائل الخاصة"},
      {"title": "التعريف بصندوق بلدي", "metric": "الوصول الشهري"},
      {"title": "كسب ثقة العائلات", "metric": "التعليقات والمشاركات"}
    ],
    "pillars": [
      {"name": "من الأرض", "description": "المنتجون والجهات وموسم الجني.", "share": 35},
      {"name": "منتوجاتنا", "description": "كل منتوج بسعره وطريقة استعماله.", "share": 30},
      {"name": "وصفات", "description": "أطباق بسيطة بمنتوجاتنا.", "share": 20},
      {"name": "حرفاؤنا", "description": "آراء الحرفاء والمناسبات التونسية.", "share": 15}
    ],
    "frequency": {"facebook": 3, "instagram": 3},
    "format_mix": {
      "facebook": {"text": 15, "image": 60, "carousel": 25},
      "instagram": {"text": 0, "image": 60, "carousel": 40}
    }
  },
  "ideas": [
    {"offset": -10, "pillar": "من الأرض", "format": "image", "networks": ["facebook"], "title": "من الزيتونة إلى القارورة", "angle": "حكاية الزيت منذ الجني.", "post": {
      "status": "published", "age": 11, "language": "ar", "brief": "حكاية زيت الزيتون من صفاقس، اللتر بسعر 28 د.ت.",
      "options": [{"visual": "أيادٍ تقطف الزيتون في ضوء الصباح.", "variants": {
        "facebook": {"caption": "في صفاقس، يبدأ موسم الجني مع أول برد.\n\nنقطف الزيتون باليد ونعصره على البارد في نفس اليوم. زيت زيتون بكر ممتاز، اللتر بـ 28 د.ت.", "cta": "اطلبوا عبر الرسائل الخاصة", "hashtags": ["بلدي_بوكس", "زيت_زيتون", "صفاقس"]}
      }}]
    }},
    {"offset": -4, "pillar": "منتوجاتنا", "format": "image", "networks": ["facebook"], "title": "زيت الموسم الجديد وصل", "angle": "الخبر كما هو، بسيط ومفرح.", "news": 0, "post": {
      "status": "published", "age": 4, "language": "tn", "brief": "وصول زيت الموسم الجديد.",
      "options": [{"visual": "قارورة زيت ذهبية فوق طاولة خشبية.", "variants": {
        "facebook": {"caption": "وصل زيت الموسم الجديد! 🫒\n\nمن صفاقس لدارك، اللتر بـ 28 د.ت والتوصيل لكل بلاصة في تونس.", "cta": "ابعثولنا ميساج", "hashtags": ["بلدي_بوكس", "زيت_الموسم", "تونس"]}
      }}]
    }},
    {"offset": -2, "pillar": "حرفاؤنا", "format": "text", "networks": ["facebook", "instagram"], "title": "آراء حرفائنا هذا الشهر", "angle": "جملة واحدة من كل حريف.", "status": "skipped"},
    {"offset": 1, "pillar": "منتوجاتنا", "format": "carousel", "networks": ["facebook", "instagram"], "title": "صندوق بلدي: هدية من قلب تونس", "angle": "ثلاث جهات في صندوق واحد.", "post": {
      "status": "in_review", "age": 2, "language": "ar", "brief": "التعريف بصندوق بلدي بسعر 65 د.ت.",
      "options": [{"visual": "صندوق خشبي مفتوح فيه قارورة زيت وهريسة وعسل.", "variants": {
        "facebook": {"caption": "زيت زيتون من صفاقس، هريسة عربي من نابل، وعسل جبلي من زغوان.\n\nثلاثة منتوجات في صندوق واحد بسعر 65 د.ت، مع توصيل لكامل ولايات الجمهورية.", "cta": "اطلبوا صندوقكم", "hashtags": ["بلدي_بوكس", "صندوق_بلدي", "صنع_في_تونس"]},
        "instagram": {"caption": "ثلاث جهات في صندوق واحد.\n\nصندوق بلدي بسعر 65 د.ت.", "cta": "راسلونا على الخاص", "hashtags": ["بلدي_بوكس", "صندوق_بلدي", "منتوجات_تونسية", "هدية"]}
      }}]
    }},
    {"offset": 3, "pillar": "منتوجاتنا", "format": "image", "networks": ["facebook", "instagram"], "title": "La Beldi Box, le goût de la Tunisie", "angle": "Parler à la clientèle francophone et à la diaspora.", "post": {
      "status": "scheduled", "age": 1, "language": "fr", "brief": "Présenter la Beldi Box à 65 DT.",
      "options": [{"visual": "Beldi Box ouverte sur une table, lumière naturelle.", "variants": {
        "facebook": {"caption": "Huile d'olive de Sfax, harissa de Nabeul, miel de montagne de Zaghouan.\n\nLa Beldi Box réunit trois producteurs dans une seule boîte, à 65 DT, livrée partout en Tunisie.", "cta": "Commandez en message privé", "hashtags": ["BeldiBox", "MadeInTunisia", "Terroir"]},
        "instagram": {"caption": "Trois régions, une seule boîte. La Beldi Box, à 65 DT.", "cta": "Écrivez-nous", "hashtags": ["BeldiBox", "MadeInTunisia", "TerroirTunisien", "Cadeau"]}
      }}]
    }},
    {"offset": 7, "pillar": "وصفات", "format": "image", "networks": ["facebook", "instagram"], "title": "هريسة عربي كيف متاع أمي", "angle": "ذكرى الطفولة في ملعقة.", "post": {
      "status": "draft", "age": 0, "language": "tn", "brief": "هريسة عربي من نابل بسعر 9 د.ت.",
      "options": [
        {"visual": "طبق هريسة بزيت الزيتون مع خبز طابونة.", "variants": {
          "facebook": {"caption": "الهريسة العربي متاعنا محضّرة في نابل كيف ما تعمل أمي.\n\nالبوط بـ 9 د.ت، ذوقوها وقولولنا.", "cta": "ابعثولنا ميساج", "hashtags": ["بلدي_بوكس", "هريسة", "نابل"]},
          "instagram": {"caption": "هريسة عربي من نابل، 9 د.ت. تحرق شوية وتفرّح برشة 🌶️", "cta": "ابعثولنا ميساج", "hashtags": ["بلدي_بوكس", "هريسة", "نابل", "كوجينة_تونسية"]}
        }},
        {"visual": "خبز ساخن يغمس في الهريسة وزيت الزيتون.", "variants": {
          "facebook": {"caption": "شكون ما يحبش خبز سخون وهريسة وزيت زيتون؟\n\nالهريسة العربي وصلت من نابل، والزيت من صفاقس. كمّلوا الباقي في داركم.", "cta": "قولولنا في تعليق", "hashtags": ["بلدي_بوكس", "هريسة"]},
          "instagram": {"caption": "خبز، هريسة، زيت زيتون. شنوة يلزم أكثر؟", "cta": "قولولنا في تعليق", "hashtags": ["بلدي_بوكس", "هريسة", "زيت_زيتون"]}
        }},
        {"visual": "بوط هريسة وحيد على خلفية حمراء.", "variants": {
          "facebook": {"caption": "هريسة تونسية بالحق، من نابل لطاولتكم بـ 9 د.ت.", "cta": "اطلبوها توا", "hashtags": ["بلدي_بوكس", "هريسة"]},
          "instagram": {"caption": "هريسة عربي. 9 د.ت. بلاش كلام زايد.", "cta": "اطلبوها توا", "hashtags": ["بلدي_بوكس", "هريسة", "تونس"]}
        }}
      ]
    }},
    {"offset": 10, "pillar": "من الأرض", "format": "image", "networks": ["facebook", "instagram"], "title": "فوائد زيت الزيتون", "angle": "الحديث عن جودة الزيت دون ادعاءات صحية.", "post": {
      "status": "draft", "age": 0, "language": "ar", "sensitive": ["health"], "brief": "الحديث عن جودة زيت الزيتون.",
      "options": [{"visual": "زيت زيتون يسكب في صحن صغير.", "variants": {
        "facebook": {"caption": "زيت الزيتون علاج طبيعي لكل العائلة، وبسعر رخيص: 15 د.ت فقط!", "cta": "اطلبوا الآن", "hashtags": ["بلدي_بوكس", "زيت_زيتون"], "score": 35, "issues": [{"code": "avoided_word", "severity": "high", "detail": "رخيص"}, {"code": "unverified_fact", "severity": "high", "detail": "15 د.ت"}, {"code": "sensitive_topic", "severity": "low", "detail": "health"}]},
        "instagram": {"caption": "زيت الزيتون علاج طبيعي، وسعره رخيص: 15 د.ت!", "cta": "اطلبوا الآن", "hashtags": ["بلدي_بوكس", "زيت_زيتون", "صحة"], "score": 35, "issues": [{"code": "avoided_word", "severity": "high", "detail": "رخيص"}, {"code": "unverified_fact", "severity": "high", "detail": "15 د.ت"}, {"code": "sensitive_topic", "severity": "low", "detail": "health"}]}
      }}]
    }},
    {"offset": 13, "pillar": "وصفات", "format": "carousel", "networks": ["facebook", "instagram"], "title": "ثلاث وصفات بزيت الموسم", "angle": "وصفة في كل صورة.", "locked": true},
    {"offset": 17, "pillar": "من الأرض", "format": "image", "networks": ["instagram"], "title": "نحالون من زغوان", "angle": "لقاء مع من يصنع العسل.", "news": 2},
    {"offset": 21, "pillar": "حرفاؤنا", "format": "image", "networks": ["facebook", "instagram"], "title": "طلبية من صفاقس إلى بنزرت", "angle": "رحلة طلبية واحدة عبر البلاد."},
    {"offset": 25, "pillar": "وصفات", "format": "image", "networks": ["facebook", "instagram"], "title": "فطور تونسي في عشر دقائق", "angle": "وصفة سريعة بمنتوجات الصندوق."}
  ],
  "projects": [
    {"name": "صندوق بلدي", "kind": "single", "template": "headline", "format": "square", "slides": [{"kicker": "من الجهات", "title": "ثلاث جهات في صندوق واحد", "body": "زيت زيتون وهريسة وعسل مباشرة من المنتجين.", "badge": "65 د.ت", "footer": "Beldi Box"}]}
  ]
}
]$seed_json$::jsonb;
$seed_fn$;

create or replace function private.seed_demo_account(p_user uuid, p_email text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_local text := split_part(p_email, '@', 1);
  v_org uuid;
  v_brand record;
begin
  -- Compte créé avant la migration : le déclencheur d'inscription n'a pas pu agir.
  insert into public.profiles (id, email, full_name)
  values (p_user, p_email, 'Ranim Zghibi')
  on conflict (id) do nothing;

  select organization_id into v_org
    from public.memberships
   where user_id = p_user and role = 'owner'
   order by created_at
   limit 1;

  if v_org is null then
    insert into public.organizations (name, created_by) values ('Espace Ranim', p_user) returning id into v_org;
    insert into public.memberships (organization_id, user_id, role) values (v_org, p_user, 'owner');
  end if;

  -- Forfait Agence : assez de marques et de quotas pour explorer sans blocage.
  update public.organizations
     set plan = 'agency',
         trial_ends_at = null,
         name = case when name = v_local or name = 'Ranim Zghibi' then 'Espace Ranim' else name end
   where id = v_org;

  update public.profiles set full_name = 'Ranim Zghibi' where id = p_user and full_name = v_local;

  for v_brand in select value from jsonb_array_elements(private.seed_data()) with ordinality order by ordinality loop
    perform private.seed_brand(v_org, p_user, v_brand.value);
  end loop;

  -- Adresses réservées (example.com) : personne ne reçoit rien, aucun lien n'existe.
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  select v_org, invitee.email, invitee.role::public.org_role, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), p_user
    from (values ('salma.redaction@example.com', 'editor'), ('youssef.validation@example.com', 'validator')) as invitee(email, role)
  on conflict (organization_id, email) where accepted_at is null and revoked_at is null do nothing;

  insert into public.usage_counters (organization_id, period, posts_generated)
  select v_org, date_trunc('month', (now() at time zone 'Africa/Tunis'))::date, count(*)
    from public.posts
   where organization_id = v_org
     and created_at >= (date_trunc('month', (now() at time zone 'Africa/Tunis')) at time zone 'Africa/Tunis')
  on conflict (organization_id, period)
  do update set posts_generated = greatest(public.usage_counters.posts_generated, excluded.posts_generated);
end;
$$;

-- Une erreur de préparation ne doit jamais empêcher l'inscription.
create or replace function private.on_seed_account_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.seed_demo_account(new.id, new.email);
  exception when others then
    raise warning 'Préparation du compte ignorée : %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on all functions in schema private from public;

-- Le nom trie après on_auth_user_created : le profil et l'espace existent déjà.
drop trigger if exists on_auth_user_created_seed on auth.users;
create trigger on_auth_user_created_seed
  after insert on auth.users
  for each row
  when (lower(new.email) = 'ranimzghibi5@gmail.com')
  execute function private.on_seed_account_created();

do $$
declare
  v_user record;
begin
  for v_user in select id, email from auth.users where lower(email) = 'ranimzghibi5@gmail.com' loop
    perform private.seed_demo_account(v_user.id, v_user.email);
  end loop;
end $$;
