-- ============================================================================
-- Escal'vet — schéma de base de données Supabase
-- À exécuter une fois dans l'éditeur SQL de ton projet Supabase
-- (Dashboard > SQL Editor > New query > coller ce fichier > Run)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- Un profil par utilisateur (créé automatiquement à l'inscription).
-- group_name sépare les visualisations : 'asv' ou 'veterinaire'.
-- is_owner = le/la vétérinaire propriétaire, accès total.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  group_name text not null default 'asv' check (group_name in ('asv', 'veterinaire')),
  is_owner boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Un profil par membre de l''équipe. Créé automatiquement à l''inscription.';

-- ----------------------------------------------------------------------------
-- 2. CONTRACTS
-- Historique des contrats par employé : nombre d'heures théoriques par
-- semaine, valable à partir d'une date donnée (permet de gérer un changement
-- de contrat en cours d'année).
-- ----------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Contrat',
  weekly_hours numeric(5, 2) not null check (weekly_hours >= 0),
  effective_from date not null,
  created_at timestamptz not null default now()
);

create index if not exists contracts_employee_idx on public.contracts (employee_id, effective_from);

comment on table public.contracts is 'Historique des contrats (heures théoriques hebdomadaires) par employé.';

-- ----------------------------------------------------------------------------
-- 3. SHIFTS
-- Un créneau = une personne, un jour, une demi-journée (matin/après-midi),
-- avec ses horaires précis et son poste (couleur).
-- ----------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  period text not null check (period in ('matin', 'apres-midi')),
  start_time time not null,
  end_time time not null,
  poste text not null check (poste in ('bleu', 'violet', 'vert', 'seul')),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_time_order check (end_time > start_time)
);

create index if not exists shifts_date_idx on public.shifts (work_date);
create index if not exists shifts_employee_idx on public.shifts (employee_id, work_date);

comment on table public.shifts is 'Créneaux de travail individuels (matin ou après-midi) avec poste coloré.';

-- ----------------------------------------------------------------------------
-- 4. WEEKLY_ABSENCES
-- Marque une semaine entière comme non décomptée pour un employé
-- (vacances, arrêt...) : la semaine est exclue du calcul du solde d'heures.
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null, -- toujours un lundi
  reason text not null default 'Vacances',
  created_at timestamptz not null default now(),
  unique (employee_id, week_start)
);

comment on table public.weekly_absences is 'Semaines entières exclues du calcul du solde d''heures (vacances, arrêt...).';

-- ----------------------------------------------------------------------------
-- 5. OVERTIME_REQUESTS
-- Déclaration d'heures supplémentaires par un employé pour un jour donné.
-- Reste "pending" tant que le propriétaire ne l'a pas validée ; seules les
-- déclarations "approved" sont comptées dans le solde hebdo/annuel.
-- ----------------------------------------------------------------------------
create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  hours integer not null default 0 check (hours >= 0),
  minutes integer not null default 0 check (minutes >= 0 and minutes < 60),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint overtime_requests_nonzero check (hours > 0 or minutes > 0)
);

create index if not exists overtime_requests_employee_idx on public.overtime_requests (employee_id, work_date);
create index if not exists overtime_requests_status_idx on public.overtime_requests (status);

comment on table public.overtime_requests is 'Heures sup déclarées par un employé pour un jour donné, à valider par le propriétaire.';

-- ============================================================================
-- FONCTIONS UTILITAIRES (security definer pour éviter la récursion RLS)
-- ============================================================================

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.my_group()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select group_name from public.profiles where id = auth.uid();
$$;

-- Création automatique du profil à l'inscription d'un nouvel utilisateur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, group_name, is_owner)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'group_name', 'asv'),
    false
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.contracts enable row level security;
alter table public.shifts enable row level security;
alter table public.weekly_absences enable row level security;
alter table public.overtime_requests enable row level security;

-- ---- profiles ----
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select
  using (
    is_owner()
    or group_name = my_group()
    or id = auth.uid()
  );

drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_owner_write" on public.profiles
  for update
  using (is_owner())
  with check (is_owner());

drop policy if exists "profiles_owner_delete" on public.profiles;
create policy "profiles_owner_delete" on public.profiles
  for delete
  using (is_owner());

-- (l'insertion des profils se fait uniquement via le trigger handle_new_user)

-- ---- contracts ----
drop policy if exists "contracts_select" on public.contracts;
create policy "contracts_select" on public.contracts
  for select
  using (
    is_owner()
    or employee_id in (select id from public.profiles where group_name = my_group())
  );

drop policy if exists "contracts_owner_write" on public.contracts;
create policy "contracts_owner_write" on public.contracts
  for all
  using (is_owner())
  with check (is_owner());

-- ---- shifts ----
drop policy if exists "shifts_select" on public.shifts;
create policy "shifts_select" on public.shifts
  for select
  using (
    is_owner()
    or employee_id in (select id from public.profiles where group_name = my_group())
  );

drop policy if exists "shifts_owner_write" on public.shifts;
create policy "shifts_owner_write" on public.shifts
  for all
  using (is_owner())
  with check (is_owner());

-- ---- weekly_absences ----
drop policy if exists "weekly_absences_select" on public.weekly_absences;
create policy "weekly_absences_select" on public.weekly_absences
  for select
  using (
    is_owner()
    or employee_id in (select id from public.profiles where group_name = my_group())
  );

drop policy if exists "weekly_absences_owner_write" on public.weekly_absences;
create policy "weekly_absences_owner_write" on public.weekly_absences
  for all
  using (is_owner())
  with check (is_owner());

-- ---- overtime_requests ----
drop policy if exists "overtime_requests_select" on public.overtime_requests;
create policy "overtime_requests_select" on public.overtime_requests
  for select
  using (is_owner() or employee_id = auth.uid());

drop policy if exists "overtime_requests_insert" on public.overtime_requests;
create policy "overtime_requests_insert" on public.overtime_requests
  for insert
  with check (employee_id = auth.uid());

-- L'employé peut modifier/supprimer sa propre déclaration tant qu'elle n'est
-- pas encore validée. Une fois "approved"/"rejected", seul le propriétaire
-- peut la modifier (validation, motif de refus...).
drop policy if exists "overtime_requests_own_update" on public.overtime_requests;
create policy "overtime_requests_own_update" on public.overtime_requests
  for update
  using (employee_id = auth.uid() and status = 'pending')
  with check (employee_id = auth.uid() and status = 'pending');

drop policy if exists "overtime_requests_own_delete" on public.overtime_requests;
create policy "overtime_requests_own_delete" on public.overtime_requests
  for delete
  using (employee_id = auth.uid() and status = 'pending');

drop policy if exists "overtime_requests_owner_write" on public.overtime_requests;
create policy "overtime_requests_owner_write" on public.overtime_requests
  for all
  using (is_owner())
  with check (is_owner());

-- ============================================================================
-- REALTIME
-- Permet à l'appli de recevoir les changements en direct (un employé voit
-- une modif du propriétaire sans recharger la page, et inversement). Sans
-- ça, les abonnements postgres_changes du client ne reçoivent rien.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'contracts', 'shifts', 'weekly_absences', 'overtime_requests']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- FIN — Rappel : pour créer le tout premier compte propriétaire, exécute
-- ensuite dans le SQL Editor (après avoir créé l'utilisateur dans
-- Authentication > Users) :
--
--   update public.profiles set is_owner = true, group_name = 'veterinaire',
--     full_name = 'Ton nom' where id = '<uuid de l''utilisateur>';
-- ============================================================================
