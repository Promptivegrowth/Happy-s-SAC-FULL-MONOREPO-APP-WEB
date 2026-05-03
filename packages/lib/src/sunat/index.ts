/**
 * Integración con Decolecta para consulta DNI / RUC.
 *
 * Decolecta (https://decolecta.com) ofrece un plan gratuito de
 * 100 consultas/mes para RUC y DNI. Reemplaza al anterior apis.net.pe
 * que descontinuó el servicio público de DNI por la nueva normativa
 * peruana de protección de datos personales (2026).
 *
 * Requiere DECOLECTA_TOKEN en las env vars del server. Las llamadas
 * pasan por /api/sunat/[tipo]/[numero] que valida sesión, así que
 * el token nunca se expone al cliente.
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

const BASE = 'https://api.decolecta.com/v1';

type FetchOptions = { token?: string; signal?: AbortSignal };

/** Limpia el token: trim + remueve whitespace/newline (caso pegado mal en Vercel). */
function cleanToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().split(/\s+/)[0]?.trim() ?? '';
  return cleaned.length > 0 ? cleaned : null;
}

async function decolectaFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  const token = cleanToken(opts.token ?? process.env.DECOLECTA_TOKEN);
  if (!token) {
    throw new Error(
      'DECOLECTA_TOKEN no configurado. Crear cuenta gratis en https://decolecta.com',
    );
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
    if (res.status === 401) {
      throw new Error('Token inválido o vencido. Regenerá DECOLECTA_TOKEN en https://decolecta.com');
    }
    if (res.status === 404) {
      throw new Error('Documento no encontrado en RENIEC/SUNAT.');
    }
    if (res.status === 429) {
      throw new Error('Cuota mensual del plan gratuito agotada. Esperá al próximo mes o subí de plan en Decolecta.');
    }
    throw new Error(`Decolecta ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function consultaDNI(dni: string, opts: FetchOptions = {}): Promise<ConsultaDNI> {
  if (!/^\d{8}$/.test(dni)) throw new Error('DNI inválido');
  type Raw = {
    first_name: string;
    first_last_name: string;
    second_last_name: string;
    full_name: string;
    document_number: string;
  };
  const raw = await decolectaFetch<Raw>(`/reniec/dni?numero=${dni}`, opts);
  return {
    numero: raw.document_number,
    nombres: raw.first_name,
    apellidoPaterno: raw.first_last_name,
    apellidoMaterno: raw.second_last_name,
    nombreCompleto:
      raw.full_name?.trim() ||
      `${raw.first_name} ${raw.first_last_name} ${raw.second_last_name}`.replace(/\s+/g, ' ').trim(),
    codigoVerificacion: null,
  };
}

export async function consultaRUC(ruc: string, opts: FetchOptions = {}): Promise<ConsultaRUC> {
  if (!/^\d{11}$/.test(ruc)) throw new Error('RUC inválido');
  type Raw = {
    numero_documento: string;
    razon_social: string;
    nombre_comercial?: string;
    estado?: string;
    condicion?: string;
    direccion?: string;
    ubigeo?: string;
    departamento?: string;
    provincia?: string;
    distrito?: string;
    tipo_contribuyente?: string;
  };
  const raw = await decolectaFetch<Raw>(`/sunat/ruc?numero=${ruc}`, opts);
  return {
    numero: raw.numero_documento,
    razonSocial: raw.razon_social,
    nombreComercial: raw.nombre_comercial,
    estado: raw.estado,
    condicion: raw.condicion,
    direccion: raw.direccion,
    ubigeo: raw.ubigeo,
    departamento: raw.departamento,
    provincia: raw.provincia,
    distrito: raw.distrito,
    tipo: raw.tipo_contribuyente,
  };
}
