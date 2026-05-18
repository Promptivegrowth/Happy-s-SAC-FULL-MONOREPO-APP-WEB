'use client';

import { useState } from 'react';
import { Input } from '@happy/ui/input';

type Props = {
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
};

/**
 * Input de teléfono — solo dígitos, longitud máxima fija (default 9 = PE móvil).
 * Si el value inicial trae caracteres no numéricos los limpia al montar.
 */
export function PhoneInput({
  name,
  defaultValue,
  required,
  placeholder = '999999999',
  maxLength = 9,
}: Props) {
  const [value, setValue] = useState<string>(() =>
    String(defaultValue ?? '').replace(/\D/g, '').slice(0, maxLength),
  );

  return (
    <Input
      name={name}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      pattern="[0-9]*"
      maxLength={maxLength}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, maxLength))}
      required={required}
    />
  );
}
