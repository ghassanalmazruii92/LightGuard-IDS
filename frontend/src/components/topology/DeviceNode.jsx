import { Handle, Position } from 'reactflow';
import {
  ShieldCheck, Box, Cpu, Gauge, Radio, Router,
} from 'lucide-react';

const riskColor = (score) => {
  if (score <= 30) return '#22C55E';
  if (score <= 60) return '#F59E0B';
  if (score <= 80) return '#EF4444';
  return '#DC2626';
};

const statusDot = (status) => {
  if (status === 'online')     return 'bg-emerald-500 shadow-[0_0_6px_#22c55e]';
  if (status === 'suspicious') return 'bg-high animate-pulse';
  return 'bg-text/30';
};

function RoleGlyph({ role, tone }) {
  const r = (role || '').toLowerCase();
  const cls = `h-[22px] w-[22px] shrink-0 ${tone}`;
  if (r.includes('fog') || r.includes('compute')) return <Cpu className={cls} strokeWidth={1.6} />;
  if (r.includes('meter') || r.includes('energy')) return <Gauge className={cls} strokeWidth={1.6} />;
  if (r.includes('sensor') || r.includes('camera')) return <Radio className={cls} strokeWidth={1.6} />;
  if (r.includes('traffic') || r.includes('signal') || r.includes('gateway')) return <Router className={cls} strokeWidth={1.6} />;
  return <Box className={cls} strokeWidth={1.6} />;
}

export default function DeviceNode({ data }) {
  const rc = riskColor(data.risk_score || 0);
  const isAttacked = data.attacked;
  const isFlowSrc = data.flowPulse === 'src';
  const isFlowTgt = data.flowPulse === 'tgt';

  return (
    <div
      className={`group relative flex flex-col items-center transition-all ${
        isAttacked ? 'scale-110' : ''
      }`}
      style={
        isFlowSrc || isFlowTgt
          ? {
              boxShadow: isFlowSrc
                ? '0 0 0 3px rgba(251,191,36,0.9), 0 0 22px rgba(251,191,36,0.45)'
                : '0 0 0 3px rgba(244,63,94,0.85), 0 0 22px rgba(244,63,94,0.4)',
              borderRadius: 10,
            }
          : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border !border-slate-500"
        style={{ background: rc }}
      />
      <div
        className="w-[104px] rounded-md border border-slate-600/80 bg-gradient-to-b from-slate-800/95 to-slate-950/98 px-1.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition-all"
        style={{
          borderTopColor: `${rc}99`,
          boxShadow: isAttacked ? `0 0 16px ${rc}99` : `0 0 0 1px ${rc}14 inset`,
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-1">
          <div className="flex gap-0.5">
            <span className={`h-1 w-1 rounded-full ${statusDot(data.status)}`} />
            <span className="h-1 w-1 rounded-full bg-slate-600" />
          </div>
          <span className="font-mono text-[6px] uppercase text-slate-500">host</span>
        </div>
        <div
          className="flex items-center justify-center rounded border border-slate-700/80 py-1"
          style={{ background: `linear-gradient(180deg, ${rc}22 0%, transparent 120%)` }}
        >
          <RoleGlyph role={data.role} tone="text-slate-50" />
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="truncate font-mono text-[7px] font-bold leading-tight text-slate-100" title={data.hostname}>
            {data.hostname || data.label || 'host'}
          </div>
          <div className="truncate font-mono text-[7px] text-sky-300/85">{data.ip}</div>
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[6px] font-bold tabular-nums" style={{ color: rc }}>
              RSV {data.risk_score}%
            </span>
            <span className="truncate font-mono text-[6px] text-slate-500">{data.role}</span>
          </div>
          {data.trusted && <ShieldCheck className="absolute right-1 top-1 h-2.5 w-2.5 text-emerald-400" />}
        </div>
      </div>

      <div className="absolute -top-[4.75rem] left-1/2 z-50 w-44 -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-950/98 p-2 text-left opacity-0 shadow-xl transition-opacity group-hover:pointer-events-none group-hover:opacity-100">
        {(isFlowSrc || isFlowTgt) && (
          <div className="mb-1 text-[8px] font-bold uppercase" style={{ color: isFlowSrc ? '#fbbf24' : '#fb7185' }}>
            {isFlowSrc ? 'Flow source (observed)' : 'Attack target'}
          </div>
        )}
        <div className="text-[10px] font-bold text-accent">{data.label}</div>
        <div className="font-mono text-[9px] text-slate-400">{data.ip}</div>
        <div className="text-[8px] text-slate-500">{data.zone}</div>
        {data.mac && <div className="font-mono text-[7px] text-slate-600">{data.mac}</div>}
        {data.os && <div className="mt-1 line-clamp-2 text-[7px] text-slate-500">{data.os}</div>}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border !border-slate-500"
        style={{ background: rc }}
      />
    </div>
  );
}
