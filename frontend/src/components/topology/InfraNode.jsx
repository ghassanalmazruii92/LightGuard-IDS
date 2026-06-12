import { Handle, Position } from 'reactflow';
import { Activity, Boxes, Network } from 'lucide-react';

function LayerIcon({ layer }) {
  if (layer === 'core') {
    return <Boxes className="h-5 w-5 text-indigo-200" strokeWidth={1.75} />;
  }
  if (layer === 'security' || layer === 'sensor') {
    return <Activity className="h-5 w-5 text-amber-200" strokeWidth={1.75} />;
  }
  return <Network className="h-5 w-5 text-slate-200" strokeWidth={1.75} />;
}

/** Rack / appliance card — Visio-style NOC node. */
export default function InfraNode({ data }) {
  const color = data.color || '#64748B';
  const pathGlow = Boolean(data.onAttackPath);
  const compact = data.form_factor === 'compact';
  const w = compact ? 'w-[112px]' : 'w-[148px]';

  return (
    <div
      className={`group flex flex-col items-center transition-all ${
        pathGlow ? 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-background rounded-xl' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2"
        style={{ background: color, borderColor: `${color}cc` }}
      />
      <div
        className={`${w} rounded-lg border border-slate-600/70 bg-gradient-to-b from-slate-800/98 to-slate-950/98 px-2 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]`}
        style={{ borderTopColor: `${color}99`, boxShadow: `0 0 0 1px ${color}22 inset, 0 8px 28px rgba(0,0,0,0.55)` }}
      >
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <div className="flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]" />
            <span className="h-1 w-1 rounded-full bg-emerald-500/80" />
            <span className="h-1 w-1 rounded-full bg-amber-500/70" />
          </div>
          <span className="font-mono text-[6px] uppercase tracking-wider text-slate-500">
            {data.layer || 'l2'}
          </span>
        </div>
        <div
          className="flex items-center justify-center rounded-md border border-slate-700/80 py-1.5"
          style={{ background: `linear-gradient(180deg, ${color}18 0%, transparent 100%)` }}
        >
          <LayerIcon layer={data.layer} />
        </div>
        <div className="mt-1.5 space-y-0.5 text-center">
          <div className="truncate font-mono text-[8px] font-bold uppercase leading-tight text-slate-100">
            {data.label}
          </div>
          {data.hostname && (
            <div className="truncate font-mono text-[6.5px] text-slate-400" title={data.hostname}>
              {data.hostname}
            </div>
          )}
          {data.model && (
            <div className="truncate font-mono text-[6px] text-slate-500">{data.model}</div>
          )}
          {data.mgmt_ip && (
            <div className="font-mono text-[6.5px] text-sky-300/80">MGMT {data.mgmt_ip}</div>
          )}
        </div>
        <div className="mt-1.5 flex justify-center gap-0.5 border-t border-slate-700/60 pt-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="h-1.5 w-0.5 rounded-sm bg-slate-600/90" />
          ))}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2"
        style={{ background: color, borderColor: `${color}cc` }}
      />
    </div>
  );
}
