import { getSmoothStepPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';

/** NOC-style link colouring by link_class from API `data`. */
function linkStroke(data) {
  const cls = data?.link_class;
  const baseVlan = data?.color;
  if (cls === 'span') return '#a78bfa';
  if (cls === 'wan') return '#38bdf8';
  if (cls === 'distribution' && baseVlan) return baseVlan;
  return data?.color || (data?.kind === 'trunk' ? '#65758b' : '#4b596d');
}

export default function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isTrunk = data?.kind === 'trunk';
  const lc = data?.link_class;
  const stroke = linkStroke(data);
  const span = lc === 'span';
  const strokeWidth =
    lc === 'wan' ? 2.85
      : lc === 'trunk' || lc === 'distribution' ? (isTrunk ? 2.35 : 2.05)
      : span ? 1.25
      : 1.2;

  const dashMain = span ? '4 8' : isTrunk ? '8 5' : '3 6';
  const opacity = lc === 'access' ? 0.72 : span ? 0.88 : 0.93;
  const label = data?.label;
  const speed = data?.speed;
  const iface = data?.src_port && data?.dst_port ? `${data.src_port} › ${data.dst_port}` : null;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray: dashMain,
          animation: span ? 'dash 4s linear infinite' : isTrunk ? 'dash 2.2s linear infinite' : 'dash 3.5s linear infinite',
          opacity,
        }}
      />
      {(label || iface || speed) && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="absolute nodrag nopan"
          >
            <div className="flex flex-col items-center gap-0.5 rounded border border-slate-600/80 bg-slate-950/95 px-1.5 py-1 shadow-md">
              {label && (
                <span className="text-[7px] font-bold uppercase tracking-wide text-slate-200">
                  {label}
                </span>
              )}
              {speed && (
                <span className="font-mono text-[6.5px] text-sky-300/90">{speed}</span>
              )}
              {iface && (
                <span className="max-w-[200px] truncate font-mono text-[6px] text-slate-400">
                  {iface}
                </span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
