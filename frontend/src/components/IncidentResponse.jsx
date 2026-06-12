import { useState } from "react";
import { Shield, XCircle, Eye, AlertTriangle } from "lucide-react";

const ACTIONS = [
  { id: "block",    label: "Block Source IP",   icon: XCircle,      color: "text-red-400 border-red-700 hover:bg-red-900/20",    desc: "Inject iptables DROP rule for source IP" },
  { id: "monitor", label: "Watchlist IP",        icon: Eye,          color: "text-yellow-400 border-yellow-700 hover:bg-yellow-900/20", desc: "Flag IP for elevated monitoring" },
  { id: "isolate", label: "Isolate Device",      icon: Shield,       color: "text-orange-400 border-orange-700 hover:bg-orange-900/20", desc: "Cut device from network (simulated VLAN change)" },
  { id: "report",  label: "Generate Report",     icon: AlertTriangle,color: "text-blue-400 border-blue-700 hover:bg-blue-900/20",  desc: "Export incident PDF report" },
];

export default function IncidentResponse({ alert, onClose }) {
  const [done, setDone] = useState({});

  const handleAction = (id) => {
    setDone(d => ({ ...d, [id]: true }));
    if (id === "report") {
      const text = `LightGuard Incident Report\n${new Date().toISOString()}\n\nAlert: ${alert?.attack_type}\nSrc: ${alert?.src_ip} → ${alert?.dst_ip}\nSeverity: ${alert?.severity}\nAction: Exported by SOC operator`;
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `incident_${Date.now()}.txt`; a.click();
    }
  };

  return (
    <div className="bg-card border border-high/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-high flex items-center gap-2">
          <Shield className="w-4 h-4" /> Incident Response
        </h3>
        {onClose && <button onClick={onClose} className="text-text/40 hover:text-text text-xs">✕</button>}
      </div>
      {alert && (
        <div className="text-xs text-text/60 bg-background rounded-lg p-2 font-mono">
          {alert.attack_type} · {alert.src_ip} → {alert.dst_ip} · <span className="text-high font-bold">{alert.severity}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => handleAction(a.id)}
            disabled={done[a.id]}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${done[a.id] ? 'opacity-50 cursor-not-allowed border-border text-text/40' : a.color}`}
          >
            <a.icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{done[a.id] ? '✓ Done' : a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
