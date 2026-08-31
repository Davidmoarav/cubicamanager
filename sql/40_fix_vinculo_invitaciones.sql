-- ============================================================
-- 40 · ARREGLO DE VINCULO DE INVITACIONES
--
-- Sintoma: un usuario invitado, al registrarse, NO queda vinculado a
-- la empresa que lo invito y cae en su propio perfil vacio.
--
-- Causas cubiertas:
--   1. El correo invitado traia acentos/espacios y no calzaba con el
--      correo real (aceptar_invitacion comparaba con lower(), que no
--      quita acentos).  -> normalizacion (quita acentos + trim).
--   2. aceptar_invitacion podia intentar activar varias invitaciones a
--      la vez y chocar con el indice unico uq_miembro_activo (fallando
--      en silencio).  -> ahora activa UNA sola, determinista.
--
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run.
-- ============================================================

-- 1) Helper de normalizacion de correo (sin extensiones; IMMUTABLE)
create or replace function norm_email(e text) returns text as $$
  select translate(lower(btrim(coalesce(e,''))),
                   'áàäâãéèëêíìïîóòöôõúùüûñç',
                   'aaaaaeeeeiiiiooooouuuunc');
$$ language sql immutable;

-- 2) Trigger: guarda el correo de invitacion siempre normalizado
create or replace function normalizar_member_email() returns trigger as $$
begin
  new.member_email := norm_email(new.member_email);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_norm_member_email on miembros;
create trigger trg_norm_member_email
  before insert or update of member_email on miembros
  for each row execute function normalizar_member_email();

-- 3) Normaliza las invitaciones ya existentes (arregla acentos previos)
update miembros
   set member_email = norm_email(member_email)
 where member_email is distinct from norm_email(member_email);

-- 4) aceptar_invitacion: determinista, con correo normalizado y sin
--    chocar con el indice unico. Requiere correo confirmado.
create or replace function aceptar_invitacion() returns void as $$
declare
  v_email     text;
  v_confirmed timestamptz;
  v_invite    uuid;
begin
  select norm_email(email), email_confirmed_at
    into v_email, v_confirmed
    from auth.users where id = auth.uid();

  if v_email is null or v_email = '' or v_confirmed is null then
    return;                       -- sin correo confirmado: no se activa
  end if;

  if exists (select 1 from miembros
              where member_user_id = auth.uid() and estado = 'activo') then
    return;                       -- ya es miembro activo de una organizacion
  end if;

  select id into v_invite
    from miembros
   where estado = 'pendiente'
     and member_user_id is null
     and norm_email(member_email) = v_email
   order by created_at asc
   limit 1;                       -- UNA sola: evita choque con uq_miembro_activo

  if v_invite is not null then
    update miembros
       set member_user_id = auth.uid(), estado = 'activo'
     where id = v_invite;
  end if;
end;
$$ language plpgsql security definer;

-- Verificacion rapida:
-- select member_email, estado, member_user_id from miembros order by created_at;
