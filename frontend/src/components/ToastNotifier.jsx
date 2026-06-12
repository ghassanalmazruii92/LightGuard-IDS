import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Shield, CheckCircle, Info, X } from "lucide-react";

let _addToast = null;

export function toast(msg, type = "info", duration = 5000) {
  if (_addToast) _addToast({ msg, type, duration, id: Date.now() });
}

const TYPE_STYLES = {
  critical: { bg: "bg-red-900/95 border-red-600",    icon: AlertTriangle, iconClass: "text-red-400",   label: "CRITICAL" },
  high:     { bg: "bg-orange-900/95 border-orange-600", icon: AlertTriangle, iconClass: "text-orange-400", label: "HIGH" },
  block:    { bg: "bg-green-900/95 border-green-600",  icon: Shield,       iconClass: "text-green-400",  label: "BLOCKED" },
  success:  { bg: "bg-teal-900/95 border-teal-600",    icon: CheckCircle,  iconClass: "text-teal-400",   label: "OK" },
  info:     { bg: "bg-blue-900/95 border-blue-600",    icon: Info,         iconClass: "text-blue-400",   label: "INFO" },
};

export default function ToastNotifier() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((t) => {
    setToasts(prev => [...prev.slice(-4), t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), t.duration);
  }, []);

  useEffect(() => { _addToast = addToast; return () => { _addToast = null; }; }, [addToast]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const s = TYPE_STYLES[t.type] || TYPE_STYLES.info;
        const Icon = s.icon;
        return (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl max-w-sm animate-slide-in ${s.bg}`}>
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${s.iconClass}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-bold ${s.iconClass} mb-0.5`}>{s.label}</p>
              <p className="text-xs text-white/90 break-words">{t.msg}</p>
            </div>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} className="text-white/40 hover:text-white/80">
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
