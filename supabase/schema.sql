-- Ejecutar esto una vez en Supabase: Project → SQL Editor → New query →
-- pegar todo este archivo → Run.

-- Tabla de perfiles: una fila por usuario registrado, enlazada a la
-- tabla de autenticación que ya gestiona Supabase por su cuenta.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  is_premium boolean default false not null,
  premium_since timestamptz,
  created_at timestamptz default now() not null
);

-- Row Level Security: cada persona SOLO puede ver y modificar su propia
-- fila, nunca la de otro usuario — esto es lo que hace seguro exponer
-- la clave "anon" en el navegador.
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Crea automáticamente la fila de perfil en cuanto alguien se registra
-- (no hace falta hacerlo a mano desde el código de la app).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  v91 — Sincronización entre dispositivos
-- ============================================================
-- Hasta ahora todo lo que la app aprendía (gustos, "me gusta", y lo que
-- Ren recuerda) vivía SOLO en el navegador. Al cambiar de móvil a
-- ordenador, Ren no te conocía de nada aunque tuvieras cuenta. Esta
-- tabla guarda ese estado por usuario para que te siga a donde vayas.
--
-- Se guarda en dos campos JSON en vez de en columnas: el contenido
-- cambia con cada versión de la app, y así añadir una preferencia nueva
-- no obliga a migrar la base de datos.
create table if not exists public.user_state (
  user_id uuid references auth.users on delete cascade primary key,
  preferences jsonb,
  ren_memory jsonb,
  -- Marca de tiempo del ÚLTIMO cambio hecho por el usuario, no de la
  -- escritura: es lo que permite decidir quién gana cuando el navegador
  -- y la nube tienen versiones distintas.
  client_updated_at timestamptz,
  updated_at timestamptz default now() not null
);

alter table public.user_state enable row level security;

create policy "Users read their own state"
  on public.user_state for select
  using (auth.uid() = user_id);

create policy "Users insert their own state"
  on public.user_state for insert
  with check (auth.uid() = user_id);

create policy "Users update their own state"
  on public.user_state for update
  using (auth.uid() = user_id);

create policy "Users delete their own state"
  on public.user_state for delete
  using (auth.uid() = user_id);

-- ============================================================
--  v91 — Base del apartado social (todavía sin emparejamiento)
-- ============================================================
-- Perfil social, separado del perfil normal a propósito: son datos más
-- delicados (edad, sexo) y con una finalidad distinta, así que se
-- guardan aparte, solo se crean si la persona entra en esa sección, y
-- se pueden borrar sin tocar el resto de su cuenta.
create table if not exists public.social_profiles (
  user_id uuid references auth.users on delete cascade primary key,
  alias text not null,
  birthdate date not null,
  gender text not null,
  looking_for text[] not null default '{}',
  bio text,
  is_active boolean default true not null,
  -- Sin aceptación expresa de las normas no hay perfil: queda registrado
  -- cuándo se aceptó y qué versión, que es lo que sirve como prueba.
  accepted_rules_at timestamptz not null,
  accepted_rules_version text not null,
  created_at timestamptz default now() not null,

  -- Solo mayores de edad. Va como restricción en la base de datos y no
  -- solo en el formulario: así no depende de que el navegador se porte
  -- bien. No es verificación real de edad (nada que se autodeclare lo
  -- es), pero deja constancia de la declaración y bloquea lo evidente.
  constraint social_profiles_adults_only check (birthdate <= (current_date - interval '18 years'))
);

alter table public.social_profiles enable row level security;

create policy "Users read their own social profile"
  on public.social_profiles for select
  using (auth.uid() = user_id);

create policy "Users insert their own social profile"
  on public.social_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users update their own social profile"
  on public.social_profiles for update
  using (auth.uid() = user_id);

create policy "Users delete their own social profile"
  on public.social_profiles for delete
  using (auth.uid() = user_id);

-- Bloqueos: quién no quiere volver a cruzarse con quién.
create table if not exists public.social_blocks (
  blocker_id uuid references auth.users on delete cascade not null,
  blocked_id uuid references auth.users on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (blocker_id, blocked_id)
);

alter table public.social_blocks enable row level security;

create policy "Users manage their own blocks"
  on public.social_blocks for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

-- Denuncias. El usuario puede crearlas pero NO leerlas ni borrarlas:
-- una denuncia no debe poder consultarse ni retirarse desde la app.
create table if not exists public.social_reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references auth.users on delete set null,
  reported_id uuid references auth.users on delete cascade not null,
  reason text not null,
  details text,
  status text default 'pendiente' not null,
  created_at timestamptz default now() not null
);

alter table public.social_reports enable row level security;

create policy "Users can file reports"
  on public.social_reports for insert
  with check (auth.uid() = reporter_id);
