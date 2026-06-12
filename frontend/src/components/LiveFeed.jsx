import { triggerAlertSound } from './AlertSound';
import { toast } from './ToastNotifier';
import React from 'react';
import { Server, Activity, Shield, Zap, AlertTriangle, Monitor } from 'lucide-react';
import HoverHint from './HoverHint';

const LiveFeed = ({ alerts }) => {
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-critical';
      case 'HIGH': return 'bg-high';
      case 'MEDIUM': return 'bg-medium';
      case 'LOW': return 'bg-low';
      default: return 'bg-text/50';
    }
  };

  const getMethodBadge = (method) => {
    const badges = {
      'arp-scan': { color: 'bg-low/20 text-low border-low/30', label: 'ARP', icon: Monitor },
      'masscan': { color: 'bg-high/20 text-high border-high/30', label: 'MASSCAN', icon: Zap },
      'nmap-vuln-scan': { color: 'bg-medium/20 text-medium border-medium/30', label: 'NMAP', icon: Shield },
      'AI': { color: 'bg-accent/20 text-accent border-accent/30', label: 'AI MODEL', icon: Activity },
      'Signature': { color: 'bg-high/20 text-high border-high/30', label: 'SIGNATURE', icon: AlertTriangle },
      'Snort': { color: 'bg-medium/20 text-medium border-medium/30', label: 'SNORT', icon: Shield },
    };

    const badge = badges[method] || { color: 'bg-text/10 text-text/60 border-text/20', label: method, icon: Shield };
    const Icon = badge.icon;

    return (
      <span className={`flex items-center space-x-1 px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase ${badge.color}`}>
        <Icon className="w-2.5 h-2.5" />
        <span>{badge.label}</span>
      </span>
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 h-full flex flex-col">
      <HoverHint
        hint="Real-time intrusion events: signature rules, ML anomalies, or scanner findings, newest first."
        className="mb-4"
      >
        <h2 className="text-lg font-bold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5 text-accent" />
            <span>Live Intrusion Feed</span>
          </div>
          <div className="flex items-center space-x-1 px-2 py-0.5 bg-low/10 text-low rounded-full text-[10px] font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
            <span>ACTIVE</span>
          </div>
        </h2>
      </HoverHint>
      
      <div className="space-y-4 overflow-y-auto pr-2 flex-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {alerts.map((alert) => (
          <HoverHint
            key={alert.id}
            hint={`${alert.attack_type}: ${alert.src_ip} → ${alert.dst_ip}. Severity ${alert.severity}. Method: ${alert.detection_method || 'n/a'}.`}
            className="block"
          >
            <div className="flex items-start space-x-3 p-3 bg-background/50 rounded-lg border border-border/50 group hover:border-accent/30 transition-all hover:translate-x-1 cursor-default">
              <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${getSeverityColor(alert.severity)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-accent truncate uppercase tracking-tight">{alert.attack_type}</span>
                  <span className="text-[10px] text-text/40 shrink-0">{new Date(alert.timestamp).toLocaleTimeString('en-US')}</span>
                </div>
                <div className="text-xs text-text/70 truncate flex items-center justify-between gap-2">
                  <span>{alert.src_ip} <span className="text-text/30">→</span> {alert.dst_ip}</span>
                  {getMethodBadge(alert.detection_method)}
                </div>
              </div>
            </div>
          </HoverHint>
        ))}
        {alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-text/30 italic">
            <Activity className="w-12 h-12 mb-2 opacity-10" />
            <span>Waiting for network events...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveFeed;
