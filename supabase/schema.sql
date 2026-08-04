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

-- ============================================================
--  v103 — Avisos push (notificaciones al móvil)
-- ============================================================
-- Un dispositivo suscrito a notificaciones. Una persona puede tener
-- varios (móvil, ordenador), de ahí que sea una fila por dispositivo y
-- no una columna en profiles.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  -- El endpoint es único por dispositivo/navegador: sirve de clave para
  -- no duplicar la suscripción cada vez que se abre la app.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now() not null
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Ver suscripciones propias" on public.push_subscriptions;
create policy "Ver suscripciones propias"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Registrar suscripcion propia" on public.push_subscriptions;
create policy "Registrar suscripcion propia"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Borrar suscripcion propia" on public.push_subscriptions;
create policy "Borrar suscripcion propia"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- OJO: quién puede LEER las suscripciones para enviar el aviso no está
-- aquí. El envío lo hace el servidor con la clave de servicio, que se
-- salta las políticas — nunca desde el navegador. Si esto se pudiera
-- leer desde el cliente, cualquiera podría mandar notificaciones a los
-- dispositivos de otro.

-- ============================================================
--  v120 — Corrección: faltaba permiso de actualizar suscripciones push
-- ============================================================
-- Guardar un dispositivo se hace con "insertar o actualizar" (upsert),
-- porque al reactivar los avisos en el mismo navegador llega el mismo
-- endpoint y hay que refrescar sus claves en vez de duplicar la fila.
-- Postgres exige política de UPDATE para la parte de "o actualizar",
-- aunque en la práctica acabe insertando: sin ella rechaza la operación
-- entera.
--
-- El resultado era el fallo que se veía: el navegador SÍ se suscribía
-- (por eso el botón decía "activo"), pero la fila nunca llegaba a la base
-- de datos, así que el servidor no tenía a dónde enviar y no llegaba
-- ningún aviso. Y como el error del guardado se ignoraba, no había
-- ninguna pista de que algo hubiera fallado.
drop policy if exists "Actualizar suscripcion propia" on public.push_subscriptions;
create policy "Actualizar suscripcion propia"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
--  v132 — Sanciones (expulsión temporal y permanente)
-- ============================================================
-- Hasta ahora, desde el panel de moderación solo se podía responder a
-- mensajes. Eso no es moderar: si alguien acosa a otra persona, hace
-- falta poder impedirle entrar, y hacerlo de forma que quede constancia
-- de quién lo hizo, cuándo y por qué.
--
-- Una fila por sanción, y se conserva el historial: no se borran al
-- levantarlas, se marcan como levantadas. Así se puede ver si alguien
-- reincide, que es justo lo que hace falta para decidir si la siguiente
-- es temporal o definitiva.
create table if not exists public.user_bans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  -- 'temporal' expira sola en la fecha indicada; 'permanente' no expira.
  tipo text not null check (tipo in ('temporal', 'permanente')),
  motivo text not null,
  -- Nulo en las permanentes.
  hasta timestamptz,
  creado_por uuid references auth.users on delete set null,
  creado_en timestamptz default now() not null,
  -- Al levantar una sanción no se borra: se marca. El historial importa.
  levantada_en timestamptz,
  levantada_por uuid references auth.users on delete set null
);

create index if not exists user_bans_user_idx on public.user_bans (user_id, levantada_en);

alter table public.user_bans enable row level security;

-- Cada persona puede LEER sus propias sanciones: la app necesita saberlo
-- para enseñarle el aviso al entrar. No puede crearlas, editarlas ni
-- borrarlas, evidentemente.
create policy "Users read their own bans"
  on public.user_bans for select
  using (auth.uid() = user_id);

-- El administrador (profiles.is_admin) puede verlas y gestionarlas todas.
create policy "Admins manage bans"
  on public.user_bans for all
  using (public.es_admin())
  with check (public.es_admin());

-- ¿Está sancionada esta persona ahora mismo? Se resuelve en la base de
-- datos y no en el navegador: una comprobación que vive solo en el
-- cliente se salta abriendo las herramientas de desarrollo.
create or replace function public.sancion_activa(uid uuid)
returns table (tipo text, motivo text, hasta timestamptz)
language sql
security definer
set search_path = public
as $$
  select b.tipo, b.motivo, b.hasta
  from public.user_bans b
  where b.user_id = uid
    and b.levantada_en is null
    and (b.tipo = 'permanente' or b.hasta > now())
  order by (b.tipo = 'permanente') desc, b.hasta desc nulls first
  limit 1;
$$;

-- ============================================================
--  v151 — Corrección de idempotencia en las políticas de sanciones
-- ============================================================
-- Las dos políticas de v132 se crearon sin "drop policy if exists"
-- delante, así que volver a ejecutar este archivo entero fallaba justo
-- ahí ("policy already exists") y dejaba sin aplicar todo lo que viniera
-- después. Se recrean bien para que este fichero se pueda pegar cuantas
-- veces haga falta.
drop policy if exists "Users read their own bans" on public.user_bans;
create policy "Users read their own bans"
  on public.user_bans for select
  using (auth.uid() = user_id);

drop policy if exists "Admins manage bans" on public.user_bans;
create policy "Admins manage bans"
  on public.user_bans for all
  using (public.es_admin())
  with check (public.es_admin());

-- ============================================================
--  v151 — Avisos de moderación (advertencias)
-- ============================================================
-- Entre "no hacer nada" y "expulsar" no había nada. Y la mayoría de los
-- problemas reales de convivencia son de los que se arreglan diciéndolo
-- una vez: un aviso con nombre, motivo y fecha, que la persona tiene que
-- leer sí o sí antes de seguir usando la app.
--
-- Se guarda en su propia tabla y no como una sanción de tipo "aviso"
-- porque no restringe nada: no bloquea el acceso, y mezclarlo con las
-- expulsiones obligaría a comprobar el tipo en cada consulta de acceso,
-- que es justo donde no se puede fallar.
create table if not exists public.user_warnings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  motivo text not null check (char_length(motivo) between 5 and 2000),
  -- Cambia el color y el tono del aviso que ve la persona. Tres niveles
  -- a propósito: si todos los avisos gritan igual, ninguno se toma en
  -- serio.
  gravedad text not null default 'normal' check (gravedad in ('leve', 'normal', 'grave')),
  creado_por uuid references auth.users on delete set null,
  creado_en timestamptz default now() not null,
  -- Cuándo lo dio por leído. Sirve para dos cosas: no repetírselo cada
  -- vez que abre la app, y poder demostrar que se le comunicó si más
  -- adelante hay que expulsarlo por lo mismo.
  leido_en timestamptz
);

create index if not exists user_warnings_user_idx
  on public.user_warnings (user_id, creado_en desc);

alter table public.user_warnings enable row level security;

-- La persona LEE sus avisos (los tiene que ver), pero no puede crearlos,
-- editarlos ni borrarlos. Ni siquiera marcarlos como leídos por la vía
-- directa: eso va por la función de abajo, que solo toca esa columna.
drop policy if exists "Ver avisos propios" on public.user_warnings;
create policy "Ver avisos propios"
  on public.user_warnings for select
  using (auth.uid() = user_id or public.es_admin());

drop policy if exists "Moderacion gestiona avisos" on public.user_warnings;
create policy "Moderacion gestiona avisos"
  on public.user_warnings for all
  using (public.es_admin())
  with check (public.es_admin());

-- Marcar un aviso como leído. Va como función y no como política de
-- UPDATE porque una política de actualización sobre la propia fila
-- dejaría reescribir también el motivo — y un registro de moderación que
-- el sancionado puede reescribir no vale como registro de nada.
create or replace function public.marcar_aviso_leido(aviso_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_warnings
     set leido_en = now()
   where id = aviso_id
     and user_id = auth.uid()
     and leido_en is null;
$$;

-- ============================================================
--  v151 — Listado de miembros para moderación
-- ============================================================
-- Hasta ahora solo se podía moderar a quien tuviera un ticket abierto,
-- que es tanto como decir que solo se podía sancionar a quien pedía
-- ayuda. Los problemas de convivencia no vienen con ticket adjunto.
--
-- Va como función "security definer" porque hace falta cruzar profiles
-- con auth.users (el correo, que suele ser el único identificador
-- fiable) y con social_profiles, y esas tablas no son legibles desde el
-- navegador ni deben serlo. La comprobación de administrador es lo
-- primero que se hace: si quien llama no lo es, la función corta ahí y
-- no devuelve una sola fila.
create or replace function public.listar_miembros(
  busqueda text default '',
  limite int default 40
)
returns table (
  id uuid,
  nombre text,
  alias text,
  email text,
  creado_en timestamptz,
  es_administrador boolean,
  sancion_tipo text,
  sancion_motivo text,
  sancion_hasta timestamptz,
  avisos int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el equipo de moderación puede consultar los miembros'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    p.id,
    p.display_name,
    sp.alias,
    u.email::text,
    p.created_at,
    p.is_admin,
    s.tipo,
    s.motivo,
    s.hasta,
    (select count(*)::int from public.user_warnings w where w.user_id = p.id)
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.social_profiles sp on sp.user_id = p.id
  -- La sanción activa se pide a la misma función que usa la app para
  -- decidir si deja entrar: si algún día cambia la regla, cambia en un
  -- sitio y el panel no se queda diciendo otra cosa.
  left join lateral public.sancion_activa(p.id) s on true
  where
    coalesce(busqueda, '') = ''
    or p.display_name ilike '%' || busqueda || '%'
    or sp.alias ilike '%' || busqueda || '%'
    or u.email ilike '%' || busqueda || '%'
  order by (s.tipo is not null) desc, p.created_at desc
  limit greatest(1, least(coalesce(limite, 40), 100));
end;
$$;

-- ============================================================
--  v151 — Realtime para que la moderación se note al instante
-- ============================================================
-- Sin esto, una expulsión no se veía hasta que la persona recargaba o
-- volvía a la pestaña. Moderar sirve para cortar algo que está pasando
-- AHORA: si tarda cinco minutos en aplicarse, no ha cortado nada.
do $$
begin
  alter publication supabase_realtime add table public.user_bans;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_warnings;
exception when duplicate_object then null;
end $$;
