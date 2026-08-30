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
-- Historique des contrats par employé : type (CDI/CDD/Alternance/Stage),
-- nombre d'heures théoriques par semaine, valable à partir d'une date donnée
-- (permet de gérer un changement de contrat en cours d'année) et jusqu'à une
-- date de fin (obligatoire sauf pour un CDI, qui n'en a pas).
-- ----------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Contrat',
  contract_type text not null default 'CDI',
  weekly_hours numeric(5, 2) not null check (weekly_hours >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

-- Colonnes ajoutées après la création initiale de la table (sans effet si
-- déjà présentes, pour pouvoir rejouer ce fichier sur une base existante).
alter table public.contracts add column if not exists contract_type text not null default 'CDI';
alter table public.contracts add column if not exists effective_to date;

alter table public.contracts drop constraint if exists contracts_type_check;
alter table public.contracts add constraint contracts_type_check
  check (contract_type in ('CDI', 'CDD', 'Alternance', 'Stage'));

alter table public.contracts drop constraint if exists contracts_end_after_start;
alter table public.contracts add constraint contracts_end_after_start
  check (effective_to is null or effective_to >= effective_from);

alter table public.contracts drop constraint if exists contracts_cdi_no_end;
alter table public.contracts add constraint contracts_cdi_no_end
  check (contract_type <> 'CDI' or effective_to is null);

alter table public.contracts drop constraint if exists contracts_noncdi_has_end;
alter table public.contracts add constraint contracts_noncdi_has_end
  check (contract_type = 'CDI' or effective_to is not null);

create index if not exists contracts_employee_idx on public.contracts (employee_id, effective_from);

comment on table public.contracts is 'Historique des contrats (type, heures théoriques hebdomadaires, période) par employé.';

-- ----------------------------------------------------------------------------
-- 3. SHIFTS
-- Un créneau = une personne, un jour, une demi-journée (matin/après-midi),
-- avec ses horaires précis et son poste (couleur). Le poste est optionnel :
-- les vétérinaires n'ont pas de poste, seulement des horaires.
-- ----------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  period text not null check (period in ('matin', 'apres-midi')),
  start_time time not null,
  end_time time not null,
  poste text,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_time_order check (end_time > start_time)
);

-- Rend le poste optionnel (sans effet si déjà nullable).
alter table public.shifts alter column poste drop not null;
alter table public.shifts drop constraint if exists shifts_poste_check;
alter table public.shifts add constraint shifts_poste_check
  check (poste is null or poste in ('bleu', 'violet', 'vert', 'seul'));

create index if not exists shifts_date_idx on public.shifts (work_date);
create index if not exists shifts_employee_idx on public.shifts (employee_id, work_date);

comment on table public.shifts is 'Créneaux de travail individuels (matin ou après-midi) avec poste coloré (optionnel, absent pour les vétérinaires).';

-- ----------------------------------------------------------------------------
-- 4. ABSENCES
-- Marque une période (date à date, congés/repos/arrêt...) comme non
-- décomptée pour un employé : les jours concernés sont exclus, au prorata,
-- du calcul du solde d'heures hebdomadaire. Le propriétaire peut en créer
-- directement (déjà "approved"), ou un·e employé·e peut en demander une
-- ("pending"), à valider par le propriétaire — comme pour les heures sup.
-- Seules les absences "approved" comptent dans le calcul du solde.
-- ----------------------------------------------------------------------------
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default 'Congés',
  status text not null default 'approved',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint absences_end_after_start check (end_date >= start_date)
);

-- Colonnes ajoutées après la création initiale de la table (sans effet si
-- déjà présentes, pour pouvoir rejouer ce fichier sur une base existante).
-- Les absences déjà en place (créées avant l'ajout du statut) sont
-- considérées "approved" grâce à la valeur par défaut.
alter table public.absences add column if not exists status text not null default 'approved';
alter table public.absences add column if not exists decided_by uuid references public.profiles (id);
alter table public.absences add column if not exists decided_at timestamptz;

alter table public.absences drop constraint if exists absences_status_check;
alter table public.absences add constraint absences_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists absences_employee_idx on public.absences (employee_id, start_date);
create index if not exists absences_status_idx on public.absences (status);

comment on table public.absences is 'Périodes (date à date) exclues, au prorata des jours, du calcul du solde d''heures. Statut pending/approved/rejected.';

-- Migration depuis l'ancienne table weekly_absences (semaines entières) :
-- reprend chaque semaine marquée comme une période lundi -> samedi, puis
-- supprime l'ancienne table. Sans effet si weekly_absences n'existe plus.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'weekly_absences') then
    insert into public.absences (employee_id, start_date, end_date, reason)
    select employee_id, week_start, week_start + 5, reason from public.weekly_absences;
    drop table public.weekly_absences;
  end if;
end $$;

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
alter table public.absences enable row level security;
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

-- ---- absences ----
-- Tout le monde voit les absences "approved" de son groupe (pour savoir qui
-- est absent) ; chacun voit aussi ses propres demandes quel que soit leur
-- statut ; le propriétaire voit tout.
drop policy if exists "absences_select" on public.absences;
create policy "absences_select" on public.absences
  for select
  using (
    is_owner()
    or employee_id = auth.uid()
    or (
      status = 'approved'
      and employee_id in (select id from public.profiles where group_name = my_group())
    )
  );

-- Le propriétaire peut créer une absence pour n'importe qui avec n'importe
-- quel statut (déjà validée). Un·e employé·e ne peut créer qu'une demande
-- pour lui/elle-même, obligatoirement "pending".
drop policy if exists "absences_owner_write" on public.absences;
drop policy if exists "absences_insert" on public.absences;
create policy "absences_insert" on public.absences
  for insert
  with check (
    is_owner()
    or (employee_id = auth.uid() and status = 'pending')
  );

-- L'employé peut modifier/annuler sa propre demande tant qu'elle n'est pas
-- encore validée. Une fois "approved"/"rejected", seul le propriétaire peut
-- la modifier (validation, motif de refus...).
drop policy if exists "absences_own_update" on public.absences;
create policy "absences_own_update" on public.absences
  for update
  using (employee_id = auth.uid() and status = 'pending')
  with check (employee_id = auth.uid() and status = 'pending');

drop policy if exists "absences_own_delete" on public.absences;
create policy "absences_own_delete" on public.absences
  for delete
  using (employee_id = auth.uid() and status = 'pending');

drop policy if exists "absences_owner_all" on public.absences;
create policy "absences_owner_all" on public.absences
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
  foreach t in array array['profiles', 'contracts', 'shifts', 'absences', 'overtime_requests']
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
