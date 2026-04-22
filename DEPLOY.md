# Deploy — HAPPY SAC

> **Estado actual:** Schema y datos ya cargados en Supabase (`trkokphwmkedhxwjriod`).
> Quedan los pasos de Vercel + Edge Functions + dominios + webhooks.

---

## 0. Pre-requisitos

- Node 20.10+ (verificar: `node -v`)
- pnpm 9.12+ — instalar globalmente: `npm install -g pnpm@9.12.0`
- Supabase CLI — vendrá vía `npx supabase` en este repo (no requiere instalación global)
- Cuenta Vercel (https://vercel.com — registro gratis)
- ✅ Cuenta apis.net.pe (Promptive) — token ya configurado en `.env`
- (Producción) cuenta Nubefact (https://nubefact.com) o equivalente PSE para SUNAT
- (Producción) cuenta Culqi (https://culqi.com) o Izipay para tarjetas

---

## 1. Estado de Supabase

✅ **Hecho** (proyecto `trkokphwmkedhxwjriod`, Postgres 17, Lima):

| Item | Estado |
| --- | --- |
| 25 migraciones aplicadas (~60 tablas, RLS, funciones, triggers) | ✅ |
| Ubigeo INEI (1.874 distritos) | ✅ |
| Datos base (empresa, almacenes, cajas, series, áreas, unidades, colores, defectos, categorías, campañas) | ✅ |
| Importación Excels: 26 proveedores, 15 talleres, 624 materiales, 289 productos, 1.648 SKUs, 1.785 líneas BOM, 134 costos confección | ✅ |
| Stock inicial: 1.417 movimientos kardex en 3 almacenes | ✅ |
| 8 usuarios demo (uno por rol) | ✅ |

---

## 2. Usuarios demo (modo pruebas)

Password común: `Happy2026!`. Aparecen como botones clicables debajo del login en ERP y POS.

| Email | Rol | Acceso | Asignaciones |
| --- | --- | --- | --- |
| `gerente@happys.pe`         | `gerente`         | ERP + POS | acceso total |
| `jefe@happys.pe`            | `jefe_produccion` | ERP       | ALM-SB |
| `operario@happys.pe`        | `operario`        | ERP       | ALM-SB |
| `almacenero@happys.pe`      | `almacenero`      | ERP       | ALM-SB |
| `cajero.huallaga@happys.pe` | `cajero`          | POS       | TDA-HU · CAJA-HU-01 |
| `cajero.laquinta@happys.pe` | `cajero`          | POS       | TDA-LQ · CAJA-LQ-01 |
| `vendedor@happys.pe`        | `vendedor_b2b`    | ERP       | — |
| `contador@happys.pe`        | `contador`        | ERP       | — |

⚠️ Recreables con: `pnpm tsx supabase/seed/03-usuarios-demo.ts` (es idempotente, solo resetea passwords).

⚠️ Antes de producción real:
1. Cambiar todas las contraseñas
2. Borrar/desactivar los usuarios demo no necesarios
3. Quitar la sección "Cuentas demo" en `apps/erp/src/app/(auth)/login/login-form.tsx` y `apps/pos/src/app/login/page.tsx` (marcadas con `=== DEMO USERS — REMOVER ANTES DE PRODUCCIÓN ===`)

---

## 3. Variables de entorno

### Local (`.env` en la raíz)

Ya está creado con todas las credenciales actuales. Ver `.env.example` como plantilla.

### Vercel — variables por proyecto

Ir a Vercel → Project → Settings → Environment Variables. Agregar las siguientes, marcando **Production / Preview / Development** según corresponda.

#### App `erp` (https://erp.disfraceshappys.com)

```
NEXT_PUBLIC_SUPABASE_URL=https://trkokphwmkedhxwjriod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<copiar de Supabase Dashboard → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<copiar de Supabase Dashboard → Settings → API>
APIS_NET_PE_TOKEN=sk_14887.Q5HUEN1YgB3ElfmgaMtDCYF88y2aIMrh
WHATSAPP_NUMBER=51916856842
NEXT_PUBLIC_ERP_URL=https://erp.disfraceshappys.com
NEXT_PUBLIC_WEB_URL=https://disfraceshappys.com
NEXT_PUBLIC_POS_URL=https://pos.disfraceshappys.com
```

#### App `web` (https://disfraceshappys.com)

```
NEXT_PUBLIC_SUPABASE_URL=https://trkokphwmkedhxwjriod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<idem>
SUPABASE_SERVICE_ROLE_KEY=<idem — necesario para crear pedidos sin RLS>
APIS_NET_PE_TOKEN=sk_14887.Q5HUEN1YgB3ElfmgaMtDCYF88y2aIMrh
WHATSAPP_NUMBER=51916856842
NEXT_PUBLIC_ERP_URL=https://erp.disfraceshappys.com
NEXT_PUBLIC_WEB_URL=https://disfraceshappys.com
NEXT_PUBLIC_POS_URL=https://pos.disfraceshappys.com
NEXT_PUBLIC_CULQI_PUBLIC_KEY=<cuando contratemos Culqi>
CULQI_SECRET_KEY=<cuando contratemos Culqi — solo server>
```

#### App `pos` (https://pos.disfraceshappys.com)

```
NEXT_PUBLIC_SUPABASE_URL=https://trkokphwmkedhxwjriod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<idem>
NEXT_PUBLIC_POS_URL=https://pos.disfraceshappys.com
NEXT_PUBLIC_ERP_URL=https://erp.disfraceshappys.com
WHATSAPP_NUMBER=51916856842
```

⚠️ El POS **no recibe** `SUPABASE_SERVICE_ROLE_KEY` — todas las operaciones pasan por RLS y el token del cajero.

⚠️ **Rotar `anon` y `service_role`** en Supabase Dashboard antes de exponer públicamente cualquier app — las claves originales se compartieron en chat.

---

## 4. (Solo si se hace deploy nuevo a otro proyecto Supabase) Aplicar migraciones

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxxxx
npx supabase link --project-ref <project-ref>
npx supabase db push --include-all --yes
```

Migraciones ya aplicadas al proyecto actual; no es necesario repetir.

---

## 5. Cargar datos iniciales (idempotente)

Si se necesita recargar (proyecto Supabase nuevo):

```bash
# 1. Instalar dependencias del seed
cd supabase/seed
npm install

# 2. Ejecutar en orden (cada uno es idempotente)
node_modules/.bin/tsx 01-datos-base.ts
node_modules/.bin/tsx 02-ubigeo.ts          # requiere supabase/seed/ubigeo-peru.json
node_modules/.bin/tsx import-excel.ts       # requiere /documentos excels/
node_modules/.bin/tsx 03-usuarios-demo.ts   # crea/reset usuarios demo
```

El dataset ubigeo-peru.json se descarga así:

```bash
# Bajar el JSON INEI desde el repo público de ernestorivero
curl -sL "https://raw.githubusercontent.com/ernestorivero/Ubigeo-Peru/master/json/ubigeo_peru_2016_distritos.json" -o /tmp/dist.json
curl -sL "https://raw.githubusercontent.com/ernestorivero/Ubigeo-Peru/master/json/ubigeo_peru_2016_provincias.json" -o /tmp/prov.json
curl -sL "https://raw.githubusercontent.com/ernestorivero/Ubigeo-Peru/master/json/ubigeo_peru_2016_departamentos.json" -o /tmp/dep.json

# Y consolidar al formato que espera el seed (codigo/departamento/provincia/distrito):
python -c "
import json
deps = json.load(open('/tmp/dep.json',  encoding='utf-8'))
provs= json.load(open('/tmp/prov.json', encoding='utf-8'))
dists= json.load(open('/tmp/dist.json', encoding='utf-8'))
dep_by  = {d['id']: d['name'].upper() for d in deps}
prov_by = {p['id']: p['name'].upper() for p in provs}
out = [{'codigo': d['id'], 'departamento': dep_by[d['department_id']],
        'provincia': prov_by[d['province_id']], 'distrito': d['name'].upper()} for d in dists]
json.dump(out, open('supabase/seed/ubigeo-peru.json','w', encoding='utf-8'), ensure_ascii=False)
print(len(out),'distritos')"
```

---

## 6. Crear proyectos Vercel (3 apps)

Para cada una de las 3 apps (`erp`, `web`, `pos`):

1. https://vercel.com → **New Project** → Import del repo `Promptivegrowth/Happy-s-SAC-FULL-MONOREPO-APP-WEB`
2. **Project Name**: `happy-erp` / `happy-web` / `happy-pos`
3. **Root Directory**: `apps/erp` (o `apps/web` o `apps/pos`)
4. **Framework Preset**: Next.js (autodetectado)
5. **Build / Install Command**: dejar el default — el `vercel.json` de cada app fuerza `pnpm turbo run build --filter=...`
6. **Environment Variables**: pegar las del paso 3 según la app
7. **Deploy** → la primera build tarda ~3-4 minutos

---

## 7. Conectar dominios

En tu DNS provider (Cloudflare/Namecheap/etc.):

| Subdominio | Tipo | Apunta a |
| --- | --- | --- |
| `disfraceshappys.com` | A / CNAME | proyecto Vercel `happy-web` |
| `www.disfraceshappys.com` | CNAME | `disfraceshappys.com` |
| `erp.disfraceshappys.com` | CNAME | proyecto Vercel `happy-erp` |
| `pos.disfraceshappys.com` | CNAME | proyecto Vercel `happy-pos` |

Vercel te indica los CNAME exactos en Project → Settings → Domains.

Después de configurar dominios, en Supabase ir a:
- **Authentication → URL Configuration → Site URL**: `https://disfraceshappys.com`
- **Authentication → URL Configuration → Additional Redirect URLs**:
  - `https://disfraceshappys.com/auth/callback`
  - `https://erp.disfraceshappys.com/auth/callback`
  - `https://pos.disfraceshappys.com/auth/callback`

---

## 8. Edge Functions Supabase

```bash
# Login (una vez)
export SUPABASE_ACCESS_TOKEN=sbp_xxxxx
npx supabase link --project-ref trkokphwmkedhxwjriod

# Deploy de las 4 funciones
npx supabase functions deploy sunat-consulta
npx supabase functions deploy culqi-webhook
npx supabase functions deploy emitir-comprobante
npx supabase functions deploy notificar-stock

# Secrets que las funciones consumen
npx supabase secrets set APIS_NET_PE_TOKEN=sk_14887.Q5HUEN1YgB3ElfmgaMtDCYF88y2aIMrh
npx supabase secrets set NUBEFACT_TOKEN=<cuando contratemos Nubefact>
npx supabase secrets set NUBEFACT_RUC=<el RUC de HAPPY SAC>
npx supabase secrets set CULQI_WEBHOOK_SECRET=<HMAC de Culqi>
```

URLs públicas resultantes:
- `https://trkokphwmkedhxwjriod.supabase.co/functions/v1/sunat-consulta`
- `https://trkokphwmkedhxwjriod.supabase.co/functions/v1/culqi-webhook`
- `https://trkokphwmkedhxwjriod.supabase.co/functions/v1/emitir-comprobante`
- `https://trkokphwmkedhxwjriod.supabase.co/functions/v1/notificar-stock`

### Cron job de alertas de stock

En Supabase Dashboard → **Database → Cron Jobs** (o vía SQL):

```sql
select cron.schedule(
  'alertas-stock-bajo',
  '0 9 * * *',          -- todos los días 9am
  $$
    select net.http_post(
      url := 'https://trkokphwmkedhxwjriod.supabase.co/functions/v1/notificar-stock',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      )
    );
  $$
);
```

---

## 9. Webhooks externos

| Servicio | Webhook URL | Configurar en |
| --- | --- | --- |
| Culqi | `https://trkokphwmkedhxwjriod.supabase.co/functions/v1/culqi-webhook` | Culqi → Tu cuenta → Webhooks |
| Nubefact (opcional) | `https://erp.disfraceshappys.com/api/sunat/callback` | Nubefact → Configuración (acepta CDR) |

---

## 10. CI/CD GitHub Actions

Workflows ya configurados en `.github/workflows/`:

- `ci.yml`: corre lint + typecheck en cada PR a `main`. Necesita secrets:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- `db-migrate.yml`: aplica migraciones al hacer push a `main` que toca `supabase/migrations/**`. Necesita secrets:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF` = `trkokphwmkedhxwjriod`
  - `SUPABASE_DB_PASSWORD` (la del proyecto Supabase, en Settings → Database)

Configurarlos en: GitHub repo → Settings → Secrets and variables → Actions.

---

## 11. Verificar smoke test

Después del deploy completo:

1. **Login ERP** con `gerente@happys.pe / Happy2026!` → debería ver el dashboard con KPIs y poder navegar todos los módulos
2. **Productos** → debe listar 289 productos importados
3. **Inventario** → debe listar 1.417 stock_actual
4. **Login POS** con `cajero.huallaga@happys.pe / Happy2026!` → debería ver la pantalla de venta
5. **Web** sin login → debería ver la home con los productos destacados (si se publicó alguno desde el ERP)
6. **Libro de reclamaciones** → enviar uno de prueba → verificar que aparezca en `/reclamos` del ERP

---

## 12. Próximos pasos (post-MVP)

- [ ] Activar **Email confirmations** en Supabase Auth con SMTP propio (Resend / SendGrid)
- [ ] Configurar **dominio email remitente** (`ventas@disfraceshappys.com`) en Resend
- [ ] Crear cuentas de **producción** para Culqi e Izipay
- [ ] Contratar **Nubefact** y conectar SUNAT real (probar con boletas de prueba primero)
- [ ] Subir fotos reales de los disfraces al bucket `disfraces-fotos` y publicarlos
- [ ] Configurar **Vercel Analytics** o **Plausible** para tracking de tráfico
- [ ] Habilitar **Supabase Pro** ($25/mes) para backups automáticos diarios y point-in-time recovery
- [ ] Configurar **2FA** para todos los usuarios staff (Supabase lo soporta nativo)
- [ ] Crear los formularios transaccionales completos para los módulos de Producción (Plan Maestro, Corte, Servicios, Ingreso PT) — el schema ya está listo
