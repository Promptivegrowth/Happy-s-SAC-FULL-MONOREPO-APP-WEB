/**
 * Ubigeo Perú — INEI.
 *
 * El dataset completo (~1879 distritos) se carga en la tabla `ubigeo` de Supabase
 * vía `supabase/seed/ubigeo-peru.json`. Aquí sólo viven tipos + helpers y el
 * listado compacto de departamentos / provincias para usos rápidos (dropdowns).
 */

export type UbigeoDepartamento = { codigo: string; nombre: string };
export type UbigeoProvincia = { codigo: string; nombre: string; departamento: string };
export type UbigeoDistrito = {
  codigo: string;       // INEI 6 dígitos (ej. '150101')
  reniec?: string;      // Código RENIEC si difiere
  nombre: string;
  provincia: string;    // codigo provincia
  departamento: string; // codigo departamento (2 dígitos)
};

export const DEPARTAMENTOS: UbigeoDepartamento[] = [
  { codigo: '01', nombre: 'AMAZONAS' },
  { codigo: '02', nombre: 'ANCASH' },
  { codigo: '03', nombre: 'APURIMAC' },
  { codigo: '04', nombre: 'AREQUIPA' },
  { codigo: '05', nombre: 'AYACUCHO' },
  { codigo: '06', nombre: 'CAJAMARCA' },
  { codigo: '07', nombre: 'CALLAO' },
  { codigo: '08', nombre: 'CUSCO' },
  { codigo: '09', nombre: 'HUANCAVELICA' },
  { codigo: '10', nombre: 'HUANUCO' },
  { codigo: '11', nombre: 'ICA' },
  { codigo: '12', nombre: 'JUNIN' },
  { codigo: '13', nombre: 'LA LIBERTAD' },
  { codigo: '14', nombre: 'LAMBAYEQUE' },
  { codigo: '15', nombre: 'LIMA' },
  { codigo: '16', nombre: 'LORETO' },
  { codigo: '17', nombre: 'MADRE DE DIOS' },
  { codigo: '18', nombre: 'MOQUEGUA' },
  { codigo: '19', nombre: 'PASCO' },
  { codigo: '20', nombre: 'PIURA' },
  { codigo: '21', nombre: 'PUNO' },
  { codigo: '22', nombre: 'SAN MARTIN' },
  { codigo: '23', nombre: 'TACNA' },
  { codigo: '24', nombre: 'TUMBES' },
  { codigo: '25', nombre: 'UCAYALI' },
];

/** Descompone un código INEI 6 dígitos: DD PP DI. */
export function parseUbigeoCode(code: string): { departamento: string; provincia: string; distrito: string } | null {
  if (!/^\d{6}$/.test(code)) return null;
  return { departamento: code.slice(0, 2), provincia: code.slice(0, 4), distrito: code };
}

export function labelDepartamento(codigo: string): string {
  return DEPARTAMENTOS.find((d) => d.codigo === codigo)?.nombre ?? codigo;
}
