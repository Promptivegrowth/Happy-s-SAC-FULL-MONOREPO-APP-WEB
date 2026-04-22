/**
 * Seed: usuarios demo HAPPY SAC.
 * Crea 1 usuario por cada rol del sistema, listos para login en el ERP/POS.
 *
 * ⚠️ SOLO PARA DESARROLLO/PRUEBAS — borrar/cambiar contraseñas antes de prod.
 *
 * Ejecutar:  pnpm tsx supabase/seed/03-usuarios-demo.ts
 */

import { sb, log, error } from './_env';
import type { Rol } from '../../packages/db/src/enums';

const PWD = 'Happy2026!';

type UserDemo = {
  email: string;
  nombre: string;
  cargo: string;
  rol: Rol;
  almacen?: 'ALM-SB' | 'TDA-HU' | 'TDA-LQ' | 'ALM-MP';
  caja?: 'CAJA-HU-01' | 'CAJA-LQ-01';
};

const DEMOS: UserDemo[] = [
  { email: 'gerente@happys.pe',     nombre: 'Gerente Demo',         cargo: 'Gerente General',     rol: 'gerente' },
  { email: 'jefe@happys.pe',        nombre: 'Jefe Producción Demo', cargo: 'Jefe de Producción',  rol: 'jefe_produccion', almacen: 'ALM-SB' },
  { email: 'operario@happys.pe',    nombre: 'Operario Demo',        cargo: 'Operario',            rol: 'operario',         almacen: 'ALM-SB' },
  { email: 'almacenero@happys.pe',  nombre: 'Almacenero Demo',      cargo: 'Almacenero',          rol: 'almacenero',       almacen: 'ALM-SB' },
  { email: 'cajero.huallaga@happys.pe', nombre: 'Cajero Huallaga',  cargo: 'Cajero',              rol: 'cajero',           almacen: 'TDA-HU', caja: 'CAJA-HU-01' },
  { email: 'cajero.laquinta@happys.pe', nombre: 'Cajero La Quinta', cargo: 'Cajero',              rol: 'cajero',           almacen: 'TDA-LQ', caja: 'CAJA-LQ-01' },
  { email: 'vendedor@happys.pe',    nombre: 'Vendedor B2B Demo',    cargo: 'Vendedor Mayorista',  rol: 'vendedor_b2b' },
  { email: 'contador@happys.pe',    nombre: 'Contador Demo',        cargo: 'Contador',            rol: 'contador' },
];

async function main() {
  log('==> Creando usuarios demo');

  const { data: almacenes } = await sb.from('almacenes').select('id, codigo');
  const almById = new Map((almacenes ?? []).map((a) => [a.codigo, a.id]));

  const { data: cajas } = await sb.from('cajas').select('id, codigo');
  const cajaById = new Map((cajas ?? []).map((c) => [c.codigo, c.id]));

  for (const u of DEMOS) {
    // 1. Buscar si ya existe (por email)
    const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users.find((x) => x.email === u.email);

    let userId: string;
    if (found) {
      userId = found.id;
      log(`  ↺ existe ${u.email}, actualizando contraseña`);
      await sb.auth.admin.updateUserById(userId, { password: PWD, email_confirm: true });
    } else {
      const { data, error: err } = await sb.auth.admin.createUser({
        email: u.email,
        password: PWD,
        email_confirm: true,
        user_metadata: { nombre_completo: u.nombre },
      });
      if (err || !data.user) { error(`  ✗ ${u.email}:`, err?.message); continue; }
      userId = data.user.id;
      log(`  + creado ${u.email}`);
    }

    // 2. Asegurar perfil (el trigger lo crea automáticamente, pero por idempotencia upsert)
    await sb.from('perfiles').upsert({
      id: userId,
      nombre_completo: u.nombre,
      cargo: u.cargo,
      almacen_default: u.almacen ? almById.get(u.almacen) ?? null : null,
      caja_default: u.caja ? cajaById.get(u.caja) ?? null : null,
      activo: true,
    }, { onConflict: 'id' });

    // 3. Asegurar rol asignado
    await sb.from('usuarios_roles').upsert(
      { usuario_id: userId, rol: u.rol },
      { onConflict: 'usuario_id,rol' },
    );

    // 4. Asignar almacén si corresponde
    if (u.almacen) {
      const almacenId = almById.get(u.almacen);
      if (almacenId) {
        await sb.from('usuarios_almacenes').upsert(
          { usuario_id: userId, almacen_id: almacenId },
          { onConflict: 'usuario_id,almacen_id' },
        );
      }
    }
  }

  log('\n✅ Usuarios demo listos (contraseña común: Happy2026!)');
  log('   Lista:');
  for (const u of DEMOS) {
    log(`   • ${u.email.padEnd(35)} → ${u.rol.padEnd(15)} ${u.almacen ?? ''} ${u.caja ? '· ' + u.caja : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
