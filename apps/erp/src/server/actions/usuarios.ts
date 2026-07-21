'use server';

import { z } from 'zod';
import { createServiceClient } from '@happy/db/service';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Administración de usuarios y roles. SOLO accesible por rol 'gerente'.
 * Las operaciones usan SERVICE_ROLE_KEY porque tocan auth.users (admin API).
 */

const ROLES_VALIDOS = [
  'gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador','cliente',
] as const;
type Rol = (typeof ROLES_VALIDOS)[number];

async function ensureGerente() {
  const { sb, userId } = await requireUser();
  const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', userId);
  const esGerente = (roles ?? []).some((r) => r.rol === 'gerente');
  if (!esGerente) throw new Error('Solo el gerente puede administrar usuarios');
}

// ============================================================================
// CREAR USUARIO
// ============================================================================
const crearSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  nombre_completo: z.string().min(2, 'Nombre requerido'),
  dni: z.string().optional().or(z.literal('')),
  cargo: z.string().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  roles: z.array(z.enum(ROLES_VALIDOS)).min(1, 'Asignar al menos un rol'),
});

export async function crearUsuario(
  input: z.input<typeof crearSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await ensureGerente();
    const data = crearSchema.parse(input);
    const admin = createServiceClient();

    // 1) Crear en auth.users con email confirmado (sin necesidad de verificación)
    const { data: created, error: errAuth } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nombre_completo: data.nombre_completo },
    });
    if (errAuth) {
      // Mensaje claro para el caso más común: el email ya tiene cuenta
      if (/already|registered|exists/i.test(errAuth.message)) {
        throw new Error(`Ya existe un usuario con el email ${data.email}. Búsquelo en la lista (borre el filtro de búsqueda) y edítele los roles ahí.`);
      }
      throw new Error(`Auth: ${errAuth.message}`);
    }
    if (!created.user) throw new Error('No se pudo crear el usuario');
    const userId = created.user.id;

    // 2) Perfil — OJO: el trigger on_auth_user_created (tg_crear_perfil) YA
    //    creó la fila de perfiles y le asignó rol 'cliente' por defecto.
    //    Antes acá se hacía INSERT y reventaba con "perfiles_pkey duplicate"
    //    (reporte del cliente 20/07/2026) — debe ser UPSERT para completar
    //    los datos (dni, cargo, teléfono) sobre la fila del trigger.
    const { error: errPerfil } = await admin.from('perfiles').upsert(
      {
        id: userId,
        nombre_completo: data.nombre_completo,
        dni: data.dni || null,
        cargo: data.cargo || null,
        telefono: data.telefono || null,
        activo: true,
      },
      { onConflict: 'id' },
    );
    if (errPerfil) {
      // Rollback auth si el perfil falla
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Perfil: ${errPerfil.message}`);
    }

    // 3) Roles: reemplazar el 'cliente' default del trigger por los elegidos
    const { error: errDel } = await admin.from('usuarios_roles').delete().eq('usuario_id', userId);
    if (errDel) {
      await admin.from('perfiles').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Roles: ${errDel.message}`);
    }
    const rolesInsert = data.roles.map((r) => ({ usuario_id: userId, rol: r }));
    const { error: errRoles } = await admin.from('usuarios_roles').insert(rolesInsert);
    if (errRoles) {
      await admin.from('perfiles').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Roles: ${errRoles.message}`);
    }

    return { id: userId };
  }).then((r) => {
    if (r.ok) void bumpPaths('/usuarios');
    return r;
  });
}

// ============================================================================
// ACTUALIZAR PERFIL
// ============================================================================
const actualizarPerfilSchema = z.object({
  nombre_completo: z.string().min(2),
  dni: z.string().optional().or(z.literal('')),
  cargo: z.string().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
});

export async function actualizarPerfilUsuario(
  usuarioId: string,
  input: z.input<typeof actualizarPerfilSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    await ensureGerente();
    const data = actualizarPerfilSchema.parse(input);
    const admin = createServiceClient();
    const { error } = await admin
      .from('perfiles')
      .update({
        nombre_completo: data.nombre_completo,
        dni: data.dni || null,
        cargo: data.cargo || null,
        telefono: data.telefono || null,
      })
      .eq('id', usuarioId);
    if (error) throw new Error(error.message);
    return null;
  }).then((r) => {
    if (r.ok) void bumpPaths('/usuarios');
    return r;
  });
}

// ============================================================================
// ACTUALIZAR ROLES
// ============================================================================
export async function actualizarRolesUsuario(
  usuarioId: string,
  roles: Rol[],
): Promise<ActionResult> {
  return runAction(async () => {
    await ensureGerente();
    if (roles.length === 0) throw new Error('Asigne al menos un rol');
    const valid = roles.every((r) => ROLES_VALIDOS.includes(r));
    if (!valid) throw new Error('Rol inválido');

    const admin = createServiceClient();
    // Borrar los existentes + insertar nuevos en una operación lógica
    const { error: errDel } = await admin.from('usuarios_roles').delete().eq('usuario_id', usuarioId);
    if (errDel) throw new Error(`Limpiar roles: ${errDel.message}`);
    const rolesInsert = roles.map((r) => ({ usuario_id: usuarioId, rol: r }));
    const { error: errIns } = await admin.from('usuarios_roles').insert(rolesInsert);
    if (errIns) throw new Error(`Asignar roles: ${errIns.message}`);
    return null;
  }).then((r) => {
    if (r.ok) void bumpPaths('/usuarios');
    return r;
  });
}

// ============================================================================
// CAMBIAR PASSWORD
// ============================================================================
const cambiarPassSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

export async function cambiarPasswordUsuario(
  usuarioId: string,
  input: z.input<typeof cambiarPassSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    await ensureGerente();
    const data = cambiarPassSchema.parse(input);
    const admin = createServiceClient();
    const { error } = await admin.auth.admin.updateUserById(usuarioId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return null;
  });
}

// ============================================================================
// DESACTIVAR / REACTIVAR (soft)
// ============================================================================
export async function cambiarEstadoUsuario(
  usuarioId: string,
  activo: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    await ensureGerente();
    const { userId: actor } = await requireUser();
    if (actor === usuarioId && !activo) {
      throw new Error('No puede desactivar su propia cuenta');
    }
    const admin = createServiceClient();
    const { error } = await admin.from('perfiles').update({ activo }).eq('id', usuarioId);
    if (error) throw new Error(error.message);
    // También invalidar/restaurar el login bloqueando con admin.updateUserById usando ban_duration
    // (Supabase Auth no tiene "desactivar" — usamos perfiles.activo + un check en login)
    return null;
  }).then((r) => {
    if (r.ok) void bumpPaths('/usuarios');
    return r;
  });
}

// ============================================================================
// HELPERS PARA LA UI
// ============================================================================
export type UsuarioRow = {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  dni: string | null;
  cargo: string | null;
  telefono: string | null;
  activo: boolean;
  ultimo_login: string | null;
  roles: string[];
};

export async function listarUsuariosAdmin(): Promise<ActionResult<UsuarioRow[]>> {
  return runAction(async () => {
    await ensureGerente();
    const admin = createServiceClient();
    const [{ data: perfiles }, { data: rolesRows }, { data: authData }] = await Promise.all([
      admin
        .from('perfiles')
        .select('id, nombre_completo, dni, cargo, telefono, activo, ultimo_login')
        .order('nombre_completo'),
      admin.from('usuarios_roles').select('usuario_id, rol'),
      admin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const rolesPorUsuario = new Map<string, string[]>();
    for (const r of (rolesRows ?? []) as { usuario_id: string; rol: string }[]) {
      const arr = rolesPorUsuario.get(r.usuario_id) ?? [];
      arr.push(r.rol);
      rolesPorUsuario.set(r.usuario_id, arr);
    }
    const emailPorId = new Map<string, string>();
    for (const u of authData?.users ?? []) {
      if (u.email) emailPorId.set(u.id, u.email);
    }
    const rows: UsuarioRow[] = (perfiles ?? []).map((p) => ({
      id: p.id,
      email: emailPorId.get(p.id) ?? null,
      nombre_completo: p.nombre_completo,
      dni: p.dni,
      cargo: p.cargo,
      telefono: (p as { telefono: string | null }).telefono ?? null,
      activo: p.activo,
      ultimo_login: p.ultimo_login,
      roles: rolesPorUsuario.get(p.id) ?? [],
    }));
    return rows;
  });
}
