import { Handle, Position } from 'reactflow';
import { Shield } from 'lucide-react';

export default function FirewallNode({ data }) {
  const glow = Boolean(data.onAttackPath);
  return (
    <div
      className={`group flex flex-col items-center transition-all ${
        glow ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background rounded-xl' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-red-600 !border !border-red-400" />
      <div className="w-[158px] rounded-lg border border-red-500/40 bg-gradient-to-b from-red-950/90 to-slate-950 px-2.5 py-2 shadow-[0_10px_32px_rgba(127,29,29,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            <span className="h-1 w-1 rounded-full bg-slate-600" />
          </div>
          <span className="font-mono text-[6px] font-bold uppercase tracking-widest text-red-300/70">
            NGFW
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-red-500/25 bg-red-950/50 px-2 py-1.5">
          <Shield className="h-6 w-6 shrink-0 text-red-300" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-50">
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
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="h-1 rounded-[1px] bg-slate-700/90" />
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-red-600 !border !border-red-400" />
    </div>
  );
}
