'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Button } from '@happy/ui/button';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { UbigeoSelect } from '@/components/forms/ubigeo-select';
import { MOTIVOS_TRASLADO, validarGuia, type MotivoTraslado } from '@happy/lib/sunat-ubl/despatch';
import { emitirGuia, buscarVariantesGuia, type VarianteGuia } from '@/server/actions/guias';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search, Send, Trash2, Truck, Car } from 'lucide-react';

export type ItemGuia = { variante_id?: string | null; codigo: string; descripcion: string; cantidad: number };

export type GuiaInicial = {
  venta_id?: string | null;
  comprobante_id?: string | null;
  cliente_id?: string | null;
  documento?: string;
  almacen_partida_id?: string | null;
  destinatario_tipo_doc?: '1' | '6' | '4' | '7';
  destinatario_num_doc?: string;
  destinatario_nombre?: string;
  motivo?: MotivoTraslado;
  motivo_descripcion?: string;
  modalidad?: '01' | '02';
  peso_bruto_kg?: string;
  num_bultos?: string;
  transportista_ruc?: string;
  transportista_razon_social?: string;
  transportista_mtc?: string;
  placa?: string;
  conductor_dni?: string;
  conductor_nombres?: string;
  conductor_apellidos?: string;
  conductor_licencia?: string;
  vehiculo_m1l?: boolean;
  partida_direccion?: string;
  partida_ubigeo?: string;
  partida_cod_establecimiento?: string;
  llegada_direccion?: string;
  llegada_ubigeo?: string;
  llegada_cod_establecimiento?: string;
  observacion?: string;
  items: ItemGuia[];
};

export type AlmacenOpt = {
  id: string; codigo: string; nombre: string; direccion: string | null; ubigeo: string | null;
  codigo_establecimiento_sunat: string | null;
};
export type TransportistaOpt = { ruc: string; razonSocial: string; mtc: string };

type Empresa = { ruc: string; razonSocial: string; direccionFiscal: string; ubigeoFiscal: string };

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** Consulta DNI/RUC con el mismo servicio de la caja (usa lo ya guardado antes de gastar cupo). */
/**
 * Consulta un DNI o RUC. Primero mira que el número esté completo: con la lupa
 * tocada y el campo vacío, la consulta iba a una dirección que no existe y la
 * pantalla mostraba "Unexpected token '<'…" (30/09/2026).
 */
async function consultar(tipo: 'dni' | 'ruc', numero: string): Promise<{ nombre: string; direccion?: string; ubigeo?: string } | null> {
  const largo = tipo === 'ruc' ? 11 : 8;
  if (!new RegExp(`^\\d{${largo}}$`).test(numero)) {
    toast.error(`Escribe el ${tipo.toUpperCase()} completo (${largo} dígitos) y vuelve a tocar la lupa.`);
    return null;
  }
  try {
    const r = await fetch(`/api/sunat/${tipo}/${numero}`);
    const d = await r.json().catch(() => ({ error: 'No se pudo consultar' }));
    if (!r.ok) throw new Error(d.error ?? 'No se encontró');
    return {
      nombre: d.razonSocial ?? d.nombreCompleto ?? [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' '),
      direccion: d.direccion, ubigeo: d.ubigeo,
    };
  } catch (e) {
    toast.error(`${(e as Error).message}. Escríbelo a mano.`);
    return null;
  }
}

export function GuiaForm({ inicial, aviso, hoy, empresa, almacenes, transportistas }: {
  inicial: GuiaInicial; aviso: string | null; hoy: string; empresa: Empresa;
  almacenes: AlmacenOpt[]; transportistas: TransportistaOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tipoDoc, setTipoDoc] = useState(inicial.destinatario_tipo_doc ?? '1');
  const [numDoc, setNumDoc] = useState(inicial.destinatario_num_doc ?? '');
  const [nombre, setNombre] = useState(inicial.destinatario_nombre ?? '');
  const [motivo, setMotivo] = useState<MotivoTraslado>(inicial.motivo ?? '01');
  const [motivoDesc, setMotivoDesc] = useState(inicial.motivo_descripcion ?? '');
  const [modalidad, setModalidad] = useState<'01' | '02'>(inicial.modalidad ?? '01');
  const [fechaTraslado, setFechaTraslado] = useState(hoy);
  const [fechaEntrega, setFechaEntrega] = useState(hoy);
  const [peso, setPeso] = useState(inicial.peso_bruto_kg ?? '');
  const [bultos, setBultos] = useState(inicial.num_bultos ?? '1');
  const [trRuc, setTrRuc] = useState(inicial.transportista_ruc ?? '');
  const [trNombre, setTrNombre] = useState(inicial.transportista_razon_social ?? '');
  const [trMtc, setTrMtc] = useState(inicial.transportista_mtc ?? '');
  const [placa, setPlaca] = useState(inicial.placa ?? '');
  const [condDni, setCondDni] = useState(inicial.conductor_dni ?? '');
  const [condNombres, setCondNombres] = useState(inicial.conductor_nombres ?? '');
  const [condApellidos, setCondApellidos] = useState(inicial.conductor_apellidos ?? '');
  const [condLicencia, setCondLicencia] = useState(inicial.conductor_licencia ?? '');
  const [m1l, setM1l] = useState(inicial.vehiculo_m1l ?? false);
  const [almacenId, setAlmacenId] = useState(inicial.almacen_partida_id ?? '');
  const almacen = almacenes.find((a) => a.id === almacenId) ?? null;
  const almacenConDireccion = Boolean(almacen?.ubigeo && almacen?.direccion);
  const [pDir, setPDir] = useState(inicial.partida_direccion ?? (almacenConDireccion ? almacen!.direccion! : ''));
  const [pUbigeo, setPUbigeo] = useState(inicial.partida_ubigeo ?? (almacenConDireccion ? almacen!.ubigeo! : ''));
  const [pCod, setPCod] = useState(inicial.partida_cod_establecimiento ?? almacen?.codigo_establecimiento_sunat ?? '');
  const [recordar, setRecordar] = useState(Boolean(almacen) && !almacenConDireccion);
  const [lDir, setLDir] = useState(inicial.llegada_direccion ?? '');
  const [lUbigeo, setLUbigeo] = useState(inicial.llegada_ubigeo ?? '');
  const [lCod, setLCod] = useState(inicial.llegada_cod_establecimiento ?? '');
  const [observacion, setObservacion] = useState(inicial.observacion ?? '');
  const [items, setItems] = useState<ItemGuia[]>(inicial.items);
  const [buscando, setBuscando] = useState(false);
  const [consultando, setConsultando] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<VarianteGuia[]>([]);

  // Traslado entre locales propios: el destinatario es la misma empresa.
  useEffect(() => {
    if (motivo === '04') {
      setTipoDoc('6'); setNumDoc(empresa.ruc); setNombre(empresa.razonSocial);
    } else if (numDoc === empresa.ruc) {
      setNumDoc(''); setNombre('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivo]);

  // La entrega a la agencia no puede ser antes de hoy ni después del inicio del traslado.
  useEffect(() => {
    if (fechaEntrega > fechaTraslado) setFechaEntrega(fechaTraslado);
  }, [fechaTraslado, fechaEntrega]);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { setResultados(await buscarVariantesGuia(busca)); } finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  function elegirAlmacen(id: string) {
    setAlmacenId(id);
    const a = almacenes.find((x) => x.id === id);
    if (a?.ubigeo && a.direccion) {
      setPDir(a.direccion); setPUbigeo(a.ubigeo); setRecordar(false);
    } else {
      setPDir(''); setPUbigeo(''); setRecordar(Boolean(a));
    }
    setPCod(a?.codigo_establecimiento_sunat ?? '');
  }

  const datos = {
    venta_id: inicial.venta_id ?? null,
    comprobante_id: inicial.comprobante_id ?? null,
    cliente_id: inicial.cliente_id ?? null,
    almacen_partida_id: almacenId || null,
    recordar_partida: recordar,
    destinatario_tipo_doc: tipoDoc,
    destinatario_num_doc: numDoc.trim(),
    destinatario_nombre: nombre.trim(),
    motivo,
    motivo_descripcion: motivoDesc,
    modalidad,
    fecha_traslado: fechaTraslado,
    fecha_entrega_transportista: modalidad === '01' ? fechaEntrega : '',
    peso_bruto_kg: Number(peso.replace(',', '.')) || 0,
    num_bultos: Number(bultos) || null,
    transportista_ruc: trRuc.trim(), transportista_razon_social: trNombre.trim(), transportista_mtc: trMtc.trim(),
    placa: placa.trim(), conductor_dni: condDni.trim(), conductor_nombres: condNombres.trim(),
    conductor_apellidos: condApellidos.trim(), conductor_licencia: condLicencia.trim(), vehiculo_m1l: m1l,
    partida_ubigeo: pUbigeo, partida_direccion: pDir.trim(), partida_cod_establecimiento: pCod.trim(),
    llegada_ubigeo: lUbigeo, llegada_direccion: lDir.trim(), llegada_cod_establecimiento: lCod.trim(),
    observacion: observacion.trim(),
    items: items.map((i) => ({ variante_id: i.variante_id ?? null, codigo: i.codigo, descripcion: i.descripcion, cantidad: Number(i.cantidad) })),
  };

  // Mismas reglas que aplica el servidor: lo que SUNAT rechazaría se ve antes de emitir.
  const faltan = useMemo(() => validarGuia({
    emisor: { ruc: empresa.ruc, razonSocial: empresa.razonSocial },
    destinatario: { tipoDoc, numDoc: datos.destinatario_num_doc, nombre: datos.destinatario_nombre },
    motivo, motivoDescripcion: motivoDesc, modalidad, fechaTraslado,
    fechaEntregaTransportista: modalidad === '01' ? fechaEntrega : undefined,
    pesoBrutoKg: datos.peso_bruto_kg, numBultos: datos.num_bultos ?? undefined,
    transportista: modalidad === '01' ? { ruc: datos.transportista_ruc, razonSocial: datos.transportista_razon_social } : undefined,
    vehiculoPlaca: datos.placa, vehiculoM1L: modalidad === '02' && m1l,
    conductor: modalidad === '02' && !m1l ? { tipoDoc: '1', numDoc: datos.conductor_dni, nombres: datos.conductor_nombres, apellidos: datos.conductor_apellidos, licencia: datos.conductor_licencia } : undefined,
    partida: { ubigeo: pUbigeo, direccion: datos.partida_direccion, codigoEstablecimiento: datos.partida_cod_establecimiento || undefined },
    llegada: { ubigeo: lUbigeo, direccion: datos.llegada_direccion, codigoEstablecimiento: datos.llegada_cod_establecimiento || undefined },
    observacion: datos.observacion,
    items: datos.items,
  }, hoy), // eslint-disable-next-line react-hooks/exhaustive-deps
  [JSON.stringify(datos), hoy]);

  function emitir() {
    if (faltan.length) { toast.error(faltan[0]!); return; }
    if (!confirm('Se va a emitir la guía ante SUNAT con el siguiente número de la serie. Una vez aceptada no se puede modificar. ¿Continuar?')) return;
    start(async () => {
      const r = await emitirGuia(datos);
      if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo emitir'); return; }
      const d = r.data;
      if (d.estado === 'ACEPTADO') toast.success(`Guía ${d.numero} aceptada por SUNAT`);
      else if (d.estado === 'RECHAZADO') toast.error(`SUNAT rechazó la guía ${d.numero}: ${d.mensaje}`);
      else if (d.estado === 'EMITIDO') toast.info(`Guía ${d.numero} enviada. SUNAT responde en unos minutos.`);
      else toast.warning(`Guía ${d.numero} registrada pero sin enviar: ${d.mensaje}`, { duration: 12000 });
      router.push(`/guias/${d.id}`);
    });
  }

  /*
   * Línea escrita a mano: "300 DISFRACES PARA NIÑOS" queda como 300 ×
   * DISFRACES PARA NIÑOS. Para consignaciones o envíos que no se cargan prenda
   * por prenda; el buscador solo encuentra productos del inventario.
   */
  const textoLibre = busca.trim();
  const lineaLibre = (() => {
    const m = textoLibre.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|u\.?|und\.?|unid\.?)?\s+(.+)$/i);
    return m ? { cantidad: Number(m[1]!.replace(',', '.')), descripcion: m[2]!.trim() } : { cantidad: 1, descripcion: textoLibre };
  })();
  const agregarLineaLibre = () => {
    if (lineaLibre.descripcion.length < 3) { toast.error('Escribe qué se envía'); return; }
    setItems((xs) => [...xs, { variante_id: null, codigo: '', descripcion: lineaLibre.descripcion.toUpperCase(), cantidad: lineaLibre.cantidad }]);
    setBusca(''); setResultados([]);
  };

  const tocarItem = (i: number, cambio: Partial<ItemGuia>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  return (
    <div className="space-y-6">
      {(aviso || inicial.documento) && (
        <div className="space-y-2">
          {inicial.documento && (
            <p className="rounded-lg border bg-corp-50/50 px-4 py-2 text-sm text-corp-900">
              Guía para la <strong>{inicial.documento}</strong>: cliente y productos vienen de ahí. Solo completa el transporte, el peso y la dirección de llegada.
            </p>
          )}
          {aviso && (
            <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
            </p>
          )}
        </div>
      )}

      <FormSection title="Motivo del traslado">
        <FormGrid cols={2}>
          <FormRow label="Motivo" required>
            <select className={selectCls} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoTraslado)}>
              {Object.entries(MOTIVOS_TRASLADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormRow>
          {motivo === '13' && (
            <FormRow label="¿Cuál es el motivo?" required>
              <Input value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} maxLength={100} placeholder="Ej: envío de muestras" />
            </FormRow>
          )}
        </FormGrid>
      </FormSection>

      <FormSection title="Destinatario" description="Quien recibe la mercadería. Para una venta, el cliente.">
        <FormGrid cols={3}>
          <FormRow label="Documento" required>
            <select className={selectCls} value={tipoDoc} disabled={motivo === '04'} onChange={(e) => setTipoDoc(e.target.value as typeof tipoDoc)}>
              <option value="1">DNI</option>
              <option value="6">RUC</option>
              <option value="4">Carnet de extranjería</option>
              <option value="7">Pasaporte</option>
            </select>
          </FormRow>
          <FormRow label="Número" required>
            <div className="flex gap-2">
              <Input value={numDoc} disabled={motivo === '04'} inputMode="numeric"
                onChange={(e) => setNumDoc(tipoDoc === '1' || tipoDoc === '6' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                maxLength={tipoDoc === '6' ? 11 : tipoDoc === '1' ? 8 : 15} />
              {(tipoDoc === '1' || tipoDoc === '6') && motivo !== '04' && (
                <Button type="button" variant="corp" disabled={consultando === 'dest'} title="Buscar en RENIEC / SUNAT"
                  onClick={async () => {
                    setConsultando('dest');
                    const r = await consultar(tipoDoc === '6' ? 'ruc' : 'dni', numDoc);
                    setConsultando(null);
                    if (r) { setNombre(r.nombre); if (tipoDoc === '6' && !lDir && r.direccion) { setLDir(r.direccion); if (r.ubigeo) setLUbigeo(r.ubigeo); } }
                  }}>
                  {consultando === 'dest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </FormRow>
          <FormRow label="Nombre o razón social" required>
            <Input value={nombre} disabled={motivo === '04'} onChange={(e) => setNombre(e.target.value)} />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Transporte">
        <div className="grid gap-2 sm:grid-cols-2">
          {([['01', Truck, 'Por agencia de transporte', 'Shalom, Olva, Marvisur… (transporte público)'],
            ['02', Car, 'Con vehículo propio', 'Lo lleva Happy\'s (transporte privado)']] as const).map(([v, Icono, t, s]) => (
            <button key={v} type="button" onClick={() => setModalidad(v)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${modalidad === v ? 'border-happy-500 bg-happy-50 ring-1 ring-happy-500' : 'hover:bg-slate-50'}`}>
              <Icono className="mt-0.5 h-5 w-5 text-corp-700" />
              <span><span className="block text-sm font-semibold">{t}</span><span className="text-xs text-slate-500">{s}</span></span>
            </button>
          ))}
        </div>

        {modalidad === '01' ? (
          <>
            {transportistas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-500">Usadas antes:</span>
                {transportistas.slice(0, 8).map((t) => (
                  <button key={t.ruc} type="button" onClick={() => { setTrRuc(t.ruc); setTrNombre(t.razonSocial); setTrMtc(t.mtc); }}
                    className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-happy-50">{t.razonSocial}</button>
                ))}
              </div>
            )}
            <FormGrid cols={3}>
              <FormRow label="RUC de la agencia" required>
                <div className="flex gap-2">
                  <Input value={trRuc} inputMode="numeric" maxLength={11} onChange={(e) => setTrRuc(e.target.value.replace(/\D/g, ''))} />
                  <Button type="button" variant="corp" disabled={consultando === 'tr'} title="Buscar en SUNAT"
                    onClick={async () => { setConsultando('tr'); const r = await consultar('ruc', trRuc); setConsultando(null); if (r) setTrNombre(r.nombre); }}>
                    {consultando === 'tr' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </FormRow>
              <FormRow label="Razón social de la agencia" required>
                <Input value={trNombre} onChange={(e) => setTrNombre(e.target.value)} />
              </FormRow>
              <FormRow label="N° registro MTC" hint="Opcional. Figura en la web o el voucher de la agencia.">
                <Input value={trMtc} onChange={(e) => setTrMtc(e.target.value)} maxLength={20} />
              </FormRow>
            </FormGrid>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={m1l} onChange={(e) => setM1l(e.target.checked)} />
              Es un auto o moto (vehículo M1 o L): no hace falta placa ni conductor
            </label>
            {!m1l && (
              <FormGrid cols={3}>
                <FormRow label="Placa" required>
                  <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} maxLength={8} placeholder="ABC123" />
                </FormRow>
                <FormRow label="DNI del conductor" required>
                  <div className="flex gap-2">
                    <Input value={condDni} inputMode="numeric" maxLength={8} onChange={(e) => setCondDni(e.target.value.replace(/\D/g, ''))} />
                    <Button type="button" variant="corp" disabled={consultando === 'cond'} title="Buscar en RENIEC"
                      onClick={async () => {
                        if (!/^\d{8}$/.test(condDni)) { toast.error('Escribe el DNI del conductor (8 dígitos) y vuelve a tocar la lupa.'); return; }
                        setConsultando('cond');
                        try {
                          const r = await fetch(`/api/sunat/dni/${condDni}`);
                          const d = await r.json().catch(() => ({ error: 'No se pudo consultar' }));
                          if (!r.ok) throw new Error(d.error ?? 'No se encontró');
                          setCondNombres(d.nombres ?? ''); setCondApellidos([d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' '));
                        } catch (e) { toast.error(`${(e as Error).message}. Escríbelo a mano.`); }
                        setConsultando(null);
                      }}>
                      {consultando === 'cond' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </FormRow>
                <FormRow label="Licencia de conducir" required>
                  <Input value={condLicencia} onChange={(e) => setCondLicencia(e.target.value.toUpperCase())} maxLength={10} placeholder="Q12345678" />
                </FormRow>
                <FormRow label="Nombres del conductor" required>
                  <Input value={condNombres} onChange={(e) => setCondNombres(e.target.value)} />
                </FormRow>
                <FormRow label="Apellidos del conductor" required>
                  <Input value={condApellidos} onChange={(e) => setCondApellidos(e.target.value)} />
                </FormRow>
              </FormGrid>
            )}
          </>
        )}

        <FormGrid cols={4}>
          <FormRow label="Inicio del traslado" required>
            <Input type="date" min={hoy} value={fechaTraslado} onChange={(e) => setFechaTraslado(e.target.value)} />
          </FormRow>
          {modalidad === '01' && (
            <FormRow label="Entrega a la agencia" required hint="El día que se deja en la agencia.">
              <Input type="date" min={hoy} max={fechaTraslado} value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </FormRow>
          )}
          <FormRow label="Peso bruto total (kg)" required hint="Con caja y empaque.">
            <Input value={peso} inputMode="decimal" onChange={(e) => setPeso(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Ej: 8.5" />
          </FormRow>
          <FormRow label="Bultos / cajas">
            <Input value={bultos} inputMode="numeric" onChange={(e) => setBultos(e.target.value.replace(/\D/g, ''))} />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Punto de partida" description="Desde dónde sale la mercadería.">
        <FormGrid cols={2}>
          <FormRow label="Almacén o tienda">
            <select className={selectCls} value={almacenId} onChange={(e) => elegirAlmacen(e.target.value)}>
              <option value="">— Otro lugar —</option>
              {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </FormRow>
          <FormRow label="Distrito" required>
            <UbigeoSelect key={`p-${almacenId}`} value={pUbigeo || null} onChange={(c) => setPUbigeo(c ?? '')} />
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label="Dirección exacta" required>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={pDir} onChange={(e) => setPDir(e.target.value)} placeholder="Calle, número, interior" />
                <Button type="button" variant="outline" className="shrink-0"
                  onClick={() => { setPDir(empresa.direccionFiscal); setPUbigeo(empresa.ubigeoFiscal); setPCod('0000'); }}>
                  Usar domicilio fiscal
                </Button>
              </div>
            </FormRow>
          </div>
          {motivo === '04' && (
            <FormRow label="Código de establecimiento SUNAT" required hint="4 dígitos de la ficha RUC. El domicilio fiscal es 0000.">
              <Input value={pCod} inputMode="numeric" maxLength={4} onChange={(e) => setPCod(e.target.value.replace(/\D/g, ''))} />
            </FormRow>
          )}
        </FormGrid>
        {almacen && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Guardar esta dirección para {almacen.nombre} (la próxima guía ya la trae)
          </label>
        )}
      </FormSection>

      <FormSection title="Punto de llegada" description={modalidad === '01' ? 'La dirección del cliente, o la agencia de destino si lo recoge ahí.' : 'Adónde se lleva la mercadería.'}>
        <FormGrid cols={2}>
          <FormRow label="Distrito" required>
            <UbigeoSelect value={lUbigeo || null} onChange={(c) => setLUbigeo(c ?? '')} />
          </FormRow>
          <FormRow label="Dirección exacta" required>
            <Input value={lDir} onChange={(e) => setLDir(e.target.value)} placeholder="Ej: Agencia Shalom Castilla, Av. Grau 123" />
          </FormRow>
          {motivo === '04' && (
            <FormRow label="Código de establecimiento SUNAT" required hint="El del local de llegada, según la ficha RUC.">
              <Input value={lCod} inputMode="numeric" maxLength={4} onChange={(e) => setLCod(e.target.value.replace(/\D/g, ''))} />
            </FormRow>
          )}
        </FormGrid>
      </FormSection>

      <FormSection title="Productos" description="Lo que viaja. La guía no descuenta stock: eso ya lo hizo la venta o el traslado.">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (resultados.length === 0 && !buscando) agregarLineaLibre(); } }}
            placeholder="Busca una prenda (nombre, SKU, código de barras) o escribe la línea, ej: 300 DISFRACES PARA NIÑOS" />
          {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          {textoLibre.length >= 2 && !buscando && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white shadow-xl">
              {resultados.length === 0 && (
                <p className="border-b px-3 py-2 text-xs text-slate-500">No hay prendas del inventario con ese nombre.</p>
              )}
              <button type="button" onClick={agregarLineaLibre}
                className="flex w-full items-center gap-2 border-b bg-happy-50/60 px-3 py-2 text-left text-sm hover:bg-happy-50">
                <Plus className="h-4 w-4 text-happy-600" />
                <span>Agregar como línea escrita: <strong>{lineaLibre.cantidad} × {lineaLibre.descripcion.toUpperCase()}</strong></span>
              </button>
              {resultados.map((r) => (
                <button key={r.variante_id} type="button" className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50"
                  onClick={() => {
                    setItems((xs) => {
                      const i = xs.findIndex((x) => x.variante_id === r.variante_id);
                      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x));
                      return [...xs, { variante_id: r.variante_id, codigo: r.codigo, descripcion: r.descripcion, cantidad: 1 }];
                    });
                    setBusca(''); setResultados([]);
                  }}>
                  <span className="font-mono text-[11px] text-slate-400">{r.codigo}</span> <span>{r.descripcion}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Descripción</th><th className="w-28 px-3 py-2 text-right">Cantidad</th><th className="w-10" /></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Busca las prendas arriba, o escribe la línea a mano (ej: 300 DISFRACES PARA NIÑOS) y presiona Enter.</td></tr>}
              {items.map((it, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{it.codigo || '—'}</td>
                  <td className="px-3 py-1.5"><Input value={it.descripcion} onChange={(e) => tocarItem(i, { descripcion: e.target.value })} /></td>
                  <td className="px-3 py-1.5">
                    <Input className="text-right" inputMode="numeric" value={String(it.cantidad)}
                      onChange={(e) => tocarItem(i, { cantidad: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />
                  </td>
                  <td className="px-2">
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Quitar"
                      onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FormRow label="Observación" hint="Sale impresa en la guía. Máx. 250 caracteres.">
          <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} maxLength={250} />
        </FormRow>
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-2 flex flex-col gap-3 rounded-t-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        {faltan.length > 0 ? (
          <div className="text-sm text-amber-800">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> Falta completar ({faltan.length}):</p>
            <p className="text-xs">{faltan[0]}{faltan.length > 1 ? ` · y ${faltan.length - 1} más` : ''}</p>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Todo listo para emitir.</p>
        )}
        <Button variant="premium" size="lg" onClick={emitir} disabled={pending || faltan.length > 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? 'Enviando a SUNAT…' : 'Emitir guía'}
        </Button>
      </div>
    </div>
  );
}
