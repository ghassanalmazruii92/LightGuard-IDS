import { useState, useEffect } from "react";
import { Clock, Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

const PHASE_COLORS = {
  "Attack Started":   "text-red-400 border-red-700 bg-red-900/20",
  "Traffic Detected": "text-orange-400 border-orange-700 bg-orange-900/20",
  "AI Analysis":      "text-yellow-400 border-yellow-700 bg-yellow-900/20",
  "Alert Raised":     "text-blue-400 border-blue-700 bg-blue-900/20",
  "Traffic Flagged":      "text-green-400 border-green-700 bg-green-900/20",
  "Logged":           "text-teal-400 border-teal-700 bg-teal-900/20",
};

const ICONS = {
  "Attack Started":   AlertTriangle,
  "Traffic Detected": Clock,
  "AI Analysis":      Shield,
  "Alert Raised":     AlertTriangle,
  "Traffic Flagged":      XCircle,
  "Logged":           CheckCircle,
};

export default function AttackTimeline({ events = [] }) {
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    // animate entries in sequence
    setVisible([]);
    events.forEach((_, i) => {
      setTimeout(() => setVisible(v => [...v, i]), i * 300);
    });
  }, [events]);

  if (!events.length) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-bold text-text mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4 text-accent" />
        Attack Timeline
      </h3>
      <div className="relative">
        {/* vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        <div className="flex flex-col gap-3">
          {events.map((ev, i) => {
            const Icon = ICONS[ev.phase] || Clock;
            const color = PHASE_COLORS[ev.phase] || "text-text/60 border-border bg-card";
            const show = visible.includes(i);
            return (
              <div key={i} className={`flex items-start gap-3 pl-2 transition-all duration-500 ${show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center z-10 ${color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-text">{ev.phase}</span>
                    <span className="text-[10px] text-text/40">{ev.time}</span>
                    {ev.delta && (
                      <span className="text-[10px] text-accent">+{ev.delta}s</span>
                    )}
                  </div>
                  <p className="text-[11px] text-text/60 mt-0.5 truncate">{ev.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
