import { Info, FileEdit, Calendar, Scissors, Layers, Send, Brush, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';

type Estado =
  | 'BORRADOR'
  | 'PLANIFICADA'
  | 'EN_CORTE'
  | 'EN_HABILITADO'
  | 'EN_SERVICIO'
  | 'EN_DECORADO'
  | 'EN_CONTROL_CALIDAD'
  | 'COMPLETADA'
  | 'CANCELADA';

type Config = {
  icon: typeof Info;
  titulo: string;
  descripcion: string;
  proximoPaso: string;
  tone: 'amber' | 'blue' | 'orange' | 'emerald' | 'red';
};

const ESTADOS: Record<Estado, Config> = {
  BORRADOR: {
    icon: FileEdit,
    titulo: 'Borrador — estás definiendo las líneas a producir',
    descripcion:
      'La OT aún no entró en producción. Acá podés agregar/quitar líneas (producto × talla × cantidad). Las columnas Cortado, Fallas y Terminado se irán llenando cuando la OT avance por las etapas reales del taller.',
    proximoPaso: 'Cuando esté lista, pasala a PLANIFICADA con el botón de arriba para iniciar el flujo.',
    tone: 'amber',
  },
  PLANIFICADA: {
    icon: Calendar,
    titulo: 'Planificada — esperando entrar a corte',
    descripcion:
      'La OT ya está aprobada pero todavía no se cortó nada. Cuando arranque el corte físico, pasala a EN_CORTE.',
    proximoPaso: 'Próximo: EN_CORTE.',
    tone: 'blue',
  },
  EN_CORTE: {
    icon: Scissors,
    titulo: 'En corte — declarando unidades cortadas',
    descripcion:
      'Mientras se corta, usá el botón "Editar" de cada línea para registrar el avance (cortado + fallas, en unidades acumuladas). La columna Terminado todavía marca 0 — se completa al cierre.',
    proximoPaso: 'Próximo: EN_HABILITADO o EN_SERVICIO.',
    tone: 'orange',
  },
  EN_HABILITADO: {
    icon: Layers,
    titulo: 'Habilitado — armado de paquetes para taller',
    descripcion:
      'Se están armando los paquetes de prendas cortadas para enviar a costura/taller. El cortado declarado ya está fijo en esta etapa.',
    proximoPaso: 'Próximo: EN_SERVICIO (con orden de servicio al taller).',
    tone: 'orange',
  },
  EN_SERVICIO: {
    icon: Send,
    titulo: 'En servicio — confección en taller externo',
    descripcion:
      'Las prendas están en el taller. Los avances reales del taller se registran desde Órdenes de Servicio.',
    proximoPaso: 'Próximo: EN_DECORADO (si lleva estampado/bordado) o EN_CONTROL_CALIDAD.',
    tone: 'orange',
  },
  EN_DECORADO: {
    icon: Brush,
    titulo: 'En decorado — estampado / bordado',
    descripcion:
      'Las prendas están en proceso de decoración (estampado, sublimado, bordado, etc.). Tampoco se actualiza Terminado en esta etapa.',
    proximoPaso: 'Próximo: EN_CONTROL_CALIDAD.',
    tone: 'orange',
  },
  EN_CONTROL_CALIDAD: {
    icon: ShieldCheck,
    titulo: 'En control de calidad — listo para cerrar',
    descripcion:
      'Las prendas están siendo revisadas. Cuando estén OK, usá "Cerrar OT" arriba para registrarlas como Producto Terminado en almacén y bloquear más cambios. Recién ahí se completa la columna Terminado.',
    proximoPaso: 'Próximo: COMPLETADA (cierre + ingreso a PT).',
    tone: 'orange',
  },
  COMPLETADA: {
    icon: CheckCircle2,
    titulo: 'Completada — registrada como PT en almacén',
    descripcion:
      'La OT cerró correctamente. La columna Terminado refleja las unidades reales que ingresaron a almacén (cortado − fallas por línea). No se permite más edición.',
    proximoPaso: '',
    tone: 'emerald',
  },
  CANCELADA: {
    icon: XCircle,
    titulo: 'Cancelada',
    descripcion:
      'Esta OT fue cancelada. Las cantidades reales (cortado/fallas) quedaron registradas pero no se generaron lotes de PT. No se permite edición.',
    proximoPaso: '',
    tone: 'red',
  },
};

const TONES: Record<Config['tone'], { border: string; bg: string; icon: string; title: string; body: string }> = {
  amber:   { border: 'border-amber-300',   bg: 'bg-amber-50',   icon: 'text-amber-600',   title: 'text-amber-900',   body: 'text-amber-800'   },
  blue:    { border: 'border-blue-300',    bg: 'bg-blue-50',    icon: 'text-blue-600',    title: 'text-blue-900',    body: 'text-blue-800'    },
  orange:  { border: 'border-orange-300',  bg: 'bg-orange-50',  icon: 'text-orange-600',  title: 'text-orange-900',  body: 'text-orange-800'  },
  emerald: { border: 'border-emerald-300', bg: 'bg-emerald-50', icon: 'text-emerald-600', title: 'text-emerald-900', body: 'text-emerald-800' },
  red:     { border: 'border-red-300',     bg: 'bg-red-50',     icon: 'text-red-600',     title: 'text-red-900',     body: 'text-red-800'     },
};

export function EstadoBanner({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado as Estado];
  if (!cfg) return null;
  const Icon = cfg.icon;
  const t = TONES[cfg.tone];
  return (
    <div className={`flex items-start gap-3 rounded-lg border-2 ${t.border} ${t.bg} px-4 py-3`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.icon}`} />
      <div className="flex-1">
        <p className={`text-sm font-semibold ${t.title}`}>{cfg.titulo}</p>
        <p className={`mt-0.5 text-xs ${t.body}`}>{cfg.descripcion}</p>
        {cfg.proximoPaso && (
          <p className={`mt-1 text-xs font-medium ${t.body}`}>{cfg.proximoPaso}</p>
        )}
      </div>
    </div>
  );
}
