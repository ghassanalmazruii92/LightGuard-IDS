import { Handle, Position } from 'reactflow';
import { Globe2 } from 'lucide-react';

/** Untrusted / carrier-style WAN block (no emoji). */
export default function WanCloudNode({ data }) {
  const pathGlow = Boolean(data.onAttackPath);
  return (
    <div
      className={`group relative flex flex-col items-center transition-all ${
        pathGlow ? 'scale-[1.02] drop-shadow-[0_0_18px_rgba(251,191,36,0.55)]' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border !border-sky-400/80 !bg-slate-900"
      />
      <div
        className="relative min-w-[220px] max-w-[260px] rounded-[1.75rem] border border-sky-500/25 bg-gradient-to-b from-slate-700/95 via-slate-800/98 to-slate-950 px-5 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.85),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <div className="pointer-events-none absolute inset-x-6 top-2 h-8 rounded-full bg-sky-400/5 blur-xl" />
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10">
            <Globe2 className="h-5 w-5 text-sky-300" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-sky-300/80">
              Untrusted · WAN
            </div>
            <div className="truncate text-[11px] font-bold leading-tight text-slate-100">
              {data.label || 'Internet handoff'}
            </div>
            <div className="mt-0.5 truncate font-mono text-[8px] text-slate-400">
              {data.hostname || 'INTERNET-PEER'}
            </div>
            {data.circuit && (
              <div className="mt-1 inline-block rounded border border-slate-600/80 bg-slate-900/80 px-1.5 py-0.5 font-mono text-[7px] text-slate-300">
                {data.circuit}
              </div>
            )}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border !border-sky-400/80 !bg-slate-900"
      />
    </div>
  );
}
