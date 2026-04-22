# Deploy — HAPPY SAC

## 0. Pre-requisitos

- Node 20.10+ y pnpm 9.12+
- Cuenta Supabase (proyecto `trkokphwmkedhxwjriod` ya creado)
- Cuenta Vercel
- Cuenta apis.net.pe (free) → `APIS_NET_PE_TOKEN`
- (Producción) cuenta Nubefact para facturación electrónica
- (Producción) cuenta Culqi para tarjetas (o Izipay)

## 1. Variables de entorno (Vercel)

En cada uno de los 3 proyectos Vercel (`erp`, `web`, `pos`) configurar:

```
NEXT_PUBLIC_SUPABASE_URL=https://trkokphwmkedhxwjriod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # solo en ERP y Web (no exponer al POS)
APIS_NET_PE_TOKEN=...                    # solo ERP y Web
WHATSAPP_NUMBER=51916856842
NEXT_PUBLIC_ERP_URL=https://erp.disfraceshappys.com
NEXT_PUBLIC_WEB_URL=https://disfraceshappys.com
NEXT_PUBLIC_POS_URL=https://pos.disfraceshappys.com
CULQI_PUBLIC_KEY=...
CULQI_SECRET_KEY=...
NUBEFACT_RUC=20609213770
NUBEFACT_TOKEN=...
```

⚠️ **Rotar las credenciales Supabase compartidas en chat (el `service_role` y `anon`)
antes de deploy a producción.**

## 2. Aplicar migraciones a Supabase

```bash
# Local
supabase login
supabase link --project-ref trkokphwmkedhxwjriod
supabase db push     # aplica las 24 migraciones de supabase/migrations/

# O por GitHub Actions (workflow db-migrate.yml)
# Requiere secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD
```

## 3. Deploy de Edge Functions

```bash
supabase functions deploy sunat-consulta
supabase functions deploy culqi-webhook
supabase functions deploy emitir-comprobante
supabase functions deploy notificar-stock

# Configurar secrets de Edge Functions
supabase secrets set APIS_NET_PE_TOKEN=...
supabase secrets set NUBEFACT_TOKEN=...
supabase secrets set NUBEFACT_RUC=...
```

## 4. Cargar datos iniciales

```bash
cp .env.example .env  # rellenar con credenciales locales

pnpm install
pnpm tsx supabase/seed/01-datos-base.ts
pnpm tsx supabase/seed/02-ubigeo.ts          # requiere supabase/seed/ubigeo-peru.json
pnpm tsx supabase/seed/import-excel.ts       # requiere /documentos excels/
```

## 5. Crear proyectos Vercel

Para cada app:

1. Vercel → New Project → Import del repo de GitHub
2. **Root Directory**: `apps/erp` (o `apps/web` o `apps/pos`)
3. Framework: Next.js (autodetectado)
4. Build/Install: dejado por `vercel.json` de cada app
5. Configurar las variables de entorno del paso 1
6. Asignar dominio (ej. `erp.disfraceshappys.com`)

## 6. Dominios sugeridos

- `disfraceshappys.com` → app `web`
- `erp.disfraceshappys.com` → app `erp`
- `pos.disfraceshappys.com` → app `pos`

## 7. Webhooks externos

- **Culqi**: configurar webhook URL → `https://disfraceshappys.com/functions/v1/culqi-webhook`
- **Nubefact**: configurar callback de aceptación SUNAT (opcional)

## 8. Verificar

- Crear primer usuario: `supabase auth signup` desde Dashboard
- Asignar rol `gerente` desde SQL: `INSERT INTO usuarios_roles (usuario_id, rol) VALUES ('<uuid>', 'gerente');`
- Loguear al ERP, verificar que se ven los productos importados
- Hacer una venta de prueba en el POS
- Hacer un pedido de prueba en la web
