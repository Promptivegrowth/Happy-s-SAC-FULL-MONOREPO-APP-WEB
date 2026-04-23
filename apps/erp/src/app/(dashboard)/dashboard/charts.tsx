'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatPEN, formatNumber } from '@happy/lib';

const HAPPY = '#F5821F';
const CORP = '#2D3193';
const CORP_DARK = '#231459';
const DANGER = '#EC1C24';
const PALETTE = [HAPPY, CORP, '#E15A25', '#4a5cbe', DANGER, '#F79447'];

type VentasDia = { dia: string; total: number; ventas: number };
type TopProd = { producto: string; unidades: number; monto: number };
type OtStat = { estado: string; total: number };
type CanalStat = { canal: string; monto: number };

export function VentasUltimos30Chart({ data }: { data: VentasDia[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="happyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HAPPY} stopOpacity={0.5} />
            <stop offset="100%" stopColor={HAPPY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} />
        <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `S/ ${(v/1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          formatter={(v: number) => formatPEN(v)}
        />
        <Area type="monotone" dataKey="total" stroke={HAPPY} strokeWidth={2} fill="url(#happyGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TopProductosChart({ data }: { data: TopProd[] }) {
  const slice = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={slice} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={11} />
        <YAxis type="category" dataKey="producto" stroke="#94a3b8" fontSize={10} width={80} tickFormatter={(v) => v.length > 14 ? v.slice(0, 12) + '…' : v} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          formatter={(v: number, name: string) => name === 'unidades' ? formatNumber(v) : formatPEN(v)}
        />
        <Bar dataKey="unidades" fill={CORP} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VentasPorCanalChart({ data }: { data: CanalStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="monto" nameKey="canal" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => formatPEN(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function OtsPorEstadoChart({ data }: { data: OtStat[] }) {
  const pretty = data.map((d) => ({ ...d, estado: d.estado.replace('_', ' ') }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={pretty}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="estado" stroke="#94a3b8" fontSize={10} />
        <YAxis stroke="#94a3b8" fontSize={11} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="total" fill={CORP_DARK} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
