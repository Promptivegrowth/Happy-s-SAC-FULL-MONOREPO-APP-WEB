# 🧪 Guía de Pruebas Exhaustivas — HAPPY SAC

Guía detallada para validar end-to-end todas las funcionalidades del ecosistema:
**ERP + Web ecommerce + POS** y sus integraciones cruzadas.

> **Cómo usar**: marca cada test con ✅ pasó · ❌ falló · ⏸ pendiente · ⏭ no aplica.
> Anota bugs encontrados en la sección final.

---

## 📋 Setup inicial

### URLs de las apps
| App | URL | Carpeta repo |
| --- | --- | --- |
| **ERP** | https://happy-s-sac-full-monorepo-app-web-e.vercel.app | `apps/erp` |
| **Web** | https://happy-s-sac-full-monorepo-app-web-w.vercel.app | `apps/web` |
| **POS** | https://happy-s-sac-full-monorepo-app-web-p.vercel.app | `apps/pos` |

### Usuarios demo (password común: `Happy2026!`)
| Email | Rol | Para probar |
| --- | --- | --- |
| `gerente@happys.pe` | Gerente | Todo el ERP + Configuración SUNAT + POS |
| `jefe@happys.pe` | Jefe Producción | Plan Maestro / OT / Corte / OS |
| `operario@happys.pe` | Operario | Avance de producción |
| `almacenero@happys.pe` | Almacenero | Inventario / Traslados / Recepciones |
| `cajero.huallaga@happys.pe` | Cajero | POS Tienda Huallaga |
| `cajero.laquinta@happys.pe` | Cajero | POS Tienda La Quinta |
| `vendedor@happys.pe` | Vendedor B2B | Pedidos mayoristas |
| `contador@happys.pe` | Contador | Comprobantes / Reportes |

### Pre-requisitos antes de probar
- [ ] **0.1** Verificar env vars en Vercel para los 3 proyectos:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (solo ERP y Web)
  - `APIS_NET_PE_TOKEN` ⚠️ asegurarse que NO tenga saltos de línea
  - `WHATSAPP_NUMBER=51916856842`
- [ ] **0.2** Las 3 apps cargan sin error 500
- [ ] **0.3** El logo Happy's aparece en login de ERP/POS y header/footer de Web

---

## 🏛️ SECCIÓN 1: ERP — Catálogo

Login: `gerente@happys.pe`

### 1.1 Productos (`/productos`)
- [ ] **1.1.1** Lista carga 289+ productos importados
- [ ] **1.1.2** Buscar "MOANA" → filtra resultados
- [ ] **1.1.3** Filtrar por categoría con badges
- [ ] **1.1.4** Click en producto → abre detalle con tabs (Datos / Variantes / Galería / Publicación)
- [ ] **1.1.5** Botón "Nuevo producto" → form aparece
- [ ] **1.1.6** Crear producto: código `TEST01`, nombre `Disfraz Prueba`, categoría Halloween
- [ ] **1.1.7** Producto creado → redirige a su detalle
- [ ] **1.1.8** Editar nombre → guardar → toast confirma
- [ ] **1.1.9** Tab **Variantes** → "Agregar variante" → talla T6 + SKU TEST01-6 + precio 50
- [ ] **1.1.10** Variante creada aparece en tabla
- [ ] **1.1.11** Eliminar variante → confirmación → desaparece
- [ ] **1.1.12** Tab **Galería** → subir foto JPG/PNG → preview
- [ ] **1.1.13** Foto subida queda como portada
- [ ] **1.1.14** Subir 2da foto → aparece en grid
- [ ] **1.1.15** Eliminar foto con hover delete
- [ ] **1.1.16** Tab **Datos**: Subir imagen principal → preview funciona
- [ ] **1.1.17** Eliminar producto → dialog confirma → vuelve a lista

### 1.2 Categorías (`/categorias`)
- [ ] **1.2.1** Lista muestra 10 categorías iniciales con emojis
- [ ] **1.2.2** Botón "Nueva categoría" → form
- [ ] **1.2.3** Crear: código `TEST`, nombre `Categoría Test`, slug `test`, ícono 🧪
- [ ] **1.2.4** Slug auto-genera si está vacío
- [ ] **1.2.5** Editar categoría → toggle "Publicar en web" off
- [ ] **1.2.6** Toggle "Activo" off → estado cambia
- [ ] **1.2.7** Eliminar categoría test

### 1.3 Materiales (`/materiales`)
- [ ] **1.3.1** Lista carga 624 materiales
- [ ] **1.3.2** Filtrar por TELA / AVIO / INSUMO con badges
- [ ] **1.3.3** Buscar "BOTON" → filtra
- [ ] **1.3.4** Click en material → form de edición
- [ ] **1.3.5** Crear nuevo material: código `TEST-MAT`, nombre `Tela Test`, categoría TELA
- [ ] **1.3.6** Seleccionar unidad de medida (metro)
- [ ] **1.3.7** Precio 12.50 → guardar
- [ ] **1.3.8** Toggle "Es importado" / "Requiere lote"
- [ ] **1.3.9** Editar precio → reflejado al volver
- [ ] **1.3.10** Eliminar material test

### 1.4 Recetas BOM (`/recetas`)
- [ ] **1.4.1** Lista muestra 144 recetas
- [ ] **1.4.2** Click en una receta → editor BOM
- [ ] **1.4.3** Tabs por talla (T0, T2, T4...) → filtrar
- [ ] **1.4.4** Ver agrupación por talla con líneas
- [ ] **1.4.5** "Agregar línea" → buscar material → seleccionar
- [ ] **1.4.6** Asignar talla T6 + cantidad 0.5 + sale_a_servicio Sí
- [ ] **1.4.7** Línea aparece en la tabla
- [ ] **1.4.8** Eliminar línea agregada
- [ ] **1.4.9** Card de "Tallas faltantes" muestra correctamente

---

## 👥 SECCIÓN 2: ERP — Personas

### 2.1 Clientes (`/clientes`)
- [ ] **2.1.1** Lista carga (puede estar vacía inicialmente)
- [ ] **2.1.2** Botón "Nuevo cliente" → form
- [ ] **2.1.3** Tipo DNI → ingresar 47507859 → click "Consultar"
- [ ] **2.1.4** ✅ **Si funciona**: autocompleta nombres y apellidos desde RENIEC
- [ ] **2.1.5** ❌ **Si falla con error de header**: arreglar `APIS_NET_PE_TOKEN` en Vercel (sin \n)
- [ ] **2.1.6** Tipo RUC → ingresar 20609213770 → autocompleta razón social y dirección
- [ ] **2.1.7** Selector ubigeo → buscar "Miraflores" → seleccionar
- [ ] **2.1.8** Selector ubigeo modo cascada: click departamento → provincia → distrito
- [ ] **2.1.9** Tipo de cliente: Mayorista A
- [ ] **2.1.10** Guardar → redirige a lista, cliente aparece
- [ ] **2.1.11** Click cliente → editar email/teléfono → guardar
- [ ] **2.1.12** Botón "Desactivar" → cliente queda inactivo
- [ ] **2.1.13** Buscar por nombre/RUC en lista funciona

### 2.2 Proveedores (`/proveedores`)
- [ ] **2.2.1** Lista carga 26 proveedores importados
- [ ] **2.2.2** Click en proveedor → editor
- [ ] **2.2.3** Botón "Nuevo proveedor"
- [ ] **2.2.4** RUC → consultar SUNAT → autocompleta razón social y dirección
- [ ] **2.2.5** Toggle "Es de importación"
- [ ] **2.2.6** Días de pago: 30
- [ ] **2.2.7** Moneda: USD
- [ ] **2.2.8** Guardar → aparece en lista
- [ ] **2.2.9** Editar → cambiar moneda PEN → guardar

### 2.3 Talleres (`/talleres`)
- [ ] **2.3.1** Lista carga 15 talleres importados
- [ ] **2.3.2** Botón "Nuevo taller"
- [ ] **2.3.3** Crear: código `TAL-TEST`, nombre `Taller Prueba`
- [ ] **2.3.4** Marcar especialidades: COSTURA + BORDADO
- [ ] **2.3.5** Datos bancarios: BCP / cuenta / CCI
- [ ] **2.3.6** Toggle "Emite comprobante"
- [ ] **2.3.7** Calificación 4.5
- [ ] **2.3.8** Guardar → aparece en lista con estrella

### 2.4 Operarios (`/operarios`)
- [ ] **2.4.1** Lista carga (puede estar vacía)
- [ ] **2.4.2** Crear operario manual desde Supabase Studio si es necesario para pruebas

---

## 🏭 SECCIÓN 3: ERP — Producción

Login: `jefe@happys.pe` o `gerente@happys.pe`

### 3.1 Plan Maestro (`/plan-maestro`)
- [ ] **3.1.1** Lista vacía inicialmente
- [ ] **3.1.2** Botón "Nuevo plan" → form
- [ ] **3.1.3** Crear: fecha inicio Lunes próximo, fin Domingo, notas
- [ ] **3.1.4** Plan creado → redirige a detalle
- [ ] **3.1.5** Estado: BORRADOR
- [ ] **3.1.6** Tab **Líneas** → "Agregar línea"
- [ ] **3.1.7** Buscar producto MOANA → seleccionar talla T6 → cantidad 50
- [ ] **3.1.8** Línea aparece en tabla
- [ ] **3.1.9** Agregar 3 líneas más con diferentes productos/tallas
- [ ] **3.1.10** Tab **Explosión materiales** → muestra materiales totales requeridos
- [ ] **3.1.11** Botón "Aprobar plan" → confirmación → estado APROBADO
- [ ] **3.1.12** Botón "Generar OTs" → confirmación → toast con cantidad de OTs creadas
- [ ] **3.1.13** Estado plan → EN_EJECUCION
- [ ] **3.1.14** Tab **OTs** → ver OTs generadas
- [ ] **3.1.15** Click en OT → abre detalle de OT

### 3.2 Órdenes de Trabajo (`/ot`)
- [ ] **3.2.1** Lista muestra OTs generadas
- [ ] **3.2.2** Filtrar/ver columna estado y prioridad
- [ ] **3.2.3** OTs atrasadas marcadas con badge rojo
- [ ] **3.2.4** Click en OT → detalle
- [ ] **3.2.5** Estado: PLANIFICADA → botón "EN_CORTE"
- [ ] **3.2.6** Confirmar transición → estado cambia
- [ ] **3.2.7** Tab **Bitácora** → evento de cambio de estado registrado
- [ ] **3.2.8** Agregar nota al timeline → aparece nota
- [ ] **3.2.9** En tab **Líneas** → click "Editar" en una línea
- [ ] **3.2.10** Declarar cortado: 50, fallas: 2 → guardar
- [ ] **3.2.11** Continuar transiciones: EN_HABILITADO → EN_SERVICIO → EN_DECORADO → EN_CONTROL_CALIDAD
- [ ] **3.2.12** En estado EN_CONTROL_CALIDAD → botón "Cerrar OT (declarar PT)"
- [ ] **3.2.13** Seleccionar almacén destino (Santa Bárbara)
- [ ] **3.2.14** Confirmar → toast "OT cerrada · X lote(s) PT generados"
- [ ] **3.2.15** Estado OT → COMPLETADA

### 3.3 Corte (`/corte`)
- [ ] **3.3.1** Lista vacía inicialmente
- [ ] **3.3.2** Botón "Nueva orden de corte"
- [ ] **3.3.3** Seleccionar OT activa, producto, responsable
- [ ] **3.3.4** Capas tendidas: 20, metros: 35.5
- [ ] **3.3.5** Crear → redirige a detalle
- [ ] **3.3.6** "Agregar talla" → T6, cantidad teórica 50, real 48, merma 2
- [ ] **3.3.7** Agregar más tallas
- [ ] **3.3.8** Diferencia se calcula automático con color (verde/rojo)
- [ ] **3.3.9** Botón "Cerrar corte" → estado COMPLETADO
- [ ] **3.3.10** En corte cerrado → botón "Generar Orden de Servicio"

### 3.4 Órdenes de Servicio (`/servicios`)
- [ ] **3.4.1** Generar OS desde corte cerrado
- [ ] **3.4.2** Seleccionar taller, proceso (COSTURA), monto base
- [ ] **3.4.3** OS creada → redirige a detalle
- [ ] **3.4.4** Estado: EMITIDA
- [ ] **3.4.5** Transición → DESPACHADA → EN_PROCESO → RECEPCIONADA → CERRADA
- [ ] **3.4.6** Crear OS manualmente desde `/servicios/nuevo`
- [ ] **3.4.7** Llenar cuidados, consideraciones, observaciones
- [ ] **3.4.8** Guardar → aparece en lista

### 3.5 Trazabilidad (`/trazabilidad`)
- [ ] **3.5.1** Página carga (placeholder o con datos según implementación)

---

## 📦 SECCIÓN 4: ERP — Inventario

Login: `almacenero@happys.pe`

### 4.1 Stock actual (`/inventario`)
- [ ] **4.1.1** Lista muestra ~1417 stocks importados
- [ ] **4.1.2** Filtros por almacén
- [ ] **4.1.3** Buscar por SKU → filtra
- [ ] **4.1.4** Stock aumenta tras cierre de OT (verificar lote PT)

### 4.2 Kardex (`/kardex`)
- [ ] **4.2.1** Lista de movimientos cronológica
- [ ] **4.2.2** Tipos coloreados (entradas verde, salidas rojo)
- [ ] **4.2.3** Filtrar por almacén / fecha / tipo
- [ ] **4.2.4** Después de cerrar OT → ver ENTRADA_PRODUCCION
- [ ] **4.2.5** Después de venta POS → ver SALIDA_VENTA

### 4.3 Alertas stock bajo (`/inventario/alertas`)
- [ ] **4.3.1** Página carga vista `v_stock_alertas`
- [ ] **4.3.2** Productos con stock bajo destacados

### 4.4 Traslados (`/traslados`)
- [ ] **4.4.1** Página placeholder o lista de traslados

---

## 🛒 SECCIÓN 5: ERP — Compras

### 5.1 Órdenes de Compra (`/oc`)
- [ ] **5.1.1** Lista carga
- [ ] **5.1.2** Botón "Nueva OC" (puede ser placeholder)

### 5.2 Cuentas por pagar (`/compras/cxp`)
- [ ] **5.2.1** Vista carga (vacía si no hay OCs)

---

## 💰 SECCIÓN 6: ERP — Ventas y Comprobantes

### 6.1 Ventas (`/ventas`)
- [ ] **6.1.1** Lista vacía si no se ha vendido nada en POS
- [ ] **6.1.2** Después de POS → aparecen ventas
- [ ] **6.1.3** Filtros por canal, fecha, almacén

### 6.2 Pedidos web (`/pedidos-web`)
- [ ] **6.2.1** Lista vacía inicialmente
- [ ] **6.2.2** Después de pedido en web → aparece con estado correcto
- [ ] **6.2.3** Cambiar estado del pedido (manual desde DB o futuro flow)

### 6.3 Comprobantes (`/comprobantes`)
- [ ] **6.3.1** Lista carga
- [ ] **6.3.2** Tras venta POS con boleta → aparece en estado BORRADOR
- [ ] **6.3.3** Click en comprobante → detalle
- [ ] **6.3.4** Ver totales, líneas, cliente

---

## 🧾 SECCIÓN 7: ERP — SUNAT (Facturación electrónica)

Login: `gerente@happys.pe`

### 7.1 Configuración (`/configuracion/sunat`)
- [ ] **7.1.1** Página carga
- [ ] **7.1.2** Cards muestran RUC + Ambiente + estado certificado
- [ ] **7.1.3** Configurar ambiente BETA
- [ ] **7.1.4** Usuario SOL: `MODDATOS`
- [ ] **7.1.5** Clave SOL: `MODDATOS`
- [ ] **7.1.6** Endpoint: dejar el de BETA por defecto
- [ ] **7.1.7** Subir certificado .pfx de prueba (puede ser uno demo)
- [ ] **7.1.8** Contraseña del certificado
- [ ] **7.1.9** Guardar → toast confirmación

### 7.2 Emisión (`/comprobantes/[id]`)
- [ ] **7.2.1** Tomar un comprobante BORRADOR
- [ ] **7.2.2** Botón "Enviar a SUNAT"
- [ ] **7.2.3** Confirmación
- [ ] **7.2.4** ⏳ Espera 5-15 segundos (SOAP a SUNAT)
- [ ] **7.2.5** Si código `0` → estado ACEPTADO + toast "SUNAT [0]: ..."
- [ ] **7.2.6** Si código `2xxx` → estado RECHAZADO + mensaje
- [ ] **7.2.7** Si error → estado original + error en envíos
- [ ] **7.2.8** Tab "Envíos SUNAT" muestra historial con CDR descargable

### 7.3 Casos de prueba SUNAT BETA
> Usar RUC `20000000001` (entidad ficticia SUNAT) para emisor o cliente
- [ ] **7.3.1** Emitir Boleta BETA con cliente DNI
- [ ] **7.3.2** Emitir Factura BETA con cliente RUC
- [ ] **7.3.3** Reintentar comprobante RECHAZADO

---

## 🌐 SECCIÓN 8: ERP — Web Catálogo y Publicación

### 8.1 Web Catálogo (`/web-catalogo`)
- [ ] **8.1.1** Lista todos los productos
- [ ] **8.1.2** Toggle "Publicar" en un producto → confirmación inmediata
- [ ] **8.1.3** Después de publicar → ir a la web pública → ver el producto
- [ ] **8.1.4** Marcar destacado → aparece en home web
- [ ] **8.1.5** Despublicar → desaparece de web
- [ ] **8.1.6** Botón "Ver en web" → abre la página pública

### 8.2 Editor de publicación (en detalle producto, tab Publicación)
- [ ] **8.2.1** Editar título web → diferente del nombre interno
- [ ] **8.2.2** Descripción corta y larga
- [ ] **8.2.3** Slug personalizado
- [ ] **8.2.4** Precio oferta (opcional)
- [ ] **8.2.5** Toggle destacado
- [ ] **8.2.6** Guardar → reflejado en web

---

## 📕 SECCIÓN 9: ERP — Reclamos INDECOPI (`/reclamos`)
- [ ] **9.1** Lista vacía inicialmente
- [ ] **9.2** Tras reclamo en web → aparece aquí
- [ ] **9.3** Cambiar estado: NUEVO → EN_REVISION → RESUELTO

---

## 📊 SECCIÓN 10: ERP — Dashboard (`/dashboard`)
- [ ] **10.1** 4 KPIs cargan: ventas hoy, OTs, productos, pedidos web
- [ ] **10.2** Gráfico ventas últimos 30 días renderiza (vacío si no hay ventas)
- [ ] **10.3** Top productos chart
- [ ] **10.4** Pie chart ventas por canal
- [ ] **10.5** Bar chart OTs por estado
- [ ] **10.6** Card alertas con conteos correctos

---

## ⚙️ SECCIÓN 11: ERP — Configuración

### 11.1 Empresa (`/configuracion`)
- [ ] **11.1.1** Datos de empresa visibles
- [ ] **11.1.2** Lista de parámetros del sistema

### 11.2 Usuarios (`/usuarios`)
- [ ] **11.2.1** Lista los 8 usuarios demo
- [ ] **11.2.2** Roles asignados visibles
- [ ] **11.2.3** Crear nuevo usuario (vía Supabase Auth)

---

## 🏪 SECCIÓN 12: POS — Login y Caja

URL: https://happy-s-sac-full-monorepo-app-web-p.vercel.app

### 12.1 Login
- [ ] **12.1.1** Pantalla login carga con logo
- [ ] **12.1.2** Sección "Cuentas demo" muestra 3 cards (Gerente, Cajero Huallaga, Cajero La Quinta)
- [ ] **12.1.3** Click "Cajero Huallaga" → autocompleta y entra
- [ ] **12.1.4** Redirige a `/venta`

### 12.2 Apertura caja
- [ ] **12.2.1** Badge "Caja abierta" visible (auto-apertura en 1ra venta)
- [ ] **12.2.2** Selector de caja muestra cajas disponibles

---

## 💸 SECCIÓN 13: POS — Venta

### 13.1 Búsqueda de productos
- [ ] **13.1.1** Input principal autofocus al cargar
- [ ] **13.1.2** Escribir "MOANA" → sugerencias aparecen
- [ ] **13.1.3** Click sugerencia → producto agregado al carrito
- [ ] **13.1.4** Escribir SKU exacto + Enter → agrega producto
- [ ] **13.1.5** Escribir SKU inexistente + Enter → toast "no encontrado"
- [ ] **13.1.6** Pistola de barras: escanear código → agrega automático
- [ ] **13.1.7** Click sobre cualquier parte → input recupera focus

### 13.2 Carrito
- [ ] **13.2.1** Producto aparece con SKU, talla, precio
- [ ] **13.2.2** Botones +/- cambian cantidad
- [ ] **13.2.3** Cantidad ≥ 1 (no permite 0 o negativo)
- [ ] **13.2.4** Botón eliminar (icono basurero) → quita línea
- [ ] **13.2.5** Subtotal de línea = cantidad × precio

### 13.3 Cliente
- [ ] **13.3.1** Tab "Cliente rápido" → solo nombre
- [ ] **13.3.2** Tab "Con DNI/RUC" → 2 inputs

### 13.4 Métodos de pago
- [ ] **13.4.1** 5 botones de método (Efectivo / Yape / Plin / Tarjeta / Transferencia)
- [ ] **13.4.2** Click un método → registra pago por el monto faltante
- [ ] **13.4.3** Pagos aplicados aparecen en lista
- [ ] **13.4.4** Click X en un pago → quita
- [ ] **13.4.5** Multi-pago: parte efectivo + parte yape
- [ ] **13.4.6** Pagado < total → "Falta cobrar S/ X"
- [ ] **13.4.7** Pagado > total → muestra "Vuelto S/ X"

### 13.5 Tipo de comprobante
- [ ] **13.5.1** Selector con 3 opciones: Nota Venta / Boleta / Factura
- [ ] **13.5.2** Tipo seleccionado se respeta al cobrar

### 13.6 Cobrar
- [ ] **13.6.1** Carrito vacío → botón "Cobrar" deshabilitado
- [ ] **13.6.2** Pago insuficiente → toast error
- [ ] **13.6.3** Pago suficiente + carrito → click "Cobrar"
- [ ] **13.6.4** Loading "Cobrando…" aparece
- [ ] **13.6.5** Toast éxito con número venta + número comprobante
- [ ] **13.6.6** Carrito se limpia
- [ ] **13.6.7** Pagos se limpian

### 13.7 WhatsApp fallback
- [ ] **13.7.1** Carrito con items → botón WhatsApp
- [ ] **13.7.2** Abre wa.me/51916856842 con mensaje pre-formateado
- [ ] **13.7.3** Mensaje incluye items, cantidades, precios, total

---

## 🔐 SECCIÓN 14: POS — Cierre de caja (`/cierre`)
- [ ] **14.1** Página carga datos de la sesión actual
- [ ] **14.2** Stats muestran apertura, ventas count, efectivo esperado
- [ ] **14.3** Card "Totales por método" desglosa cada método
- [ ] **14.4** Form: input efectivo contado pre-llenado con esperado
- [ ] **14.5** Cambiar valor → diferencia se calcula en vivo
- [ ] **14.6** Diferencia positiva → verde "Sobrante"
- [ ] **14.7** Diferencia negativa → rojo "Faltante"
- [ ] **14.8** Diferencia >= 5 → confirmación al cerrar
- [ ] **14.9** Botón "Confirmar cierre" → procesa
- [ ] **14.10** Toast éxito → redirige a /venta
- [ ] **14.11** Verificar en Supabase que `cajas_sesiones` tiene `cerrada_en` y totales

---

## 🛍️ SECCIÓN 15: Web Ecommerce — Navegación y Catálogo

URL: https://happy-s-sac-full-monorepo-app-web-w.vercel.app

### 15.1 Home
- [ ] **15.1.1** Carga sin error (no debe mostrar "Application error")
- [ ] **15.1.2** Logo Happy's en header
- [ ] **15.1.3** Banner promo arriba con sparkles animados
- [ ] **15.1.4** Hero principal con tipografía display + gradient
- [ ] **15.1.5** Cards de categorías (4) en grid
- [ ] **15.1.6** Sección "Explora por temporada" con 6 cards
- [ ] **15.1.7** Sección "Más vendidos" — vacía si no hay destacados publicados
- [ ] **15.1.8** Footer con info y enlaces sociales
- [ ] **15.1.9** WhatsApp FAB (botón flotante verde) abajo derecha

### 15.2 Catálogo (`/productos`)
- [ ] **15.2.1** Grid de productos publicados (vacío si no se publicó nada)
- [ ] **15.2.2** Cada card: imagen, título, tallas disponibles, precio desde
- [ ] **15.2.3** Click → abre detalle del producto

### 15.3 Categoría (`/categoria/halloween`)
- [ ] **15.3.1** Header con ícono y nombre categoría
- [ ] **15.3.2** Grid de productos de esa categoría

### 15.4 Detalle producto (`/productos/[slug]`)
- [ ] **15.4.1** Galería de fotos a la izquierda
- [ ] **15.4.2** Foto principal + thumbnails
- [ ] **15.4.3** Título, descripción corta, descripción larga
- [ ] **15.4.4** Selector de talla con botones
- [ ] **15.4.5** Selector de cantidad +/-
- [ ] **15.4.6** Precio cliente final + precio mayorista (cuando aplica)
- [ ] **15.4.7** Cantidad >= 6 → "¡Precio mayorista!" badge
- [ ] **15.4.8** Botón "Comprar ahora" → agrega al carrito + redirige checkout
- [ ] **15.4.9** Botón "Agregar al carrito"
- [ ] **15.4.10** Botón "Pedir por WhatsApp" → abre chat con mensaje pre-formateado

---

## 🛒 SECCIÓN 16: Web — Carrito y Checkout

### 16.1 Carrito (`/carrito`)
- [ ] **16.1.1** Vacío → muestra estado vacío con CTA al catálogo
- [ ] **16.1.2** Con items → muestra cada producto con foto/nombre/talla/precio
- [ ] **16.1.3** Cambiar cantidad +/-
- [ ] **16.1.4** Eliminar línea
- [ ] **16.1.5** Resumen lateral con subtotal + CTA "Continuar al checkout"

### 16.2 Checkout (`/checkout`)
- [ ] **16.2.1** Tipo doc DNI/RUC + número
- [ ] **16.2.2** Botón "Consultar" → autocompleta nombre y dirección
- [ ] **16.2.3** Si autocompleta falla → mostrar error claro (token mal en Vercel?)
- [ ] **16.2.4** Email, celular requeridos
- [ ] **16.2.5** Toggle "Necesito factura"
- [ ] **16.2.6** Método entrega: Delivery vs Recojo en tienda
- [ ] **16.2.7** Si delivery → dirección + ubigeo
- [ ] **16.2.8** Métodos de pago: Yape, Plin, Tarjeta, Transferencia, WhatsApp
- [ ] **16.2.9** Resumen del pedido lateral
- [ ] **16.2.10** Click "Finalizar compra" → procesa
- [ ] **16.2.11** Si método WhatsApp → abre wa.me con pedido pre-formateado
- [ ] **16.2.12** Si otro método → crea pedido en estado PENDIENTE_PAGO
- [ ] **16.2.13** Toast éxito con número de pedido

---

## 📕 SECCIÓN 17: Web — Libro de Reclamaciones (`/libro-de-reclamaciones`)
- [ ] **17.1** Página carga con estilo INDECOPI
- [ ] **17.2** Selector RECLAMO vs QUEJA
- [ ] **17.3** Datos consumidor: nombre, doc, contacto, dirección
- [ ] **17.4** Toggle "Soy menor de edad" → muestra apoderado
- [ ] **17.5** Tipo bien: Producto vs Servicio
- [ ] **17.6** Descripción + pedido del consumidor (textarea)
- [ ] **17.7** Submit → genera número REC-YYYY-XXXXX
- [ ] **17.8** Pantalla de éxito con número
- [ ] **17.9** Reclamo aparece en `/reclamos` del ERP

---

## 📑 SECCIÓN 18: Páginas estáticas Web
- [ ] **18.1** `/nosotros` carga
- [ ] **18.2** `/contacto` carga
- [ ] **18.3** `/terminos-y-condiciones` carga
- [ ] **18.4** `/politica-de-privacidad` carga

---

## 🔄 SECCIÓN 19: Tests cruzados (integración entre apps)

### 19.1 ERP → Web
- [ ] **19.1.1** Crear producto en ERP → ir a Web Catálogo → publicar → abrir web → ver producto
- [ ] **19.1.2** Editar precio en ERP → cambio reflejado en web (puede tomar minutos por cache)
- [ ] **19.1.3** Subir foto en ERP → aparece en detalle web
- [ ] **19.1.4** Marcar "destacado" en ERP → aparece en home web
- [ ] **19.1.5** Despublicar en ERP → desaparece de web

### 19.2 POS → ERP
- [ ] **19.2.1** Vender en POS → aparece en `/ventas` del ERP
- [ ] **19.2.2** Stock baja en `/inventario` tras venta
- [ ] **19.2.3** Ver SALIDA_VENTA en `/kardex`
- [ ] **19.2.4** Ver comprobante en `/comprobantes` (estado BORRADOR)
- [ ] **19.2.5** Cierre caja → registra en cajas_sesiones (verificar Supabase)

### 19.3 Web → ERP
- [ ] **19.3.1** Pedido web → aparece en `/pedidos-web`
- [ ] **19.3.2** Cliente nuevo en checkout → aparece en `/clientes`
- [ ] **19.3.3** Reclamo en web → aparece en `/reclamos`

### 19.4 Flujo producción ERP completo
- [ ] **19.4.1** Crear plan maestro → aprobar → generar OTs (verificar OTs en `/ot`)
- [ ] **19.4.2** Tomar 1 OT → cambiar estados hasta EN_CONTROL_CALIDAD
- [ ] **19.4.3** Cerrar OT con almacén destino → toast confirma lotes
- [ ] **19.4.4** Verificar nuevo lote PT en `lotes_pt` (Supabase)
- [ ] **19.4.5** Verificar ENTRADA_PRODUCCION en `/kardex`
- [ ] **19.4.6** Stock incrementa en `/inventario`
- [ ] **19.4.7** Evento creado en `trazabilidad_eventos`

### 19.5 Flujo SUNAT end-to-end (BETA)
- [ ] **19.5.1** Configurar `/configuracion/sunat` con credenciales BETA
- [ ] **19.5.2** Vender en POS con tipo BOLETA
- [ ] **19.5.3** Ir a `/comprobantes` → ver el nuevo en BORRADOR
- [ ] **19.5.4** Click → "Enviar a SUNAT"
- [ ] **19.5.5** Esperar respuesta
- [ ] **19.5.6** Verificar `sunat_envios` en Supabase
- [ ] **19.5.7** Si ACEPTADO → CDR descargable
- [ ] **19.5.8** Verificar XML firmado en Storage bucket `comprobantes`

---

## 🐛 SECCIÓN 20: Errores conocidos y troubleshooting

### Web no carga (Application error / Server-side exception)
- **Causa común**: env vars en Vercel mal configuradas
- **Solución**: Verificar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en proyecto Vercel del Web
- Asegurarse que valores no tengan saltos de línea ni espacios extra

### DNI/RUC consulta falla con "Headers.append: invalid"
- **Causa**: `APIS_NET_PE_TOKEN` mal pegado en Vercel (tiene salto de línea o variable siguiente concatenada)
- **Solución**: Vercel → Settings → Environment Variables → Editar `APIS_NET_PE_TOKEN`
- Valor correcto: `sk_14887.Q5HUEN1YgB3ElfmgaMtDCYF88y2aIMrh` (solo eso, nada más)
- Re-deploy

### POS no graba la venta
- Verificar que la caja tenga sesión abierta
- Verificar permisos RLS del usuario cajero
- Revisar logs Vercel del proyecto POS

### Imágenes subidas no se ven
- Verificar bucket `disfraces-fotos` en Supabase Storage existe
- Bucket debe ser público
- Verificar policy `public_read_disfraces` activa

### SUNAT rechaza con código 2335 / 2336
- Validar formato del XML — usualmente es un campo faltante
- Para pruebas BETA usar usuario `MODDATOS` / clave `MODDATOS` y RUC `20000000001`
- Revisar `sunat_envios` para ver el detalle del error

---

## 📝 SECCIÓN 21: Bitácora de bugs encontrados

Anotar aquí cada bug nuevo con formato:

```
### BUG-001: [Título corto]
- **Sección**: ej. POS - Venta
- **Pasos para reproducir**: 1... 2... 3...
- **Comportamiento esperado**: ...
- **Comportamiento actual**: ...
- **Severidad**: 🔴 Crítica / 🟡 Media / 🟢 Baja
- **Estado**: 🆕 Nuevo / 🔧 En curso / ✅ Resuelto
- **Commit fix**: (cuando aplique)
```

### Bugs reportados en sesiones previas
- ✅ **BUG**: Token APIS con \n en Vercel — fix `cleanToken()` en commit `37b2319`
- ✅ **BUG**: Web crash por `unstable_cache + cookies()` — fix removido en `37b2319`
- ✅ **BUG**: Cierre de caja era placeholder — implementado en `37b2319`

---

## 🎯 Prioridades sugeridas de testing

**Día 1 — Smoke test (1-2 horas)**
1. Login en las 3 apps con quickLogin
2. Crear 1 producto en ERP, agregar variante, publicar en web
3. Ver en web pública
4. Vender en POS
5. Verificar stock baja en ERP

**Día 2 — CRUDs (2-3 horas)**
- Sección 1, 2 completas (productos, categorías, materiales, recetas, clientes, proveedores, talleres)

**Día 3 — Producción (2-3 horas)**
- Sección 3 completa (plan maestro → OT → corte → OS → cierre)

**Día 4 — POS y Web (2-3 horas)**
- Secciones 12-18

**Día 5 — SUNAT y cruzados (2-3 horas)**
- Sección 7, 19, 20

**Día 6 — Iteración y cleanup**
- Reportar bugs encontrados, agendar correcciones

---

**🚀 ¡A iterar!** Cualquier bug que encuentres anótalo en la sección 21 y lo arreglamos.
