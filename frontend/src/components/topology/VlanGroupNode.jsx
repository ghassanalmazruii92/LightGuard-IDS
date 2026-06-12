import { Handle, Position } from 'reactflow';

export default function VlanGroupNode({ data }) {
  const color = data.color || '#0D9488';
  const isPulsing = data.pulsing;
  const gw = data.gateway;

  return (
    <div
      className={`relative min-h-[88px] rounded-lg border border-dashed px-3 pb-3 pt-9 transition-all ${
        isPulsing ? 'animate-pulse' : ''
      }`}
      style={{
        background: `linear-gradient(145deg, ${color}0f 0%, rgba(15,23,42,0.35) 45%, ${color}08 100%)`,
        borderColor: isPulsing ? color : `${color}50`,
        boxShadow: isPulsing ? `0 0 24px ${color}66` : `inset 0 0 0 1px ${color}18, 0 4px 18px rgba(0,0,0,0.35)`,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="absolute left-2 right-2 top-2 flex flex-wrap items-center justify-between gap-1">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color }}>
            BD · VLAN {data.vlan_id}
          </span>
          <span className="max-w-[200px] truncate text-[8px] font-semibold text-slate-200/90">
            {data.name}
          </span>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8px] opacity-80" style={{ color }}>{data.cidr}</div>
          {gw && (
            <div className="font-mono text-[7px] text-sky-300/85">GW {gw}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}
