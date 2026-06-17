'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Pencil, Key, Power, PowerOff, Loader2, X, Shield } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearUsuario,
  actualizarPerfilUsuario,
  actualizarRolesUsuario,
  cambiarPasswordUsuario,
  cambiarEstadoUsuario,
  type UsuarioRow,
} from '@/server/actions/usuarios';
import { ROLES_SISTEMA, DESCRIPCION_ROL, type RolSistema } from '@/server/actions/usuarios-helpers';

export function UsuariosClient({ initialUsuarios }: { initialUsuarios: UsuarioRow[] }) {
  const router = useRouter();
  const [usuarios] = useState<UsuarioRow[]>(initialUsuarios);
  const [filtro, setFiltro] = useState('');
  const [openNuevo, setOpenNuevo] = useState(false);
  const [editando, setEditando] = useState<UsuarioRow | null>(null);
  const [editTab, setEditTab] = useState<'perfil' | 'roles' | 'password'>('perfil');

  const filtrados = usuarios.filter((u) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (
      u.nombre_completo?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.cargo?.toLowerCase().includes(q) ||
      u.dni?.includes(q) ||
      u.roles.some((r) => r.includes(q))
    );
  });

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre, email, DNI, cargo, rol…"
          className="max-w-md"
        />
        <Button variant="premium" size="sm" onClick={() => setOpenNuevo(true)}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
        <span className="ml-auto text-xs text-slate-500">{filtrados.length} de {usuarios.length} usuarios</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Sin usuarios.
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map((u) => (
                <UsuarioFila key={u.id} u={u} onEdit={(tab) => { setEditando(u); setEditTab(tab); }} onRefresh={refresh} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {openNuevo && (
        <NuevoUsuarioModal
          onClose={() => setOpenNuevo(false)}
          onCreated={() => { setOpenNuevo(false); refresh(); }}
        />
      )}
      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          initialTab={editTab}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); refresh(); }}
        />
      )}
    </div>
  );
}

function UsuarioFila({
  u, onEdit, onRefresh,
}: {
  u: UsuarioRow;
  onEdit: (tab: 'perfil' | 'roles' | 'password') => void;
  onRefresh: () => void;
}) {
  const [pending, start] = useTransition();
  function toggle() {
    if (!confirm(`¿${u.activo ? 'Desactivar' : 'Reactivar'} a ${u.nombre_completo}?`)) return;
    start(async () => {
      const r = await cambiarEstadoUsuario(u.id, !u.activo);
      if (r.ok) {
        toast.success(`${u.activo ? 'Desactivado' : 'Reactivado'} OK`);
        onRefresh();
      } else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <TableRow className={u.activo ? '' : 'opacity-60'}>
      <TableCell className="font-medium">{u.nombre_completo ?? '—'}</TableCell>
      <TableCell className="text-xs text-slate-600">{u.email ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs">{u.dni ?? '—'}</TableCell>
      <TableCell className="text-sm">{u.cargo ?? '—'}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {u.roles.length === 0 && <span className="text-xs text-slate-400">sin roles</span>}
          {u.roles.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        {u.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit('perfil')} title="Editar perfil">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit('roles')} title="Cambiar roles">
            <Shield className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit('password')} title="Cambiar contraseña">
            <Key className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggle} disabled={pending} title={u.activo ? 'Desactivar' : 'Reactivar'}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.activo ? <PowerOff className="h-3.5 w-3.5 text-rose-500" /> : <Power className="h-3.5 w-3.5 text-emerald-600" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MODAL NUEVO USUARIO
// ─────────────────────────────────────────────────────────────────────────
function NuevoUsuarioModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [cargo, setCargo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [roles, setRoles] = useState<Set<RolSistema>>(new Set(['cliente']));

  function toggleRol(r: RolSistema) {
    const next = new Set(roles);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setRoles(next);
  }

  function submit() {
    if (!email || !password || !nombre) {
      toast.error('Email, contraseña y nombre son obligatorios');
      return;
    }
    if (roles.size === 0) {
      toast.error('Asigná al menos un rol');
      return;
    }
    start(async () => {
      const r = await crearUsuario({
        email, password, nombre_completo: nombre,
        dni: dni || '', cargo: cargo || '', telefono: telefono || '',
        roles: [...roles],
      });
      if (r.ok) {
        toast.success('Usuario creado');
        onCreated();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email *">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase().trim())} placeholder="usuario@happys.pe" />
        </Field>
        <Field label="Contraseña *" hint="Mínimo 8 caracteres">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="Nombre completo *">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
        </Field>
        <Field label="DNI">
          <Input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="12345678" maxLength={20} />
        </Field>
        <Field label="Cargo">
          <Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Operario / Cajero / etc." />
        </Field>
        <Field label="Teléfono">
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="987654321" />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-700">Roles asignados *</p>
        <RolesGrid roles={roles} onToggle={toggleRol} />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
        <Button variant="premium" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Crear usuario
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MODAL EDITAR USUARIO (3 tabs)
// ─────────────────────────────────────────────────────────────────────────
function EditarUsuarioModal({
  usuario, initialTab, onClose, onSaved,
}: {
  usuario: UsuarioRow;
  initialTab: 'perfil' | 'roles' | 'password';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState(initialTab);

  return (
    <Modal title={`Editar ${usuario.nombre_completo ?? usuario.email}`} onClose={onClose}>
      <div className="mb-4 flex border-b border-slate-200">
        <TabBtn active={tab === 'perfil'} onClick={() => setTab('perfil')}>Perfil</TabBtn>
        <TabBtn active={tab === 'roles'} onClick={() => setTab('roles')}>Roles</TabBtn>
        <TabBtn active={tab === 'password'} onClick={() => setTab('password')}>Contraseña</TabBtn>
      </div>
      {tab === 'perfil' && <PerfilTab usuario={usuario} onSaved={onSaved} />}
      {tab === 'roles' && <RolesTab usuario={usuario} onSaved={onSaved} />}
      {tab === 'password' && <PasswordTab usuario={usuario} onSaved={onSaved} />}
    </Modal>
  );
}

function PerfilTab({ usuario, onSaved }: { usuario: UsuarioRow; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [nombre, setNombre] = useState(usuario.nombre_completo ?? '');
  const [dni, setDni] = useState(usuario.dni ?? '');
  const [cargo, setCargo] = useState(usuario.cargo ?? '');
  const [telefono, setTelefono] = useState(usuario.telefono ?? '');
  function submit() {
    start(async () => {
      const r = await actualizarPerfilUsuario(usuario.id, { nombre_completo: nombre, dni, cargo, telefono });
      if (r.ok) { toast.success('Perfil actualizado'); onSaved(); }
      else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <div className="space-y-3">
      <Field label="Nombre completo *">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Field>
      <Field label="DNI">
        <Input value={dni} onChange={(e) => setDni(e.target.value)} maxLength={20} />
      </Field>
      <Field label="Cargo">
        <Input value={cargo} onChange={(e) => setCargo(e.target.value)} />
      </Field>
      <Field label="Teléfono">
        <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </Field>
      <div className="flex justify-end pt-2">
        <Button variant="premium" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar perfil
        </Button>
      </div>
    </div>
  );
}

function RolesTab({ usuario, onSaved }: { usuario: UsuarioRow; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [roles, setRoles] = useState<Set<RolSistema>>(
    new Set(usuario.roles.filter((r): r is RolSistema => (ROLES_SISTEMA as readonly string[]).includes(r))),
  );
  function toggleRol(r: RolSistema) {
    const next = new Set(roles);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setRoles(next);
  }
  function submit() {
    if (roles.size === 0) {
      toast.error('Asigná al menos un rol');
      return;
    }
    start(async () => {
      const r = await actualizarRolesUsuario(usuario.id, [...roles]);
      if (r.ok) { toast.success('Roles actualizados'); onSaved(); }
      else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <div className="space-y-3">
      <RolesGrid roles={roles} onToggle={toggleRol} />
      <div className="flex justify-end pt-2">
        <Button variant="premium" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar roles
        </Button>
      </div>
    </div>
  );
}

function PasswordTab({ usuario, onSaved }: { usuario: UsuarioRow; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  function submit() {
    if (pass.length < 8) { toast.error('Mínimo 8 caracteres'); return; }
    if (pass !== pass2) { toast.error('Las contraseñas no coinciden'); return; }
    if (!confirm(`¿Cambiar la contraseña de ${usuario.nombre_completo ?? usuario.email}?`)) return;
    start(async () => {
      const r = await cambiarPasswordUsuario(usuario.id, { password: pass });
      if (r.ok) { toast.success('Contraseña cambiada'); setPass(''); setPass2(''); onSaved(); }
      else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
        ⚠ El usuario tendrá que usar esta nueva contraseña en su próximo login. Comunicáselo de forma segura.
      </p>
      <Field label="Nueva contraseña *" hint="Mínimo 8 caracteres">
        <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
      </Field>
      <Field label="Repetir contraseña *">
        <Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" />
      </Field>
      <div className="flex justify-end pt-2">
        <Button variant="premium" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Cambiar contraseña
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PRIMITIVOS
// ─────────────────────────────────────────────────────────────────────────
function RolesGrid({ roles, onToggle }: { roles: Set<RolSistema>; onToggle: (r: RolSistema) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLES_SISTEMA.map((r) => {
        const sel = roles.has(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => onToggle(r)}
            className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition ${
              sel ? 'border-happy-500 bg-happy-50' : 'border-slate-200 bg-white hover:border-happy-300'
            }`}
          >
            <input type="checkbox" checked={sel} readOnly className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-corp-900">{r}</div>
              <div className="text-[10px] text-slate-500">{DESCRIPCION_ROL[r]}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-corp-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? 'border-happy-500 text-happy-700' : 'border-transparent text-slate-500 hover:text-corp-900'
      }`}
    >
      {children}
    </button>
  );
}
