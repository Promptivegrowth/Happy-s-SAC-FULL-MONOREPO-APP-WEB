'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Switch } from '@happy/ui/switch';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@happy/ui/dialog';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearCuentaBancaria,
  actualizarCuentaBancaria,
  eliminarCuentaBancaria,
  toggleCuentaActiva,
} from '@/server/actions/cuentas-bancarias';
import type { Cuenta } from './page';

const METODOS = [
  'EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO',
  'TRANSFERENCIA', 'DEPOSITO', 'CREDITO', 'WHATSAPP_PENDIENTE',
] as const;

function FormModal({
  initial,
  open,
  onOpenChange,
}: {
  initial?: Cuenta;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isEdit = Boolean(initial?.id);
  const [nombre, setNombre] = useState(initial?.nombre_corto ?? '');
  const [banco, setBanco] = useState(initial?.banco ?? '');
  const [titular, setTitular] = useState(initial?.titular ?? '');
  const [numeroCuenta, setNumeroCuenta] = useState(initial?.numero_cuenta ?? '');
  const [numeroCci, setNumeroCci] = useState(initial?.numero_cci ?? '');
  const [numeroTelefono, setNumeroTelefono] = useState(initial?.numero_telefono ?? '');
  const [metodoDefault, setMetodoDefault] = useState<typeof METODOS[number]>(
    (initial?.metodo_default as typeof METODOS[number]) ?? 'TRANSFERENCIA',
  );
  const [visiblePos, setVisiblePos] = useState(initial?.visible_pos ?? true);
  const [visibleWeb, setVisibleWeb] = useState(initial?.visible_web ?? false);
  const [orden, setOrden] = useState<string>((initial?.orden ?? 0).toString());
  const [activo, setActivo] = useState(initial?.activo ?? true);
  const [notas, setNotas] = useState(initial?.notas ?? '');

  function submit() {
    if (!nombre.trim()) {
      toast.error('El nombre corto es obligatorio');
      return;
    }
    const ordenN = orden.trim() ? Number(orden) : 0;
    start(async () => {
      const input = {
        nombre_corto: nombre.trim(),
        banco,
        titular,
        numero_cuenta: numeroCuenta,
        numero_cci: numeroCci,
        numero_telefono: numeroTelefono,
        metodo_default: metodoDefault,
        visible_pos: visiblePos,
        visible_web: visibleWeb,
        orden: ordenN,
        activo,
        notas,
      };
      const r = isEdit
        ? await actualizarCuentaBancaria(initial!.id, input)
        : await crearCuentaBancaria(input);
      if (r.ok) {
        toast.success(isEdit ? 'Cuenta actualizada' : 'Cuenta creada');
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar cuenta' : 'Nueva cuenta bancaria'}</DialogTitle>
          <DialogDescription>
            Aparece como medio de pago en el POS y/o web según los switches de visibilidad.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nombre">Nombre corto *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: BCP HAPPYS"
              maxLength={60}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="banco">Banco</Label>
            <Input
              id="banco"
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              placeholder="BCP, INTERBANK, BBVA…"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="titular">Titular</Label>
            <Input
              id="titular"
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="HAPPY SAC / JAVIER…"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numero">Nº cuenta</Label>
            <Input
              id="numero"
              value={numeroCuenta}
              onChange={(e) => setNumeroCuenta(e.target.value)}
              placeholder="Opcional"
              disabled={pending}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cci">Nº CCI</Label>
            <Input
              id="cci"
              value={numeroCci}
              onChange={(e) => setNumeroCci(e.target.value)}
              placeholder="Opcional"
              disabled={pending}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="telefono">Nº teléfono (Yape/Plin)</Label>
            <Input
              id="telefono"
              value={numeroTelefono}
              onChange={(e) => setNumeroTelefono(e.target.value)}
              placeholder="Ej: 915109463"
              disabled={pending}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metodo">Método por defecto</Label>
            <select
              id="metodo"
              value={metodoDefault}
              onChange={(e) => setMetodoDefault(e.target.value as typeof METODOS[number])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={pending}
            >
              {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orden">Orden</Label>
            <Input
              id="orden"
              type="number"
              min="0"
              step="10"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <Input
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={500}
              disabled={pending}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm">
            <Switch checked={visiblePos} onCheckedChange={setVisiblePos} />
            <span>{visiblePos ? 'Visible en POS' : 'Oculto del POS'}</span>
          </div>
          <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm">
            <Switch checked={visibleWeb} onCheckedChange={setVisibleWeb} />
            <span>{visibleWeb ? 'Visible en Web' : 'Oculto de la Web'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm">
          <Switch checked={activo} onCheckedChange={setActivo} />
          <span className={activo ? 'text-emerald-700' : 'text-slate-500'}>
            {activo ? 'Activa' : 'Inactiva (oculta de ambos)'}
          </span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button variant="premium" onClick={submit} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : isEdit ? 'Guardar cambios' : 'Crear cuenta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nueva cuenta
      </Button>
      {open && <FormModal open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function EditButton({ cuenta }: { cuenta: Cuenta }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {open && <FormModal initial={cuenta} open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function DeleteButton({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (!confirm(`¿Eliminar la cuenta "${nombre}"?`)) return;
    start(async () => {
      const r = await eliminarCuentaBancaria(id);
      if (r.ok) {
        toast.success('Cuenta eliminada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} title="Eliminar">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
    </Button>
  );
}

export function ToggleActiva({ id, activo }: { id: string; activo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(activo);

  function onChange(v: boolean) {
    setVal(v);
    start(async () => {
      const r = await toggleCuentaActiva(id, v);
      if (r.ok) {
        toast.success(v ? 'Cuenta activa' : 'Cuenta desactivada');
        router.refresh();
      } else {
        setVal(!v);
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return <Switch checked={val} onCheckedChange={onChange} disabled={pending} />;
}
