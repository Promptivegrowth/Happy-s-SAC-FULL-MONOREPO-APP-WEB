/**
 * Integración con APIs de consulta de DNI / RUC para autocompletar perfiles.
 * Proveedor por defecto: apis.net.pe (requiere APIS_NET_PE_TOKEN env var).
 *
 * En producción: mover a Edge Function para no exponer el token.
 */

export type ConsultaDNI = {
  numero: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
  codigoVerificacion?: number | null;
};

export type ConsultaRUC = {
  numero: string;
  razonSocial: string;
  nombreComercial?: string;
  estado?: string;         // ACTIVO | INACTIVO
  condicion?: string;      // HABIDO | NO HABIDO
  direccion?: string;
  ubigeo?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  tipo?: string;
};

const BASE = 'https://api.apis.net.pe/v2';

type FetchOptions = { token?: string; signal?: AbortSignal };

async function apisNetFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  const token = opts.token ?? process.env.APIS_NET_PE_TOKEN;
  if (!token) {
    throw new Error('APIS_NET_PE_TOKEN no configurado. Crear cuenta en https://apis.net.pe');
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: opts.signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`apis.net.pe ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function consultaDNI(dni: string, opts: FetchOptions = {}): Promise<ConsultaDNI> {
  if (!/^\d{8}$/.test(dni)) throw new Error('DNI inválido');
  type RawDNI = {
    numeroDocumento: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    codigoVerificacion?: number;
  };
  const raw = await apisNetFetch<RawDNI>(`/reniec/dni?numero=${dni}`, opts);
  return {
    numero: raw.numeroDocumento,
    nombres: raw.nombres,
    apellidoPaterno: raw.apellidoPaterno,
    apellidoMaterno: raw.apellidoMaterno,
    nombreCompleto: `${raw.nombres} ${raw.apellidoPaterno} ${raw.apellidoMaterno}`.replace(/\s+/g, ' ').trim(),
    codigoVerificacion: raw.codigoVerificacion ?? null,
  };
}

export async function consultaRUC(ruc: string, opts: FetchOptions = {}): Promise<ConsultaRUC> {
  if (!/^\d{11}$/.test(ruc)) throw new Error('RUC inválido');
  type RawRUC = {
    numeroDocumento: string;
    razonSocial: string;
    nombreComercial?: string;
    estado?: string;
    condicion?: string;
    direccion?: string;
    ubigeo?: string;
    departamento?: string;
    provincia?: string;
    distrito?: string;
    tipo?: string;
  };
  const raw = await apisNetFetch<RawRUC>(`/sunat/ruc?numero=${ruc}`, opts);
  return {
    numero: raw.numeroDocumento,
    razonSocial: raw.razonSocial,
    nombreComercial: raw.nombreComercial,
    estado: raw.estado,
    condicion: raw.condicion,
    direccion: raw.direccion,
    ubigeo: raw.ubigeo,
    departamento: raw.departamento,
    provincia: raw.provincia,
    distrito: raw.distrito,
    tipo: raw.tipo,
  };
}
