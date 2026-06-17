'use client';

import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatPEN, formatNumber } from '@happy/lib';
import { COLORS, PALETTE } from '@/server/actions/dashboard-helpers';

const { HAPPY, CORP, GREEN, ROSE, SLATE } = COLORS;

// ---------- helpers ----------

function fmtFechaCorta(iso: string): string {
  // iso = YYYY-MM-DD → "06 Jun"
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[Number(m) - 1] ?? ''}`;
}

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 6px 24px rgba(15,23,42,0.08)',
  padding: '8px 12px',
};

// ---------- 1) Curva S de producción ----------

export type CurvaSPunto = { fecha: string; real_acum: number; plan_acum: number };

export function CurvaS({ datos }: { datos: CurvaSPunto[] }) {
  const sinPlan = datos.every((d) => d.plan_acum === 0);
  // Construir series con `delta` = real - plan, para pintar áreas por debajo/encima
  const data = datos.map((d) => ({
    ...d,
    diff_pos: Math.max(0, d.real_acum - d.plan_acum),
    diff_neg: Math.max(0, d.plan_acum - d.real_acum),
    fechaCorta: fmtFechaCorta(d.fecha),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cs-pos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="cs-neg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ROSE} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ROSE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="fechaCorta" stroke={SLATE} fontSize={11} tickMargin={6} />
        <YAxis stroke={SLATE} fontSize={11} tickFormatter={(v) => formatNumber(v)} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(_, p) => (p?.[0]?.payload?.fecha ? fmtFechaCorta(p[0].payload.fecha) : '')}
          formatter={(v: number, name: string) => {
            const labels: Record<string, string> = {
              real_acum: 'Producción real',
              plan_acum: 'Plan',
              diff_pos: 'Adelanto',
              diff_neg: 'Retraso',
            };
            return [formatNumber(v) + ' und', labels[name] ?? name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        {/* Áreas de delta — ocultas si no hay plan */}
        {!sinPlan && (
          <>
            <Area type="monotone" dataKey="diff_pos" name="Adelanto" stroke="none" fill="url(#cs-pos)" stackId="a" />
            <Area type="monotone" dataKey="diff_neg" name="Retraso" stroke="none" fill="url(#cs-neg)" stackId="b" />
          </>
        )}
        <Line type="monotone" dataKey="real_acum" name="Producción real" stroke={HAPPY} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        {!sinPlan && (
          <Line type="monotone" dataKey="plan_acum" name="Plan" stroke={CORP} strokeWidth={2} strokeDasharray="5 4" dot={false} />
        )}
        <ReferenceLine y={0} stroke="#cbd5e1" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------- 2) Ventas comparativas (línea actual vs anterior) ----------

export function VentasComparativasChart({
  actual, anterior,
}: {
  actual: { fecha: string; monto: number }[];
  anterior: { fecha: string; monto: number }[];
}) {
  // Alinear por índice (día 1 vs día 1, etc.) — etiqueta tomada del actual.
  const data = actual.map((a, i) => ({
    fechaCorta: fmtFechaCorta(a.fecha),
    fecha: a.fecha,
    actual: a.monto,
    anterior: anterior[i]?.monto ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="vc-act" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HAPPY} stopOpacity={0.5} />
            <stop offset="100%" stopColor={HAPPY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="fechaCorta" stroke={SLATE} fontSize={11} />
        <YAxis stroke={SLATE} fontSize={11} tickFormatter={(v) => `S/ ${(Number(v) / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [formatPEN(v), name === 'actual' ? 'Período actual' : 'Período anterior']}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} formatter={(v) => (v === 'actual' ? 'Período actual' : 'Período anterior')} />
        <Line type="monotone" dataKey="anterior" stroke={CORP} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line type="monotone" dataKey="actual" stroke={HAPPY} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------- 3) Ventas por canal (donut) ----------

export function VentasPorCanalChart({ data }: { data: { canal: string; monto: number; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.monto, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="monto" nameKey="canal" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="#fff" strokeWidth={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, _n, p) => {
            const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
            return [`${formatPEN(v)} · ${pct}%`, p?.payload?.canal ?? ''];
          }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------- 4) Top productos (barras horizontales) ----------

export function TopProductosChart({ data }: { data: { nombre: string; unidades: number; monto: number }[] }) {
  const slice = data.slice(0, 10);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={slice} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" stroke={SLATE} fontSize={11} />
        <YAxis
          type="category"
          dataKey="nombre"
          stroke={SLATE}
          fontSize={10}
          width={100}
          tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 14) + '…' : v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) => {
            if (n === 'unidades') return [formatNumber(v) + ' und', 'Unidades'];
            return [formatPEN(v), 'Monto'];
          }}
        />
        <Bar dataKey="unidades" fill={CORP} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- 5) OTs por estado (radial) ----------

const ESTADOS_ORDER = ['BORRADOR', 'PLANIFICADA', 'EN_CORTE', 'EN_HABILITADO', 'EN_SERVICIO', 'EN_DECORADO', 'EN_CONTROL_CALIDAD', 'COMPLETADA', 'CANCELADA'];

export function OtsPorEstadoChart({ data }: { data: { estado: string; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  const ordered = [...data].sort((a, b) => ESTADOS_ORDER.indexOf(a.estado) - ESTADOS_ORDER.indexOf(b.estado));
  const pretty = ordered.map((d, i) => ({
    name: d.estado.replace(/_/g, ' '),
    value: d.count,
    fill: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={280}>
        <RadialBarChart innerRadius="20%" outerRadius="95%" data={pretty} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, Math.max(1, total)]} angleAxisId={0} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={6} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number, _n, p) => {
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
              return [`${v} OTs · ${pct}%`, p?.payload?.name ?? ''];
            }}
          />
          <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, lineHeight: '18px' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 left-0 flex w-2/5 flex-col items-center justify-center">
        <div className="font-display text-3xl font-semibold text-corp-900">{formatNumber(total)}</div>
        <div className="text-xs text-slate-500">OTs totales</div>
      </div>
    </div>
  );
}
