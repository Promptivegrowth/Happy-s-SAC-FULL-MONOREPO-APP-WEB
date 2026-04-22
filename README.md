# HAPPY SAC — ERP Textil + E-commerce + POS Dual

Monorepo del ecosistema digital de **HAPPY SAC / disfraceshappys.com**.
Fábrica de disfraces para niños y adultos con producción propia + talleres externos, almacén central, dos puntos de venta físicos (tiendas) y tienda e-commerce nativa.

## Apps

| App | Stack | Descripción |
| --- | ----- | ----------- |
| `apps/erp` | Next.js 15 (App Router) | Panel de administración: maestros, producción, inventario, compras, costeo, RR.HH., facturación, reportes |
| `apps/web` | Next.js 15 + RSC | Tienda e-commerce pública con checkout (Yape/Plin/Tarjeta + fallback WhatsApp) y libro de reclamaciones INDECOPI |
| `apps/pos` | Next.js 15 PWA offline-first | Punto de venta para tiendas (La Quinta y Huallaga). Soporta pistola código de barras, impresora térmica, cierre de caja |

## Packages

| Paquete | Descripción |
| ------- | ----------- |
| `packages/db` | Cliente Supabase, tipos generados, helpers RLS |
| `packages/ui` | Sistema de diseño (shadcn/ui + tokens HAPPY) |
| `packages/lib` | Utilidades compartidas: ubigeo Perú, BOM/costing, formato moneda, validadores DNI/RUC, integraciones SUNAT/RENIEC |
| `packages/config` | Configs compartidos (TS, ESLint, Tailwind) |

## Backend

- **Supabase** (Postgres + Auth + Storage + Edge Functions + Realtime)
- ~60 tablas con RLS por rol (Gerente / Producción / Almacenero / Cajero / Vendedor B2B / Contador / Cliente)
- Migraciones versionadas en `supabase/migrations/`
- Edge Functions en `supabase/functions/` (SUNAT, pasarelas, WhatsApp)

## Stack

- TypeScript 5.6 — estricto
- pnpm 9 + Turborepo 2
- Next.js 15 + React 18 + Tailwind v3 + shadcn/ui
- Supabase JS v2
- Zod, React Hook Form, TanStack Query, TanStack Table
- date-fns (es-PE), zustand
- Vitest + Playwright

## Setup local

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar variables de entorno
cp .env.example .env
# editar .env con tus credenciales

# 3. Aplicar migraciones a Supabase
pnpm db:migrate

# 4. Generar tipos TypeScript desde Supabase
pnpm db:types

# 5. Importar datos iniciales (Excels del cliente + ubigeo INEI)
pnpm db:import-excel
pnpm db:seed

# 6. Levantar todas las apps
pnpm dev
```

## Deploy

- **Vercel** para las 3 apps (cada una como proyecto Vercel independiente apuntando al monorepo)
- **Supabase** hosted (proyecto `trkokphwmkedhxwjriod`)
- CI/CD con GitHub Actions: lint + typecheck + tests por PR

## Integraciones Perú

| Integración | Servicio | Notas |
| ----------- | -------- | ----- |
| DNI / RUC autocompletar | [apis.net.pe](https://apis.net.pe) | Free tier 50 req/día — cuenta personal |
| Ubigeo (INEI) | offline (`packages/lib/src/ubigeo`) | 1.879 distritos pre-cargados |
| Yape / Plin | QR estático apuntando a `+51 916 856 842` | Confirmación manual en POS o automática vía webhook si se contrata Yape Empresa |
| Tarjeta | Culqi (recomendado) o Izipay | Configurable por env |
| WhatsApp fallback | `wa.me/51916856842` con mensaje pre-formateado | Para clientes que no quieren pagar online |
| Facturación electrónica | Nubefact (PSE) | Boleta, Factura, NC, ND, Guía remisión |
| Libro de Reclamaciones | INDECOPI (Ley 29571) | Formulario obligatorio en e-commerce, llega al ERP |

## Roles del sistema

1. **Gerente / Propietario** — todo
2. **Jefe de Producción** — maestros producto, OTs, plan maestro, talleres
3. **Operario de Planta** — registro avance OT (vía POS o tablet)
4. **Almacenero** — inventario, recepción mercadería, traslados
5. **Cajero POS** — solo POS de su tienda + consulta stock global
6. **Vendedor B2B** — pedidos mayoristas, proformas, cuentas por cobrar
7. **Contador** — facturación, exportes SIRE/PLE, cuentas por pagar
8. **Cliente final** (web) — solo carrito + cuenta propia

---

© 2026 HAPPY SAC · desarrollado por **Promptive Agency** (Luciérnaga & Asociados S.A.C.)
