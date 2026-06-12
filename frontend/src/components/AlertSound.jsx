import { useState } from 'react';

let soundEnabled = false;

export function triggerAlertSound(severity) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = severity === 'CRITICAL' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(severity === 'CRITICAL' ? 880 : 660, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

export function AlertSoundToggle() {
  const [enabled, setEnabled] = useState(false);
  const toggle = () => {
    soundEnabled = !soundEnabled;
    setEnabled(!enabled);
  };
  return (
    <button
      onClick={toggle}
      title={enabled ? 'Mute alert sounds' : 'Enable alert sounds'}
      className={`text-xs px-2 py-1 rounded border transition-colors ${
        enabled ? 'border-accent text-accent bg-accent/10' : 'border-border text-text/40 hover:text-text/70'
      }`}
    >
      {enabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
    </button>
  );
}

export default AlertSoundToggle;
