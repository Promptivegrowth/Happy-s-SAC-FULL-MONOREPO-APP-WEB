export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ajustes_inventario: {
        Row: {
          almacen_id: string
          aprobado_por: string | null
          codigo: string
          created_at: string | null
          estado: string
          fecha: string
          id: string
          motivo: string
          updated_at: string | null
        }
        Insert: {
          almacen_id: string
          aprobado_por?: string | null
          codigo: string
          created_at?: string | null
          estado?: string
          fecha?: string
          id?: string
          motivo: string
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string
          aprobado_por?: string | null
          codigo?: string
          created_at?: string | null
          estado?: string
          fecha?: string
          id?: string
          motivo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      ajustes_inventario_lineas: {
        Row: {
          ajuste_id: string
          cantidad_real: number
          cantidad_sistema: number | null
          costo_unitario: number | null
          diferencia: number | null
          id: string
          material_id: string | null
          observacion: string | null
          variante_id: string | null
        }
        Insert: {
          ajuste_id: string
          cantidad_real: number
          cantidad_sistema?: number | null
          costo_unitario?: number | null
          diferencia?: number | null
          id?: string
          material_id?: string | null
          observacion?: string | null
          variante_id?: string | null
        }
        Update: {
          ajuste_id?: string
          cantidad_real?: number
          cantidad_sistema?: number | null
          costo_unitario?: number | null
          diferencia?: number | null
          id?: string
          material_id?: string | null
          observacion?: string | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_inventario_lineas_ajuste_id_fkey"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "ajustes_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_inventario_lineas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_inventario_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      almacenes: {
        Row: {
          activo: boolean
          codigo: string
          color_etiqueta: string | null
          created_at: string | null
          direccion: string | null
          es_tienda: boolean
          id: string
          nombre: string
          notas: string | null
          permite_compras: boolean
          permite_produccion: boolean
          permite_ventas: boolean
          responsable_usuario_id: string | null
          tipo: Database["public"]["Enums"]["tipo_almacen"]
          ubigeo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          color_etiqueta?: string | null
          created_at?: string | null
          direccion?: string | null
          es_tienda?: boolean
          id?: string
          nombre: string
          notas?: string | null
          permite_compras?: boolean
          permite_produccion?: boolean
          permite_ventas?: boolean
          responsable_usuario_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_almacen"]
          ubigeo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          color_etiqueta?: string | null
          created_at?: string | null
          direccion?: string | null
          es_tienda?: boolean
          id?: string
          nombre?: string
          notas?: string | null
          permite_compras?: boolean
          permite_produccion?: boolean
          permite_ventas?: boolean
          responsable_usuario_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_almacen"]
          ubigeo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "almacenes_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      areas_produccion: {
        Row: {
          activa: boolean
          codigo: string
          costo_indirecto_mensual: number | null
          created_at: string | null
          id: string
          nombre: string
          updated_at: string | null
          valor_minuto: number
        }
        Insert: {
          activa?: boolean
          codigo: string
          costo_indirecto_mensual?: number | null
          created_at?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
          valor_minuto?: number
        }
        Update: {
          activa?: boolean
          codigo?: string
          costo_indirecto_mensual?: number | null
          created_at?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
          valor_minuto?: number
        }
        Relationships: []
      }
      asistencias: {
        Row: {
          created_at: string | null
          fecha: string
          hora_entrada: string | null
          hora_salida: string | null
          horas_trabajadas: number | null
          id: number
          observacion: string | null
          operario_id: string
        }
        Insert: {
          created_at?: string | null
          fecha: string
          hora_entrada?: string | null
          hora_salida?: string | null
          horas_trabajadas?: number | null
          id?: number
          observacion?: string | null
          operario_id: string
        }
        Update: {
          created_at?: string | null
          fecha?: string
          hora_entrada?: string | null
          hora_salida?: string | null
          horas_trabajadas?: number | null
          id?: number
          observacion?: string | null
          operario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          contexto: Json | null
          diff: Json | null
          id: number
          ip: unknown
          ocurrido_en: string
          registro_id: string | null
          tabla: string
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          contexto?: Json | null
          diff?: Json | null
          id?: number
          ip?: unknown
          ocurrido_en?: string
          registro_id?: string | null
          tabla: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          contexto?: Json | null
          diff?: Json | null
          id?: number
          ip?: unknown
          ocurrido_en?: string
          registro_id?: string | null
          tabla?: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      caja_chica_movimientos: {
        Row: {
          caja_id: string | null
          comprobante_ref: string | null
          concepto: string
          created_at: string | null
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          registrado_por: string | null
          sesion_id: string | null
          tipo: string
        }
        Insert: {
          caja_id?: string | null
          comprobante_ref?: string | null
          concepto: string
          created_at?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          registrado_por?: string | null
          sesion_id?: string | null
          tipo: string
        }
        Update: {
          caja_id?: string | null
          comprobante_ref?: string | null
          concepto?: string
          created_at?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          registrado_por?: string | null
          sesion_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_chica_movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_chica_movimientos_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "cajas_sesiones"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          activo: boolean
          almacen_id: string
          codigo: string
          created_at: string | null
          id: string
          impresora_ticket: string | null
          monto_apertura_default: number | null
          nombre: string
          serie_boleta: string | null
          serie_factura: string | null
          serie_nota_venta: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          almacen_id: string
          codigo: string
          created_at?: string | null
          id?: string
          impresora_ticket?: string | null
          monto_apertura_default?: number | null
          nombre: string
          serie_boleta?: string | null
          serie_factura?: string | null
          serie_nota_venta?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          almacen_id?: string
          codigo?: string
          created_at?: string | null
          id?: string
          impresora_ticket?: string | null
          monto_apertura_default?: number | null
          nombre?: string
          serie_boleta?: string | null
          serie_factura?: string | null
          serie_nota_venta?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cajas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas_sesiones: {
        Row: {
          abierta_en: string
          abierta_por: string
          caja_id: string
          cerrada_en: string | null
          cerrada_por: string | null
          created_at: string | null
          diferencia: number | null
          id: string
          monto_apertura: number
          monto_cierre_efectivo: number | null
          monto_esperado_efectivo: number | null
          observaciones: string | null
          total_efectivo: number | null
          total_otros: number | null
          total_plin: number | null
          total_tarjeta: number | null
          total_transferencia: number | null
          total_yape: number | null
          updated_at: string | null
        }
        Insert: {
          abierta_en?: string
          abierta_por: string
          caja_id: string
          cerrada_en?: string | null
          cerrada_por?: string | null
          created_at?: string | null
          diferencia?: number | null
          id?: string
          monto_apertura?: number
          monto_cierre_efectivo?: number | null
          monto_esperado_efectivo?: number | null
          observaciones?: string | null
          total_efectivo?: number | null
          total_otros?: number | null
          total_plin?: number | null
          total_tarjeta?: number | null
          total_transferencia?: number | null
          total_yape?: number | null
          updated_at?: string | null
        }
        Update: {
          abierta_en?: string
          abierta_por?: string
          caja_id?: string
          cerrada_en?: string | null
          cerrada_por?: string | null
          created_at?: string | null
          diferencia?: number | null
          id?: string
          monto_apertura?: number
          monto_cierre_efectivo?: number | null
          monto_esperado_efectivo?: number | null
          observaciones?: string | null
          total_efectivo?: number | null
          total_otros?: number | null
          total_plin?: number | null
          total_tarjeta?: number | null
          total_transferencia?: number | null
          total_yape?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cajas_sesiones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanas: {
        Row: {
          activa: boolean
          banner_url: string | null
          codigo: string
          created_at: string | null
          descripcion: string | null
          destacada_web: boolean
          factor_costo_servicio: number | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          imagen_url: string | null
          nombre: string
          orden_web: number | null
          slug: string | null
        }
        Insert: {
          activa?: boolean
          banner_url?: string | null
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          destacada_web?: boolean
          factor_costo_servicio?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          imagen_url?: string | null
          nombre: string
          orden_web?: number | null
          slug?: string | null
        }
        Update: {
          activa?: boolean
          banner_url?: string | null
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          destacada_web?: boolean
          factor_costo_servicio?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          imagen_url?: string | null
          nombre?: string
          orden_web?: number | null
          slug?: string | null
        }
        Relationships: []
      }
      carritos: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          cupon_id: string | null
          expira_en: string | null
          id: string
          session_token: string | null
          sub_total: number | null
          total_items: number | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          cupon_id?: string | null
          expira_en?: string | null
          id?: string
          session_token?: string | null
          sub_total?: number | null
          total_items?: number | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          cupon_id?: string | null
          expira_en?: string | null
          id?: string
          session_token?: string | null
          sub_total?: number | null
          total_items?: number | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carritos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carritos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carritos_cupon_id_fkey"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
        ]
      }
      carritos_lineas: {
        Row: {
          agregado_en: string | null
          cantidad: number
          carrito_id: string
          id: string
          precio_unitario_snapshot: number | null
          variante_id: string
        }
        Insert: {
          agregado_en?: string | null
          cantidad?: number
          carrito_id: string
          id?: string
          precio_unitario_snapshot?: number | null
          variante_id: string
        }
        Update: {
          agregado_en?: string | null
          cantidad?: number
          carrito_id?: string
          id?: string
          precio_unitario_snapshot?: number | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carritos_lineas_carrito_id_fkey"
            columns: ["carrito_id"]
            isOneToOne: false
            referencedRelation: "carritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carritos_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activo: boolean
          codigo: string
          color: string | null
          created_at: string | null
          descripcion: string | null
          icono: string | null
          id: string
          imagen_url: string | null
          nombre: string
          orden_web: number | null
          padre_id: string | null
          publicar_en_web: boolean
          seo_descripcion: string | null
          seo_titulo: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          color?: string | null
          created_at?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          imagen_url?: string | null
          nombre: string
          orden_web?: number | null
          padre_id?: string | null
          publicar_en_web?: boolean
          seo_descripcion?: string | null
          seo_titulo?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          color?: string | null
          created_at?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          imagen_url?: string | null
          nombre?: string
          orden_web?: number | null
          padre_id?: string | null
          publicar_en_web?: boolean
          seo_descripcion?: string | null
          seo_titulo?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          aceptacion_marketing: boolean | null
          activo: boolean
          adelantos: boolean | null
          apellido_materno: string | null
          apellido_paterno: string | null
          created_at: string | null
          descuento_default: number | null
          dias_credito: number | null
          direccion: string | null
          email: string | null
          id: string
          limite_credito: number | null
          lista_precio: string | null
          nombre_comercial: string | null
          nombres: string | null
          notas: string | null
          numero_documento: string
          razon_social: string | null
          telefono: string | null
          telefono_secundario: string | null
          tipo_cliente: Database["public"]["Enums"]["tipo_cliente"]
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          aceptacion_marketing?: boolean | null
          activo?: boolean
          adelantos?: boolean | null
          apellido_materno?: string | null
          apellido_paterno?: string | null
          created_at?: string | null
          descuento_default?: number | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          id?: string
          limite_credito?: number | null
          lista_precio?: string | null
          nombre_comercial?: string | null
          nombres?: string | null
          notas?: string | null
          numero_documento: string
          razon_social?: string | null
          telefono?: string | null
          telefono_secundario?: string | null
          tipo_cliente?: Database["public"]["Enums"]["tipo_cliente"]
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          aceptacion_marketing?: boolean | null
          activo?: boolean
          adelantos?: boolean | null
          apellido_materno?: string | null
          apellido_paterno?: string | null
          created_at?: string | null
          descuento_default?: number | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          id?: string
          limite_credito?: number | null
          lista_precio?: string | null
          nombre_comercial?: string | null
          nombres?: string | null
          notas?: string | null
          numero_documento?: string
          razon_social?: string | null
          telefono?: string | null
          telefono_secundario?: string | null
          tipo_cliente?: Database["public"]["Enums"]["tipo_cliente"]
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "clientes_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      clientes_direcciones: {
        Row: {
          alias: string | null
          cliente_id: string
          created_at: string | null
          direccion: string
          es_default: boolean | null
          id: string
          referencia: string | null
          telefono_contacto: string | null
          ubigeo: string | null
          updated_at: string | null
        }
        Insert: {
          alias?: string | null
          cliente_id: string
          created_at?: string | null
          direccion: string
          es_default?: boolean | null
          id?: string
          referencia?: string | null
          telefono_contacto?: string | null
          ubigeo?: string | null
          updated_at?: string | null
        }
        Update: {
          alias?: string | null
          cliente_id?: string
          created_at?: string | null
          direccion?: string
          es_default?: boolean | null
          id?: string
          referencia?: string | null
          telefono_contacto?: string | null
          ubigeo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_direcciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_direcciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_direcciones_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "clientes_direcciones_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      colores: {
        Row: {
          activo: boolean
          codigo: string
          hex: string | null
          id: string
          nombre: string
          pantone: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          hex?: string | null
          id?: string
          nombre: string
          pantone?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          hex?: string | null
          id?: string
          nombre?: string
          pantone?: string | null
        }
        Relationships: []
      }
      comprobantes: {
        Row: {
          cdr_url: string | null
          cliente_id: string | null
          created_at: string | null
          descuento_global: number | null
          devolucion_id: string | null
          direccion_cliente: string | null
          documento_referencia_id: string | null
          estado: Database["public"]["Enums"]["estado_comprobante"]
          fecha_emision: string
          fecha_vencimiento: string | null
          forma_pago: string | null
          hash_firma: string | null
          icbper: number | null
          id: string
          igv: number
          moneda: string | null
          motivo_nc_nd: string | null
          nota_interna: string | null
          numero: number
          numero_completo: string | null
          numero_documento_cliente: string | null
          pdf_url: string | null
          pedido_b2b_id: string | null
          pedido_web_id: string | null
          pse_proveedor: string | null
          pse_ticket: string | null
          razon_social_cliente: string | null
          serie: string
          sub_total: number
          sunat_aceptado_en: string | null
          sunat_codigo_respuesta: string | null
          sunat_enviado_en: string | null
          sunat_mensaje: string | null
          tipo: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_cambio: number | null
          tipo_documento_cliente:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total: number
          total_letras: string | null
          ubigeo_cliente: string | null
          updated_at: string | null
          venta_id: string | null
          xml_firmado_url: string | null
        }
        Insert: {
          cdr_url?: string | null
          cliente_id?: string | null
          created_at?: string | null
          descuento_global?: number | null
          devolucion_id?: string | null
          direccion_cliente?: string | null
          documento_referencia_id?: string | null
          estado?: Database["public"]["Enums"]["estado_comprobante"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          forma_pago?: string | null
          hash_firma?: string | null
          icbper?: number | null
          id?: string
          igv?: number
          moneda?: string | null
          motivo_nc_nd?: string | null
          nota_interna?: string | null
          numero: number
          numero_completo?: string | null
          numero_documento_cliente?: string | null
          pdf_url?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          pse_proveedor?: string | null
          pse_ticket?: string | null
          razon_social_cliente?: string | null
          serie: string
          sub_total?: number
          sunat_aceptado_en?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_mensaje?: string | null
          tipo: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_cambio?: number | null
          tipo_documento_cliente?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total?: number
          total_letras?: string | null
          ubigeo_cliente?: string | null
          updated_at?: string | null
          venta_id?: string | null
          xml_firmado_url?: string | null
        }
        Update: {
          cdr_url?: string | null
          cliente_id?: string | null
          created_at?: string | null
          descuento_global?: number | null
          devolucion_id?: string | null
          direccion_cliente?: string | null
          documento_referencia_id?: string | null
          estado?: Database["public"]["Enums"]["estado_comprobante"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          forma_pago?: string | null
          hash_firma?: string | null
          icbper?: number | null
          id?: string
          igv?: number
          moneda?: string | null
          motivo_nc_nd?: string | null
          nota_interna?: string | null
          numero?: number
          numero_completo?: string | null
          numero_documento_cliente?: string | null
          pdf_url?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          pse_proveedor?: string | null
          pse_ticket?: string | null
          razon_social_cliente?: string | null
          serie?: string
          sub_total?: number
          sunat_aceptado_en?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_mensaje?: string | null
          tipo?: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_cambio?: number | null
          tipo_documento_cliente?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total?: number
          total_letras?: string | null
          ubigeo_cliente?: string | null
          updated_at?: string | null
          venta_id?: string | null
          xml_firmado_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_documento_referencia_id_fkey"
            columns: ["documento_referencia_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_documento_referencia_id_fkey"
            columns: ["documento_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_pedido_b2b_id_fkey"
            columns: ["pedido_b2b_id"]
            isOneToOne: false
            referencedRelation: "pedidos_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_pedido_web_fk"
            columns: ["pedido_web_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes_lineas: {
        Row: {
          afectacion_igv: string | null
          cantidad: number
          codigo: string | null
          comprobante_id: string
          descripcion: string
          descuento: number | null
          id: string
          igv: number | null
          precio_unitario: number
          sub_total: number
          total: number
          unidad_sunat: string | null
          variante_id: string | null
        }
        Insert: {
          afectacion_igv?: string | null
          cantidad: number
          codigo?: string | null
          comprobante_id: string
          descripcion: string
          descuento?: number | null
          id?: string
          igv?: number | null
          precio_unitario: number
          sub_total: number
          total: number
          unidad_sunat?: string | null
          variante_id?: string | null
        }
        Update: {
          afectacion_igv?: string | null
          cantidad?: number
          codigo?: string | null
          comprobante_id?: string
          descripcion?: string
          descuento?: number | null
          id?: string
          igv?: number | null
          precio_unitario?: number
          sub_total?: number
          total?: number
          unidad_sunat?: string | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_lineas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_lineas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion: {
        Row: {
          actualizado_por: string | null
          clave: string
          descripcion: string | null
          updated_at: string | null
          valor: Json
        }
        Insert: {
          actualizado_por?: string | null
          clave: string
          descripcion?: string | null
          updated_at?: string | null
          valor: Json
        }
        Update: {
          actualizado_por?: string | null
          clave?: string
          descripcion?: string | null
          updated_at?: string | null
          valor?: Json
        }
        Relationships: []
      }
      controles_calidad: {
        Row: {
          cantidad_falla: number | null
          cantidad_merma: number | null
          cantidad_ok: number | null
          cantidad_reproceso: number | null
          cantidad_revisada: number
          cantidad_segunda: number | null
          created_at: string | null
          descuento_aplicado: number | null
          fecha: string | null
          id: string
          ingreso_pt_id: string | null
          numero: string
          observacion: string | null
          os_id: string | null
          ot_id: string | null
          producto_id: string | null
          responsable_operario_id: string | null
          responsable_taller_id: string | null
          revisor_usuario_id: string | null
        }
        Insert: {
          cantidad_falla?: number | null
          cantidad_merma?: number | null
          cantidad_ok?: number | null
          cantidad_reproceso?: number | null
          cantidad_revisada: number
          cantidad_segunda?: number | null
          created_at?: string | null
          descuento_aplicado?: number | null
          fecha?: string | null
          id?: string
          ingreso_pt_id?: string | null
          numero: string
          observacion?: string | null
          os_id?: string | null
          ot_id?: string | null
          producto_id?: string | null
          responsable_operario_id?: string | null
          responsable_taller_id?: string | null
          revisor_usuario_id?: string | null
        }
        Update: {
          cantidad_falla?: number | null
          cantidad_merma?: number | null
          cantidad_ok?: number | null
          cantidad_reproceso?: number | null
          cantidad_revisada?: number
          cantidad_segunda?: number | null
          created_at?: string | null
          descuento_aplicado?: number | null
          fecha?: string | null
          id?: string
          ingreso_pt_id?: string | null
          numero?: string
          observacion?: string | null
          os_id?: string | null
          ot_id?: string | null
          producto_id?: string | null
          responsable_operario_id?: string | null
          responsable_taller_id?: string | null
          revisor_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "controles_calidad_ingreso_pt_id_fkey"
            columns: ["ingreso_pt_id"]
            isOneToOne: false
            referencedRelation: "ingresos_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "controles_calidad_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "controles_calidad_responsable_operario_id_fkey"
            columns: ["responsable_operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_responsable_taller_id_fkey"
            columns: ["responsable_taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
        ]
      }
      controles_calidad_detalle: {
        Row: {
          accion: string | null
          cantidad: number
          control_id: string
          defecto_id: string | null
          id: string
          observacion: string | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Insert: {
          accion?: string | null
          cantidad: number
          control_id: string
          defecto_id?: string | null
          id?: string
          observacion?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Update: {
          accion?: string | null
          cantidad?: number
          control_id?: string
          defecto_id?: string | null
          id?: string
          observacion?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Relationships: [
          {
            foreignKeyName: "controles_calidad_detalle_control_id_fkey"
            columns: ["control_id"]
            isOneToOne: false
            referencedRelation: "controles_calidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controles_calidad_detalle_defecto_id_fkey"
            columns: ["defecto_id"]
            isOneToOne: false
            referencedRelation: "defectos"
            referencedColumns: ["id"]
          },
        ]
      }
      correlativos: {
        Row: {
          actualizado_en: string
          clave: string
          ultimo: number
        }
        Insert: {
          actualizado_en?: string
          clave: string
          ultimo?: number
        }
        Update: {
          actualizado_en?: string
          clave?: string
          ultimo?: number
        }
        Relationships: []
      }
      correos_log: {
        Row: {
          asunto: string | null
          created_at: string | null
          destinatario: string
          enviado_en: string | null
          error: string | null
          estado: string | null
          id: number
          payload: Json | null
          proveedor: string | null
          proveedor_id: string | null
          template: string | null
        }
        Insert: {
          asunto?: string | null
          created_at?: string | null
          destinatario: string
          enviado_en?: string | null
          error?: string | null
          estado?: string | null
          id?: number
          payload?: Json | null
          proveedor?: string | null
          proveedor_id?: string | null
          template?: string | null
        }
        Update: {
          asunto?: string | null
          created_at?: string | null
          destinatario?: string
          enviado_en?: string | null
          error?: string | null
          estado?: string | null
          id?: number
          payload?: Json | null
          proveedor?: string | null
          proveedor_id?: string | null
          template?: string | null
        }
        Relationships: []
      }
      costos_confeccion: {
        Row: {
          categoria_legacy: string | null
          created_at: string | null
          descripcion_ref: string | null
          id: string
          ojal_y_boton: number | null
          producto_id: string | null
          t0: number | null
          t10: number | null
          t12: number | null
          t14: number | null
          t16: number | null
          t2: number | null
          t4: number | null
          t6: number | null
          t8: number | null
          tad: number | null
          ts: number | null
          updated_at: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          categoria_legacy?: string | null
          created_at?: string | null
          descripcion_ref?: string | null
          id?: string
          ojal_y_boton?: number | null
          producto_id?: string | null
          t0?: number | null
          t10?: number | null
          t12?: number | null
          t14?: number | null
          t16?: number | null
          t2?: number | null
          t4?: number | null
          t6?: number | null
          t8?: number | null
          tad?: number | null
          ts?: number | null
          updated_at?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          categoria_legacy?: string | null
          created_at?: string | null
          descripcion_ref?: string | null
          id?: string
          ojal_y_boton?: number | null
          producto_id?: string | null
          t0?: number | null
          t10?: number | null
          t12?: number | null
          t14?: number | null
          t16?: number | null
          t2?: number | null
          t4?: number | null
          t6?: number | null
          t8?: number | null
          tad?: number | null
          ts?: number | null
          updated_at?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_confeccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_confeccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_confeccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      costos_indirectos: {
        Row: {
          anio: number
          area_id: string | null
          concepto: string
          created_at: string | null
          id: string
          mes: number
          monto: number
          observacion: string | null
        }
        Insert: {
          anio: number
          area_id?: string | null
          concepto: string
          created_at?: string | null
          id?: string
          mes: number
          monto: number
          observacion?: string | null
        }
        Update: {
          anio?: number
          area_id?: string | null
          concepto?: string
          created_at?: string | null
          id?: string
          mes?: number
          monto?: number
          observacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_indirectos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      cupones: {
        Row: {
          activo: boolean | null
          categoria_id: string | null
          codigo: string
          created_at: string | null
          descripcion: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          monto_minimo_compra: number | null
          primer_compra_only: boolean | null
          tipo: string
          usos_actuales: number | null
          usos_max: number | null
          valor: number
        }
        Insert: {
          activo?: boolean | null
          categoria_id?: string | null
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          monto_minimo_compra?: number | null
          primer_compra_only?: boolean | null
          tipo: string
          usos_actuales?: number | null
          usos_max?: number | null
          valor?: number
        }
        Update: {
          activo?: boolean | null
          categoria_id?: string | null
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          monto_minimo_compra?: number | null
          primer_compra_only?: boolean | null
          tipo?: string
          usos_actuales?: number | null
          usos_max?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cupones_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      defectos: {
        Row: {
          accion_default: string | null
          activo: boolean | null
          codigo: string
          descripcion: string | null
          id: string
          nombre: string
          severidad: string | null
        }
        Insert: {
          accion_default?: string | null
          activo?: boolean | null
          codigo: string
          descripcion?: string | null
          id?: string
          nombre: string
          severidad?: string | null
        }
        Update: {
          accion_default?: string | null
          activo?: boolean | null
          codigo?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          severidad?: string | null
        }
        Relationships: []
      }
      devoluciones: {
        Row: {
          almacen_id: string | null
          atendido_por: string | null
          created_at: string | null
          fecha: string | null
          id: string
          metodo_devolucion: Database["public"]["Enums"]["metodo_pago"] | null
          monto_devuelto: number | null
          motivo: string | null
          nota_credito_id: string | null
          numero: string
          observacion: string | null
          tipo: string | null
          venta_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          atendido_por?: string | null
          created_at?: string | null
          fecha?: string | null
          id?: string
          metodo_devolucion?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_devuelto?: number | null
          motivo?: string | null
          nota_credito_id?: string | null
          numero: string
          observacion?: string | null
          tipo?: string | null
          venta_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          atendido_por?: string | null
          created_at?: string | null
          fecha?: string | null
          id?: string
          metodo_devolucion?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_devuelto?: number | null
          motivo?: string | null
          nota_credito_id?: string | null
          numero?: string
          observacion?: string | null
          tipo?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_nc_fk"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_nc_fk"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones_lineas: {
        Row: {
          cantidad: number
          devolucion_id: string
          id: string
          observacion: string | null
          precio_unitario: number | null
          reingresa_stock: boolean | null
          variante_id: string | null
          venta_linea_id: string | null
        }
        Insert: {
          cantidad: number
          devolucion_id: string
          id?: string
          observacion?: string | null
          precio_unitario?: number | null
          reingresa_stock?: boolean | null
          variante_id?: string | null
          venta_linea_id?: string | null
        }
        Update: {
          cantidad?: number
          devolucion_id?: string
          id?: string
          observacion?: string | null
          precio_unitario?: number | null
          reingresa_stock?: boolean | null
          variante_id?: string | null
          venta_linea_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_lineas_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_lineas_venta_linea_id_fkey"
            columns: ["venta_linea_id"]
            isOneToOne: false
            referencedRelation: "ventas_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa: {
        Row: {
          created_at: string | null
          direccion_fiscal: string | null
          email: string | null
          id: string
          idioma: string
          igv_porcentaje: number
          logo_url: string | null
          moneda_base: string
          nombre_comercial: string | null
          politica_comentarios: string | null
          razon_social: string
          ruc: string
          telefono: string | null
          ubigeo: string | null
          updated_at: string | null
          zona_horaria: string
        }
        Insert: {
          created_at?: string | null
          direccion_fiscal?: string | null
          email?: string | null
          id?: string
          idioma?: string
          igv_porcentaje?: number
          logo_url?: string | null
          moneda_base?: string
          nombre_comercial?: string | null
          politica_comentarios?: string | null
          razon_social: string
          ruc: string
          telefono?: string | null
          ubigeo?: string | null
          updated_at?: string | null
          zona_horaria?: string
        }
        Update: {
          created_at?: string | null
          direccion_fiscal?: string | null
          email?: string | null
          id?: string
          idioma?: string
          igv_porcentaje?: number
          logo_url?: string | null
          moneda_base?: string
          nombre_comercial?: string | null
          politica_comentarios?: string | null
          razon_social?: string
          ruc?: string
          telefono?: string | null
          ubigeo?: string | null
          updated_at?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "empresa_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      guias_remision: {
        Row: {
          conductor_dni: string | null
          conductor_nombre: string | null
          created_at: string | null
          direccion_llegada: string | null
          direccion_partida: string | null
          estado: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision: string | null
          fecha_traslado: string | null
          id: string
          modalidad: string | null
          motivo_traslado: string | null
          numero: number
          numero_completo: string | null
          pdf_url: string | null
          pedido_b2b_id: string | null
          pedido_web_id: string | null
          placa_vehiculo: string | null
          serie: string
          transportista_razon_social: string | null
          transportista_ruc: string | null
          traslado_id: string | null
          ubigeo_llegada: string | null
          ubigeo_partida: string | null
          updated_at: string | null
          venta_id: string | null
          xml_firmado_url: string | null
        }
        Insert: {
          conductor_dni?: string | null
          conductor_nombre?: string | null
          created_at?: string | null
          direccion_llegada?: string | null
          direccion_partida?: string | null
          estado?: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision?: string | null
          fecha_traslado?: string | null
          id?: string
          modalidad?: string | null
          motivo_traslado?: string | null
          numero: number
          numero_completo?: string | null
          pdf_url?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          placa_vehiculo?: string | null
          serie: string
          transportista_razon_social?: string | null
          transportista_ruc?: string | null
          traslado_id?: string | null
          ubigeo_llegada?: string | null
          ubigeo_partida?: string | null
          updated_at?: string | null
          venta_id?: string | null
          xml_firmado_url?: string | null
        }
        Update: {
          conductor_dni?: string | null
          conductor_nombre?: string | null
          created_at?: string | null
          direccion_llegada?: string | null
          direccion_partida?: string | null
          estado?: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision?: string | null
          fecha_traslado?: string | null
          id?: string
          modalidad?: string | null
          motivo_traslado?: string | null
          numero?: number
          numero_completo?: string | null
          pdf_url?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          placa_vehiculo?: string | null
          serie?: string
          transportista_razon_social?: string | null
          transportista_ruc?: string | null
          traslado_id?: string | null
          ubigeo_llegada?: string | null
          ubigeo_partida?: string | null
          updated_at?: string | null
          venta_id?: string | null
          xml_firmado_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guias_remision_pedido_b2b_id_fkey"
            columns: ["pedido_b2b_id"]
            isOneToOne: false
            referencedRelation: "pedidos_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_pedido_web_fk"
            columns: ["pedido_web_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_traslado_id_fkey"
            columns: ["traslado_id"]
            isOneToOne: false
            referencedRelation: "traslados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      guias_remision_items: {
        Row: {
          cantidad: number
          descripcion: string | null
          guia_id: string
          id: string
          peso_kg: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          descripcion?: string | null
          guia_id: string
          id?: string
          peso_kg?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          descripcion?: string | null
          guia_id?: string
          id?: string
          peso_kg?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guias_remision_items_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "guias_remision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      importaciones: {
        Row: {
          adelanto: number | null
          aduanas: number | null
          costo_total_adicional: number | null
          created_at: string | null
          estado: string | null
          fecha_arribo_esperada: string | null
          fecha_arribo_real: string | null
          fecha_embarque: string | null
          flete: number | null
          id: string
          moneda: string | null
          numero: string
          observacion: string | null
          otros_costos: number | null
          pais_origen: string | null
          proveedor_id: string | null
          seguro: number | null
          tipo_cambio: number | null
          updated_at: string | null
        }
        Insert: {
          adelanto?: number | null
          aduanas?: number | null
          costo_total_adicional?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_arribo_esperada?: string | null
          fecha_arribo_real?: string | null
          fecha_embarque?: string | null
          flete?: number | null
          id?: string
          moneda?: string | null
          numero: string
          observacion?: string | null
          otros_costos?: number | null
          pais_origen?: string | null
          proveedor_id?: string | null
          seguro?: number | null
          tipo_cambio?: number | null
          updated_at?: string | null
        }
        Update: {
          adelanto?: number | null
          aduanas?: number | null
          costo_total_adicional?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_arribo_esperada?: string | null
          fecha_arribo_real?: string | null
          fecha_embarque?: string | null
          flete?: number | null
          id?: string
          moneda?: string | null
          numero?: string
          observacion?: string | null
          otros_costos?: number | null
          pais_origen?: string | null
          proveedor_id?: string | null
          seguro?: number | null
          tipo_cambio?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importaciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      ingresos_pt: {
        Row: {
          almacen_destino: string
          created_at: string | null
          declarado_por: string | null
          fecha: string | null
          id: string
          numero: string
          observacion: string | null
          ot_id: string | null
        }
        Insert: {
          almacen_destino: string
          created_at?: string | null
          declarado_por?: string | null
          fecha?: string | null
          id?: string
          numero: string
          observacion?: string | null
          ot_id?: string | null
        }
        Update: {
          almacen_destino?: string
          created_at?: string | null
          declarado_por?: string | null
          fecha?: string | null
          id?: string
          numero?: string
          observacion?: string | null
          ot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingresos_pt_almacen_destino_fkey"
            columns: ["almacen_destino"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_pt_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_pt_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ingresos_pt_lineas: {
        Row: {
          cantidad: number
          cantidad_falla: number | null
          costo_unitario_materiales: number | null
          costo_unitario_servicios: number | null
          costo_unitario_total: number | null
          id: string
          ingreso_id: string
          lote_pt_id: string | null
          observacion: string | null
          variante_id: string
        }
        Insert: {
          cantidad: number
          cantidad_falla?: number | null
          costo_unitario_materiales?: number | null
          costo_unitario_servicios?: number | null
          costo_unitario_total?: number | null
          id?: string
          ingreso_id: string
          lote_pt_id?: string | null
          observacion?: string | null
          variante_id: string
        }
        Update: {
          cantidad?: number
          cantidad_falla?: number | null
          costo_unitario_materiales?: number | null
          costo_unitario_servicios?: number | null
          costo_unitario_total?: number | null
          id?: string
          ingreso_id?: string
          lote_pt_id?: string | null
          observacion?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingresos_pt_lineas_ingreso_id_fkey"
            columns: ["ingreso_id"]
            isOneToOne: false
            referencedRelation: "ingresos_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_pt_lineas_lote_fk"
            columns: ["lote_pt_id"]
            isOneToOne: false
            referencedRelation: "lotes_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_pt_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      kardex_movimientos: {
        Row: {
          almacen_contraparte: string | null
          almacen_id: string
          cantidad: number
          costo_total: number | null
          costo_unitario: number | null
          created_at: string | null
          fecha: string
          id: number
          lote_pt_id: string | null
          material_id: string | null
          material_lote_id: string | null
          observacion: string | null
          operario_id: string | null
          referencia_id: string | null
          referencia_linea_id: string | null
          referencia_tipo: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento_kardex"]
          usuario_id: string | null
          variante_id: string | null
        }
        Insert: {
          almacen_contraparte?: string | null
          almacen_id: string
          cantidad: number
          costo_total?: number | null
          costo_unitario?: number | null
          created_at?: string | null
          fecha?: string
          id?: number
          lote_pt_id?: string | null
          material_id?: string | null
          material_lote_id?: string | null
          observacion?: string | null
          operario_id?: string | null
          referencia_id?: string | null
          referencia_linea_id?: string | null
          referencia_tipo?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento_kardex"]
          usuario_id?: string | null
          variante_id?: string | null
        }
        Update: {
          almacen_contraparte?: string | null
          almacen_id?: string
          cantidad?: number
          costo_total?: number | null
          costo_unitario?: number | null
          created_at?: string | null
          fecha?: string
          id?: number
          lote_pt_id?: string | null
          material_id?: string | null
          material_lote_id?: string | null
          observacion?: string | null
          operario_id?: string | null
          referencia_id?: string | null
          referencia_linea_id?: string | null
          referencia_tipo?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento_kardex"]
          usuario_id?: string | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kardex_lote_pt_fk"
            columns: ["lote_pt_id"]
            isOneToOne: false
            referencedRelation: "lotes_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movimientos_almacen_contraparte_fkey"
            columns: ["almacen_contraparte"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movimientos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movimientos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movimientos_material_lote_id_fkey"
            columns: ["material_lote_id"]
            isOneToOne: false
            referencedRelation: "materiales_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movimientos_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_pt: {
        Row: {
          almacen_actual: string | null
          cantidad_actual: number
          cantidad_inicial: number
          codigo: string
          costo_unitario: number | null
          created_at: string | null
          estado: string | null
          fecha_ingreso: string | null
          fecha_produccion: string | null
          id: string
          ingreso_pt_id: string | null
          observacion: string | null
          ot_id: string | null
          updated_at: string | null
          variante_id: string
        }
        Insert: {
          almacen_actual?: string | null
          cantidad_actual: number
          cantidad_inicial: number
          codigo: string
          costo_unitario?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_ingreso?: string | null
          fecha_produccion?: string | null
          id?: string
          ingreso_pt_id?: string | null
          observacion?: string | null
          ot_id?: string | null
          updated_at?: string | null
          variante_id: string
        }
        Update: {
          almacen_actual?: string | null
          cantidad_actual?: number
          cantidad_inicial?: number
          codigo?: string
          costo_unitario?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_ingreso?: string | null
          fecha_produccion?: string | null
          id?: string
          ingreso_pt_id?: string | null
          observacion?: string | null
          ot_id?: string | null
          updated_at?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_pt_almacen_actual_fkey"
            columns: ["almacen_actual"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_pt_ingreso_pt_id_fkey"
            columns: ["ingreso_pt_id"]
            isOneToOne: false
            referencedRelation: "ingresos_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_pt_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_pt_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_pt_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas: {
        Row: {
          activo: boolean
          descripcion: string | null
          id: string
          logo_url: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          descripcion?: string | null
          id?: string
          logo_url?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          descripcion?: string | null
          id?: string
          logo_url?: string | null
          nombre?: string
        }
        Relationships: []
      }
      materiales: {
        Row: {
          activo: boolean
          categoria: Database["public"]["Enums"]["categoria_material"]
          codigo: string
          color_id: string | null
          color_nombre: string | null
          created_at: string | null
          descripcion: string | null
          es_importado: boolean
          factor_conversion: number | null
          id: string
          imagen_url: string | null
          nombre: string
          notas: string | null
          precio_incluye_igv: boolean
          precio_unitario: number
          proveedor_preferido_id: string | null
          requiere_lote: boolean
          stock_maximo: number | null
          stock_minimo: number | null
          sub_categoria: string | null
          unidad_compra_id: string | null
          unidad_consumo_id: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          categoria: Database["public"]["Enums"]["categoria_material"]
          codigo: string
          color_id?: string | null
          color_nombre?: string | null
          created_at?: string | null
          descripcion?: string | null
          es_importado?: boolean
          factor_conversion?: number | null
          id?: string
          imagen_url?: string | null
          nombre: string
          notas?: string | null
          precio_incluye_igv?: boolean
          precio_unitario?: number
          proveedor_preferido_id?: string | null
          requiere_lote?: boolean
          stock_maximo?: number | null
          stock_minimo?: number | null
          sub_categoria?: string | null
          unidad_compra_id?: string | null
          unidad_consumo_id?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_material"]
          codigo?: string
          color_id?: string | null
          color_nombre?: string | null
          created_at?: string | null
          descripcion?: string | null
          es_importado?: boolean
          factor_conversion?: number | null
          id?: string
          imagen_url?: string | null
          nombre?: string
          notas?: string | null
          precio_incluye_igv?: boolean
          precio_unitario?: number
          proveedor_preferido_id?: string | null
          requiere_lote?: boolean
          stock_maximo?: number | null
          stock_minimo?: number | null
          sub_categoria?: string | null
          unidad_compra_id?: string | null
          unidad_consumo_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_proveedor_preferido_fk"
            columns: ["proveedor_preferido_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_unidad_compra_id_fkey"
            columns: ["unidad_compra_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_unidad_consumo_id_fkey"
            columns: ["unidad_consumo_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales_colores: {
        Row: {
          codigo_variante: string | null
          color_id: string
          material_id: string
        }
        Insert: {
          codigo_variante?: string | null
          color_id: string
          material_id: string
        }
        Update: {
          codigo_variante?: string | null
          color_id?: string
          material_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materiales_colores_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_colores_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales_lotes: {
        Row: {
          almacen_id: string | null
          cantidad_disponible: number
          cantidad_inicial: number
          costo_unitario: number | null
          created_at: string | null
          fecha_ingreso: string
          fecha_vencimiento: string | null
          id: string
          material_id: string
          notas: string | null
          numero_lote: string
          oc_recepcion_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          cantidad_disponible: number
          cantidad_inicial: number
          costo_unitario?: number | null
          created_at?: string | null
          fecha_ingreso?: string
          fecha_vencimiento?: string | null
          id?: string
          material_id: string
          notas?: string | null
          numero_lote: string
          oc_recepcion_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          cantidad_disponible?: number
          cantidad_inicial?: number
          costo_unitario?: number | null
          created_at?: string | null
          fecha_ingreso?: string
          fecha_vencimiento?: string | null
          id?: string
          material_id?: string
          notas?: string | null
          numero_lote?: string
          oc_recepcion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_lotes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_lotes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_lotes_recepcion_fk"
            columns: ["oc_recepcion_id"]
            isOneToOne: false
            referencedRelation: "oc_recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales_precios_historico: {
        Row: {
          created_at: string | null
          fecha: string
          id: number
          material_id: string
          oc_id: string | null
          origen: string | null
          precio: number
          proveedor_id: string | null
        }
        Insert: {
          created_at?: string | null
          fecha?: string
          id?: number
          material_id: string
          oc_id?: string | null
          origen?: string | null
          precio: number
          proveedor_id?: string | null
        }
        Update: {
          created_at?: string | null
          fecha?: string
          id?: number
          material_id?: string
          oc_id?: string | null
          origen?: string | null
          precio?: number
          proveedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_precios_historico_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_precios_oc_fk"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "oc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_precios_oc_fk"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_pagar"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "materiales_precios_proveedor_fk"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          created_at: string | null
          destinatario_rol: Database["public"]["Enums"]["rol_sistema"] | null
          destinatario_usuario_id: string | null
          enlace: string | null
          id: string
          leido: boolean | null
          leido_en: string | null
          mensaje: string | null
          meta: Json | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string | null
          destinatario_rol?: Database["public"]["Enums"]["rol_sistema"] | null
          destinatario_usuario_id?: string | null
          enlace?: string | null
          id?: string
          leido?: boolean | null
          leido_en?: string | null
          mensaje?: string | null
          meta?: Json | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string | null
          destinatario_rol?: Database["public"]["Enums"]["rol_sistema"] | null
          destinatario_usuario_id?: string | null
          enlace?: string | null
          id?: string
          leido?: boolean | null
          leido_en?: string | null
          mensaje?: string | null
          meta?: Json | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      notificaciones_stock: {
        Row: {
          created_at: string | null
          email: string
          id: string
          notificado: boolean | null
          notificado_en: string | null
          variante_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          notificado?: boolean | null
          notificado_en?: string | null
          variante_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          notificado?: boolean | null
          notificado_en?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      oc: {
        Row: {
          adelanto: number | null
          almacen_destino: string | null
          aprobada_en: string | null
          aprobada_por: string | null
          archivo_orden_url: string | null
          condicion_pago: string | null
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_oc"]
          fecha: string
          fecha_entrega_esperada: string | null
          id: string
          igv: number | null
          importacion_id: string | null
          moneda: string | null
          numero: string
          observacion: string | null
          proveedor_id: string
          saldo: number | null
          solicitada_por: string | null
          sub_total: number | null
          tipo: Database["public"]["Enums"]["tipo_oc"]
          tipo_cambio: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          adelanto?: number | null
          almacen_destino?: string | null
          aprobada_en?: string | null
          aprobada_por?: string | null
          archivo_orden_url?: string | null
          condicion_pago?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_oc"]
          fecha?: string
          fecha_entrega_esperada?: string | null
          id?: string
          igv?: number | null
          importacion_id?: string | null
          moneda?: string | null
          numero: string
          observacion?: string | null
          proveedor_id: string
          saldo?: number | null
          solicitada_por?: string | null
          sub_total?: number | null
          tipo?: Database["public"]["Enums"]["tipo_oc"]
          tipo_cambio?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          adelanto?: number | null
          almacen_destino?: string | null
          aprobada_en?: string | null
          aprobada_por?: string | null
          archivo_orden_url?: string | null
          condicion_pago?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_oc"]
          fecha?: string
          fecha_entrega_esperada?: string | null
          id?: string
          igv?: number | null
          importacion_id?: string | null
          moneda?: string | null
          numero?: string
          observacion?: string | null
          proveedor_id?: string
          saldo?: number | null
          solicitada_por?: string | null
          sub_total?: number | null
          tipo?: Database["public"]["Enums"]["tipo_oc"]
          tipo_cambio?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_almacen_destino_fkey"
            columns: ["almacen_destino"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_lineas: {
        Row: {
          cantidad: number
          cantidad_pendiente: number | null
          cantidad_recibida: number | null
          descripcion_libre: string | null
          descuento_porcentaje: number | null
          id: string
          igv_aplicable: boolean | null
          material_id: string | null
          observacion: string | null
          oc_id: string
          precio_unitario: number
          sub_total: number | null
          unidad_id: string | null
        }
        Insert: {
          cantidad: number
          cantidad_pendiente?: number | null
          cantidad_recibida?: number | null
          descripcion_libre?: string | null
          descuento_porcentaje?: number | null
          id?: string
          igv_aplicable?: boolean | null
          material_id?: string | null
          observacion?: string | null
          oc_id: string
          precio_unitario?: number
          sub_total?: number | null
          unidad_id?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_pendiente?: number | null
          cantidad_recibida?: number | null
          descripcion_libre?: string | null
          descuento_porcentaje?: number | null
          id?: string
          igv_aplicable?: boolean | null
          material_id?: string | null
          observacion?: string | null
          oc_id?: string
          precio_unitario?: number
          sub_total?: number | null
          unidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_lineas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_lineas_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "oc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_lineas_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_pagar"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "oc_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_recepciones: {
        Row: {
          almacen_id: string
          created_at: string | null
          factura_proveedor: string | null
          fecha: string
          guia_proveedor: string | null
          id: string
          numero: string
          observacion: string | null
          oc_id: string
          recibido_por: string | null
        }
        Insert: {
          almacen_id: string
          created_at?: string | null
          factura_proveedor?: string | null
          fecha?: string
          guia_proveedor?: string | null
          id?: string
          numero: string
          observacion?: string | null
          oc_id: string
          recibido_por?: string | null
        }
        Update: {
          almacen_id?: string
          created_at?: string | null
          factura_proveedor?: string | null
          fecha?: string
          guia_proveedor?: string | null
          id?: string
          numero?: string
          observacion?: string | null
          oc_id?: string
          recibido_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_recepciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_recepciones_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "oc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_recepciones_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_pagar"
            referencedColumns: ["oc_id"]
          },
        ]
      }
      oc_recepciones_lineas: {
        Row: {
          cantidad_recibida: number
          costo_unitario: number | null
          fecha_vencimiento: string | null
          id: string
          material_id: string | null
          numero_lote: string | null
          observacion: string | null
          oc_linea_id: string | null
          recepcion_id: string
        }
        Insert: {
          cantidad_recibida: number
          costo_unitario?: number | null
          fecha_vencimiento?: string | null
          id?: string
          material_id?: string | null
          numero_lote?: string | null
          observacion?: string | null
          oc_linea_id?: string | null
          recepcion_id: string
        }
        Update: {
          cantidad_recibida?: number
          costo_unitario?: number | null
          fecha_vencimiento?: string | null
          id?: string
          material_id?: string | null
          numero_lote?: string | null
          observacion?: string | null
          oc_linea_id?: string | null
          recepcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oc_recepciones_lineas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_recepciones_lineas_oc_linea_id_fkey"
            columns: ["oc_linea_id"]
            isOneToOne: false
            referencedRelation: "oc_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_recepciones_lineas_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "oc_recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      operarios: {
        Row: {
          activo: boolean
          apellido_materno: string | null
          apellido_paterno: string | null
          area_id: string | null
          codigo: string
          created_at: string | null
          dni: string | null
          email: string | null
          fecha_ingreso: string | null
          fecha_salida: string | null
          id: string
          nombres: string
          notas: string | null
          sueldo_base: number | null
          tarifa_destajo: number | null
          telefono: string | null
          tipo_contrato: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          activo?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          area_id?: string | null
          codigo: string
          created_at?: string | null
          dni?: string | null
          email?: string | null
          fecha_ingreso?: string | null
          fecha_salida?: string | null
          id?: string
          nombres: string
          notas?: string | null
          sueldo_base?: number | null
          tarifa_destajo?: number | null
          telefono?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          activo?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          area_id?: string | null
          codigo?: string
          created_at?: string | null
          dni?: string | null
          email?: string | null
          fecha_ingreso?: string | null
          fecha_salida?: string | null
          id?: string
          nombres?: string
          notas?: string | null
          sueldo_base?: number | null
          tarifa_destajo?: number | null
          telefono?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operarios_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      operarios_adelantos: {
        Row: {
          created_at: string | null
          estado: string | null
          fecha: string
          id: string
          monto: number
          motivo: string | null
          operario_id: string
        }
        Insert: {
          created_at?: string | null
          estado?: string | null
          fecha?: string
          id?: string
          monto: number
          motivo?: string | null
          operario_id: string
        }
        Update: {
          created_at?: string | null
          estado?: string | null
          fecha?: string
          id?: string
          monto?: number
          motivo?: string | null
          operario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operarios_adelantos_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
        ]
      }
      operarios_produccion: {
        Row: {
          cantidad: number
          created_at: string | null
          fecha: string
          id: number
          observacion: string | null
          operario_id: string
          ot_id: string | null
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"] | null
          producto_id: string | null
          registrado_por: string | null
          subtotal: number | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
          tarifa_unitaria: number
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          fecha?: string
          id?: number
          observacion?: string | null
          operario_id: string
          ot_id?: string | null
          proceso?:
            | Database["public"]["Enums"]["tipo_proceso_produccion"]
            | null
          producto_id?: string | null
          registrado_por?: string | null
          subtotal?: number | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
          tarifa_unitaria?: number
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          fecha?: string
          id?: number
          observacion?: string | null
          operario_id?: string
          ot_id?: string | null
          proceso?:
            | Database["public"]["Enums"]["tipo_proceso_produccion"]
            | null
          producto_id?: string | null
          registrado_por?: string | null
          subtotal?: number | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
          tarifa_unitaria?: number
        }
        Relationships: [
          {
            foreignKeyName: "operarios_produccion_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operarios_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operarios_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "operarios_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      ordenes_servicio: {
        Row: {
          adicional_campana: number | null
          adicional_movilidad: number | null
          consideraciones: string | null
          corte_id: string | null
          creado_por: string | null
          created_at: string | null
          cuidados: string | null
          es_campana: boolean | null
          estado: string | null
          fecha_emision: string | null
          fecha_entrega_esperada: string | null
          fecha_recepcion: string | null
          firma_recibido_url: string | null
          id: string
          monto_base: number | null
          monto_total: number | null
          numero: string
          observaciones: string | null
          ot_id: string | null
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"]
          taller_id: string
          updated_at: string | null
        }
        Insert: {
          adicional_campana?: number | null
          adicional_movilidad?: number | null
          consideraciones?: string | null
          corte_id?: string | null
          creado_por?: string | null
          created_at?: string | null
          cuidados?: string | null
          es_campana?: boolean | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_entrega_esperada?: string | null
          fecha_recepcion?: string | null
          firma_recibido_url?: string | null
          id?: string
          monto_base?: number | null
          monto_total?: number | null
          numero: string
          observaciones?: string | null
          ot_id?: string | null
          proceso?: Database["public"]["Enums"]["tipo_proceso_produccion"]
          taller_id: string
          updated_at?: string | null
        }
        Update: {
          adicional_campana?: number | null
          adicional_movilidad?: number | null
          consideraciones?: string | null
          corte_id?: string | null
          creado_por?: string | null
          created_at?: string | null
          cuidados?: string | null
          es_campana?: boolean | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_entrega_esperada?: string | null
          fecha_recepcion?: string | null
          firma_recibido_url?: string | null
          id?: string
          monto_base?: number | null
          monto_total?: number | null
          numero?: string
          observaciones?: string | null
          ot_id?: string | null
          proceso?: Database["public"]["Enums"]["tipo_proceso_produccion"]
          taller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_servicio_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "ot_corte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_servicio_avios: {
        Row: {
          cantidad_devuelta: number | null
          cantidad_enviada: number
          id: string
          material_id: string
          observacion: string | null
          os_id: string
        }
        Insert: {
          cantidad_devuelta?: number | null
          cantidad_enviada: number
          id?: string
          material_id: string
          observacion?: string | null
          os_id: string
        }
        Update: {
          cantidad_devuelta?: number | null
          cantidad_enviada?: number
          id?: string
          material_id?: string
          observacion?: string | null
          os_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_servicio_avios_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_avios_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_servicio_lineas: {
        Row: {
          cantidad: number
          cantidad_fallada: number | null
          cantidad_recepcionada: number | null
          id: string
          observacion: string | null
          os_id: string
          pago_unitario: number | null
          producto_id: string | null
          talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Insert: {
          cantidad: number
          cantidad_fallada?: number | null
          cantidad_recepcionada?: number | null
          id?: string
          observacion?: string | null
          os_id: string
          pago_unitario?: number | null
          producto_id?: string | null
          talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Update: {
          cantidad?: number
          cantidad_fallada?: number | null
          cantidad_recepcionada?: number | null
          id?: string
          observacion?: string | null
          os_id?: string
          pago_unitario?: number | null
          producto_id?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"]
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_servicio_lineas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ordenes_servicio_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      ot: {
        Row: {
          almacen_produccion: string | null
          campana_id: string | null
          created_at: string | null
          es_campana: boolean | null
          estado: Database["public"]["Enums"]["estado_ot"]
          fecha_apertura: string | null
          fecha_cierre: string | null
          fecha_entrega_objetivo: string | null
          id: string
          numero: string
          observacion: string | null
          plan_id: string | null
          prioridad: number | null
          responsable_usuario_id: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_produccion?: string | null
          campana_id?: string | null
          created_at?: string | null
          es_campana?: boolean | null
          estado?: Database["public"]["Enums"]["estado_ot"]
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_entrega_objetivo?: string | null
          id?: string
          numero: string
          observacion?: string | null
          plan_id?: string | null
          prioridad?: number | null
          responsable_usuario_id?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_produccion?: string | null
          campana_id?: string | null
          created_at?: string | null
          es_campana?: boolean | null
          estado?: Database["public"]["Enums"]["estado_ot"]
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_entrega_objetivo?: string | null
          id?: string
          numero?: string
          observacion?: string | null
          plan_id?: string | null
          prioridad?: number | null
          responsable_usuario_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_almacen_produccion_fkey"
            columns: ["almacen_produccion"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan_maestro"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_corte: {
        Row: {
          capas_tendidas: number | null
          created_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          merma_metros: number | null
          metros_consumidos: number | null
          numero: string
          observacion: string | null
          ot_id: string
          producto_id: string
          responsable_operario_id: string | null
          tiempo_corte_min: number | null
          tiempo_habilitado_min: number | null
          tiempo_tendido_min: number | null
          tiempo_trazado_min: number | null
          updated_at: string | null
        }
        Insert: {
          capas_tendidas?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          merma_metros?: number | null
          metros_consumidos?: number | null
          numero: string
          observacion?: string | null
          ot_id: string
          producto_id: string
          responsable_operario_id?: string | null
          tiempo_corte_min?: number | null
          tiempo_habilitado_min?: number | null
          tiempo_tendido_min?: number | null
          tiempo_trazado_min?: number | null
          updated_at?: string | null
        }
        Update: {
          capas_tendidas?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          merma_metros?: number | null
          metros_consumidos?: number | null
          numero?: string
          observacion?: string | null
          ot_id?: string
          producto_id?: string
          responsable_operario_id?: string | null
          tiempo_corte_min?: number | null
          tiempo_habilitado_min?: number | null
          tiempo_tendido_min?: number | null
          tiempo_trazado_min?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_corte_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_corte_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_corte_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_corte_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ot_corte_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ot_corte_responsable_operario_id_fkey"
            columns: ["responsable_operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_corte_lineas: {
        Row: {
          cantidad_real: number | null
          cantidad_teorica: number
          corte_id: string
          id: string
          merma: number | null
          observacion: string | null
          ot_linea_id: string | null
          talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Insert: {
          cantidad_real?: number | null
          cantidad_teorica: number
          corte_id: string
          id?: string
          merma?: number | null
          observacion?: string | null
          ot_linea_id?: string | null
          talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Update: {
          cantidad_real?: number | null
          cantidad_teorica?: number
          corte_id?: string
          id?: string
          merma?: number | null
          observacion?: string | null
          ot_linea_id?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"]
        }
        Relationships: [
          {
            foreignKeyName: "ot_corte_lineas_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "ot_corte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_corte_lineas_ot_linea_id_fkey"
            columns: ["ot_linea_id"]
            isOneToOne: false
            referencedRelation: "ot_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_eventos: {
        Row: {
          contexto: Json | null
          detalle: string | null
          estado_anterior: Database["public"]["Enums"]["estado_ot"] | null
          estado_nuevo: Database["public"]["Enums"]["estado_ot"] | null
          fecha: string
          id: number
          ot_id: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          contexto?: Json | null
          detalle?: string | null
          estado_anterior?: Database["public"]["Enums"]["estado_ot"] | null
          estado_nuevo?: Database["public"]["Enums"]["estado_ot"] | null
          fecha?: string
          id?: number
          ot_id: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          contexto?: Json | null
          detalle?: string | null
          estado_anterior?: Database["public"]["Enums"]["estado_ot"] | null
          estado_nuevo?: Database["public"]["Enums"]["estado_ot"] | null
          fecha?: string
          id?: number
          ot_id?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_eventos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_eventos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_lineas: {
        Row: {
          cantidad_cortada: number | null
          cantidad_fallas: number | null
          cantidad_planificada: number
          cantidad_terminada: number | null
          id: string
          observacion: string | null
          ot_id: string
          producto_id: string
          talla: Database["public"]["Enums"]["talla_prenda"]
          variante_id: string | null
        }
        Insert: {
          cantidad_cortada?: number | null
          cantidad_fallas?: number | null
          cantidad_planificada: number
          cantidad_terminada?: number | null
          id?: string
          observacion?: string | null
          ot_id: string
          producto_id: string
          talla: Database["public"]["Enums"]["talla_prenda"]
          variante_id?: string | null
        }
        Update: {
          cantidad_cortada?: number | null
          cantidad_fallas?: number | null
          cantidad_planificada?: number
          cantidad_terminada?: number | null
          id?: string
          observacion?: string | null
          ot_id?: string
          producto_id?: string
          talla?: Database["public"]["Enums"]["talla_prenda"]
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_lineas_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_lineas_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ot_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ot_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_proveedores: {
        Row: {
          archivo_voucher_url: string | null
          comprobante_proveedor: string | null
          created_at: string | null
          fecha: string
          id: string
          importacion_id: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          moneda: string | null
          monto: number
          numero: string
          observacion: string | null
          oc_id: string | null
          proveedor_id: string
          referencia_bancaria: string | null
          registrado_por: string | null
          tipo_cambio: number | null
        }
        Insert: {
          archivo_voucher_url?: string | null
          comprobante_proveedor?: string | null
          created_at?: string | null
          fecha?: string
          id?: string
          importacion_id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          moneda?: string | null
          monto: number
          numero: string
          observacion?: string | null
          oc_id?: string | null
          proveedor_id: string
          referencia_bancaria?: string | null
          registrado_por?: string | null
          tipo_cambio?: number | null
        }
        Update: {
          archivo_voucher_url?: string | null
          comprobante_proveedor?: string | null
          created_at?: string | null
          fecha?: string
          id?: string
          importacion_id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          moneda?: string | null
          monto?: number
          numero?: string
          observacion?: string | null
          oc_id?: string | null
          proveedor_id?: string
          referencia_bancaria?: string | null
          registrado_por?: string | null
          tipo_cambio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_proveedores_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_proveedores_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "oc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_proveedores_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_pagar"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "pagos_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_b2b: {
        Row: {
          adelanto: number | null
          cliente_id: string
          condicion_pago: string | null
          created_at: string | null
          descuento_porcentaje: number | null
          estado: string
          fecha: string | null
          fecha_entrega_estimada: string | null
          id: string
          igv: number | null
          lista_precio: string | null
          numero: string
          observacion: string | null
          proforma_pdf_url: string | null
          sub_total: number | null
          total: number | null
          updated_at: string | null
          vendedor_usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          adelanto?: number | null
          cliente_id: string
          condicion_pago?: string | null
          created_at?: string | null
          descuento_porcentaje?: number | null
          estado?: string
          fecha?: string | null
          fecha_entrega_estimada?: string | null
          id?: string
          igv?: number | null
          lista_precio?: string | null
          numero: string
          observacion?: string | null
          proforma_pdf_url?: string | null
          sub_total?: number | null
          total?: number | null
          updated_at?: string | null
          vendedor_usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          adelanto?: number | null
          cliente_id?: string
          condicion_pago?: string | null
          created_at?: string | null
          descuento_porcentaje?: number | null
          estado?: string
          fecha?: string | null
          fecha_entrega_estimada?: string | null
          id?: string
          igv?: number | null
          lista_precio?: string | null
          numero?: string
          observacion?: string | null
          proforma_pdf_url?: string | null
          sub_total?: number | null
          total?: number | null
          updated_at?: string | null
          vendedor_usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_b2b_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_b2b_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_b2b_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_b2b_despachos: {
        Row: {
          almacen_id: string | null
          fecha: string | null
          guia_remision_id: string | null
          id: string
          numero: string
          observacion: string | null
          pedido_id: string
        }
        Insert: {
          almacen_id?: string | null
          fecha?: string | null
          guia_remision_id?: string | null
          id?: string
          numero: string
          observacion?: string | null
          pedido_id: string
        }
        Update: {
          almacen_id?: string | null
          fecha?: string | null
          guia_remision_id?: string | null
          id?: string
          numero?: string
          observacion?: string | null
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_b2b_despachos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_b2b_despachos_guia_fk"
            columns: ["guia_remision_id"]
            isOneToOne: false
            referencedRelation: "guias_remision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_b2b_despachos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_b2b"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_b2b_lineas: {
        Row: {
          cantidad_entregada: number | null
          cantidad_pedida: number
          descuento: number | null
          id: string
          observacion: string | null
          pedido_id: string
          precio_unitario: number
          sub_total: number | null
          variante_id: string
        }
        Insert: {
          cantidad_entregada?: number | null
          cantidad_pedida: number
          descuento?: number | null
          id?: string
          observacion?: string | null
          pedido_id: string
          precio_unitario: number
          sub_total?: number | null
          variante_id: string
        }
        Update: {
          cantidad_entregada?: number | null
          cantidad_pedida?: number
          descuento?: number | null
          id?: string
          observacion?: string | null
          pedido_id?: string
          precio_unitario?: number
          sub_total?: number | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_b2b_lineas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_b2b_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_web: {
        Row: {
          almacen_recojo: string | null
          cliente_id: string | null
          comprobante_id: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          costo_envio: number | null
          created_at: string | null
          cupon_id: string | null
          descuento: number | null
          direccion_entrega: string | null
          email_invitado: string | null
          estado: Database["public"]["Enums"]["estado_pedido_web"]
          fecha: string
          id: string
          igv: number | null
          ip_cliente: unknown
          metodo_entrega: string
          metodo_pago_seleccionado: string | null
          moneda: string | null
          necesita_factura: boolean | null
          notas_cliente: string | null
          notas_internas: string | null
          numero: string
          origen_url: string | null
          razon_social_facturacion: string | null
          referencia_entrega: string | null
          ruc_facturacion: string | null
          sub_total: number
          total: number
          ubigeo_entrega: string | null
          updated_at: string | null
          user_agent: string | null
          usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          almacen_recojo?: string | null
          cliente_id?: string | null
          comprobante_id?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          costo_envio?: number | null
          created_at?: string | null
          cupon_id?: string | null
          descuento?: number | null
          direccion_entrega?: string | null
          email_invitado?: string | null
          estado?: Database["public"]["Enums"]["estado_pedido_web"]
          fecha?: string
          id?: string
          igv?: number | null
          ip_cliente?: unknown
          metodo_entrega?: string
          metodo_pago_seleccionado?: string | null
          moneda?: string | null
          necesita_factura?: boolean | null
          notas_cliente?: string | null
          notas_internas?: string | null
          numero: string
          origen_url?: string | null
          razon_social_facturacion?: string | null
          referencia_entrega?: string | null
          ruc_facturacion?: string | null
          sub_total?: number
          total?: number
          ubigeo_entrega?: string | null
          updated_at?: string | null
          user_agent?: string | null
          usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          almacen_recojo?: string | null
          cliente_id?: string | null
          comprobante_id?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          costo_envio?: number | null
          created_at?: string | null
          cupon_id?: string | null
          descuento?: number | null
          direccion_entrega?: string | null
          email_invitado?: string | null
          estado?: Database["public"]["Enums"]["estado_pedido_web"]
          fecha?: string
          id?: string
          igv?: number | null
          ip_cliente?: unknown
          metodo_entrega?: string
          metodo_pago_seleccionado?: string | null
          moneda?: string | null
          necesita_factura?: boolean | null
          notas_cliente?: string | null
          notas_internas?: string | null
          numero?: string
          origen_url?: string | null
          razon_social_facturacion?: string | null
          referencia_entrega?: string | null
          ruc_facturacion?: string | null
          sub_total?: number
          total?: number
          ubigeo_entrega?: string | null
          updated_at?: string | null
          user_agent?: string | null
          usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_web_almacen_recojo_fkey"
            columns: ["almacen_recojo"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_cupon_id_fkey"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_ubigeo_entrega_fkey"
            columns: ["ubigeo_entrega"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "pedidos_web_ubigeo_entrega_fkey"
            columns: ["ubigeo_entrega"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "pedidos_web_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_web_lineas: {
        Row: {
          cantidad: number
          descuento: number | null
          id: string
          observacion: string | null
          pedido_id: string
          precio_unitario: number
          sub_total: number | null
          variante_id: string
        }
        Insert: {
          cantidad: number
          descuento?: number | null
          id?: string
          observacion?: string | null
          pedido_id: string
          precio_unitario: number
          sub_total?: number | null
          variante_id: string
        }
        Update: {
          cantidad?: number
          descuento?: number | null
          id?: string
          observacion?: string | null
          pedido_id?: string
          precio_unitario?: number
          sub_total?: number | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_web_lineas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_web_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_web_pagos: {
        Row: {
          created_at: string | null
          culqi_charge_id: string | null
          estado: string | null
          id: string
          izipay_transaction_id: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          pedido_id: string
          referencia: string | null
          updated_at: string | null
          verificado_en: string | null
          verificado_por: string | null
          voucher_url: string | null
          webhook_payload: Json | null
        }
        Insert: {
          created_at?: string | null
          culqi_charge_id?: string | null
          estado?: string | null
          id?: string
          izipay_transaction_id?: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          pedido_id: string
          referencia?: string | null
          updated_at?: string | null
          verificado_en?: string | null
          verificado_por?: string | null
          voucher_url?: string | null
          webhook_payload?: Json | null
        }
        Update: {
          created_at?: string | null
          culqi_charge_id?: string | null
          estado?: string | null
          id?: string
          izipay_transaction_id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          pedido_id?: string
          referencia?: string | null
          updated_at?: string | null
          verificado_en?: string | null
          verificado_por?: string | null
          voucher_url?: string | null
          webhook_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_web_pagos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          almacen_default: string | null
          avatar_url: string | null
          caja_default: string | null
          cargo: string | null
          created_at: string | null
          dni: string | null
          id: string
          idioma: string
          nombre_completo: string | null
          telefono: string | null
          ultimo_login: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          almacen_default?: string | null
          avatar_url?: string | null
          caja_default?: string | null
          cargo?: string | null
          created_at?: string | null
          dni?: string | null
          id: string
          idioma?: string
          nombre_completo?: string | null
          telefono?: string | null
          ultimo_login?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          almacen_default?: string | null
          avatar_url?: string | null
          caja_default?: string | null
          cargo?: string | null
          created_at?: string | null
          dni?: string | null
          id?: string
          idioma?: string
          nombre_completo?: string | null
          telefono?: string | null
          ultimo_login?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_almacen_default_fkey"
            columns: ["almacen_default"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_caja_default_fkey"
            columns: ["caja_default"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_maestro: {
        Row: {
          anio: number | null
          codigo: string
          creado_por: string | null
          created_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          notas: string | null
          semana: number | null
          updated_at: string | null
        }
        Insert: {
          anio?: number | null
          codigo: string
          creado_por?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          notas?: string | null
          semana?: number | null
          updated_at?: string | null
        }
        Update: {
          anio?: number | null
          codigo?: string
          creado_por?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          notas?: string | null
          semana?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      plan_maestro_lineas: {
        Row: {
          campana_id: string | null
          cantidad_planificada: number
          cantidad_producida: number | null
          id: string
          observacion: string | null
          plan_id: string
          prioridad: number | null
          producto_id: string
          talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Insert: {
          campana_id?: string | null
          cantidad_planificada: number
          cantidad_producida?: number | null
          id?: string
          observacion?: string | null
          plan_id: string
          prioridad?: number | null
          producto_id: string
          talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Update: {
          campana_id?: string | null
          cantidad_planificada?: number
          cantidad_producida?: number | null
          id?: string
          observacion?: string | null
          plan_id?: string
          prioridad?: number | null
          producto_id?: string
          talla?: Database["public"]["Enums"]["talla_prenda"]
        }
        Relationships: [
          {
            foreignKeyName: "plan_maestro_lineas_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_maestro_lineas_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan_maestro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_maestro_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_maestro_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "plan_maestro_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          campana_id: string | null
          categoria_id: string | null
          codigo: string
          created_at: string | null
          descripcion: string | null
          destacado: boolean
          es_conjunto: boolean
          genero: string | null
          id: string
          imagen_principal_url: string | null
          marca_id: string | null
          nombre: string
          piezas_descripcion: string | null
          proceso_estandar_tiempo_min: number | null
          updated_at: string | null
          version_ficha: string
        }
        Insert: {
          activo?: boolean
          campana_id?: string | null
          categoria_id?: string | null
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          destacado?: boolean
          es_conjunto?: boolean
          genero?: string | null
          id?: string
          imagen_principal_url?: string | null
          marca_id?: string | null
          nombre: string
          piezas_descripcion?: string | null
          proceso_estandar_tiempo_min?: number | null
          updated_at?: string | null
          version_ficha?: string
        }
        Update: {
          activo?: boolean
          campana_id?: string | null
          categoria_id?: string | null
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          destacado?: boolean
          es_conjunto?: boolean
          genero?: string | null
          id?: string
          imagen_principal_url?: string | null
          marca_id?: string | null
          nombre?: string
          piezas_descripcion?: string | null
          proceso_estandar_tiempo_min?: number | null
          updated_at?: string | null
          version_ficha?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_imagenes: {
        Row: {
          alt_texto: string | null
          created_at: string | null
          es_portada: boolean
          id: string
          orden: number
          producto_id: string | null
          tipo: string | null
          url: string
          variante_id: string | null
        }
        Insert: {
          alt_texto?: string | null
          created_at?: string | null
          es_portada?: boolean
          id?: string
          orden?: number
          producto_id?: string | null
          tipo?: string | null
          url: string
          variante_id?: string | null
        }
        Update: {
          alt_texto?: string | null
          created_at?: string | null
          es_portada?: boolean
          id?: string
          orden?: number
          producto_id?: string | null
          tipo?: string | null
          url?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_imagenes_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_procesos: {
        Row: {
          area_id: string | null
          created_at: string | null
          es_tercerizado: boolean
          id: string
          observacion: string | null
          orden: number
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"]
          producto_id: string
          talla: Database["public"]["Enums"]["talla_prenda"] | null
          taller_default_id: string | null
          tiempo_estandar_min: number | null
          tiempo_real_promedio_min: number | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string | null
          es_tercerizado?: boolean
          id?: string
          observacion?: string | null
          orden: number
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"]
          producto_id: string
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
          taller_default_id?: string | null
          tiempo_estandar_min?: number | null
          tiempo_real_promedio_min?: number | null
        }
        Update: {
          area_id?: string | null
          created_at?: string | null
          es_tercerizado?: boolean
          id?: string
          observacion?: string | null
          orden?: number
          proceso?: Database["public"]["Enums"]["tipo_proceso_produccion"]
          producto_id?: string
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
          taller_default_id?: string | null
          tiempo_estandar_min?: number | null
          tiempo_real_promedio_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_procesos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_procesos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_procesos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_procesos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_procesos_taller_fk"
            columns: ["taller_default_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_publicacion: {
        Row: {
          descripcion_corta: string | null
          descripcion_larga: string | null
          destacado_web: boolean
          etiquetas: string[] | null
          oferta_desde: string | null
          oferta_hasta: string | null
          orden_web: number | null
          palabras_clave: string | null
          precio_oferta: number | null
          producto_id: string
          publicado: boolean
          publicado_en: string | null
          publicado_por: string | null
          seo_descripcion: string | null
          seo_titulo: string | null
          slug: string | null
          titulo_web: string | null
          updated_at: string | null
        }
        Insert: {
          descripcion_corta?: string | null
          descripcion_larga?: string | null
          destacado_web?: boolean
          etiquetas?: string[] | null
          oferta_desde?: string | null
          oferta_hasta?: string | null
          orden_web?: number | null
          palabras_clave?: string | null
          precio_oferta?: number | null
          producto_id: string
          publicado?: boolean
          publicado_en?: string | null
          publicado_por?: string | null
          seo_descripcion?: string | null
          seo_titulo?: string | null
          slug?: string | null
          titulo_web?: string | null
          updated_at?: string | null
        }
        Update: {
          descripcion_corta?: string | null
          descripcion_larga?: string | null
          destacado_web?: boolean
          etiquetas?: string[] | null
          oferta_desde?: string | null
          oferta_hasta?: string | null
          orden_web?: number | null
          palabras_clave?: string | null
          precio_oferta?: number | null
          producto_id?: string
          publicado?: boolean
          publicado_en?: string | null
          publicado_por?: string | null
          seo_descripcion?: string | null
          seo_titulo?: string | null
          slug?: string | null
          titulo_web?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_publicacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_publicacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_publicacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      productos_resenas: {
        Row: {
          aprobada: boolean | null
          aprobada_en: string | null
          aprobada_por: string | null
          autor_email: string | null
          autor_nombre: string | null
          cliente_id: string | null
          comentario: string | null
          created_at: string | null
          id: string
          ip: string | null
          producto_id: string
          puntuacion: number
          titulo: string | null
          usuario_id: string | null
          verificado: boolean
        }
        Insert: {
          aprobada?: boolean | null
          aprobada_en?: string | null
          aprobada_por?: string | null
          autor_email?: string | null
          autor_nombre?: string | null
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string | null
          id?: string
          ip?: string | null
          producto_id: string
          puntuacion: number
          titulo?: string | null
          usuario_id?: string | null
          verificado?: boolean
        }
        Update: {
          aprobada?: boolean | null
          aprobada_en?: string | null
          aprobada_por?: string | null
          autor_email?: string | null
          autor_nombre?: string | null
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string | null
          id?: string
          ip?: string | null
          producto_id?: string
          puntuacion?: number
          titulo?: string | null
          usuario_id?: string | null
          verificado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "productos_resenas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_resenas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      productos_sets: {
        Row: {
          activo: boolean | null
          id: string
          nombre: string | null
          precio_set: number | null
          producto_id: string
        }
        Insert: {
          activo?: boolean | null
          id?: string
          nombre?: string | null
          precio_set?: number | null
          producto_id: string
        }
        Update: {
          activo?: boolean | null
          id?: string
          nombre?: string | null
          precio_set?: number | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_sets_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_sets_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_sets_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      productos_sets_lineas: {
        Row: {
          cantidad: number
          set_id: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          set_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          set_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_sets_lineas_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "productos_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_sets_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_variantes: {
        Row: {
          activo: boolean
          codigo_barras: string | null
          color_id: string | null
          color_variante: string | null
          created_at: string | null
          id: string
          imagen_url: string | null
          moneda: string
          peso_gramos: number | null
          precio_costo_estandar: number | null
          precio_industrial: number | null
          precio_mayorista_a: number | null
          precio_mayorista_b: number | null
          precio_mayorista_c: number | null
          precio_publico: number | null
          producto_id: string
          sku: string
          talla: Database["public"]["Enums"]["talla_prenda"]
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          codigo_barras?: string | null
          color_id?: string | null
          color_variante?: string | null
          created_at?: string | null
          id?: string
          imagen_url?: string | null
          moneda?: string
          peso_gramos?: number | null
          precio_costo_estandar?: number | null
          precio_industrial?: number | null
          precio_mayorista_a?: number | null
          precio_mayorista_b?: number | null
          precio_mayorista_c?: number | null
          precio_publico?: number | null
          producto_id: string
          sku: string
          talla: Database["public"]["Enums"]["talla_prenda"]
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          codigo_barras?: string | null
          color_id?: string | null
          color_variante?: string | null
          created_at?: string | null
          id?: string
          imagen_url?: string | null
          moneda?: string
          peso_gramos?: number | null
          precio_costo_estandar?: number | null
          precio_industrial?: number | null
          precio_mayorista_a?: number | null
          precio_mayorista_b?: number | null
          precio_mayorista_c?: number | null
          precio_publico?: number | null
          producto_id?: string
          sku?: string
          talla?: Database["public"]["Enums"]["talla_prenda"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_variantes_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string | null
          dias_pago_default: number | null
          direccion: string | null
          email: string | null
          es_importacion: boolean | null
          id: string
          moneda: string | null
          nombre_comercial: string | null
          notas: string | null
          numero_documento: string
          razon_social: string
          telefono: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          tipo_suministro: string[] | null
          ubigeo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          dias_pago_default?: number | null
          direccion?: string | null
          email?: string | null
          es_importacion?: boolean | null
          id?: string
          moneda?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          numero_documento: string
          razon_social: string
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          tipo_suministro?: string[] | null
          ubigeo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          dias_pago_default?: number | null
          direccion?: string | null
          email?: string | null
          es_importacion?: boolean | null
          id?: string
          moneda?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          numero_documento?: string
          razon_social?: string
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          tipo_suministro?: string[] | null
          ubigeo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "proveedores_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      proveedores_cuentas: {
        Row: {
          banco: string
          created_at: string | null
          id: string
          moneda: string | null
          numero: string
          proveedor_id: string
          tipo_cuenta: string | null
          titular: string | null
        }
        Insert: {
          banco: string
          created_at?: string | null
          id?: string
          moneda?: string | null
          numero: string
          proveedor_id: string
          tipo_cuenta?: string | null
          titular?: string | null
        }
        Update: {
          banco?: string
          created_at?: string | null
          id?: string
          moneda?: string | null
          numero?: string
          proveedor_id?: string
          tipo_cuenta?: string | null
          titular?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_cuentas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores_materiales: {
        Row: {
          cantidad_minima: number | null
          id: string
          material_id: string
          moneda: string | null
          observacion: string | null
          precio: number | null
          proveedor_id: string
          tiempo_entrega_dias: number | null
          ultima_compra: string | null
        }
        Insert: {
          cantidad_minima?: number | null
          id?: string
          material_id: string
          moneda?: string | null
          observacion?: string | null
          precio?: number | null
          proveedor_id: string
          tiempo_entrega_dias?: number | null
          ultima_compra?: string | null
        }
        Update: {
          cantidad_minima?: number | null
          id?: string
          material_id?: string
          moneda?: string | null
          observacion?: string | null
          precio?: number | null
          proveedor_id?: string
          tiempo_entrega_dias?: number | null
          ultima_compra?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_materiales_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedores_materiales_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          activa: boolean
          creado_por: string | null
          created_at: string | null
          descripcion: string | null
          fecha_vigencia_desde: string | null
          fecha_vigencia_hasta: string | null
          id: string
          notas: string | null
          producto_id: string
          updated_at: string | null
          version: string
        }
        Insert: {
          activa?: boolean
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          fecha_vigencia_desde?: string | null
          fecha_vigencia_hasta?: string | null
          id?: string
          notas?: string | null
          producto_id: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          activa?: boolean
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          fecha_vigencia_desde?: string | null
          fecha_vigencia_hasta?: string | null
          id?: string
          notas?: string | null
          producto_id?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      recetas_lineas: {
        Row: {
          cantidad: number
          cantidad_almacen: number | null
          created_at: string | null
          id: string
          material_id: string
          observacion: string | null
          orden: number | null
          receta_id: string
          sale_a_servicio: boolean
          talla: Database["public"]["Enums"]["talla_prenda"]
          unidad_id: string | null
        }
        Insert: {
          cantidad: number
          cantidad_almacen?: number | null
          created_at?: string | null
          id?: string
          material_id: string
          observacion?: string | null
          orden?: number | null
          receta_id: string
          sale_a_servicio?: boolean
          talla: Database["public"]["Enums"]["talla_prenda"]
          unidad_id?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_almacen?: number | null
          created_at?: string | null
          id?: string
          material_id?: string
          observacion?: string | null
          orden?: number | null
          receta_id?: string
          sale_a_servicio?: boolean
          talla?: Database["public"]["Enums"]["talla_prenda"]
          unidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recetas_lineas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_lineas_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: false
            referencedRelation: "recetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_lineas_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["receta_id"]
          },
          {
            foreignKeyName: "recetas_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      reclamos: {
        Row: {
          acepta_terminos: boolean | null
          apoderado_documento: string | null
          apoderado_nombre: string | null
          cliente_direccion: string | null
          cliente_documento_numero: string
          cliente_documento_tipo: Database["public"]["Enums"]["tipo_documento_identidad"]
          cliente_email: string | null
          cliente_nombre: string
          cliente_telefono: string | null
          cliente_ubigeo: string | null
          comprobante_id: string | null
          created_at: string | null
          descripcion: string
          es_menor_edad: boolean | null
          estado: Database["public"]["Enums"]["estado_reclamo"]
          fecha: string
          fecha_respuesta: string | null
          id: string
          ip_consumidor: unknown
          monto_reclamado: number | null
          numero: string
          pdf_url: string | null
          pedido_consumidor: string | null
          pedido_web_id: string | null
          respondido_por: string | null
          respuesta: string | null
          tipo: Database["public"]["Enums"]["tipo_reclamo"]
          tipo_bien: string | null
          updated_at: string | null
          user_agent: string | null
          venta_id: string | null
        }
        Insert: {
          acepta_terminos?: boolean | null
          apoderado_documento?: string | null
          apoderado_nombre?: string | null
          cliente_direccion?: string | null
          cliente_documento_numero: string
          cliente_documento_tipo?: Database["public"]["Enums"]["tipo_documento_identidad"]
          cliente_email?: string | null
          cliente_nombre: string
          cliente_telefono?: string | null
          cliente_ubigeo?: string | null
          comprobante_id?: string | null
          created_at?: string | null
          descripcion: string
          es_menor_edad?: boolean | null
          estado?: Database["public"]["Enums"]["estado_reclamo"]
          fecha?: string
          fecha_respuesta?: string | null
          id?: string
          ip_consumidor?: unknown
          monto_reclamado?: number | null
          numero: string
          pdf_url?: string | null
          pedido_consumidor?: string | null
          pedido_web_id?: string | null
          respondido_por?: string | null
          respuesta?: string | null
          tipo: Database["public"]["Enums"]["tipo_reclamo"]
          tipo_bien?: string | null
          updated_at?: string | null
          user_agent?: string | null
          venta_id?: string | null
        }
        Update: {
          acepta_terminos?: boolean | null
          apoderado_documento?: string | null
          apoderado_nombre?: string | null
          cliente_direccion?: string | null
          cliente_documento_numero?: string
          cliente_documento_tipo?: Database["public"]["Enums"]["tipo_documento_identidad"]
          cliente_email?: string | null
          cliente_nombre?: string
          cliente_telefono?: string | null
          cliente_ubigeo?: string | null
          comprobante_id?: string | null
          created_at?: string | null
          descripcion?: string
          es_menor_edad?: boolean | null
          estado?: Database["public"]["Enums"]["estado_reclamo"]
          fecha?: string
          fecha_respuesta?: string | null
          id?: string
          ip_consumidor?: unknown
          monto_reclamado?: number | null
          numero?: string
          pdf_url?: string | null
          pedido_consumidor?: string | null
          pedido_web_id?: string | null
          respondido_por?: string | null
          respuesta?: string | null
          tipo?: Database["public"]["Enums"]["tipo_reclamo"]
          tipo_bien?: string | null
          updated_at?: string | null
          user_agent?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reclamos_cliente_ubigeo_fkey"
            columns: ["cliente_ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "reclamos_cliente_ubigeo_fkey"
            columns: ["cliente_ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "reclamos_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamos_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamos_pedido_web_id_fkey"
            columns: ["pedido_web_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      series_comprobantes: {
        Row: {
          activa: boolean | null
          almacen_id: string | null
          caja_id: string | null
          canal: Database["public"]["Enums"]["canal_venta"] | null
          created_at: string | null
          id: string
          observacion: string | null
          serie: string
          tipo: Database["public"]["Enums"]["tipo_comprobante"]
          ultimo_correlativo: number
        }
        Insert: {
          activa?: boolean | null
          almacen_id?: string | null
          caja_id?: string | null
          canal?: Database["public"]["Enums"]["canal_venta"] | null
          created_at?: string | null
          id?: string
          observacion?: string | null
          serie: string
          tipo: Database["public"]["Enums"]["tipo_comprobante"]
          ultimo_correlativo?: number
        }
        Update: {
          activa?: boolean | null
          almacen_id?: string | null
          caja_id?: string | null
          canal?: Database["public"]["Enums"]["canal_venta"] | null
          created_at?: string | null
          id?: string
          observacion?: string | null
          serie?: string
          tipo?: Database["public"]["Enums"]["tipo_comprobante"]
          ultimo_correlativo?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_comprobantes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_comprobantes_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_actual: {
        Row: {
          almacen_id: string
          cantidad: number
          costo_promedio: number | null
          id: number
          material_id: string | null
          material_lote_id: string | null
          ultima_actualizacion: string
          variante_id: string | null
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          costo_promedio?: number | null
          id?: number
          material_id?: string | null
          material_lote_id?: string | null
          ultima_actualizacion?: string
          variante_id?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          costo_promedio?: number | null
          id?: number
          material_id?: string | null
          material_lote_id?: string | null
          ultima_actualizacion?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_actual_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_actual_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_actual_material_lote_id_fkey"
            columns: ["material_lote_id"]
            isOneToOne: false
            referencedRelation: "materiales_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_actual_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      sunat_config: {
        Row: {
          activo: boolean
          ambiente: string
          certificado_password: string | null
          certificado_pfx_base64: string | null
          certificado_subject: string | null
          certificado_vencimiento: string | null
          clave_sol: string
          created_at: string | null
          empresa_id: string
          endpoint_consulta: string | null
          endpoint_factura: string
          endpoint_guia: string
          firmante_cargo: string | null
          firmante_nombre: string | null
          id: string
          updated_at: string | null
          usuario_sol: string
        }
        Insert: {
          activo?: boolean
          ambiente?: string
          certificado_password?: string | null
          certificado_pfx_base64?: string | null
          certificado_subject?: string | null
          certificado_vencimiento?: string | null
          clave_sol: string
          created_at?: string | null
          empresa_id: string
          endpoint_consulta?: string | null
          endpoint_factura?: string
          endpoint_guia?: string
          firmante_cargo?: string | null
          firmante_nombre?: string | null
          id?: string
          updated_at?: string | null
          usuario_sol: string
        }
        Update: {
          activo?: boolean
          ambiente?: string
          certificado_password?: string | null
          certificado_pfx_base64?: string | null
          certificado_subject?: string | null
          certificado_vencimiento?: string | null
          clave_sol?: string
          created_at?: string | null
          empresa_id?: string
          endpoint_consulta?: string | null
          endpoint_factura?: string
          endpoint_guia?: string
          firmante_cargo?: string | null
          firmante_nombre?: string | null
          id?: string
          updated_at?: string | null
          usuario_sol?: string
        }
        Relationships: [
          {
            foreignKeyName: "sunat_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      sunat_envios: {
        Row: {
          cdr_path: string | null
          cdr_xml: string | null
          comprobante_id: string | null
          duracion_ms: number | null
          endpoint_url: string | null
          exitoso: boolean | null
          fecha: string
          hash_documento: string | null
          http_status: number | null
          id: number
          intento: number
          notas: string | null
          observaciones: Json | null
          soap_fault: string | null
          sunat_codigo: string | null
          sunat_descripcion: string | null
          xml_enviado: string | null
          xml_zip_path: string | null
        }
        Insert: {
          cdr_path?: string | null
          cdr_xml?: string | null
          comprobante_id?: string | null
          duracion_ms?: number | null
          endpoint_url?: string | null
          exitoso?: boolean | null
          fecha?: string
          hash_documento?: string | null
          http_status?: number | null
          id?: number
          intento?: number
          notas?: string | null
          observaciones?: Json | null
          soap_fault?: string | null
          sunat_codigo?: string | null
          sunat_descripcion?: string | null
          xml_enviado?: string | null
          xml_zip_path?: string | null
        }
        Update: {
          cdr_path?: string | null
          cdr_xml?: string | null
          comprobante_id?: string | null
          duracion_ms?: number | null
          endpoint_url?: string | null
          exitoso?: boolean | null
          fecha?: string
          hash_documento?: string | null
          http_status?: number | null
          id?: number
          intento?: number
          notas?: string | null
          observaciones?: Json | null
          soap_fault?: string | null
          sunat_codigo?: string | null
          sunat_descripcion?: string | null
          xml_enviado?: string | null
          xml_zip_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sunat_envios_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sunat_envios_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
        ]
      }
      talleres: {
        Row: {
          activo: boolean
          banco: string | null
          calificacion: number | null
          codigo: string | null
          contacto_nombre: string | null
          created_at: string | null
          direccion: string | null
          emite_comprobante: boolean | null
          especialidades:
            | Database["public"]["Enums"]["tipo_proceso_produccion"][]
            | null
          id: string
          nombre: string
          notas: string | null
          numero_cuenta: string | null
          numero_documento: string | null
          telefono: string | null
          tipo_cuenta: string | null
          tipo_documento:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          ubigeo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          calificacion?: number | null
          codigo?: string | null
          contacto_nombre?: string | null
          created_at?: string | null
          direccion?: string | null
          emite_comprobante?: boolean | null
          especialidades?:
            | Database["public"]["Enums"]["tipo_proceso_produccion"][]
            | null
          id?: string
          nombre: string
          notas?: string | null
          numero_cuenta?: string | null
          numero_documento?: string | null
          telefono?: string | null
          tipo_cuenta?: string | null
          tipo_documento?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          ubigeo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          banco?: string | null
          calificacion?: number | null
          codigo?: string | null
          contacto_nombre?: string | null
          created_at?: string | null
          direccion?: string | null
          emite_comprobante?: boolean | null
          especialidades?:
            | Database["public"]["Enums"]["tipo_proceso_produccion"][]
            | null
          id?: string
          nombre?: string
          notas?: string | null
          numero_cuenta?: string | null
          numero_documento?: string | null
          telefono?: string | null
          tipo_cuenta?: string | null
          tipo_documento?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          ubigeo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talleres_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "talleres_ubigeo_fkey"
            columns: ["ubigeo"]
            isOneToOne: false
            referencedRelation: "v_ubigeo_completo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      talleres_tarifas: {
        Row: {
          created_at: string | null
          id: string
          observacion: string | null
          precio_unitario: number
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"] | null
          producto_id: string | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
          taller_id: string
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          observacion?: string | null
          precio_unitario: number
          proceso?:
            | Database["public"]["Enums"]["tipo_proceso_produccion"]
            | null
          producto_id?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
          taller_id: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          observacion?: string | null
          precio_unitario?: number
          proceso?:
            | Database["public"]["Enums"]["tipo_proceso_produccion"]
            | null
          producto_id?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
          taller_id?: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talleres_tarifas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talleres_tarifas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "talleres_tarifas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "talleres_tarifas_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_operacion: {
        Row: {
          area_id: string | null
          cantidad: number | null
          codigo_qr: string | null
          corte_id: string | null
          created_at: string | null
          duracion_min: number | null
          fin: string | null
          id: string
          inicio: string | null
          observacion: string | null
          operario_id: string | null
          ot_id: string | null
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"]
          producto_id: string | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Insert: {
          area_id?: string | null
          cantidad?: number | null
          codigo_qr?: string | null
          corte_id?: string | null
          created_at?: string | null
          duracion_min?: number | null
          fin?: string | null
          id?: string
          inicio?: string | null
          observacion?: string | null
          operario_id?: string | null
          ot_id?: string | null
          proceso: Database["public"]["Enums"]["tipo_proceso_produccion"]
          producto_id?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Update: {
          area_id?: string | null
          cantidad?: number | null
          codigo_qr?: string | null
          corte_id?: string | null
          created_at?: string | null
          duracion_min?: number | null
          fin?: string | null
          id?: string
          inicio?: string | null
          observacion?: string | null
          operario_id?: string | null
          ot_id?: string | null
          proceso?: Database["public"]["Enums"]["tipo_proceso_produccion"]
          producto_id?: string | null
          talla?: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_operacion_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operacion_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "ot_corte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operacion_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operacion_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operacion_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_operacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "tickets_operacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      traslados: {
        Row: {
          almacen_destino: string
          almacen_origen: string
          codigo: string
          created_at: string | null
          despachado_por: string | null
          estado: string
          fecha_despacho: string | null
          fecha_recepcion: string | null
          fecha_solicitud: string | null
          guia_remision: string | null
          id: string
          motivo: string | null
          observacion: string | null
          recibido_por: string | null
          solicitado_por: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_destino: string
          almacen_origen: string
          codigo: string
          created_at?: string | null
          despachado_por?: string | null
          estado?: string
          fecha_despacho?: string | null
          fecha_recepcion?: string | null
          fecha_solicitud?: string | null
          guia_remision?: string | null
          id?: string
          motivo?: string | null
          observacion?: string | null
          recibido_por?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_destino?: string
          almacen_origen?: string
          codigo?: string
          created_at?: string | null
          despachado_por?: string | null
          estado?: string
          fecha_despacho?: string | null
          fecha_recepcion?: string | null
          fecha_solicitud?: string | null
          guia_remision?: string | null
          id?: string
          motivo?: string | null
          observacion?: string | null
          recibido_por?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traslados_almacen_destino_fkey"
            columns: ["almacen_destino"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traslados_almacen_origen_fkey"
            columns: ["almacen_origen"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      traslados_lineas: {
        Row: {
          cantidad: number
          cantidad_recibida: number | null
          id: string
          material_id: string | null
          observacion: string | null
          traslado_id: string
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          cantidad_recibida?: number | null
          id?: string
          material_id?: string | null
          observacion?: string | null
          traslado_id: string
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number | null
          id?: string
          material_id?: string | null
          observacion?: string | null
          traslado_id?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traslados_lineas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traslados_lineas_traslado_id_fkey"
            columns: ["traslado_id"]
            isOneToOne: false
            referencedRelation: "traslados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traslados_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      trazabilidad_eventos: {
        Row: {
          almacen_destino: string | null
          almacen_origen: string | null
          cantidad: number | null
          cliente_id: string | null
          contexto: Json | null
          fecha: string
          id: number
          lote_pt_id: string | null
          observacion: string | null
          operario_id: string | null
          ot_id: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          taller_id: string | null
          tipo: string
          usuario_id: string | null
          variante_id: string | null
        }
        Insert: {
          almacen_destino?: string | null
          almacen_origen?: string | null
          cantidad?: number | null
          cliente_id?: string | null
          contexto?: Json | null
          fecha?: string
          id?: number
          lote_pt_id?: string | null
          observacion?: string | null
          operario_id?: string | null
          ot_id?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          taller_id?: string | null
          tipo: string
          usuario_id?: string | null
          variante_id?: string | null
        }
        Update: {
          almacen_destino?: string | null
          almacen_origen?: string | null
          cantidad?: number | null
          cliente_id?: string | null
          contexto?: Json | null
          fecha?: string
          id?: number
          lote_pt_id?: string | null
          observacion?: string | null
          operario_id?: string | null
          ot_id?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          taller_id?: string | null
          tipo?: string
          usuario_id?: string | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trazabilidad_eventos_almacen_destino_fkey"
            columns: ["almacen_destino"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_almacen_origen_fkey"
            columns: ["almacen_origen"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_lote_pt_id_fkey"
            columns: ["lote_pt_id"]
            isOneToOne: false
            referencedRelation: "lotes_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "v_ots_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trazabilidad_eventos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      ubigeo: {
        Row: {
          codigo: string
          codigo_reniec: string | null
          departamento: string
          departamento_codigo: string
          distrito: string
          latitud: number | null
          longitud: number | null
          provincia: string
          provincia_codigo: string
          region_geografica: string | null
        }
        Insert: {
          codigo: string
          codigo_reniec?: string | null
          departamento: string
          departamento_codigo: string
          distrito: string
          latitud?: number | null
          longitud?: number | null
          provincia: string
          provincia_codigo: string
          region_geografica?: string | null
        }
        Update: {
          codigo?: string
          codigo_reniec?: string | null
          departamento?: string
          departamento_codigo?: string
          distrito?: string
          latitud?: number | null
          longitud?: number | null
          provincia?: string
          provincia_codigo?: string
          region_geografica?: string | null
        }
        Relationships: []
      }
      unidades_medida: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string | null
          factor_conversion: number | null
          id: string
          nombre: string
          simbolo: string | null
          sunat_codigo: string | null
          tipo: string | null
          unidad_base: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string | null
          factor_conversion?: number | null
          id?: string
          nombre: string
          simbolo?: string | null
          sunat_codigo?: string | null
          tipo?: string | null
          unidad_base?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string | null
          factor_conversion?: number | null
          id?: string
          nombre?: string
          simbolo?: string | null
          sunat_codigo?: string | null
          tipo?: string | null
          unidad_base?: string | null
        }
        Relationships: []
      }
      usuarios_almacenes: {
        Row: {
          almacen_id: string
          usuario_id: string
        }
        Insert: {
          almacen_id: string
          usuario_id: string
        }
        Update: {
          almacen_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_almacenes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_roles: {
        Row: {
          otorgado_en: string
          otorgado_por: string | null
          rol: Database["public"]["Enums"]["rol_sistema"]
          usuario_id: string
        }
        Insert: {
          otorgado_en?: string
          otorgado_por?: string | null
          rol: Database["public"]["Enums"]["rol_sistema"]
          usuario_id: string
        }
        Update: {
          otorgado_en?: string
          otorgado_por?: string | null
          rol?: Database["public"]["Enums"]["rol_sistema"]
          usuario_id?: string
        }
        Relationships: []
      }
      ventas: {
        Row: {
          almacen_id: string
          caja_id: string | null
          caja_sesion_id: string | null
          canal: Database["public"]["Enums"]["canal_venta"]
          cliente_id: string | null
          comprobante_id: string | null
          created_at: string | null
          cupon_id: string | null
          descuento_total: number | null
          documento_cliente: string | null
          es_apartado: boolean | null
          estado: string
          fecha: string
          id: string
          igv: number
          moneda: string | null
          monto_apartado: number | null
          nombre_cliente_rapido: string | null
          numero: string
          observacion: string | null
          pedido_b2b_id: string | null
          pedido_web_id: string | null
          sub_total: number
          tipo_documento_cliente:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total: number
          updated_at: string | null
          vendedor_b2b_id: string | null
          vendedor_usuario_id: string | null
        }
        Insert: {
          almacen_id: string
          caja_id?: string | null
          caja_sesion_id?: string | null
          canal: Database["public"]["Enums"]["canal_venta"]
          cliente_id?: string | null
          comprobante_id?: string | null
          created_at?: string | null
          cupon_id?: string | null
          descuento_total?: number | null
          documento_cliente?: string | null
          es_apartado?: boolean | null
          estado?: string
          fecha?: string
          id?: string
          igv?: number
          moneda?: string | null
          monto_apartado?: number | null
          nombre_cliente_rapido?: string | null
          numero: string
          observacion?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          sub_total?: number
          tipo_documento_cliente?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total?: number
          updated_at?: string | null
          vendedor_b2b_id?: string | null
          vendedor_usuario_id?: string | null
        }
        Update: {
          almacen_id?: string
          caja_id?: string | null
          caja_sesion_id?: string | null
          canal?: Database["public"]["Enums"]["canal_venta"]
          cliente_id?: string | null
          comprobante_id?: string | null
          created_at?: string | null
          cupon_id?: string | null
          descuento_total?: number | null
          documento_cliente?: string | null
          es_apartado?: boolean | null
          estado?: string
          fecha?: string
          id?: string
          igv?: number
          moneda?: string | null
          monto_apartado?: number | null
          nombre_cliente_rapido?: string | null
          numero?: string
          observacion?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          sub_total?: number
          tipo_documento_cliente?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total?: number
          updated_at?: string | null
          vendedor_b2b_id?: string | null
          vendedor_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_caja_sesion_id_fkey"
            columns: ["caja_sesion_id"]
            isOneToOne: false
            referencedRelation: "cajas_sesiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_comprobante_fk"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_comprobante_fk"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cupon_fk"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_pedido_b2b_fk"
            columns: ["pedido_b2b_id"]
            isOneToOne: false
            referencedRelation: "pedidos_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_pedido_web_fk"
            columns: ["pedido_web_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_lineas: {
        Row: {
          cantidad: number
          descuento_monto: number | null
          descuento_porcentaje: number | null
          id: string
          igv: number | null
          lote_pt_id: string | null
          observacion: string | null
          precio_unitario: number
          sub_total: number | null
          variante_id: string
          venta_id: string
        }
        Insert: {
          cantidad: number
          descuento_monto?: number | null
          descuento_porcentaje?: number | null
          id?: string
          igv?: number | null
          lote_pt_id?: string | null
          observacion?: string | null
          precio_unitario: number
          sub_total?: number | null
          variante_id: string
          venta_id: string
        }
        Update: {
          cantidad?: number
          descuento_monto?: number | null
          descuento_porcentaje?: number | null
          id?: string
          igv?: number | null
          lote_pt_id?: string | null
          observacion?: string | null
          precio_unitario?: number
          sub_total?: number | null
          variante_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_lineas_lote_pt_id_fkey"
            columns: ["lote_pt_id"]
            isOneToOne: false
            referencedRelation: "lotes_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_lineas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_pagos: {
        Row: {
          created_at: string | null
          culqi_charge_id: string | null
          estado: string | null
          id: string
          izipay_transaction_id: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          referencia: string | null
          venta_id: string
          voucher_url: string | null
        }
        Insert: {
          created_at?: string | null
          culqi_charge_id?: string | null
          estado?: string | null
          id?: string
          izipay_transaction_id?: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          referencia?: string | null
          venta_id: string
          voucher_url?: string | null
        }
        Update: {
          created_at?: string | null
          culqi_charge_id?: string | null
          estado?: string | null
          id?: string
          izipay_transaction_id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          referencia?: string | null
          venta_id?: string
          voucher_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      web_banners: {
        Row: {
          activo: boolean | null
          campana_id: string | null
          created_at: string | null
          enlace: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          imagen_desktop_url: string
          imagen_mobile_url: string | null
          orden: number | null
          posicion: string | null
          subtitulo: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          campana_id?: string | null
          created_at?: string | null
          enlace?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          imagen_desktop_url: string
          imagen_mobile_url?: string | null
          orden?: number | null
          posicion?: string | null
          subtitulo?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          campana_id?: string | null
          created_at?: string | null
          enlace?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          imagen_desktop_url?: string
          imagen_mobile_url?: string | null
          orden?: number | null
          posicion?: string | null
          subtitulo?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_banners_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks_log: {
        Row: {
          created_at: string | null
          error: string | null
          evento: string | null
          id: number
          payload: Json | null
          procesado: boolean | null
          procesado_en: string | null
          proveedor: string
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          evento?: string | null
          id?: number
          payload?: Json | null
          procesado?: boolean | null
          procesado_en?: string | null
          proveedor: string
        }
        Update: {
          created_at?: string | null
          error?: string | null
          evento?: string | null
          id?: number
          payload?: Json | null
          procesado?: boolean | null
          procesado_en?: string | null
          proveedor?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_bom_activo: {
        Row: {
          cantidad: number | null
          cantidad_almacen: number | null
          categoria: Database["public"]["Enums"]["categoria_material"] | null
          costo_linea: number | null
          material_codigo: string | null
          material_id: string | null
          material_nombre: string | null
          precio_unitario: number | null
          producto_codigo: string | null
          producto_id: string | null
          producto_nombre: string | null
          receta_id: string | null
          receta_version: string | null
          sale_a_servicio: boolean | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
          unidad_codigo: string | null
          unidad_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recetas_lineas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cliente_nombre_completo: {
        Row: {
          id: string | null
          nombre_completo: string | null
        }
        Insert: {
          id?: string | null
          nombre_completo?: never
        }
        Update: {
          id?: string | null
          nombre_completo?: never
        }
        Relationships: []
      }
      v_comprobantes_sunat: {
        Row: {
          cdr_url: string | null
          cliente_id: string | null
          created_at: string | null
          descuento_global: number | null
          devolucion_id: string | null
          direccion_cliente: string | null
          documento_referencia_id: string | null
          estado: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          forma_pago: string | null
          hash_firma: string | null
          icbper: number | null
          id: string | null
          igv: number | null
          moneda: string | null
          motivo_nc_nd: string | null
          nota_interna: string | null
          numero: number | null
          numero_completo: string | null
          numero_documento_cliente: string | null
          pdf_url: string | null
          pedido_b2b_id: string | null
          pedido_web_id: string | null
          pse_proveedor: string | null
          pse_ticket: string | null
          razon_social_cliente: string | null
          serie: string | null
          sub_total: number | null
          sunat_aceptado_en: string | null
          sunat_codigo_respuesta: string | null
          sunat_enviado_en: string | null
          sunat_mensaje: string | null
          tipo: Database["public"]["Enums"]["tipo_comprobante"] | null
          tipo_cambio: number | null
          tipo_documento_cliente:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total: number | null
          total_letras: string | null
          ubigeo_cliente: string | null
          ultimo_codigo: string | null
          ultimo_envio_en: string | null
          ultimo_envio_exitoso: boolean | null
          ultimo_mensaje: string | null
          updated_at: string | null
          venta_id: string | null
          xml_firmado_url: string | null
        }
        Insert: {
          cdr_url?: string | null
          cliente_id?: string | null
          created_at?: string | null
          descuento_global?: number | null
          devolucion_id?: string | null
          direccion_cliente?: string | null
          documento_referencia_id?: string | null
          estado?: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          forma_pago?: string | null
          hash_firma?: string | null
          icbper?: number | null
          id?: string | null
          igv?: number | null
          moneda?: string | null
          motivo_nc_nd?: string | null
          nota_interna?: string | null
          numero?: number | null
          numero_completo?: string | null
          numero_documento_cliente?: string | null
          pdf_url?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          pse_proveedor?: string | null
          pse_ticket?: string | null
          razon_social_cliente?: string | null
          serie?: string | null
          sub_total?: number | null
          sunat_aceptado_en?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_mensaje?: string | null
          tipo?: Database["public"]["Enums"]["tipo_comprobante"] | null
          tipo_cambio?: number | null
          tipo_documento_cliente?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total?: number | null
          total_letras?: string | null
          ubigeo_cliente?: string | null
          ultimo_codigo?: never
          ultimo_envio_en?: never
          ultimo_envio_exitoso?: never
          ultimo_mensaje?: never
          updated_at?: string | null
          venta_id?: string | null
          xml_firmado_url?: string | null
        }
        Update: {
          cdr_url?: string | null
          cliente_id?: string | null
          created_at?: string | null
          descuento_global?: number | null
          devolucion_id?: string | null
          direccion_cliente?: string | null
          documento_referencia_id?: string | null
          estado?: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          forma_pago?: string | null
          hash_firma?: string | null
          icbper?: number | null
          id?: string | null
          igv?: number | null
          moneda?: string | null
          motivo_nc_nd?: string | null
          nota_interna?: string | null
          numero?: number | null
          numero_completo?: string | null
          numero_documento_cliente?: string | null
          pdf_url?: string | null
          pedido_b2b_id?: string | null
          pedido_web_id?: string | null
          pse_proveedor?: string | null
          pse_ticket?: string | null
          razon_social_cliente?: string | null
          serie?: string | null
          sub_total?: number | null
          sunat_aceptado_en?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_mensaje?: string | null
          tipo?: Database["public"]["Enums"]["tipo_comprobante"] | null
          tipo_cambio?: number | null
          tipo_documento_cliente?:
            | Database["public"]["Enums"]["tipo_documento_identidad"]
            | null
          total?: number | null
          total_letras?: string | null
          ubigeo_cliente?: string | null
          ultimo_codigo?: never
          ultimo_envio_en?: never
          ultimo_envio_exitoso?: never
          ultimo_mensaje?: never
          updated_at?: string | null
          venta_id?: string | null
          xml_firmado_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_nombre_completo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_documento_referencia_id_fkey"
            columns: ["documento_referencia_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_documento_referencia_id_fkey"
            columns: ["documento_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_sunat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_pedido_b2b_id_fkey"
            columns: ["pedido_b2b_id"]
            isOneToOne: false
            referencedRelation: "pedidos_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_pedido_web_fk"
            columns: ["pedido_web_id"]
            isOneToOne: false
            referencedRelation: "pedidos_web"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costo_materiales_producto: {
        Row: {
          costo_materiales: number | null
          producto_codigo: string | null
          producto_id: string | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
        }
        Relationships: []
      }
      v_cuentas_pagar: {
        Row: {
          estado: Database["public"]["Enums"]["estado_oc"] | null
          fecha: string | null
          fecha_entrega_esperada: string | null
          numero: string | null
          oc_id: string | null
          pagado: number | null
          proveedor: string | null
          proveedor_id: string | null
          saldo_pendiente: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_kpi_ventas_dia: {
        Row: {
          canal: Database["public"]["Enums"]["canal_venta"] | null
          dia: string | null
          monto_total: number | null
          ventas_count: number | null
        }
        Relationships: []
      }
      v_ots_pendientes: {
        Row: {
          atrasada: boolean | null
          cantidad_planificada: number | null
          cantidad_terminada: number | null
          dias_restantes: number | null
          estado: Database["public"]["Enums"]["estado_ot"] | null
          fecha_apertura: string | null
          fecha_entrega_objetivo: string | null
          id: string | null
          numero: string | null
        }
        Relationships: []
      }
      v_productos_rating: {
        Row: {
          producto_id: string | null
          promedio_rating: number | null
          total_resenas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_stock_alertas: {
        Row: {
          almacen: string | null
          almacen_id: string | null
          cantidad: number | null
          producto: string | null
          sku: string | null
          stock_minimo: number | null
          talla: Database["public"]["Enums"]["talla_prenda"] | null
          variante_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_actual_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_actual_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_variante_total: {
        Row: {
          stock_total: number | null
          variante_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_actual_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "productos_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_top_productos: {
        Row: {
          monto_total: number | null
          producto: string | null
          producto_id: string | null
          unidades_vendidas: number | null
          ventas_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_bom_activo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_materiales_producto"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_ubigeo_completo: {
        Row: {
          codigo: string | null
          departamento: string | null
          departamento_codigo: string | null
          distrito: string | null
          provincia: string | null
          provincia_codigo: string | null
          ruta: string | null
        }
        Insert: {
          codigo?: string | null
          departamento?: string | null
          departamento_codigo?: string | null
          distrito?: string | null
          provincia?: string | null
          provincia_codigo?: string | null
          ruta?: never
        }
        Update: {
          codigo?: string | null
          departamento?: string | null
          departamento_codigo?: string | null
          distrito?: string | null
          provincia?: string | null
          provincia_codigo?: string | null
          ruta?: never
        }
        Relationships: []
      }
    }
    Functions: {
      costeo_variante: {
        Args: { p_variante: string }
        Returns: {
          costo_confeccion: number
          costo_indirectos: number
          costo_materiales: number
          costo_total: number
        }[]
      }
      costo_confeccion: {
        Args: {
          p_producto: string
          p_talla: Database["public"]["Enums"]["talla_prenda"]
        }
        Returns: number
      }
      es_admin: { Args: never; Returns: boolean }
      explosion_materiales_plan: {
        Args: { p_plan: string }
        Returns: {
          cantidad_total: number
          categoria: Database["public"]["Enums"]["categoria_material"]
          material_codigo: string
          material_id: string
          material_nombre: string
          unidad: string
        }[]
      }
      fn_slug_unico_campana: {
        Args: { _base: string; _excluir?: string }
        Returns: string
      }
      fn_slug_unico_categoria: {
        Args: { _base: string; _excluir?: string }
        Returns: string
      }
      fn_slug_unico_publicacion: {
        Args: { _base: string; _excluir?: string }
        Returns: string
      }
      fn_slugify: { Args: { input: string }; Returns: string }
      generar_numero_oc: { Args: never; Returns: string }
      generar_numero_ot: { Args: never; Returns: string }
      generar_numero_pedido_web: { Args: never; Returns: string }
      generar_numero_reclamo: { Args: never; Returns: string }
      log_audit: {
        Args: {
          p_accion: string
          p_contexto?: Json
          p_diff?: Json
          p_registro_id: string
          p_tabla: string
        }
        Returns: undefined
      }
      next_correlativo: {
        Args: { p_clave: string; p_padding?: number }
        Returns: string
      }
      puede_acceder_almacen: { Args: { p_almacen: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stock_de_variante: {
        Args: { p_almacen?: string; p_variante: string }
        Returns: number
      }
      tiene_algun_rol: {
        Args: { p_roles: Database["public"]["Enums"]["rol_sistema"][] }
        Returns: boolean
      }
      tiene_rol: {
        Args: { p_rol: Database["public"]["Enums"]["rol_sistema"] }
        Returns: boolean
      }
      timeline_lote: {
        Args: { p_lote: string }
        Returns: {
          almacen_destino: string
          almacen_origen: string
          cantidad: number
          cliente: string
          descripcion: string
          fecha: string
          operario: string
          tipo: string
        }[]
      }
      unaccent_lower: { Args: { "": string }; Returns: string }
    }
    Enums: {
      canal_venta: "POS" | "WEB" | "B2B" | "WHATSAPP" | "REDES"
      categoria_material: "TELA" | "AVIO" | "INSUMO" | "EMPAQUE"
      estado_comprobante:
        | "BORRADOR"
        | "EMITIDO"
        | "ACEPTADO"
        | "OBSERVADO"
        | "RECHAZADO"
        | "ANULADO"
      estado_oc:
        | "BORRADOR"
        | "APROBADA"
        | "ENVIADA"
        | "PARCIAL"
        | "RECIBIDA"
        | "PAGADA"
        | "CANCELADA"
      estado_ot:
        | "BORRADOR"
        | "PLANIFICADA"
        | "EN_CORTE"
        | "EN_HABILITADO"
        | "EN_SERVICIO"
        | "EN_DECORADO"
        | "EN_CONTROL_CALIDAD"
        | "COMPLETADA"
        | "CANCELADA"
      estado_pedido_web:
        | "PENDIENTE_PAGO"
        | "PAGO_VERIFICADO"
        | "EN_PREPARACION"
        | "LISTO_RECOJO"
        | "EN_DELIVERY"
        | "ENTREGADO"
        | "CANCELADO"
        | "WHATSAPP_DERIVADO"
      estado_reclamo: "NUEVO" | "EN_REVISION" | "RESUELTO" | "DESESTIMADO"
      metodo_pago:
        | "EFECTIVO"
        | "YAPE"
        | "PLIN"
        | "TARJETA_DEBITO"
        | "TARJETA_CREDITO"
        | "TRANSFERENCIA"
        | "DEPOSITO"
        | "CREDITO"
        | "WHATSAPP_PENDIENTE"
      rol_sistema:
        | "gerente"
        | "jefe_produccion"
        | "operario"
        | "almacenero"
        | "cajero"
        | "vendedor_b2b"
        | "contador"
        | "cliente"
      talla_prenda:
        | "T0"
        | "T2"
        | "T4"
        | "T6"
        | "T8"
        | "T10"
        | "T12"
        | "T14"
        | "T16"
        | "TS"
        | "TAD"
      tipo_almacen:
        | "MATERIA_PRIMA"
        | "PRODUCTO_TERMINADO"
        | "TIENDA"
        | "PRODUCCION"
        | "TALLER_EXTERNO"
        | "MERMA"
      tipo_cliente:
        | "PUBLICO_FINAL"
        | "MAYORISTA_A"
        | "MAYORISTA_B"
        | "MAYORISTA_C"
        | "INDUSTRIAL"
      tipo_comprobante:
        | "NOTA_VENTA"
        | "BOLETA"
        | "FACTURA"
        | "NOTA_CREDITO"
        | "NOTA_DEBITO"
        | "GUIA_REMISION"
      tipo_documento_identidad: "DNI" | "RUC" | "CE" | "PASAPORTE"
      tipo_movimiento_kardex:
        | "ENTRADA_COMPRA"
        | "ENTRADA_PRODUCCION"
        | "ENTRADA_DEVOLUCION_CLIENTE"
        | "ENTRADA_DEVOLUCION_TALLER"
        | "ENTRADA_TRASLADO"
        | "ENTRADA_AJUSTE"
        | "SALIDA_VENTA"
        | "SALIDA_PRODUCCION"
        | "SALIDA_TRASLADO"
        | "SALIDA_TALLER_SERVICIO"
        | "SALIDA_AJUSTE"
        | "SALIDA_MERMA"
      tipo_oc: "NACIONAL" | "IMPORTACION" | "SERVICIO_TALLER"
      tipo_proceso_produccion:
        | "TRAZADO"
        | "TENDIDO"
        | "CORTE"
        | "HABILITADO"
        | "COSTURA"
        | "BORDADO"
        | "ESTAMPADO"
        | "SUBLIMADO"
        | "PLISADO"
        | "ACABADO"
        | "PLANCHADO"
        | "OJAL_BOTON"
        | "CONTROL_CALIDAD"
        | "EMBALAJE"
        | "DECORADO"
      tipo_reclamo: "RECLAMO" | "QUEJA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_venta: ["POS", "WEB", "B2B", "WHATSAPP", "REDES"],
      categoria_material: ["TELA", "AVIO", "INSUMO", "EMPAQUE"],
      estado_comprobante: [
        "BORRADOR",
        "EMITIDO",
        "ACEPTADO",
        "OBSERVADO",
        "RECHAZADO",
        "ANULADO",
      ],
      estado_oc: [
        "BORRADOR",
        "APROBADA",
        "ENVIADA",
        "PARCIAL",
        "RECIBIDA",
        "PAGADA",
        "CANCELADA",
      ],
      estado_ot: [
        "BORRADOR",
        "PLANIFICADA",
        "EN_CORTE",
        "EN_HABILITADO",
        "EN_SERVICIO",
        "EN_DECORADO",
        "EN_CONTROL_CALIDAD",
        "COMPLETADA",
        "CANCELADA",
      ],
      estado_pedido_web: [
        "PENDIENTE_PAGO",
        "PAGO_VERIFICADO",
        "EN_PREPARACION",
        "LISTO_RECOJO",
        "EN_DELIVERY",
        "ENTREGADO",
        "CANCELADO",
        "WHATSAPP_DERIVADO",
      ],
      estado_reclamo: ["NUEVO", "EN_REVISION", "RESUELTO", "DESESTIMADO"],
      metodo_pago: [
        "EFECTIVO",
        "YAPE",
        "PLIN",
        "TARJETA_DEBITO",
        "TARJETA_CREDITO",
        "TRANSFERENCIA",
        "DEPOSITO",
        "CREDITO",
        "WHATSAPP_PENDIENTE",
      ],
      rol_sistema: [
        "gerente",
        "jefe_produccion",
        "operario",
        "almacenero",
        "cajero",
        "vendedor_b2b",
        "contador",
        "cliente",
      ],
      talla_prenda: [
        "T0",
        "T2",
        "T4",
        "T6",
        "T8",
        "T10",
        "T12",
        "T14",
        "T16",
        "TS",
        "TAD",
      ],
      tipo_almacen: [
        "MATERIA_PRIMA",
        "PRODUCTO_TERMINADO",
        "TIENDA",
        "PRODUCCION",
        "TALLER_EXTERNO",
        "MERMA",
      ],
      tipo_cliente: [
        "PUBLICO_FINAL",
        "MAYORISTA_A",
        "MAYORISTA_B",
        "MAYORISTA_C",
        "INDUSTRIAL",
      ],
      tipo_comprobante: [
        "NOTA_VENTA",
        "BOLETA",
        "FACTURA",
        "NOTA_CREDITO",
        "NOTA_DEBITO",
        "GUIA_REMISION",
      ],
      tipo_documento_identidad: ["DNI", "RUC", "CE", "PASAPORTE"],
      tipo_movimiento_kardex: [
        "ENTRADA_COMPRA",
        "ENTRADA_PRODUCCION",
        "ENTRADA_DEVOLUCION_CLIENTE",
        "ENTRADA_DEVOLUCION_TALLER",
        "ENTRADA_TRASLADO",
        "ENTRADA_AJUSTE",
        "SALIDA_VENTA",
        "SALIDA_PRODUCCION",
        "SALIDA_TRASLADO",
        "SALIDA_TALLER_SERVICIO",
        "SALIDA_AJUSTE",
        "SALIDA_MERMA",
      ],
      tipo_oc: ["NACIONAL", "IMPORTACION", "SERVICIO_TALLER"],
      tipo_proceso_produccion: [
        "TRAZADO",
        "TENDIDO",
        "CORTE",
        "HABILITADO",
        "COSTURA",
        "BORDADO",
        "ESTAMPADO",
        "SUBLIMADO",
        "PLISADO",
        "ACABADO",
        "PLANCHADO",
        "OJAL_BOTON",
        "CONTROL_CALIDAD",
        "EMBALAJE",
        "DECORADO",
      ],
      tipo_reclamo: ["RECLAMO", "QUEJA"],
    },
  },
} as const
