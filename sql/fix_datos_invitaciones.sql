-- ============================================================
-- FIX DE DATOS (UNA SOLA VEZ) - vincular a las 2 personas a la
-- empresa de David (dmoya@casadeleifs.cl).
--
-- Correr DESPUES de sql/40_fix_vinculo_invitaciones.sql
-- (la 40 ya corrigio el acento del correo de ferreteria).
--
-- Los IDs vienen de: /api/miembros (id de la invitacion) y de
-- Authentication > Users (uid de la cuenta).
-- El "not exists" evita violar el indice unico uq_miembro_activo:
-- si la persona ya estuviera activa en otra empresa, la fila no se
-- toca y lo veras en la verificacion (0 filas afectadas).
-- ============================================================

-- 1) avaldivia@casadeleifs.cl
update miembros
   set member_user_id = 'b4f2bf3d-73cd-4597-a2b2-3cbb63faafcd',
       estado         = 'activo'
 where id = 'eac7f925-bf97-4505-8a41-ec56cdb0b196'
   and not exists (select 1 from miembros x
                   where x.member_user_id = 'b4f2bf3d-73cd-4597-a2b2-3cbb63faafcd'
                     and x.estado = 'activo');

-- 2) ferreterianuevaholanda@casadeleifs.cl
update miembros
   set member_user_id = 'aedb3ef9-14c1-41f9-85a3-2741cd6a5919',
       estado         = 'activo'
 where id = 'f7ed1645-4f49-4212-96e8-a784779ecc36'
   and not exists (select 1 from miembros x
                   where x.member_user_id = 'aedb3ef9-14c1-41f9-85a3-2741cd6a5919'
                     and x.estado = 'activo');

-- 3) Verificacion (ambas deben quedar estado=activo y con cuenta_vinculada)
select m.member_email, m.estado, vinc.email as cuenta_vinculada
  from miembros m
  left join auth.users vinc on vinc.id = m.member_user_id
 where m.id in ('eac7f925-bf97-4505-8a41-ec56cdb0b196',
                'f7ed1645-4f49-4212-96e8-a784779ecc36');
