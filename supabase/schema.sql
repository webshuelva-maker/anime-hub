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

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
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

drop policy if exists "Users read their own state" on public.user_state;
create policy "Users read their own state"
  on public.user_state for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own state" on public.user_state;
create policy "Users insert their own state"
  on public.user_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own state" on public.user_state;
create policy "Users update their own state"
  on public.user_state for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete their own state" on public.user_state;
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

drop policy if exists "Users read their own social profile" on public.social_profiles;
create policy "Users read their own social profile"
  on public.social_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own social profile" on public.social_profiles;
create policy "Users insert their own social profile"
  on public.social_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own social profile" on public.social_profiles;
create policy "Users update their own social profile"
  on public.social_profiles for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete their own social profile" on public.social_profiles;
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

drop policy if exists "Users manage their own blocks" on public.social_blocks;
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

drop policy if exists "Users can file reports" on public.social_reports;
create policy "Users can file reports"
  on public.social_reports for insert
  with check (auth.uid() = reporter_id);

-- ============================================================
--  v93 — Alias únicos en el apartado social
-- ============================================================
-- Dos personas no pueden llamarse igual: en un sitio donde hablas con
-- desconocidos, poder repetir alias es una vía directa para hacerse
-- pasar por otro. Se compara en minúsculas para que "Shirokuma" y
-- "shirokuma" cuenten como el mismo.
--
-- Va como índice en la base de datos y no como comprobación en la app a
-- propósito: cada persona solo puede leer su propia fila, así que la app
-- no PUEDE saber si un alias está libre. Y aunque pudiera, dos altas a la
-- vez podrían colarse igual.
create unique index if not exists social_profiles_alias_unique
  on public.social_profiles (lower(alias));

-- ============================================================
--  v95 — La fecha de nacimiento no se puede cambiar
-- ============================================================
-- Nadie puede verificar de verdad una edad autodeclarada sin pedir un
-- documento, y eso no se va a hacer aquí. Pero sí se puede evitar lo
-- fácil: que alguien ponga una fecha, la app le diga "eres menor de 18",
-- y entonces la cambie sabiendo ya qué fecha hace falta. La declaración
-- vale de algo solo si se hace UNA vez y queda fija.
--
-- Va como disparador en la base de datos, no como comprobación en la
-- app, por lo mismo de siempre: no puede depender de que el navegador se
-- porte bien. Si alguien necesita corregirla de verdad (se equivocó al
-- teclear), tiene que borrar el perfil social y volver a crearlo, y eso
-- queda registrado.
create or replace function public.social_profiles_birthdate_inmutable()
returns trigger as $$
begin
  if new.birthdate is distinct from old.birthdate then
    raise exception 'La fecha de nacimiento no se puede cambiar'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists social_profiles_birthdate_lock on public.social_profiles;
create trigger social_profiles_birthdate_lock
  before update on public.social_profiles
  for each row execute procedure public.social_profiles_birthdate_inmutable();

-- ============================================================
--  v101 — Tickets de soporte / moderación
-- ============================================================
-- Vía de contacto de la app: en vez de un correo que nadie mira, el
-- usuario abre un ticket desde dentro y habla con un humano.
--
-- Quién es administrador se marca aquí, no en el código: una columna en
-- profiles. Así se puede dar y quitar sin desplegar nada, y sobre todo
-- las políticas de abajo pueden apoyarse en ella (si viviera en el
-- cliente, cualquiera podría decir que es administrador).
alter table public.profiles
  add column if not exists is_admin boolean default false not null;

-- Función auxiliar: ¿quien hace la petición es administrador?
-- "security definer" para que pueda mirar profiles sin chocar con las
-- políticas de la propia tabla profiles (si no, se muerde la cola).
create or replace function public.es_admin()
returns boolean as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$ language sql stable security definer set search_path = public;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  -- abierto: esperando a que lo coja alguien
  -- atendido: un administrador ya está dentro
  -- cerrado: resuelto
  estado text not null default 'abierto' check (estado in ('abierto', 'atendido', 'cerrado')),
  asunto text,
  -- Lo que contó el usuario o lo que Ren detectó, para no tener que leer
  -- todo el hilo antes de saber de qué va.
  motivo text,
  admin_id uuid references auth.users on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists support_tickets_estado_idx
  on public.support_tickets (estado, created_at desc);
create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets on delete cascade not null,
  autor_id uuid references auth.users on delete set null,
  -- Se guarda aparte de autor_id a propósito: si algún día se borra la
  -- cuenta del administrador, el hilo tiene que seguir leyéndose y
  -- entendiéndose quién dijo qué.
  autor_rol text not null check (autor_rol in ('usuario', 'admin')),
  contenido text not null check (char_length(contenido) between 1 and 4000),
  created_at timestamptz default now() not null
);

create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Tickets: cada uno ve los suyos; los administradores, todos.
drop policy if exists "Ver tickets propios o todos si admin" on public.support_tickets;
create policy "Ver tickets propios o todos si admin"
  on public.support_tickets for select
  using (auth.uid() = user_id or public.es_admin());

drop policy if exists "Abrir ticket propio" on public.support_tickets;
create policy "Abrir ticket propio"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

-- El usuario puede cerrar el suyo; el administrador puede además
-- cogerlo y cambiarle el estado.
drop policy if exists "Actualizar ticket propio o si admin" on public.support_tickets;
create policy "Actualizar ticket propio o si admin"
  on public.support_tickets for update
  using (auth.uid() = user_id or public.es_admin());

-- Mensajes: se ven si se puede ver el ticket al que pertenecen.
drop policy if exists "Ver mensajes de tickets visibles" on public.support_messages;
create policy "Ver mensajes de tickets visibles"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (t.user_id = auth.uid() or public.es_admin())
    )
  );

-- Al escribir se comprueba que el rol declarado cuadra con quién eres de
-- verdad: nadie puede mandar un mensaje haciéndose pasar por admin.
drop policy if exists "Escribir en tickets visibles" on public.support_messages;
create policy "Escribir en tickets visibles"
  on public.support_messages for insert
  with check (
    autor_id = auth.uid()
    and (
      (autor_rol = 'admin' and public.es_admin())
      or (
        autor_rol = 'usuario'
        and exists (
          select 1 from public.support_tickets t
          where t.id = ticket_id and t.user_id = auth.uid()
        )
      )
    )
  );

-- Los mensajes no se editan ni se borran a propósito: un hilo de
-- moderación que se puede reescribir no sirve como registro de nada.

-- Realtime: para que el chat aparezca solo, sin recargar.
do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.support_tickets;
exception when duplicate_object then null;
end $$;
