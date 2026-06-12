import { getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';

const severityColor = (severity, blocked) => {
  if (blocked) return '#22C55E';      // green = firewall blocked it
  switch (severity) {
    case 'CRITICAL': return '#DC2626';
    case 'HIGH':     return '#EF4444';
    case 'MEDIUM':   return '#F59E0B';
    default:         return '#3B82F6';
  }
};

export default function AttackEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, markerEnd,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const color = severityColor(data?.severity, data?.blocked);
  const label = data?.attack_type || '';
  const ipLine = `${data?.srcIp || ''}${data?.srcIp && data?.dstIp ? ' › ' : ''}${data?.dstIp || ''}`;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: data?.blocked ? 2 : 3.25,
          filter: `drop-shadow(0 0 10px ${color})`,
          strokeDasharray: '10 6',
          animation: 'dash 0.65s linear infinite',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="absolute nodrag nopan"
        >
          <div className="flex flex-col items-center gap-0.5">
            <span
              className="px-2 py-0.5 rounded text-[8px] font-bold uppercase whitespace-nowrap"
              style={{
                background: `${color}29`,
                color,
                border: `1px solid ${color}99`,
                boxShadow: `0 0 12px ${color}44`,
              }}
            >
              {data?.blocked ? 'BLOCKED · ' : 'ALERT · '}{label}
            </span>
            {(data?.srcIp || data?.dstIp) && (
              <span
                className="px-1.5 rounded text-[7px] font-mono max-w-[200px] truncate"
                style={{ color: '#e2e8f0', textShadow: '0 1px 2px rgb(0 0 0 / 0.6)' }}
              >
                {ipLine}
              </span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
