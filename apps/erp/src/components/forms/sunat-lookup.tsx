'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

type Result = {
  numero: string;
  razonSocial?: string;
  nombreCompleto?: string;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  direccion?: string;
  ubigeo?: string;
  estado?: string;
  condicion?: string;
};

type Props = {
  tipo: 'dni' | 'ruc';
  defaultValue?: string;
  onResult: (data: Result) => void;
  name?: string;
  required?: boolean;
};

export function SunatLookup({ tipo, defaultValue = '', onResult, name, required }: Props) {
  const [valor, setValor] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const maxLen = tipo === 'dni' ? 8 : 11;

  async function consultar() {
    if (valor.length !== maxLen) {
      toast.error(`${tipo.toUpperCase()} debe tener ${maxLen} dígitos`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/sunat/${tipo}/${valor}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error de consulta');
      onResult(data);
      toast.success(`${tipo === 'dni' ? 'DNI' : 'RUC'} encontrado`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        name={name}
        type="text"
        inputMode="numeric"
        maxLength={maxLen}
        value={valor}
        onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), consultar())}
        placeholder={tipo === 'dni' ? '12345678' : '20123456789'}
        required={required}
      />
      <Button type="button" variant="corp" onClick={consultar} disabled={loading || valor.length !== maxLen}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        <span className="hidden sm:inline">Consultar</span>
      </Button>
    </div>
  );
}
