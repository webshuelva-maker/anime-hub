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
