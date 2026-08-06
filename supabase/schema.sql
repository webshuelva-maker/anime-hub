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

-- ============================================================
--  v154 — Conectar: descubrir perfiles
-- ============================================================
-- Primera pieza de verdad del apartado social. Hasta ahora solo se
-- podía crear el perfil; aquí empieza a servir para algo.
--
-- Cómo funciona el emparejamiento: la app decide automáticamente A QUIÉN
-- ves y en qué orden (por gustos en común), y la persona solo dice
-- "me interesa" o "paso". Hay coincidencia cuando los dos dicen que sí.
--
-- Todo pasa por funciones "security definer" y NINGUNA abre la tabla de
-- perfiles sociales a la lectura ajena. Es importante: si se relajaran
-- las políticas de social_profiles para poder enseñar candidatos, se
-- estaría exponiendo también la fecha de nacimiento exacta de todo el
-- mundo. Así solo sale lo que estas funciones deciden devolver (alias,
-- edad en años, cómo se identifica y la biografía) y nunca el correo ni
-- la fecha.

-- Ayuda: pasar un campo JSON a lista de textos sin reventar si no es una
-- lista o si no existe. Las preferencias se guardan en JSON precisamente
-- para poder cambiar de versión sin migrar, así que aquí hay que asumir
-- que cualquier cosa puede faltar.
create or replace function public.jsonb_texto_array(j jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when jsonb_typeof(j) = 'array'
      then coalesce((select array_agg(x) from jsonb_array_elements_text(j) x), '{}')
    else '{}'::text[]
  end;
$$;

-- ¿La persona que busca aceptaría a esta otra, según con quién quiere
-- coincidir? Se aplica en LOS DOS SENTIDOS más abajo: que a mí me
-- encajes no significa que yo te encaje a ti, y enseñar a alguien
-- perfiles que nunca le van a devolver el sí es hacerle perder el tiempo.
--
-- Consecuencia a tener en cuenta: quien elige "Prefiero no decirlo" solo
-- aparece ante quien haya marcado "Me da igual". No hay forma de evitarlo
-- sin ignorar lo que la otra persona ha pedido.
create or replace function public.encaja_busqueda(busca text[], genero text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(array_length(busca, 1), 0) = 0
    or 'Me da igual' = any(busca)
    or (genero = 'Mujer' and 'Mujeres' = any(busca))
    or (genero = 'Hombre' and 'Hombres' = any(busca))
    or (genero = 'No binario' and 'Personas no binarias' = any(busca));
$$;

-- Una fila por decisión tomada. Se guardan también los "paso": es lo que
-- evita que la misma persona vuelva a salir una y otra vez, y sin eso la
-- pila de perfiles sería un bucle.
create table if not exists public.social_decisions (
  decisor_id uuid references auth.users on delete cascade not null,
  objetivo_id uuid references auth.users on delete cascade not null,
  decision text not null check (decision in ('interesa', 'paso')),
  creado_en timestamptz default now() not null,
  primary key (decisor_id, objetivo_id)
);

create index if not exists social_decisions_objetivo_idx
  on public.social_decisions (objetivo_id, decision);

alter table public.social_decisions enable row level security;

-- Cada uno ve y crea SOLO sus propias decisiones. Muy a propósito: si se
-- pudieran leer las ajenas, cualquiera podría consultar quién le ha dado
-- a "me interesa" antes de decidir, y eso convierte el gusto mutuo en un
-- juego de información. Saber si el otro dijo que sí es justo lo que la
-- coincidencia revela, y solo cuando toca.
drop policy if exists "Ver decisiones propias" on public.social_decisions;
create policy "Ver decisiones propias"
  on public.social_decisions for select
  using (auth.uid() = decisor_id);

drop policy if exists "Tomar decisiones propias" on public.social_decisions;
create policy "Tomar decisiones propias"
  on public.social_decisions for insert
  with check (auth.uid() = decisor_id);

-- A quién enseñarle. Ordenado por gustos comunes: títulos favoritos
-- valen más que géneros, porque compartir "Vinland Saga" dice bastante
-- más que compartir "Acción".
create or replace function public.descubrir_perfiles(limite int default 20)
returns table (
  user_id uuid,
  alias text,
  edad int,
  genero text,
  bio text,
  afinidad int,
  titulos_comunes text[],
  generos_comunes text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  mis_titulos text[];
  mis_generos text[];
  mi_busqueda text[];
  mi_genero text;
begin
  if yo is null then
    raise exception 'Hace falta iniciar sesión' using errcode = 'insufficient_privilege';
  end if;

  -- Sin perfil social no se descubre a nadie: es la puerta de entrada
  -- donde se comprobó la edad y se aceptaron las normas.
  select sp.looking_for, sp.gender into mi_busqueda, mi_genero
  from public.social_profiles sp
  where sp.user_id = yo and sp.is_active;

  if mi_genero is null then
    return;
  end if;

  -- Una cuenta sancionada no se pasea por el apartado social.
  if exists (
    select 1 from public.user_bans b
    where b.user_id = yo and b.levantada_en is null
      and (b.tipo = 'permanente' or b.hasta > now())
  ) then
    return;
  end if;

  select
    array(select lower(t) from unnest(public.jsonb_texto_array(us.preferences -> 'favoriteTitles')) t),
    array(select lower(g) from unnest(public.jsonb_texto_array(us.preferences -> 'genres')) g)
  into mis_titulos, mis_generos
  from public.user_state us
  where us.user_id = yo;

  mis_titulos := coalesce(mis_titulos, '{}');
  mis_generos := coalesce(mis_generos, '{}');

  return query
  select
    sp.user_id,
    sp.alias,
    extract(year from age(sp.birthdate))::int,
    sp.gender,
    sp.bio,
    (cardinality(c.tc) * 10 + cardinality(c.gc) * 3)::int,
    c.tc,
    c.gc
  from public.social_profiles sp
  left join public.user_state us on us.user_id = sp.user_id
  cross join lateral (
    select
      coalesce((
        select array_agg(t) from unnest(public.jsonb_texto_array(us.preferences -> 'favoriteTitles')) t
        where lower(t) = any(mis_titulos)
      ), '{}') as tc,
      coalesce((
        select array_agg(g) from unnest(public.jsonb_texto_array(us.preferences -> 'genres')) g
        where lower(g) = any(mis_generos)
      ), '{}') as gc
  ) c
  where sp.user_id <> yo
    and sp.is_active
    -- Ya decidido antes: no vuelve a salir.
    and not exists (
      select 1 from public.social_decisions d
      where d.decisor_id = yo and d.objetivo_id = sp.user_id
    )
    -- Bloqueos, en los dos sentidos.
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = yo and b.blocked_id = sp.user_id)
         or (b.blocker_id = sp.user_id and b.blocked_id = yo)
    )
    -- Quien está sancionado desaparece del apartado mientras lo esté.
    and not exists (
      select 1 from public.user_bans ub
      where ub.user_id = sp.user_id and ub.levantada_en is null
        and (ub.tipo = 'permanente' or ub.hasta > now())
    )
    -- Que encaje en los dos sentidos.
    and public.encaja_busqueda(mi_busqueda, sp.gender)
    and public.encaja_busqueda(sp.looking_for, mi_genero)
  order by (cardinality(c.tc) * 10 + cardinality(c.gc) * 3) desc, random()
  limit greatest(1, least(coalesce(limite, 20), 50));
end;
$$;

-- Decidir sobre alguien. Devuelve si ha salido coincidencia, que es lo
-- único que la app necesita saber — y lo único que se puede contar sin
-- filtrar quién dijo que sí antes.
create or replace function public.decidir_perfil(objetivo uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  hay_match boolean := false;
begin
  if yo is null or objetivo = yo then
    return false;
  end if;
  if decision not in ('interesa', 'paso') then
    raise exception 'Decisión no válida';
  end if;
  if not exists (select 1 from public.social_profiles where user_id = yo and is_active) then
    raise exception 'Hace falta tener perfil social';
  end if;

  -- Si ya se había decidido, se respeta la primera: sin esto, un doble
  -- toque por error reescribiría la decisión.
  insert into public.social_decisions (decisor_id, objetivo_id, decision)
  values (yo, objetivo, decision)
  on conflict (decisor_id, objetivo_id) do nothing;

  if decision = 'interesa' then
    select exists (
      select 1 from public.social_decisions d
      where d.decisor_id = objetivo and d.objetivo_id = yo and d.decision = 'interesa'
    ) into hay_match;
  end if;

  return hay_match;
end;
$$;

-- Las coincidencias: gente a la que le dijiste que sí y te dijo que sí.
create or replace function public.mis_coincidencias()
returns table (
  user_id uuid,
  alias text,
  edad int,
  genero text,
  bio text,
  desde timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
begin
  if yo is null then
    return;
  end if;

  return query
  select
    sp.user_id,
    sp.alias,
    extract(year from age(sp.birthdate))::int,
    sp.gender,
    sp.bio,
    greatest(mia.creado_en, suya.creado_en)
  from public.social_decisions mia
  join public.social_decisions suya
    on suya.decisor_id = mia.objetivo_id
   and suya.objetivo_id = yo
   and suya.decision = 'interesa'
  join public.social_profiles sp on sp.user_id = mia.objetivo_id and sp.is_active
  where mia.decisor_id = yo
    and mia.decision = 'interesa'
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = yo and b.blocked_id = sp.user_id)
         or (b.blocker_id = sp.user_id and b.blocked_id = yo)
    )
  order by greatest(mia.creado_en, suya.creado_en) desc;
end;
$$;

-- ============================================================
--  v154 — Conectar, fase 1: descubrir perfiles
-- ============================================================
-- Los gustos que la app ya conoce (favoritos, géneros, estudios) vivían
-- solo del lado de las noticias. Para poder ordenar a quién enseñar
-- primero hacen falta EN LA BASE DE DATOS: la afinidad se calcula ahí,
-- no en el navegador, porque para compararte con otra persona harían
-- falta los gustos de esa otra persona — y eso es justo lo que no se le
-- puede dar a nadie.
alter table public.social_profiles
  add column if not exists generos text[] not null default '{}',
  add column if not exists estudios text[] not null default '{}',
  add column if not exists favoritos text[] not null default '{}',
  add column if not exists avatar_id text,
  add column if not exists gustos_en timestamptz;

-- Lo que has decidido sobre cada persona que te ha salido. Se guarda
-- también el "paso" y no solo el "me interesa": sin eso, la misma
-- persona volvería a salir en la siguiente tanda para siempre.
create table if not exists public.social_decisions (
  user_id uuid references auth.users on delete cascade not null,
  target_id uuid references auth.users on delete cascade not null,
  decision text not null check (decision in ('interesa', 'paso')),
  created_at timestamptz default now() not null,
  primary key (user_id, target_id),
  constraint social_decisions_no_self check (user_id <> target_id)
);

alter table public.social_decisions enable row level security;

-- Cada uno ve y escribe SOLO sus propias decisiones. Que no se puedan
-- leer las ajenas es lo que impide saber si le gustas a alguien antes de
-- que haya coincidencia.
drop policy if exists "Decisiones propias" on public.social_decisions;
create policy "Decisiones propias"
  on public.social_decisions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Coincidencias. Se guardan con los dos identificadores ORDENADOS
-- (menor primero) para que una pareja no pueda existir dos veces según
-- quién dijera que sí primero.
create table if not exists public.social_matches (
  usuario_a uuid references auth.users on delete cascade not null,
  usuario_b uuid references auth.users on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (usuario_a, usuario_b),
  constraint social_matches_orden check (usuario_a < usuario_b)
);

alter table public.social_matches enable row level security;

drop policy if exists "Ver coincidencias propias" on public.social_matches;
create policy "Ver coincidencias propias"
  on public.social_matches for select
  using (auth.uid() = usuario_a or auth.uid() = usuario_b);

-- Nadie inserta coincidencias a mano: las crea la función de decidir.

-- Afinidad entre dos listas de gustos. Los favoritos pesan más que un
-- género: compartir "Acción" no dice casi nada (lo tiene medio mundo),
-- compartir un título concreto sí.
create or replace function public.afinidad_gustos(
  a_favoritos text[], a_generos text[], a_estudios text[],
  b_favoritos text[], b_generos text[], b_estudios text[]
)
returns int
language sql
immutable
as $$
  select
    -- Los favoritos los escribe cada uno a mano, así que se comparan en
    -- minúsculas: "One Piece" y "one piece" son el mismo anime.
    5 * coalesce(cardinality(array(
      select lower(trim(x)) from unnest(a_favoritos) x
      intersect
      select lower(trim(y)) from unnest(b_favoritos) y
    )), 0)
    + 2 * coalesce(cardinality(array(
      select unnest(a_generos) intersect select unnest(b_generos)
    )), 0)
    + 2 * coalesce(cardinality(array(
      select unnest(a_estudios) intersect select unnest(b_estudios)
    )), 0);
$$;

-- ¿Encajan las preferencias de los dos? Tiene que cuadrar en AMBOS
-- sentidos: que el otro entre en lo que tú buscas no basta si tú no
-- entras en lo que busca él.
create or replace function public.encaja_busqueda(
  a_genero text, a_busca text[], b_genero text, b_busca text[]
)
returns boolean
language sql
immutable
as $$
  select
    ('Me da igual' = any(a_busca) or
      case b_genero
        when 'Mujer' then 'Mujeres' = any(a_busca)
        when 'Hombre' then 'Hombres' = any(a_busca)
        when 'No binario' then 'Personas no binarias' = any(a_busca)
        else true
      end)
    and
    ('Me da igual' = any(b_busca) or
      case a_genero
        when 'Mujer' then 'Mujeres' = any(b_busca)
        when 'Hombre' then 'Hombres' = any(b_busca)
        when 'No binario' then 'Personas no binarias' = any(b_busca)
        else true
      end);
$$;

-- A quién enseñar, y en qué orden.
--
-- Es una función y no una política de lectura sobre social_profiles a
-- propósito: así se devuelve SOLO lo que hay que enseñar (alias, edad,
-- bio, gustos en común) y nunca la fecha de nacimiento exacta ni el
-- correo. Una política abierta sobre la tabla habría dejado leerlo todo
-- desde la consola del navegador.
create or replace function public.descubrir_perfiles(limite int default 12)
returns table (
  user_id uuid,
  alias text,
  edad int,
  gender text,
  bio text,
  avatar_id text,
  afinidad int,
  generos_comunes text[],
  estudios_comunes text[],
  favoritos_comunes text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  yo public.social_profiles%rowtype;
begin
  select * into yo from public.social_profiles where social_profiles.user_id = auth.uid();
  if not found or not yo.is_active then
    return;
  end if;

  -- Quien está sancionado no busca a nadie.
  if exists (select 1 from public.sancion_activa(auth.uid())) then
    return;
  end if;

  return query
  select
    p.user_id,
    p.alias,
    extract(year from age(p.birthdate))::int,
    p.gender,
    p.bio,
    p.avatar_id,
    public.afinidad_gustos(
      yo.favoritos, yo.generos, yo.estudios,
      p.favoritos, p.generos, p.estudios
    ),
    array(select unnest(yo.generos) intersect select unnest(p.generos)),
    array(select unnest(yo.estudios) intersect select unnest(p.estudios)),
    array(select unnest(yo.favoritos) intersect select unnest(p.favoritos))
  from public.social_profiles p
  where p.user_id <> auth.uid()
    and p.is_active
    -- Ya decidido (que sí o que no): no vuelve a salir.
    and not exists (
      select 1 from public.social_decisions d
      where d.user_id = auth.uid() and d.target_id = p.user_id
    )
    -- Bloqueos, en los dos sentidos. Si alguien te ha bloqueado, no
    -- vuelves a aparecerle — y él tampoco a ti, para que el bloqueo no
    -- se note desde el otro lado.
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    )
    -- Sancionados fuera del circuito mientras dure la sanción.
    and not exists (select 1 from public.sancion_activa(p.user_id))
    and public.encaja_busqueda(yo.gender, yo.looking_for, p.gender, p.looking_for)
  order by
    public.afinidad_gustos(
      yo.favoritos, yo.generos, yo.estudios,
      p.favoritos, p.generos, p.estudios
    ) desc,
    -- A igualdad de afinidad, primero quien lleva menos tiempo: reparte
    -- las visitas en vez de enseñar siempre a los mismos.
    p.created_at desc
  limit greatest(1, least(coalesce(limite, 12), 30));
end;
$$;

-- Decidir sobre una persona. Devuelve true si ha habido coincidencia.
--
-- La coincidencia se calcula AQUÍ y no en el navegador porque hace falta
-- mirar la decisión del otro, que nadie puede leer. Es la única forma de
-- que "¿le intereso?" solo se pueda responder cuando la respuesta es que
-- sí y es mutua.
create or replace function public.decidir_perfil(objetivo uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reciproco boolean;
begin
  if auth.uid() is null or objetivo = auth.uid() then
    raise exception 'Decisión no válida';
  end if;
  if decision not in ('interesa', 'paso') then
    raise exception 'Decisión no válida';
  end if;

  insert into public.social_decisions (user_id, target_id, decision)
  values (auth.uid(), objetivo, decision)
  on conflict (user_id, target_id) do update set decision = excluded.decision;

  if decision <> 'interesa' then
    return false;
  end if;

  select exists (
    select 1 from public.social_decisions d
    where d.user_id = objetivo
      and d.target_id = auth.uid()
      and d.decision = 'interesa'
  ) into reciproco;

  if reciproco then
    insert into public.social_matches (usuario_a, usuario_b)
    values (least(auth.uid(), objetivo), greatest(auth.uid(), objetivo))
    on conflict do nothing;
  end if;

  return reciproco;
end;
$$;

-- Tus coincidencias, con lo justo para enseñarlas en una lista.
create or replace function public.mis_coincidencias()
returns table (
  user_id uuid,
  alias text,
  edad int,
  avatar_id text,
  desde timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.alias,
    extract(year from age(p.birthdate))::int,
    p.avatar_id,
    m.created_at
  from public.social_matches m
  join public.social_profiles p
    on p.user_id = case when m.usuario_a = auth.uid() then m.usuario_b else m.usuario_a end
  where auth.uid() in (m.usuario_a, m.usuario_b)
    and p.is_active
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    )
  order by m.created_at desc;
$$;

-- ============================================================
--  v158 — Conectar fase 2: quien te marca sube, y chat
-- ============================================================

-- Descripción obligatoria y con fondo.
--
-- Antes era opcional y de una palabra valía. El resultado eran fichas
-- que no decían nada de nadie, y sin nada que leer la decisión se toma
-- por el avatar — que es justo lo contrario de lo que pretende esta
-- sección. Va como NOT VALID para que los perfiles que ya existen sigan
-- funcionando: la regla se aplica a lo que se escriba a partir de ahora.
do $$
begin
  alter table public.social_profiles
    add constraint social_profiles_bio_minima
    check (bio is not null and char_length(trim(bio)) >= 40) not valid;
exception when duplicate_object then null;
end $$;

-- ============================================================
--  v158 — Quien te ha marcado sale primero
-- ============================================================
-- El problema de esperar a que le salgas: con cincuenta personas en la
-- baraja, que a quien te ha marcado le toque justo tu ficha es cuestión
-- de suerte, y una coincidencia que depende de la suerte no llega nunca.
--
-- Así que la información se usa: si alguien ya te ha marcado, su ficha
-- salta al principio de tu montón. La coincidencia deja de depender de
-- que dos personas coincidan en el tiempo — basta con que las dos digan
-- que sí, en el orden que sea.
--
-- Lo que NO se hace: avisar a quien marca de que ha marcado bien. Quien
-- te marcó no sabe que estás viendo su ficha; solo se entera si le dices
-- que sí. Eso mantiene el "nadie sabe que le has dicho que no".
--
-- El DROP es obligatorio, no una limpieza: Postgres no deja que
-- "create or replace" cambie lo que devuelve una función, y esta versión
-- añade la columna te_ha_marcado. Sin el drop delante, el fichero falla
-- aquí con "cannot change return type of existing function".
drop function if exists public.descubrir_perfiles(integer);
create or replace function public.descubrir_perfiles(limite int default 12)
returns table (
  user_id uuid,
  alias text,
  edad int,
  gender text,
  bio text,
  avatar_id text,
  afinidad int,
  generos_comunes text[],
  estudios_comunes text[],
  favoritos_comunes text[],
  te_ha_marcado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  yo public.social_profiles%rowtype;
begin
  select * into yo from public.social_profiles where social_profiles.user_id = auth.uid();
  if not found or not yo.is_active then
    return;
  end if;

  if exists (select 1 from public.sancion_activa(auth.uid())) then
    return;
  end if;

  return query
  select
    p.user_id,
    p.alias,
    extract(year from age(p.birthdate))::int,
    p.gender,
    p.bio,
    p.avatar_id,
    public.afinidad_gustos(
      yo.favoritos, yo.generos, yo.estudios,
      p.favoritos, p.generos, p.estudios
    ),
    array(select unnest(yo.generos) intersect select unnest(p.generos)),
    array(select unnest(yo.estudios) intersect select unnest(p.estudios)),
    array(select unnest(yo.favoritos) intersect select unnest(p.favoritos)),
    exists (
      select 1 from public.social_decisions d
      where d.user_id = p.user_id
        and d.target_id = auth.uid()
        and d.decision = 'interesa'
    )
  from public.social_profiles p
  where p.user_id <> auth.uid()
    and p.is_active
    and not exists (
      select 1 from public.social_decisions d
      where d.user_id = auth.uid() and d.target_id = p.user_id
    )
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    )
    and not exists (select 1 from public.sancion_activa(p.user_id))
    and public.encaja_busqueda(yo.gender, yo.looking_for, p.gender, p.looking_for)
  order by
    -- Primero, quien ya te ha dicho que sí.
    exists (
      select 1 from public.social_decisions d
      where d.user_id = p.user_id and d.target_id = auth.uid() and d.decision = 'interesa'
    ) desc,
    public.afinidad_gustos(
      yo.favoritos, yo.generos, yo.estudios,
      p.favoritos, p.generos, p.estudios
    ) desc,
    p.created_at desc
  limit greatest(1, least(coalesce(limite, 12), 30));
end;
$$;

-- Cuánta gente te ha marcado y todavía no has decidido sobre ella.
-- Solo el número: para verlos hay que pasar por la baraja como todo el
-- mundo, y así no se convierte en una lista de admiradores.
create or replace function public.cuantos_te_esperan()
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.social_decisions d
  join public.social_profiles p on p.user_id = d.user_id and p.is_active
  where d.target_id = auth.uid()
    and d.decision = 'interesa'
    and not exists (
      select 1 from public.social_decisions mia
      where mia.user_id = auth.uid() and mia.target_id = d.user_id
    )
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = d.user_id)
         or (b.blocker_id = d.user_id and b.blocked_id = auth.uid())
    )
    and not exists (select 1 from public.sancion_activa(d.user_id));
$$;

-- ============================================================
--  v158 — Chat entre coincidencias
-- ============================================================
create table if not exists public.social_messages (
  id uuid default gen_random_uuid() primary key,
  -- La pareja, siempre ordenada igual que en social_matches: así una
  -- conversación es una sola cosa y no dos según quién escriba.
  usuario_a uuid references auth.users on delete cascade not null,
  usuario_b uuid references auth.users on delete cascade not null,
  autor_id uuid references auth.users on delete cascade not null,
  texto text not null check (char_length(trim(texto)) between 1 and 2000),
  creado_en timestamptz default now() not null,
  leido_en timestamptz,
  constraint social_messages_orden check (usuario_a < usuario_b)
);

create index if not exists social_messages_conv_idx
  on public.social_messages (usuario_a, usuario_b, creado_en);

alter table public.social_messages enable row level security;

-- ¿Puede esta persona escribir a la otra AHORA MISMO?
--
-- Se comprueba en cada mensaje y no solo al abrir la conversación,
-- porque las condiciones cambian mientras se habla: te pueden bloquear
-- o sancionar en mitad de un chat. Si eso solo se mirara al abrir, el
-- bloqueo no cortaría nada hasta que el otro cerrara la pantalla.
create or replace function public.puede_escribir(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    auth.uid() in (a, b)
    and exists (
      select 1 from public.social_matches m
      where m.usuario_a = a and m.usuario_b = b
    )
    and not exists (
      select 1 from public.social_blocks bl
      where (bl.blocker_id = a and bl.blocked_id = b)
         or (bl.blocker_id = b and bl.blocked_id = a)
    )
    and not exists (select 1 from public.sancion_activa(auth.uid()));
$$;

drop policy if exists "Leer mis conversaciones" on public.social_messages;
create policy "Leer mis conversaciones"
  on public.social_messages for select
  using (auth.uid() in (usuario_a, usuario_b));

drop policy if exists "Escribir en mis conversaciones" on public.social_messages;
create policy "Escribir en mis conversaciones"
  on public.social_messages for insert
  with check (
    auth.uid() = autor_id
    and public.puede_escribir(usuario_a, usuario_b)
  );

-- Nadie EDITA mensajes, y nadie los borra de verdad de la base de datos
-- — eso sigue igual. Lo que sí existe (más abajo, v194) es un borrado
-- controlado por RPC: el autor puede marcar su propio mensaje como
-- eliminado y que se enseñe como tal a los dos, pero el texto se queda
-- en la fila por si hace falta para una denuncia.

create or replace function public.marcar_conversacion_leida(otro uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.social_messages
     set leido_en = now()
   where usuario_a = least(auth.uid(), otro)
     and usuario_b = greatest(auth.uid(), otro)
     and autor_id = otro
     and leido_en is null;
$$;

-- Coincidencias con lo necesario para pintar la lista de chats: último
-- mensaje, cuándo, y cuántos sin leer.
--
-- Mismo motivo que arriba para el DROP: cambia lo que devuelve.
drop function if exists public.mis_coincidencias();
create or replace function public.mis_coincidencias()
returns table (
  user_id uuid,
  alias text,
  edad int,
  avatar_id text,
  desde timestamptz,
  ultimo_texto text,
  ultimo_en timestamptz,
  sin_leer int
)
language sql
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.alias,
    extract(year from age(p.birthdate))::int,
    p.avatar_id,
    m.created_at,
    (select ms.texto from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
      order by ms.creado_en desc limit 1),
    (select ms.creado_en from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
      order by ms.creado_en desc limit 1),
    (select count(*)::int from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and ms.autor_id <> auth.uid() and ms.leido_en is null)
  from public.social_matches m
  join public.social_profiles p
    on p.user_id = case when m.usuario_a = auth.uid() then m.usuario_b else m.usuario_a end
  where auth.uid() in (m.usuario_a, m.usuario_b)
    and p.is_active
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    )
  order by coalesce(
    (select ms.creado_en from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
      order by ms.creado_en desc limit 1),
    m.created_at
  ) desc;
$$;

do $$
begin
  alter publication supabase_realtime add table public.social_messages;
exception when duplicate_object then null;
end $$;

-- ============================================================
--  v163 — Chat: reacciones y respuestas
-- ============================================================

-- Responder a un mensaje concreto.
--
-- En una conversación de dos no parece imprescindible, pero sí lo es en
-- cuanto pasan unas horas: se contesta a algo dicho esta mañana y sin la
-- cita no se entiende a qué. Va como columna y no como tabla aparte
-- porque una respuesta es parte del mensaje, no una relación suya.
--
-- "on delete set null": si el mensaje citado desapareciera (solo puede
-- pasar al borrarse una cuenta entera), la respuesta se queda y
-- simplemente deja de citar. Perder la conversación por eso sería peor.
alter table public.social_messages
  add column if not exists responde_a uuid references public.social_messages on delete set null;

-- Reacciones.
--
-- La clave primaria es (mensaje, usuario, emoji): cada persona pone cada
-- emoji una vez como mucho, y volver a pulsarlo lo quita. Eso hace
-- imposible por construcción que alguien infle un contador pulsando
-- rápido, sin necesidad de comprobar nada en la app.
create table if not exists public.social_message_reactions (
  mensaje_id uuid references public.social_messages on delete cascade not null,
  usuario_id uuid references auth.users on delete cascade not null,
  emoji text not null check (char_length(emoji) between 1 and 8),
  creado_en timestamptz default now() not null,
  primary key (mensaje_id, usuario_id, emoji)
);

create index if not exists social_reactions_mensaje_idx
  on public.social_message_reactions (mensaje_id);

alter table public.social_message_reactions enable row level security;

-- Se ven las reacciones de los mensajes de tus conversaciones, y solo de
-- esos: la pertenencia se comprueba contra el mensaje, no se confía en
-- lo que mande el navegador.
drop policy if exists "Ver reacciones de mis conversaciones" on public.social_message_reactions;
create policy "Ver reacciones de mis conversaciones"
  on public.social_message_reactions for select
  using (
    exists (
      select 1 from public.social_messages m
      where m.id = mensaje_id
        and auth.uid() in (m.usuario_a, m.usuario_b)
    )
  );

-- Reaccionar exige poder escribir en esa conversación. Si te han
-- bloqueado, tampoco puedes seguir reaccionando a lo antiguo: reaccionar
-- es hablar.
drop policy if exists "Reaccionar en mis conversaciones" on public.social_message_reactions;
create policy "Reaccionar en mis conversaciones"
  on public.social_message_reactions for insert
  with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from public.social_messages m
      where m.id = mensaje_id
        and public.puede_escribir(m.usuario_a, m.usuario_b)
    )
  );

-- Quitar SOLO las tuyas.
drop policy if exists "Quitar mis reacciones" on public.social_message_reactions;
create policy "Quitar mis reacciones"
  on public.social_message_reactions for delete
  using (auth.uid() = usuario_id);

do $$
begin
  alter publication supabase_realtime add table public.social_message_reactions;
exception when duplicate_object then null;
end $$;

-- ============================================================
--  v164 — "Me da igual" pasa a llamarse "Cualquiera"
-- ============================================================
-- Solo cambia el texto, no el significado. "Me da igual" es una respuesta
-- de formulario y en la ficha se leía como desgana; en un perfil que
-- otras personas van a leer, eso dice algo que nadie quiso decir.
--
-- La app entiende los dos valores, así que este UPDATE no es obligatorio
-- para que funcione: solo deja los perfiles antiguos con la palabra
-- nueva.
-- PRIMERO la función, y luego el renombrado. Al revés habría un rato
-- —el que se tarde en ejecutar lo segundo— en el que los perfiles ya
-- dirían 'Cualquiera' y la función seguiría buscando 'Me da igual': a
-- todo el que hubiera elegido esa opción dejaría de salirle gente.
create or replace function public.encaja_busqueda(
  a_genero text, a_busca text[], b_genero text, b_busca text[]
)
returns boolean
language sql
immutable
as $$
  select
    -- Se aceptan las dos palabras: 'Me da igual' es como se guardaba
    -- hasta la v163 y 'Cualquiera' como se guarda ahora.
    ('Me da igual' = any(a_busca) or 'Cualquiera' = any(a_busca) or
      case b_genero
        when 'Mujer' then 'Mujeres' = any(a_busca)
        when 'Hombre' then 'Hombres' = any(a_busca)
        when 'No binario' then 'Personas no binarias' = any(a_busca)
        else true
      end)
    and
    ('Me da igual' = any(b_busca) or 'Cualquiera' = any(b_busca) or
      case a_genero
        when 'Mujer' then 'Mujeres' = any(b_busca)
        when 'Hombre' then 'Hombres' = any(b_busca)
        when 'No binario' then 'Personas no binarias' = any(b_busca)
        else true
      end);
$$;

update public.social_profiles
   set looking_for = array_replace(looking_for, 'Me da igual', 'Cualquiera')
 where 'Me da igual' = any(looking_for);

-- ============================================================
--  v165 — Notas de voz en el chat
-- ============================================================

-- Un cubo PRIVADO. Nada de público: un cubo público significa que
-- cualquiera con la dirección del archivo puede oír la conversación de
-- dos desconocidos, y las direcciones se filtran solas (historial,
-- registros del servidor, alguien que comparte un enlace sin pensar).
-- Al ser privado, para oír un audio hay que pedir un enlace firmado que
-- caduca, y solo lo consigue quien pertenece a esa conversación.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notas-voz',
  'notas-voz',
  false,
  3145728, -- 3 MB: dos minutos de voz comprimida caben de sobra
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Los archivos se guardan como {usuario_a}/{usuario_b}/{id}.webm, con la
-- pareja ordenada igual que en el resto de tablas. Así el permiso se
-- puede comprobar leyendo la propia ruta, sin consultar nada más.
drop policy if exists "Oir notas de mis conversaciones" on storage.objects;
create policy "Oir notas de mis conversaciones"
  on storage.objects for select
  using (
    bucket_id = 'notas-voz'
    and auth.uid()::text in (
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
    and exists (
      select 1 from public.social_matches m
      where m.usuario_a::text = (storage.foldername(name))[1]
        and m.usuario_b::text = (storage.foldername(name))[2]
    )
  );

-- Subir exige lo mismo que escribir: si te han bloqueado o estás
-- sancionado, tampoco puedes mandar audios.
drop policy if exists "Subir notas a mis conversaciones" on storage.objects;
create policy "Subir notas a mis conversaciones"
  on storage.objects for insert
  with check (
    bucket_id = 'notas-voz'
    and auth.uid()::text in (
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
    and public.puede_escribir(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

-- Un mensaje pasa a poder ser texto O voz.
alter table public.social_messages
  add column if not exists audio_ruta text,
  add column if not exists audio_ms int;

-- La restricción original exigía texto de 1 a 2000 caracteres, así que
-- una nota de voz (que no lleva texto) no cabía. Ahora se admite lo uno
-- o lo otro, pero nunca un mensaje vacío de las dos cosas.
alter table public.social_messages drop constraint if exists social_messages_texto_check;
alter table public.social_messages drop constraint if exists social_messages_contenido;
alter table public.social_messages add constraint social_messages_contenido check (
  (audio_ruta is not null and char_length(trim(texto)) = 0)
  or char_length(trim(texto)) between 1 and 2000
);

-- ============================================================
--  v194 — Borrar mensajes (para mí / para todos)
-- ============================================================
-- La regla de arriba sigue en pie: nadie edita ni borra un mensaje de
-- verdad, porque en una conversación entre desconocidos poder borrar lo
-- que acabas de decir es poder acosar y hacer desaparecer la prueba.
-- Esto añade DOS formas de "borrar" que no chocan con eso:
--
--  - Para mí: el mensaje deja de aparecer en TU pantalla. Para la otra
--    persona sigue ahí tal cual, y la fila no se toca — es un gusto de
--    cada uno, no un borrado real.
--  - Para todos: solo el propio autor, y solo de sus propios mensajes.
--    Se enseña como "Mensaje eliminado" a los dos, pero el texto NO se
--    borra de la fila: se marca con eliminado_en/eliminado_por y se
--    oculta desde la aplicación. Si hay una denuncia de por medio, el
--    contenido real sigue existiendo para quien tenga que revisarla.

alter table public.social_messages
  add column if not exists eliminado_en timestamptz,
  add column if not exists eliminado_por uuid references auth.users on delete set null;

-- RPC en vez de una política de UPDATE abierta a propósito: así solo se
-- puede tocar eliminado_en/eliminado_por, nunca el texto ni el audio de
-- un mensaje ya enviado, así alguien manipule la petición a mano.
create or replace function public.eliminar_mensaje_para_todos(objetivo uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.social_messages
     set eliminado_en = now(),
         eliminado_por = auth.uid()
   where id = objetivo
     and autor_id = auth.uid()
     and eliminado_en is null
  returning true;
$$;

-- "Para mí": una fila por persona que oculta un mensaje concreto de su
-- propia vista. Solo se puede ocultar un mensaje de una conversación en
-- la que de verdad se participa — comprobado en la propia política, no
-- solo confiando en lo que mande el cliente.
create table if not exists public.social_message_hidden (
  mensaje_id uuid references public.social_messages on delete cascade not null,
  usuario_id uuid references auth.users on delete cascade not null,
  oculto_en timestamptz default now() not null,
  primary key (mensaje_id, usuario_id)
);

alter table public.social_message_hidden enable row level security;

drop policy if exists "Ocultar mensajes de mis conversaciones" on public.social_message_hidden;
create policy "Ocultar mensajes de mis conversaciones"
  on public.social_message_hidden for insert
  with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from public.social_messages m
      where m.id = mensaje_id and auth.uid() in (m.usuario_a, m.usuario_b)
    )
  );

drop policy if exists "Ver lo que he ocultado" on public.social_message_hidden;
create policy "Ver lo que he ocultado"
  on public.social_message_hidden for select
  using (auth.uid() = usuario_id);

drop policy if exists "Deshacer ocultar" on public.social_message_hidden;
create policy "Deshacer ocultar"
  on public.social_message_hidden for delete
  using (auth.uid() = usuario_id);

do $$
begin
  alter publication supabase_realtime add table public.social_message_hidden;
exception when duplicate_object then null;
end $$;

-- mis_coincidencias() tiene que dejar de contar como "último mensaje"
-- uno que el propio usuario ha ocultado para sí, y decir cuándo el
-- último es una nota de voz o un "mensaje eliminado" — antes el cliente
-- lo adivinaba mirando si el texto venía vacío, y un mensaje eliminado
-- también llega con el texto vacío, así que se confundían.
drop function if exists public.mis_coincidencias();
create or replace function public.mis_coincidencias()
returns table (
  user_id uuid,
  alias text,
  edad int,
  avatar_id text,
  desde timestamptz,
  ultimo_texto text,
  ultimo_es_nota boolean,
  ultimo_eliminado boolean,
  ultimo_en timestamptz,
  sin_leer int
)
language sql
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.alias,
    extract(year from age(p.birthdate))::int,
    p.avatar_id,
    m.created_at,
    (select case when ms.eliminado_en is not null then null else ms.texto end
      from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and not exists (
          select 1 from public.social_message_hidden h
          where h.mensaje_id = ms.id and h.usuario_id = auth.uid()
        )
      order by ms.creado_en desc limit 1),
    (select ms.audio_ruta is not null from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and not exists (
          select 1 from public.social_message_hidden h
          where h.mensaje_id = ms.id and h.usuario_id = auth.uid()
        )
      order by ms.creado_en desc limit 1),
    (select ms.eliminado_en is not null from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and not exists (
          select 1 from public.social_message_hidden h
          where h.mensaje_id = ms.id and h.usuario_id = auth.uid()
        )
      order by ms.creado_en desc limit 1),
    (select ms.creado_en from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and not exists (
          select 1 from public.social_message_hidden h
          where h.mensaje_id = ms.id and h.usuario_id = auth.uid()
        )
      order by ms.creado_en desc limit 1),
    (select count(*)::int from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and ms.autor_id <> auth.uid() and ms.leido_en is null
        and not exists (
          select 1 from public.social_message_hidden h
          where h.mensaje_id = ms.id and h.usuario_id = auth.uid()
        )
    )
  from public.social_matches m
  join public.social_profiles p
    on p.user_id = case when m.usuario_a = auth.uid() then m.usuario_b else m.usuario_a end
  where auth.uid() in (m.usuario_a, m.usuario_b)
    and p.is_active
    and not exists (
      select 1 from public.social_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    )
  order by coalesce(
    (select ms.creado_en from public.social_messages ms
      where ms.usuario_a = m.usuario_a and ms.usuario_b = m.usuario_b
        and not exists (
          select 1 from public.social_message_hidden h
          where h.mensaje_id = ms.id and h.usuario_id = auth.uid()
        )
      order by ms.creado_en desc limit 1),
    m.created_at
  ) desc;
$$;

-- ============================================================
--  v196 — Panel de moderación para leer las denuncias
-- ============================================================
-- Hasta ahora una denuncia se podía crear pero nadie la leía desde la
-- app: la única manera de verla era entrar a mano en Supabase. Esto
-- completa el círculo: quien administra puede leerlas, ver la
-- conversación de por medio (si la hay), sancionar desde ahí mismo, y
-- dejar la denuncia como resuelta o descartada.

alter table public.social_reports
  add column if not exists resolucion text,
  add column if not exists resuelto_por uuid references auth.users on delete set null,
  add column if not exists resuelto_en timestamptz;

-- El estado ya existía ('pendiente' por defecto). Se cierra el
-- vocabulario para que el panel no tenga que adivinar qué valores puede
-- llegar a ver.
alter table public.social_reports drop constraint if exists social_reports_status_check;
alter table public.social_reports add constraint social_reports_status_check
  check (status in ('pendiente', 'resuelta', 'descartada'));

-- Leer y resolver denuncias es cosa de administración. La política de
-- inserción (arriba del todo, v93) se queda igual: cualquiera crea las
-- suyas, pero nadie las lee salvo quien modera.
drop policy if exists "Los administradores leen las denuncias" on public.social_reports;
create policy "Los administradores leen las denuncias"
  on public.social_reports for select
  using (public.es_admin());

drop policy if exists "Los administradores resuelven denuncias" on public.social_reports;
create policy "Los administradores resuelven denuncias"
  on public.social_reports for update
  using (public.es_admin())
  with check (public.es_admin());

-- La ficha del chat ya avisa de que "lo revisa una persona del equipo
-- de moderación, que podrá leer esta conversación" (ver ChatConversacion,
-- botón Denunciar). Sin esta política esa frase era falsa: denunciar no
-- daba acceso a nada. Es deliberadamente amplia (cualquier administrador
-- puede leer cualquier conversación, no solo las denunciadas) porque en
-- un proyecto con un único administrador de confianza, acotarlo más no
-- añade seguridad real y sí mucha complejidad.
drop policy if exists "Los administradores leen conversaciones denunciadas" on public.social_messages;
create policy "Los administradores leen conversaciones denunciadas"
  on public.social_messages for select
  using (public.es_admin());

-- Lo mismo para las notas de voz citadas en una denuncia: sin esto, la
-- fila del mensaje se vería pero el audio no se podría reproducir.
drop policy if exists "Los administradores oyen notas de conversaciones denunciadas" on storage.objects;
create policy "Los administradores oyen notas de conversaciones denunciadas"
  on storage.objects for select
  using (bucket_id = 'notas-voz' and public.es_admin());

-- Lista de denuncias con el alias de quien denuncia y de quien es
-- denunciado ya resueltos, y si existe una conversación entre los dos
-- que se pueda abrir. Mismo patrón que listar_miembros: corta en seco
-- si quien pregunta no es administrador.
create or replace function public.listar_denuncias(
  incluir_resueltas boolean default false,
  limite int default 100
)
returns table (
  id uuid,
  created_at timestamptz,
  reporter_id uuid,
  reporter_alias text,
  reported_id uuid,
  reported_alias text,
  reason text,
  details text,
  status text,
  resolucion text,
  resuelto_en timestamptz,
  hay_conversacion boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el equipo de moderación puede consultar las denuncias'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    r.id,
    r.created_at,
    r.reporter_id,
    rp.alias,
    r.reported_id,
    dp.alias,
    r.reason,
    r.details,
    r.status,
    r.resolucion,
    r.resuelto_en,
    r.reporter_id is not null and exists (
      select 1 from public.social_matches m
      where m.usuario_a = least(r.reporter_id, r.reported_id)
        and m.usuario_b = greatest(r.reporter_id, r.reported_id)
    )
  from public.social_reports r
  left join public.social_profiles rp on rp.user_id = r.reporter_id
  left join public.social_profiles dp on dp.user_id = r.reported_id
  where incluir_resueltas or r.status = 'pendiente'
  order by (r.status = 'pendiente') desc, r.created_at desc
  limit greatest(1, least(coalesce(limite, 100), 200));
end;
$$;

-- Marca una denuncia como resuelta, descartada, o de vuelta a pendiente
-- (por si se cierra por error). Va por RPC y no por UPDATE directo desde
-- el cliente para que resuelto_por y resuelto_en no se puedan falsear.
create or replace function public.resolver_denuncia(
  denuncia_id uuid,
  nuevo_estado text,
  resolucion_texto text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el equipo de moderación puede resolver denuncias'
      using errcode = 'insufficient_privilege';
  end if;
  if nuevo_estado not in ('resuelta', 'descartada', 'pendiente') then
    raise exception 'Estado no reconocido: %', nuevo_estado;
  end if;

  update public.social_reports
     set status = nuevo_estado,
         resolucion = nullif(trim(coalesce(resolucion_texto, '')), ''),
         resuelto_por = auth.uid(),
         resuelto_en = case when nuevo_estado = 'pendiente' then null else now() end
   where id = denuncia_id;

  return found;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.social_reports;
exception when duplicate_object then null;
end $$;
