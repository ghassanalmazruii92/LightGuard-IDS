import React, { useState, useEffect } from 'react';
import { 
  Monitor, Search, Shield, AlertTriangle, Activity, Bell,
  ChevronRight, RefreshCw, Server, Info, X, ShieldCheck, 
  MapPin, Cpu, Router, Video, Zap, Droplets, Network, Building2, Car, Bot, PlusCircle
} from 'lucide-react';
import api from '../lib/api';
import { askAIAbout } from '../components/AIChat';
import HoverHint from '../components/HoverHint';

const zoneIcons = {
  "Transportation": Car,
  "Energy Grid": Zap,
  "Infrastructure": Droplets,
  "Compute Layer": Cpu,
  "Network": Network,
  "Control Center": Building2,
};

const Devices = ({ user }) => {
  const canManageDevices = user?.role === 'admin' || user?.role === 'technical';
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0, suspicious: 0, avg_risk_score: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scanningIp, setScanningIp] = useState(null);
  const [trustingIp, setTrustingIp] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'discovered' | 'seed'
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [vlans, setVlans] = useState([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addForm, setAddForm] = useState({
    ip: '',
    zone: '',
    label: '',
    hostname: '',
    mac: '',
    role: 'generic_host',
    icon: '📟',
    os: '',
    status: 'online',
  });

  const fetchDevices = async () => {
    try {
      const [devicesRes, statsRes] = await Promise.all([
        api.get('/api/devices'),
        api.get('/api/devices/stats'),
      ]);
      setDevices(devicesRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDeviceClick = async (device) => {
    setSelectedDevice({ device });
    setIsModalOpen(true);
    try {
      const res = await api.get(`/api/devices/${device.ip}`);
      setSelectedDevice(res.data);
    } catch (err) {
      console.error('Error fetching device details:', err);
    }
  };

  const runDeepScan = async (ip) => {
    setScanningIp(ip);
    try {
      await api.post(`/api/devices/${ip}/scan`, {});
      fetchDevices();
      if (isModalOpen && selectedDevice?.device?.ip === ip) {
        handleDeviceClick({ ip });
      }
    } catch (err) {
      console.error('Error running scan:', err);
    } finally {
      setScanningIp(null);
    }
  };

  const toggleTrust = async (ip, currentTrust) => {
    setTrustingIp(ip);
    try {
      await api.post(`/api/devices/${ip}/trust?trusted=${!currentTrust}`, {});
      fetchDevices();
      if (isModalOpen && selectedDevice?.device?.ip === ip) {
        const res = await api.get(`/api/devices/${ip}`);
        setSelectedDevice(res.data);
      }
    } catch (err) {
      console.error('Error toggling trust:', err);
    } finally {
      setTrustingIp(null);
    }
  };

  const fetchVlansForAdd = async () => {
    try {
      const res = await api.get('/api/network/vlans');
      const list = res.data || [];
      setVlans(list);
      setAddForm((f) => {
        if (list.length && !f.zone) {
          return { ...f, zone: list[0].zone || '' };
        }
        return f;
      });
    } catch (err) {
      console.error('Error fetching VLANs:', err);
      setAddError('Could not load network zones (VLANs).');
    }
  };

  const openAddDevice = () => {
    setAddError(null);
    setAddForm({
      ip: '',
      zone: '',
      label: '',
      hostname: '',
      mac: '',
      role: 'generic_host',
      icon: '📟',
      os: '',
      status: 'online',
    });
    setAddOpen(true);
    fetchVlansForAdd();
  };

  const submitAddDevice = async (e) => {
    e.preventDefault();
    setAddSubmitting(true);
    setAddError(null);
    const payload = {
      ip: addForm.ip.trim(),
      zone: addForm.zone.trim(),
      label: addForm.label.trim() || undefined,
      hostname: addForm.hostname.trim() || undefined,
      mac: addForm.mac.trim() || undefined,
      role: addForm.role.trim() || 'generic_host',
      icon: addForm.icon.trim() || '📟',
      os: addForm.os.trim() || undefined,
      status: addForm.status,
    };
    if (!payload.zone) {
      setAddError('Select a zone (must match an existing VLAN).');
      setAddSubmitting(false);
      return;
    }
    try {
      await api.post('/api/devices/register', payload);
      setAddOpen(false);
      await fetchDevices();
    } catch (err) {
      const d = err.response?.data?.detail;
      let msg = 'Failed to register device.';
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d)) msg = d.map((x) => x.msg || JSON.stringify(x)).join('; ');
      setAddError(msg);
    } finally {
      setAddSubmitting(false);
    }
  };

  const triggerNetworkScan = async () => {
    setScanningNetwork(true);
    setScanResult(null);
    try {
      const res = await api.post('/api/devices/scan-network');
      setScanResult(`Scanning ${res.data.cidr} — devices will appear shortly`);
      setTimeout(() => {
        fetchDevices();
        setScanResult(null);
      }, 8000);
    } catch (err) {
      setScanResult('Scan failed – check server logs');
    } finally {
      setScanningNetwork(false);
    }
  };

  const getRiskBadge = (score) => {
    if (score <= 30) return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-low/10 text-low uppercase">Low</span>;
    if (score <= 60) return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-medium/10 text-medium uppercase">Medium</span>;
    if (score <= 80) return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-high/10 text-high uppercase">High</span>;
    return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-critical/10 text-critical uppercase animate-pulse">Critical</span>;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'online': return <div className="flex items-center space-x-1.5 text-low"><div className="w-1.5 h-1.5 rounded-full bg-low" /><span>Online</span></div>;
      case 'offline': return <div className="flex items-center space-x-1.5 text-text/40"><div className="w-1.5 h-1.5 rounded-full bg-text/40" /><span>Offline</span></div>;
      case 'suspicious': return <div className="flex items-center space-x-1.5 text-high animate-pulse"><div className="w-1.5 h-1.5 rounded-full bg-high" /><span>Suspicious</span></div>;
      default: return <span>{status}</span>;
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, hint }) => (
    <HoverHint hint={hint} className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
      <div>
        <span className="text-text/60 text-sm font-medium">{title}</span>
        <div className="flex items-baseline space-x-2 mt-1">
          <span className="text-2xl font-bold">{value}</span>
        </div>
      </div>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${color}/10`}>
        <Icon className={`w-6 h-6 text-${color}`} />
      </div>
    </HoverHint>
  );

  const liveCount = devices.filter(d => d.source === 'discovered').length;
  const demoCount = devices.filter(d => d.source !== 'discovered').length;
  const filteredDevices = devices.filter(d => {
    if (sourceFilter === 'discovered') return d.source === 'discovered';
    if (sourceFilter === 'seed') return d.source !== 'discovered';
    return true;
  });

  const citySecurityScorePct =
    `${Math.max(0, Math.min(100, 100 - (Number(stats.avg_risk_score) || 0))).toFixed(1)}%`;

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <HoverHint
          hint="City-wide IoT inventory: live discoveries vs demo seeds; risk and trust per asset."
          className="min-w-0"
        >
          <div>
            <h1 className="text-2xl font-bold text-accent">Device Inventory – Tadhamon IoT Map</h1>
            <p className="text-text/60 text-sm mt-1">
              Monitoring {devices.length} city-wide connected assets
              {liveCount > 0 && <span className="ml-2 text-low font-semibold">{liveCount} live</span>}
            </p>
          </div>
        </HoverHint>
        <div className="flex items-center space-x-2 shrink-0">
          <HoverHint hint="Reload device list and stats from the API." as="button" type="button" className="flex items-center space-x-2 px-3 py-2 bg-background border border-border rounded-lg text-text/60 hover:text-accent hover:border-accent/50 transition-all" onClick={fetchDevices}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </HoverHint>
          <HoverHint
            hint="Register a host manually: pick a VLAN zone and enter an IP inside that subnet."
            as="button"
            type="button"
            className="flex items-center space-x-2 px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:bg-accent/90 transition-all active:scale-95 shadow-md shadow-accent/25"
            onClick={openAddDevice}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Device</span>
          </HoverHint>
          {canManageDevices && (
            <HoverHint
              hint="Kick off a network discovery scan (CIDR from server config); new hosts appear when found."
              as="button"
              type="button"
              className="flex items-center space-x-2 px-4 py-2 bg-background border border-border text-text rounded-lg font-medium hover:border-accent/50 transition-all active:scale-95 disabled:opacity-50"
              onClick={triggerNetworkScan}
              disabled={scanningNetwork}
            >
              <Search className={`w-4 h-4 ${scanningNetwork ? 'animate-spin' : ''}`} />
              <span>{scanningNetwork ? 'Scanning...' : 'Scan Network'}</span>
            </HoverHint>
          )}
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="px-4 py-3 bg-accent/10 border border-accent/30 rounded-xl text-sm text-accent font-medium flex items-center space-x-2">
          <Activity className="w-4 h-4 animate-pulse" />
          <span>{scanResult}</span>
        </div>
      )}

      {/* Source filter tabs */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        {[
          { key: 'all',        label: `All (${devices.length})`, hint: 'Show every asset: discovered and seeded demo hosts.' },
          { key: 'discovered', label: `Live (${liveCount})`,  color: 'text-low', hint: 'Hosts seen by active discovery (ARP / scan) only.' },
          { key: 'seed',       label: `Demo (${demoCount})`,  color: 'text-text/40', hint: 'Pre-seeded demo devices for presentation.' },
        ].map(tab => (
          <HoverHint key={tab.key} hint={tab.hint} className="inline-flex">
            <button
              type="button"
              onClick={() => setSourceFilter(tab.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                sourceFilter === tab.key
                  ? 'bg-accent text-white border-accent'
                  : `bg-background border-border ${tab.color || 'text-text/60'} hover:border-accent/50`
              }`}
            >
              {tab.label}
            </button>
          </HoverHint>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Assets" value={stats.total} icon={Monitor} color="accent" hint="All rows in inventory (online + offline)." />
        <StatCard title="Active Sensors" value={stats.online} icon={Activity} color="low" hint="Devices currently marked online / reachable." />
        <StatCard title="Critical Risks" value={stats.suspicious} icon={AlertTriangle} color="high" hint="Assets flagged suspicious or high-risk by scoring." />
        <StatCard title="City Security Score" value={citySecurityScorePct} icon={Shield} color="medium" hint="100% minus average portfolio risk score (higher is better)." />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-background/50 text-text/60 text-[10px] font-bold uppercase">
              <tr>
                <HoverHint as="th" hint="Zone icon, label, and whether this row is live-discovered or demo." className="px-6 py-4 text-left font-bold">Zone / Asset</HoverHint>
                <HoverHint as="th" hint="IPv4 address used for scans and API calls." className="px-6 py-4 text-left font-bold">IP Address</HoverHint>
                <HoverHint as="th" hint="Asset role tag from inventory (e.g. sensor, gateway)." className="px-6 py-4 text-left font-bold">Role</HoverHint>
                <HoverHint as="th" hint="Layer-2 identifier when known from discovery." className="px-6 py-4 text-left font-bold">MAC Address</HoverHint>
                <HoverHint as="th" hint="Heuristic risk score from telemetry and scans." className="px-6 py-4 text-left font-bold">Risk Level</HoverHint>
                <HoverHint as="th" hint="Reachability / suspicion state." className="px-6 py-4 text-left font-bold">Status</HoverHint>
                <HoverHint as="th" hint="Admin-only: deep scan and trust toggle." className="px-6 py-4 text-right font-bold">Actions</HoverHint>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDevices.map((device) => {
                const ZoneIcon = zoneIcons[device.zone] || Network;
                const isLive = device.source === 'discovered';
                const isManual = device.source === 'manual';
                return (
                  <HoverHint
                    key={device.id}
                    as="tr"
                    followCursor
                    hint={`${device.label || device.hostname || device.ip}  ·  Zone: ${device.zone || 'Unknown'}  ·  IP: ${device.ip}  ·  Risk Score: ${device.risk_score ?? '—'}%  ·  ${device.trusted ? '✓ Trusted device' : '⚠ Untrusted — monitor closely'}  ·  Click to open full device analysis`}
                    className={`hover:bg-background/30 transition-colors cursor-pointer group ${device.trusted ? 'opacity-80' : ''}`}
                    onClick={() => handleDeviceClick(device)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg bg-background border transition-all group-hover:border-accent/30 ${isLive ? 'border-low/40' : 'border-border'} ${device.risk_score > 60 ? 'border-high/30' : ''}`}>
                          <ZoneIcon className={`w-5 h-5 ${device.risk_score > 60 ? 'text-high' : isLive ? 'text-low' : 'text-accent'}`} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-text flex items-center space-x-1.5">
                            <span>{device.label || device.hostname}</span>
                            {device.trusted && <ShieldCheck className="w-3 h-3 text-low" />}
                            {isLive
                              ? <span className="flex items-center space-x-1 px-1.5 py-0.5 bg-low/10 text-low border border-low/30 rounded text-[9px] font-bold">
                                  <span className="w-1 h-1 rounded-full bg-low animate-pulse inline-block" />
                                  <span>LIVE</span>
                                </span>
                              : isManual
                                ? <span className="px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/30 rounded text-[9px] font-bold"></span>
                                : <span className="px-1.5 py-0.5 bg-background text-text/30 border border-border rounded text-[9px] font-bold">DEMO</span>
                            }
                          </div>
                          <div className="text-[10px] text-text/40">{device.zone || 'Unknown Zone'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-accent">{device.ip}</td>
                    <td className="px-6 py-4">
                       <span className="text-[10px] font-bold text-text/60 bg-background border border-border px-2 py-0.5 rounded uppercase">{device.role || 'unknown'}</span>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-text/40 font-mono">{device.mac}</td>
                    <td className="px-6 py-4">{getRiskBadge(device.risk_score)}</td>
                    <td className="px-6 py-4 text-xs">{getStatusBadge(device.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <HoverHint
                          as="button"
                          type="button"
                          hint="Run a deeper vulnerability scan on this IP (nmap-style; admin only)."
                          className="p-2 bg-background border border-border rounded-lg text-text/40 hover:text-accent hover:border-accent/50 disabled:opacity-30 transition-all"
                          onClick={(e) => { e.stopPropagation(); runDeepScan(device.ip); }}
                          disabled={scanningIp === device.ip || !canManageDevices}
                        >
                          <Search className={`w-3.5 h-3.5 ${scanningIp === device.ip ? 'animate-spin' : ''}`} />
                        </HoverHint>
                        <HoverHint
                          as="button"
                          type="button"
                          hint={device.trusted ? 'Remove trusted override for this asset.' : 'Mark this asset as trusted to reduce alert noise.'}
                          className={`p-2 border rounded-lg transition-all ${device.trusted ? 'bg-low/10 border-low text-low' : 'bg-background border-border text-text/40 hover:text-low hover:border-low/50'}`}
                          onClick={(e) => { e.stopPropagation(); toggleTrust(device.ip, device.trusted); }}
                          disabled={trustingIp === device.ip || !canManageDevices}
                        >
                          <ShieldCheck className={`w-3.5 h-3.5 ${trustingIp === device.ip ? 'animate-pulse' : ''}`} />
                        </HoverHint>
                      </div>
                    </td>
                  </HoverHint>
                );
              })}
              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-text/40 italic">
                    {loading
                      ? 'Discovering city assets...'
                      : sourceFilter === 'discovered'
                        ? 'No live devices discovered yet — click Scan Network to start.'
                        : 'No devices found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add device modal */}
      {addOpen && user && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                  <PlusCircle className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Add device to the network</h2>
                  <p className="text-xs text-text/50 mt-0.5">IP address must fall within the selected VLAN subnet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-2 hover:bg-background border border-transparent hover:border-border rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitAddDevice} className="p-6 overflow-y-auto space-y-4">
              {addError && (
                <div className="px-3 py-2 rounded-lg bg-high/10 border border-high/30 text-high text-sm">{addError}</div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">Zone</label>
                <select
                  required
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                  value={addForm.zone}
                  onChange={(e) => setAddForm((f) => ({ ...f, zone: e.target.value }))}
                >
                  <option value="">— Select —</option>
                  {vlans.map((v) => (
                    <option key={v.id ?? v.vlan_id} value={v.zone}>
                      {v.zone}{v.cidr ? ` (${v.cidr})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">IP address</label>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  placeholder="192.168.10.50"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border font-mono text-sm focus:border-accent outline-none"
                  value={addForm.ip}
                  onChange={(e) => setAddForm((f) => ({ ...f, ip: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">Label</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                    value={addForm.label}
                    onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">Hostname</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                    value={addForm.hostname}
                    onChange={(e) => setAddForm((f) => ({ ...f, hostname: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">MAC</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border font-mono text-xs focus:border-accent outline-none"
                    placeholder="Optional"
                    value={addForm.mac}
                    onChange={(e) => setAddForm((f) => ({ ...f, mac: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">Role</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">Icon</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                    value={addForm.icon}
                    onChange={(e) => setAddForm((f) => ({ ...f, icon: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">Status</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                    value={addForm.status}
                    onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="online">online</option>
                    <option value="offline">offline</option>
                    <option value="suspicious">suspicious</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text/40 uppercase mb-1.5">OS (optional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-accent outline-none"
                  value={addForm.os}
                  onChange={(e) => setAddForm((f) => ({ ...f, os: e.target.value }))}
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border text-text/70 hover:bg-background text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:bg-accent/90 disabled:opacity-50 flex items-center space-x-2"
                >
                  <span>{addSubmitting ? 'Saving…' : 'Save device'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Detail Overlay */}
      {isModalOpen && selectedDevice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="bg-card border border-border rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="p-8 border-b border-border flex items-center justify-between bg-background/50">
              <div className="flex items-center space-x-5">
                <div className={`p-4 rounded-2xl bg-${selectedDevice.device?.status === 'suspicious' ? 'high' : 'accent'}/10 border border-${selectedDevice.device?.status === 'suspicious' ? 'high' : 'accent'}/20`}>
                  {selectedDevice.device?.zone ? React.createElement(zoneIcons[selectedDevice.device.zone] || Monitor, { className: `w-8 h-8 text-${selectedDevice.device?.status === 'suspicious' ? 'high' : 'accent'}` }) : <Monitor className="w-8 h-8 text-accent" />}
                </div>
                <div>
                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                    <h2 className="text-2xl font-bold">{selectedDevice.device?.label || selectedDevice.device?.hostname}</h2>
                    {selectedDevice.device?.trusted && <div className="px-2 py-0.5 bg-low/10 text-low border border-low/20 text-[10px] font-bold rounded uppercase">Trusted Asset</div>}
                    {selectedDevice.device?.source === 'discovered'
                      ? <div className="flex items-center space-x-1 px-2 py-0.5 bg-low/10 text-low border border-low/30 text-[10px] font-bold rounded uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
                          <span>Live Device</span>
                        </div>
                      : selectedDevice.device?.source === 'manual'
                        ? <div className="px-2 py-0.5 bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold rounded uppercase">Manual</div>
                        : <div className="px-2 py-0.5 bg-background text-text/30 border border-border text-[10px] font-bold rounded uppercase">Demo</div>
                    }
                  </div>
                  <div className="flex items-center space-x-3 text-text/60 text-sm mt-1 font-mono">
                    <span className="flex items-center space-x-1"><MapPin className="w-3 h-3" /> <span>{selectedDevice.device?.zone || 'Unassigned Zone'}</span></span>
                    <span>•</span>
                    <span>{selectedDevice.device?.ip}</span>
                    <span>•</span>
                    <span>{selectedDevice.device?.mac}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => askAIAbout({
                    device_ip: selectedDevice.device?.ip,
                    message: `Analyze the security posture of device ${selectedDevice.device?.label} (${selectedDevice.device?.ip}) in Tadhamon Smart City and recommend fixes.`,
                  })}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-xl hover:bg-accent/20 transition-all text-sm font-medium"
                >
                  <Bot className="w-4 h-4" />
                  <span>AI analysis</span>
                </button>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-background border border-transparent hover:border-border rounded-full transition-all">
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Left Column: Stats & Meta */}
              <div className="space-y-8">
                <section>
                  <h3 className="text-[10px] font-bold text-text/40 uppercase mb-4 flex items-center space-x-2">
                    <Activity className="w-3 h-3" />
                    <span>Real-time Risk Assessment</span>
                  </h3>
                  <div className="p-6 bg-background rounded-2xl border border-border flex flex-col items-center justify-center text-center">
                    <div className={`text-5xl font-bold mb-1 ${selectedDevice.device?.risk_score > 60 ? 'text-high' : 'text-low'}`}>{selectedDevice.device?.risk_score}%</div>
                    <div className="text-[10px] font-bold text-text/40 uppercase">Total Threat Index</div>
                    <div className="w-full h-1.5 bg-border rounded-full mt-4 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${selectedDevice.device?.risk_score > 60 ? 'bg-high' : 'bg-low'}`}
                        style={{ width: `${selectedDevice.device?.risk_score}%` }}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-text/40 uppercase mb-4">Device Metadata</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-xs text-text/60">Asset Role</span>
                      <span className="text-xs font-bold text-accent uppercase">{selectedDevice.device?.role || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-xs text-text/60">Platform / OS</span>
                      <span className="text-xs font-medium">{selectedDevice.device?.os || 'Undetected'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-xs text-text/60">First Discovered</span>
                      <span className="text-xs font-medium">{new Date(selectedDevice.device?.first_seen).toLocaleDateString('en-US')}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-xs text-text/60">Last Signal</span>
                      <span className="text-xs font-medium text-low">{new Date(selectedDevice.device?.last_seen).toLocaleTimeString('en-US')}</span>
                    </div>
                  </div>
                </section>
                
                {canManageDevices && (
                  <section className="pt-4 border-t border-border">
                     <button 
                        onClick={() => runDeepScan(selectedDevice.device?.ip)}
                        disabled={scanningIp === selectedDevice.device?.ip}
                        className="w-full py-3 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 active:scale-95 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 shadow-lg shadow-accent/20"
                      >
                        <Search className={`w-4 h-4 ${scanningIp === selectedDevice.device?.ip ? 'animate-spin' : ''}`} />
                        <span>{scanningIp === selectedDevice.device?.ip ? 'Running Deep Scan...' : 'Trigger Vulnerability Scan'}</span>
                      </button>
                  </section>
                )}
              </div>

              {/* Center Column: Network Intel */}
              <div className="lg:col-span-3 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section className="bg-background/30 p-6 rounded-2xl border border-border">
                    <h3 className="text-[10px] font-bold text-text/40 uppercase mb-4 flex items-center space-x-2">
                       <Network className="w-3 h-3" />
                       <span>Open Communication Ports</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedDevice.device?.open_ports?.map(port => (
                        <div 
                          key={port} 
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-2 ${[21, 23, 3389, 445, 1883, 554].includes(port) ? 'bg-high/10 text-high border border-high/30' : 'bg-background border border-border text-text/70'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          <span>{port}</span>
                        </div>
                      )) || <div className="text-xs text-text/30 italic py-4">Awaiting port discovery...</div>}
                    </div>
                  </section>

                  <section className="bg-background/30 p-6 rounded-2xl border border-border">
                    <h3 className="text-[10px] font-bold text-text/40 uppercase mb-4 flex items-center space-x-2">
                      <Activity className="w-3 h-3" />
                      <span>Fingerprinted Services</span>
                    </h3>
                    <div className="space-y-2">
                      {selectedDevice.device?.services?.map((svc, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/50">
                          <span className="text-[10px] font-bold text-accent uppercase">{svc.port}/{svc.protocol}</span>
                          <span className="text-[10px] text-text/80">{svc.name || svc.service} <span className="text-text/40 ml-1">{svc.version}</span></span>
                        </div>
                      )) || <div className="text-xs text-text/30 italic py-4">No services fingerprint found</div>}
                    </div>
                  </section>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section className="bg-background/30 p-6 rounded-2xl border border-border">
                    <h3 className="text-[10px] font-bold text-text/40 uppercase mb-4 flex items-center space-x-2 text-high">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Security Vulnerabilities (CVE)</span>
                    </h3>
                    <div className="space-y-3">
                      {selectedDevice.device?.vulnerabilities?.map((vuln, i) => (
                        <div key={i} className="p-3 bg-high/5 rounded-xl border border-high/20">
                          <div className="text-[10px] font-bold text-high uppercase flex justify-between items-center mb-1">
                            <span>Port {vuln.port} - {vuln.script}</span>
                            <div className="flex items-center space-x-1">
                              {vuln.cve && (
                                <span className="px-1.5 py-0.5 bg-high/20 text-high border border-high/30 rounded text-[9px]">{vuln.cve}</span>
                              )}
                              <span className={`px-1.5 py-0.5 text-white rounded text-[9px] ${vuln.severity === 'CRITICAL' ? 'bg-critical' : 'bg-high'}`}>{vuln.severity || 'VULN'}</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-high/80 leading-relaxed mb-2">{vuln.summary || vuln.output}</p>
                          {vuln.recommendation && (
                            <div className="text-[10px] text-low/80 bg-low/5 border border-low/20 rounded-lg px-2 py-1.5 mb-2">
                              <span className="font-bold text-low">Fix: </span>{vuln.recommendation}
                            </div>
                          )}
                          <button
                            onClick={() => askAIAbout({
                              device_ip: selectedDevice.device?.ip,
                              vuln_script: vuln.script,
                              message: `Explain vulnerability ${vuln.script} ${vuln.cve ? `(${vuln.cve})` : ''} on device ${selectedDevice.device?.label} and how to remediate it.`,
                            })}
                            className="flex items-center space-x-1.5 text-[10px] px-2 py-1 bg-accent/10 border border-accent/20 text-accent rounded-lg hover:bg-accent/20 transition-all"
                          >
                            <Bot className="w-3 h-3" />
                            <span>Ask AI about this finding</span>
                          </button>
                        </div>
                      )) || <div className="text-xs text-text/30 italic py-4 flex items-center space-x-2"><ShieldCheck className="w-4 h-4 text-low" /> <span>No known vulnerabilities detected.</span></div>}
                    </div>
                  </section>

                  <section className="bg-background/30 p-6 rounded-2xl border border-border">
                    <h3 className="text-[10px] font-bold text-text/40 uppercase mb-4 flex items-center space-x-2">
                      <Bell className="w-3 h-3" />
                      <span>Intrusion Attempt History</span>
                    </h3>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {selectedDevice.alerts?.map(alert => (
                        <div key={alert.id} className="p-3 bg-background rounded-xl border border-border/50 flex items-center justify-between transition-all hover:bg-background/50">
                          <div className="flex items-center space-x-4">
                            <div className={`w-2.5 h-2.5 rounded-full ${alert.severity === 'CRITICAL' ? 'bg-critical' : (alert.severity === 'HIGH' ? 'bg-high' : 'bg-medium')}`} />
                            <div>
                              <p className="text-[10px] font-bold uppercase text-text/90">{alert.attack_type}</p>
                              <p className="text-[9px] text-text/40 mt-0.5">{new Date(alert.timestamp).toLocaleString('en-US')}</p>
                            </div>
                          </div>
                          <span className="text-[8px] font-bold text-text/30 border border-border px-1.5 py-0.5 rounded uppercase">{alert.detection_method}</span>
                        </div>
                      )) || <div className="text-xs text-text/30 italic py-8 text-center bg-background rounded-2xl border border-border/30">Zero active intrusion records.</div>}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · TLS 1.3 Encrypted · Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
};

export default Devices;
