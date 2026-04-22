# Seeds & Importaciones — HAPPY SAC

## Orden de ejecución (en producción)

```bash
# 1. Aplicar todas las migraciones
supabase db push

# 2. Datos base (empresa, almacenes, cajas, series, áreas producción, unidades, roles)
pnpm tsx supabase/seed/01-datos-base.ts

# 3. Ubigeo Perú (1,879 distritos INEI)
pnpm tsx supabase/seed/02-ubigeo.ts

# 4. Importación desde Excels del cliente
pnpm tsx supabase/seed/import-excel.ts
```

## Archivos

| Script | Descripción |
| ------ | ----------- |
| `01-datos-base.ts` | Empresa HAPPY, 3 almacenes (Santa Bárbara, Huallaga, La Quinta), 2 cajas, series B001/F001, áreas producción, unidades medida, colores base |
| `02-ubigeo.ts` | Carga `ubigeo-peru.json` en tabla `public.ubigeo` |
| `import-excel.ts` | Procesa los 7 Excels del cliente: materiales, proveedores, talleres, costos confección, valor minuto, kardex (stock inicial por almacén), plantilla recetas |
| `ubigeo-peru.json` | Dataset INEI completo (descargar manualmente desde https://datosabiertos.gob.pe — referencia: 1879 distritos) |
| `03-usuarios-demo.ts` | (opcional) Crea usuarios demo por cada rol |

## Archivos Excel origen esperados

Ubicados en `/documentos excels/` (en la raíz del repo):

- `PLANTILLA_RECETAS.xlsx` — hojas MATERIALES, RECETAS, CODIGO MAT, COSTOS DE CONFECCION
- `KARDEX ALMACEN SANTA BARBARA.xlsx` — stock producto terminado en almacén central
- `KARDEX TIENDA HUALLAGA.xlsx` — stock tienda Huallaga
- `KARDEX  TIENDA LA QUINTA.xlsx` — stock tienda La Quinta
- `PROVEEDORES.xlsx`
- `TALLERES DE CONFECCIÓN.xlsx`
- `VALOR MIN POR AREA.xlsx` — valores por minuto por área de producción

## Requisitos

Variables en `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # service role — bypassa RLS
```

## Re-ejecución

Los scripts usan `upsert` con `onConflict` en columnas únicas (códigos / documentos).
Son seguros de ejecutar múltiples veces — no generan duplicados. El kardex sí se acumula
por inserts en `kardex_movimientos`, por eso solo correr una vez el import inicial.
