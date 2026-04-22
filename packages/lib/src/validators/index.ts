import { z } from 'zod';

/** Valida DNI peruano: 8 dígitos numéricos. */
export function isValidDNI(value: string): boolean {
  return /^\d{8}$/.test(value);
}

/**
 * Valida RUC peruano: 11 dígitos. Algoritmo módulo 11 (SUNAT).
 * Primeros 2 dígitos son tipo de contribuyente.
 */
export function isValidRUC(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const tipo = value.slice(0, 2);
  if (!['10', '15', '17', '20'].includes(tipo)) return false;
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(value[i]) * factores[i]!;
  }
  const resto = suma % 11;
  const dv = (11 - resto) % 10;
  return dv === Number(value[10]);
}

/** Valida un correo razonable (no estricto RFC). */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Valida número celular peruano (9 dígitos comenzando en 9). */
export function isValidCelular(value: string): boolean {
  return /^9\d{8}$/.test(value);
}

// ===== Schemas Zod compartidos =====

export const dniSchema = z
  .string()
  .trim()
  .refine(isValidDNI, 'DNI inválido (debe tener 8 dígitos)');

export const rucSchema = z
  .string()
  .trim()
  .refine(isValidRUC, 'RUC inválido');

export const celularSchema = z
  .string()
  .trim()
  .refine(isValidCelular, 'Celular inválido (9 dígitos comenzando en 9)');

export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido');
