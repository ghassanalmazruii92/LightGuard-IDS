import { Handle, Position } from 'reactflow';
import { Building2, MonitorDot } from 'lucide-react';

export default function ControlCenterNode({ data }) {
  const glow = Boolean(data.onAttackPath);
  return (
    <div
      className={`group flex flex-col items-center transition-all ${
        glow ? 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-background rounded-xl' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-teal-500 !border !border-teal-300" />
      <div className="w-[168px] rounded-lg border border-teal-500/35 bg-gradient-to-b from-teal-950/85 to-slate-950 px-2.5 py-2 shadow-[0_10px_36px_rgba(13,148,136,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <MonitorDot className="h-3 w-3 text-teal-300" />
            <span className="font-mono text-[6px] font-bold uppercase tracking-widest text-teal-300/80">
              NOC / SOC
            </span>
          </div>
          <div className="flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-teal-400" />
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-teal-500/25 bg-teal-950/40 px-2 py-1.5">
          <Building2 className="h-7 w-7 shrink-0 text-teal-200" strokeWidth={1.5} />
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
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-teal-500 !border !border-teal-300" />
    </div>
  );
}
