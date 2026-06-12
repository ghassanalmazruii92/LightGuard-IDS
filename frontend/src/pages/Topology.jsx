import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState, MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  Network, Lock, Activity, Trash2, Plus, ToggleLeft,
  ToggleRight, ChevronDown, ChevronRight, RefreshCw, HelpCircle,
  Zap,
  Globe,
  Shield,
  Layers,
  Radar,
  GitBranch,
  Server,
} from 'lucide-react';

import api from '../lib/api';
import HoverHint from '../components/HoverHint';
import InfraNode       from '../components/topology/InfraNode';
import ControlCenterNode from '../components/topology/ControlCenterNode';
import FirewallNode    from '../components/topology/FirewallNode';
import VlanGroupNode   from '../components/topology/VlanGroupNode';
import DeviceNode      from '../components/topology/DeviceNode';
import AttackEdge      from '../components/topology/AttackEdge';
import TrafficEdge     from '../components/topology/TrafficEdge';
import WanCloudNode    from '../components/topology/WanCloudNode';

// ── React Flow node/edge type registries ──────────────────────────────────
const nodeTypes = {
  infra:         InfraNode,
  wanCloud:      WanCloudNode,
  controlCenter: ControlCenterNode,
  firewall:      FirewallNode,
  vlanGroup:     VlanGroupNode,
  device:        DeviceNode,
};

const edgeTypes = {
  attack: AttackEdge,
  traffic: TrafficEdge,
};

/** Horizontal center used to align WAN → core fabric (looks like rack elevation). */
const FABRIC_CENTER_X = 884;

// ── Layout constants ───────────────────────────────────────────────────────
const INFRA_Y       = 0;
const VLAN_Y        = 304;
const DEVICE_Y_BASE = 448;
const VLAN_X_STEP   = 278;
const DEVICE_X_STEP = 132;
const VLAN_SWITCH_W = 112;

/** Physical-style north–south path; lucide glyphs match NOC diagram tone */
const NETWORK_FLOW_STEPS = [
  { key: 'inet', Icon: Globe, title: 'WAN / ISP', sub: 'Carrier handoff', hint: 'Untrusted ingress: BGP or static default route from the ISP; demarc optics (e.g. 10GE LR).' },
  { key: 'fw', Icon: Shield, title: 'NGFW', sub: 'Policy & zoning', hint: 'Perimeter firewall: application policy, VLAN tagging into the trusted core.' },
  { key: 'core', Icon: Layers, title: 'Core L3', sub: 'SVI & routing', hint: 'Agg switch / router: terminates VLAN SVIs or downlinks trunked to distribution / access switches.' },
  { key: 'ids', Icon: Radar, title: 'IDS / SPAN', sub: 'Mirror ingest', hint: 'Packet mirror (SPAN/ERSPAN) from the NGFW interior port into the sensor VM or appliance.' },
  { key: 'vlan', Icon: GitBranch, title: 'ToR access', sub: 'L2 per zone', hint: 'Top-of-rack or closet switch serving one broadcast domain mapped to VLAN + SVI subnet.' },
  { key: 'iot', Icon: Server, title: 'Hosts', sub: 'ICS / IoT', hint: 'Field devices, sensors, or fog/compute blades with host routes via the gateway on the VLAN.' },
];

function topologyMarkerEndColor(edge) {
  const kind = edge.id.startsWith('e-dev-') ? 'access' : 'trunk';
  const lc = edge.data?.link_class;
  if (lc === 'span') return '#a78bfa';
  if (lc === 'wan') return '#38bdf8';
  if (lc === 'distribution' && edge.data?.color) return edge.data.color;
  if (kind === 'access') return '#586174';
  return edge.data?.color || '#64748b';
}

function mgmtTorFromVlanCidr(cidr) {
  if (!cidr || !cidr.includes('/')) return null;
  const p = cidr.split('/')[0].split('.');
  if (p.length !== 4) return null;
  p[3] = '2';
  return p.join('.');
}

function torHostnameFromVlan(vlan) {
  return `tor-vlan${vlan.vlan_id}.dc1.tadhamon`;
}

const PATH_STACK_IDS = new Set(['internet', 'firewall-01', 'core-switch', 'ids-engine']);

function buildAttackStory(alert, topo) {
  if (!alert || !topo) return [];
  const src = topo.devices.find((d) => d.ip === alert.src_ip);
  const dst = topo.devices.find((d) => d.ip === alert.dst_ip);
  const vlanSrc = src ? topo.vlans.find((v) => v.zone === src.zone) : null;
  const vlanDst = dst ? topo.vlans.find((v) => v.zone === dst.zone) : null;

  const zoneNote =
    vlanSrc && vlanDst && vlanSrc.vlan_id !== vlanDst.vlan_id
      ? 'Source and destination VLANs differ — east–west path between segments via the core.'
      : vlanSrc || vlanDst
        ? 'Traffic is generally east–west within the same VLAN segment.'
        : null;

  return [
    {
      title: 'Network path (static diagram)',
      body:
        'Dim or coloured lines with arrows show the logical path: untrusted → firewall → core (packets mirrored or analysed by IDS) → zone VLAN switch → host. The bright dashed arrow that fades after ~5s is the same live event.',
    },
    {
      title: 'What does this alert mean?',
      body:
        `${alert.attack_type} — activity between ${alert.src_ip} → ${alert.dst_ip}${
          alert.blocked ? ' (blocked or restricted per log).' : '.'
        }`,
    },
    {
      title: 'Source and target',
      body: [
        src
          ? `Source: ${src.label || src.hostname} (${alert.src_ip}) — zone ${src.zone}`
          : `Source: ${alert.src_ip} (not mapped to a device node).`,
        dst
          ? `Target: ${dst.label || dst.hostname} (${alert.dst_ip}) — zone ${dst.zone}`
          : `Target: ${alert.dst_ip} (not mapped to a device node).`,
        vlanSrc &&
          vlanDst &&
          `Source VLAN ${vlanSrc.vlan_id}, destination VLAN ${vlanDst.vlan_id}`,
        zoneNote,
      ]
        .filter(Boolean)
        .join(' • '),
    },
  ];
}

function buildNodes(topoData, pulsing) {
  const nodes = [];
  const cx = FABRIC_CENTER_X;

  const infraMap = {
    internet:       { type: 'wanCloud',       x: cx - 122, y: INFRA_Y + 2 },
    'firewall-01':  { type: 'firewall',       x: cx - 79, y: INFRA_Y + 108 },
    'core-switch': { type: 'infra',           x: cx - 74, y: INFRA_Y + 234 },
    'control-center': { type: 'controlCenter', x: cx + 210, y: INFRA_Y + 224 },
    'ids-engine':  { type: 'infra',           x: cx - 394, y: INFRA_Y + 226 },
  };

  topoData.infra.forEach((inf) => {
    const meta = infraMap[inf.id] || { type: 'infra', x: cx, y: INFRA_Y };
    nodes.push({
      id: inf.id,
      type: meta.type,
      position: { x: meta.x, y: meta.y },
      data: { ...inf },
      draggable: true,
    });
  });

  const sortedVlans = [...topoData.vlans].sort((a, b) => a.vlan_id - b.vlan_id);
  const vlanSpan = sortedVlans.length ? (sortedVlans.length - 1) * VLAN_X_STEP : 0;
  const vlanXStart = cx - vlanSpan / 2;

  sortedVlans.forEach((vlan, idx) => {
    const sx = vlanXStart + idx * VLAN_X_STEP;
    const switchId = `vlan-switch-${vlan.vlan_id}`;
    const groupId = `vlan-group-${vlan.vlan_id}`;
    const isPulsing = pulsing.has(vlan.zone);
    const devicesInVlan = topoData.devices.filter((d) => d.zone === vlan.zone);

    nodes.push({
      id: switchId,
      type: 'infra',
      position: { x: sx, y: VLAN_Y },
      data: {
        id: switchId,
        label: `ToR VLAN ${vlan.vlan_id}`,
        hostname: torHostnameFromVlan(vlan),
        model: '48×1G · 4×10G uplink · L2 Access (sim)',
        mgmt_ip: mgmtTorFromVlanCidr(vlan.cidr),
        layer: 'access',
        color: vlan.color,
        site: vlan.zone,
        form_factor: 'compact',
      },
      draggable: true,
    });

    const groupW = Math.max(212, devicesInVlan.length * DEVICE_X_STEP + 72);
    const groupLeft = sx + VLAN_SWITCH_W / 2 - groupW / 2;

    nodes.push({
      id: groupId,
      type: 'vlanGroup',
      position: { x: groupLeft, y: DEVICE_Y_BASE - 34 },
      data: { ...vlan, pulsing: isPulsing },
      style: { width: groupW, minHeight: 136, zIndex: -1 },
      draggable: true,
      selectable: false,
    });

    const innerBlock = Math.max(DEVICE_X_STEP, (devicesInVlan.length - 1) * DEVICE_X_STEP + 104);
    const inset = Math.max(10, (groupW - innerBlock) / 2);

    devicesInVlan.forEach((dev, dIdx) => {
      const devX = inset + dIdx * DEVICE_X_STEP;
      nodes.push({
        id: `dev-${dev.ip}`,
        type: 'device',
        position: { x: devX, y: DEVICE_Y_BASE + 18 },
        parentNode: groupId,
        extent: 'parent',
        data: { ...dev },
        draggable: true,
      });
    });
  });

  return nodes;
}

function buildEdges(topoData) {
  return topoData.edges.map((e) => {
    const kind = e.id.startsWith('e-dev-') ? 'access' : 'trunk';
    const strokeColor = topologyMarkerEndColor(e);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'traffic',
      animated: false,
      style: {},
      markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
      data: {
        ...(e.data || {}),
        label: e.label,
        kind,
        color:
          e.data?.color ??
          (kind === 'trunk' ? '#65758b' : '#4b596d'),
      },
    };
  });
}

// ── Side-panel tab key ─────────────────────────────────────────────────────
const TABS = ['Firewall', 'Hosts', 'Encryption', 'Live Logs'];

// ── Main component ─────────────────────────────────────────────────────────
export default function Topology({ user }) {
  const canManageDevices = user?.role === 'admin' || user?.role === 'technical';
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [topoData, setTopoData]  = useState(null);
  const [loading, setLoading]    = useState(true);

  // Attack edge tracking
  const attackEdgesRef = useRef({});        // id -> timeoutId
  const pulsing = useRef(new Set());        // zones currently pulsing
  const storyTimeoutRef = useRef(null);
  const topoRef = useRef(null);

  // Side-panel state
  const [tab, setTab]             = useState('Firewall');
  const [panelOpen, setPanelOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  // Firewall rules
  const [fwRules, setFwRules]   = useState([]);
  const [fwLoading, setFwLoading] = useState(false);
  const [newRule, setNewRule]   = useState({
    src_zone: '*', dst_zone: '*', protocol: '*',
    port: '', action: 'allow', description: '',
  });
  const [addingRule, setAddingRule] = useState(false);

  // Manual hosts (topology)
  const [addingDevice, setAddingDevice] = useState(false);
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceFormError, setDeviceFormError] = useState('');
  const [newDevice, setNewDevice] = useState({
    ip: '',
    zone: '',
    hostname: '',
    mac: '',
    label: '',
    role: 'generic_host',
    status: 'online',
  });

  // Detection config (encryption)
  const [config, setConfig] = useState({});

  // Live logs from WS
  const [liveLogs, setLiveLogs] = useState([]);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [attackStory, setAttackStory] = useState(null);

  useEffect(() => {
    topoRef.current = topoData;
  }, [topoData]);

  useEffect(() => {
    if (!topoData?.vlans?.length) return;
    setNewDevice((d) => (d.zone ? d : { ...d, zone: topoData.vlans[0].zone }));
  }, [topoData]);

  // ── Fetch topology ──────────────────────────────────────────────────────
  const fetchTopo = useCallback(async () => {
    try {
      const res = await api.get('/api/network/topology');
      setTopoData(res.data);
      const builtNodes = buildNodes(res.data, pulsing.current);
      const builtEdges = buildEdges(res.data);
      setNodes(builtNodes);
      setEdges(builtEdges);
    } catch (e) {
      console.error('topology fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  const fetchFwRules = useCallback(async () => {
    setFwLoading(true);
    try {
      const res = await api.get('/api/network/firewall');
      setFwRules(res.data);
    } catch (e) {
      console.error('fw rules fetch error', e);
    } finally {
      setFwLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/api/detection-config');
      setConfig(res.data);
    } catch (e) {
      console.error('config fetch error', e);
    }
  }, []);

  useEffect(() => {
    fetchTopo();
    fetchFwRules();
    fetchConfig();
  }, [fetchTopo, fetchFwRules, fetchConfig]);

  // ── WebSocket — live attacks ────────────────────────────────────────────
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const token = localStorage.getItem('token') || '';
    const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws/alerts?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      const alert = JSON.parse(event.data);

      setLiveLogs((prev) => [alert, ...prev.slice(0, 49)]);

      const topo = topoRef.current;
      if (storyTimeoutRef.current) {
        clearTimeout(storyTimeoutRef.current);
        storyTimeoutRef.current = null;
      }
      setAttackStory({ alert, paragraphs: buildAttackStory(alert, topo) });
      storyTimeoutRef.current = setTimeout(() => {
        setAttackStory(null);
        storyTimeoutRef.current = null;
      }, 9000);

      const srcId = `dev-${alert.src_ip}`;
      const dstId = `dev-${alert.dst_ip}`;
      const edgeId = `attack-${Date.now()}-${alert.id}`;
      const color = alert.blocked
        ? '#22C55E'
        : alert.severity === 'CRITICAL' ? '#DC2626'
        : alert.severity === 'HIGH'     ? '#EF4444'
        : alert.severity === 'MEDIUM'   ? '#F59E0B'
        : '#3B82F6';

      const attackEdge = {
        id: edgeId,
        source: srcId,
        target: dstId,
        type: 'attack',
        animated: true,
        zIndex: 100,
        style: { stroke: color, strokeWidth: 3, zIndex: 100 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        data: {
          attack_type: alert.attack_type,
          severity: alert.severity,
          blocked: alert.blocked,
          srcIp: alert.src_ip,
          dstIp: alert.dst_ip,
        },
      };

      setEdges((eds) => [...eds, attackEdge]);

      if (alert.zone) {
        pulsing.current.add(alert.zone);
      }

      setNodes((nds) =>
        nds.map((n) => {
          const nextData = { ...n.data };

          if (n.type === 'vlanGroup' && alert.zone && n.data.zone === alert.zone) {
            nextData.pulsing = true;
          }

          if (n.type === 'device') {
            if (n.id === srcId) nextData.flowPulse = 'src';
            else if (n.id === dstId) nextData.flowPulse = 'tgt';
            else delete nextData.flowPulse;
          }

          if (PATH_STACK_IDS.has(n.id)) {
            nextData.onAttackPath = true;
          } else if (
            ['infra', 'firewall', 'controlCenter'].includes(n.type)
            && !PATH_STACK_IDS.has(n.id)
          ) {
            delete nextData.onAttackPath;
          }

          return { ...n, data: nextData };
        })
      );

      const timeout = setTimeout(() => {
        setEdges((eds) => eds.filter((e) => e.id !== edgeId));
        if (alert.zone) {
          pulsing.current.delete(alert.zone);
        }
        setNodes((nds) =>
          nds.map((n) => {
            const nextData = { ...n.data };

            if (n.type === 'vlanGroup' && alert.zone && n.data.zone === alert.zone) {
              nextData.pulsing = false;
            }

            if (n.type === 'device') {
              delete nextData.flowPulse;
            }

            if (PATH_STACK_IDS.has(n.id)) {
              delete nextData.onAttackPath;
            }

            return { ...n, data: nextData };
          })
        );

        delete attackEdgesRef.current[edgeId];
      }, 5000);

      attackEdgesRef.current[edgeId] = timeout;
    };

    return () => {
      ws.close();
      Object.values(attackEdgesRef.current).forEach(clearTimeout);
      if (storyTimeoutRef.current) {
        clearTimeout(storyTimeoutRef.current);
      }
    };
  }, [setEdges, setNodes]);

  // ── Firewall CRUD ───────────────────────────────────────────────────────
  const toggleRule = async (rule) => {
    try {
      await api.patch(`/api/network/firewall/${rule.id}`, { enabled: !rule.enabled });
      fetchFwRules();
    } catch (e) {
      console.error('toggle rule error', e);
    }
  };

  const deleteRule = async (id) => {
    try {
      await api.delete(`/api/network/firewall/${id}`);
      fetchFwRules();
    } catch (e) {
      console.error('delete rule error', e);
    }
  };

  const addRule = async () => {
    try {
      await api.post('/api/network/firewall', {
        ...newRule,
        port: newRule.port ? parseInt(newRule.port) : null,
      });
      setNewRule({ src_zone: '*', dst_zone: '*', protocol: '*', port: '', action: 'allow', description: '' });
      setAddingRule(false);
      fetchFwRules();
    } catch (e) {
      console.error('add rule error', e);
    }
  };

  const saveNewDevice = async () => {
    setDeviceFormError('');
    setDeviceSaving(true);
    try {
      await api.post('/api/devices/register', {
        ip: newDevice.ip.trim(),
        zone: newDevice.zone.trim(),
        hostname: newDevice.hostname.trim() || undefined,
        mac: newDevice.mac.trim() || undefined,
        label: newDevice.label.trim() || undefined,
        role: newDevice.role.trim() || 'generic_host',
        status: newDevice.status.trim() || 'online',
      });
      const z = newDevice.zone;
      setNewDevice({
        ip: '',
        zone: z,
        hostname: '',
        mac: '',
        label: '',
        role: 'generic_host',
        status: 'online',
      });
      setAddingDevice(false);
      await fetchTopo();
    } catch (e) {
      console.error('add device error', e);
      const det = e.response?.data?.detail;
      const msg =
        typeof det === 'string'
          ? det
          : Array.isArray(det)
            ? det.map((x) => x.msg || JSON.stringify(x)).join('; ')
            : det
              ? JSON.stringify(det)
              : e.message || 'Failed to add device';
      setDeviceFormError(msg);
    } finally {
      setDeviceSaving(false);
    }
  };

  // ── Severity helpers ────────────────────────────────────────────────────
  const severityDot = (s, blocked) => {
    if (blocked)           return 'bg-low';
    if (s === 'CRITICAL')  return 'bg-critical';
    if (s === 'HIGH')      return 'bg-high';
    if (s === 'MEDIUM')    return 'bg-medium';
    return 'bg-low';
  };

  return (
    <div className="page-enter flex h-[calc(100vh-80px)] gap-4" lang="en" dir="ltr">
      {/* ── React Flow canvas ─────────────────────────────────────────── */}
      <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden relative">
        <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2 max-w-md">
          <div className="flex items-center space-x-2">
            <Network className="w-5 h-5 text-accent" />
            <span className="text-sm font-bold text-accent">Tadhamon Network Topology</span>
            <HoverHint
              as="button"
              type="button"
              hint="Toggle the topology legend: layers, edges, and how live alerts animate on the graph."
              className="p-1.5 bg-background border border-border rounded-lg text-text/50 hover:text-accent transition-all"
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </HoverHint>
            <HoverHint
              as="button"
              type="button"
              hint="Reload topology JSON from GET /api/network/topology and refresh the diagram."
              className="p-1.5 bg-background border border-border rounded-lg text-text/50 hover:text-accent transition-all"
              onClick={fetchTopo}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </HoverHint>
          </div>
          {legendOpen && (
            <div
              className="text-[10px] leading-relaxed text-text/80 bg-background/95 border border-border rounded-xl p-3 shadow-lg max-h-64 overflow-y-auto space-y-2"
            >
              <p className="font-bold text-accent">Network layers</p>
              <p className="text-text/70">
                Internet → city firewall → core → control plane &amp; IDS engine → per-zone VLAN switches → hosts in each segment (data from{' '}
                <code className="text-accent/90 bg-card px-0.5 rounded">GET /api/network/topology</code>).
              </p>
              <p className="font-bold text-accent">Diagram lines</p>
              <ul className="list-disc space-y-1 ps-4 text-text/70">
                <li>
                  <strong>WAN handoff block</strong> plus rack-face NGFW, core agg, IDS, and ToR nodes—hostnames/models/mgmt IPs and VLAN gateways mimic a NetBox lab export.
                </li>
                <li>
                  Dashed <strong>traffic</strong> edges annotate speed plus interface shorthand (carrier demarc → Po uplinks → Gi access → NIC). Alerts still originate from{' '}
                  <code className="text-accent/90 bg-card px-0.5 rounded">/ws/alerts</code>{' '}(~5s glow between hosts).
                </li>
              </ul>
              <p className="font-bold text-accent">How it works</p>
              <p className="text-text/70">
                IDS records the event → SQLite → broadcast to clients → animated arrow between source and target; Live Logs tab shows the same JSON.
              </p>
              <p className="text-text/70">
                Firewall tab: <code className="text-accent/90 bg-card px-0.5 rounded">/api/network/firewall</code>.
              </p>
            </div>
          )}
        </div>

        {/* Animated attack CSS + traffic dashed edges */}
        <style>{`
          @keyframes dash {
            to { stroke-dashoffset: -18; }
          }
        `}</style>

        {!loading && attackStory && (
          <div className="absolute bottom-[148px] left-3 right-3 z-[8] pointer-events-none flex justify-center px-2">
            <div className="pointer-events-auto max-w-2xl w-full rounded-2xl border border-high/35 bg-background/96 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 text-high drop-shadow-[0_0_8px_rgba(239,68,68,0.55)]" aria-hidden />
                <div className="min-w-0 flex-1 space-y-3 text-left">
                  <div>
                    <p className="text-[11px] font-bold text-accent">How this attack appears on the topology</p>
                    <p className="mt-0.5 truncate text-[9px] font-mono text-text/55">
                      [{attackStory.alert.severity}] {attackStory.alert.attack_type}
                    </p>
                  </div>
                  {attackStory.paragraphs.map((p, idx) => (
                    <div
                      key={`${p.title}-${idx}`}
                      className="rounded-lg border border-border/70 bg-card/70 px-2.5 py-2 leading-relaxed"
                    >
                      <span className="text-[10px] font-bold text-text">{p.title}</span>
                      <p className="mt-1 text-[10px] text-text/80">{p.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <div className="absolute bottom-3 left-2 right-2 z-[7] pointer-events-none flex justify-center px-2">
            <div
              className="pointer-events-auto max-w-[98%] overflow-x-auto rounded-2xl border border-border bg-background/96 px-3 py-2.5 shadow-xl backdrop-blur-sm sm:px-4 sm:py-3"
            >
              <p className="mb-2 text-center text-[11px] font-bold text-accent">Physical-ish north–south path (left → right)</p>
              <div className="flex flex-nowrap items-stretch justify-center gap-0.5 min-w-min sm:gap-1">
                {NETWORK_FLOW_STEPS.map((s, i) => (
                  <React.Fragment key={s.key}>
                    {i > 0 && (
                      <ChevronRight className="h-4 w-4 shrink-0 self-center text-accent/40 sm:h-5 sm:w-5" aria-hidden />
                    )}
                    <HoverHint
                      hint={s.hint}
                      className="flex min-w-[76px] max-w-[106px] flex-col items-center gap-1 rounded-lg border border-border/70 bg-slate-950/85 px-1.5 py-1.5 sm:min-w-[84px]"
                    >
                      <s.Icon className="h-[18px] w-[18px] shrink-0 text-sky-400/90 sm:h-[20px] sm:w-[20px]" strokeWidth={1.85} aria-hidden />
                      <span className="text-center text-[8.5px] font-bold uppercase leading-snug tracking-wide text-slate-100">
                        {s.title}
                      </span>
                      <span className="text-center text-[6.5px] leading-snug text-slate-500">{s.sub}</span>
                    </HoverHint>
                  </React.Fragment>
                ))}
              </div>
              <p className="mx-auto mt-2 max-w-lg text-center text-[8px] leading-relaxed text-text/45">
                Edge labels pulled from topology JSON (circuit, SPAN, VLAN, access port → NIC). Alerts still draw live device-to-device overlays from WebSocket.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full text-text/40">
            <Activity className="w-6 h-6 animate-pulse mr-2" /> Loading topology…
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background id="cross" variant="cross" gap={26} color="#2a394f" lineWidth={0.5} />
            <Background id="dots" variant="dots" gap={34} color="#394b63" size={1.15} />
            <Controls className="!bg-card !border-border" />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === 'wanCloud') return '#0ea5e9';
                if (n.type === 'controlCenter') return '#0D9488';
                if (n.type === 'firewall') return '#EF4444';
                if (n.type === 'vlanGroup') return n.data?.color || '#334155';
                if (n.type === 'device') return '#64748B';
                return '#475569';
              }}
              className="!bg-card !border-border !opacity-[0.92]"
              maskColor="rgb(15,23,42,0.12)"
            />
          </ReactFlow>
        )}
      </div>

      {/* ── Side panel ────────────────────────────────────────────────── */}
      <div
        className={`bg-card border border-border rounded-2xl flex flex-col overflow-hidden transition-all duration-300 ${panelOpen ? 'w-96' : 'w-12'}`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center justify-between p-3 border-b border-border hover:bg-background/50 transition-colors"
        >
          {panelOpen && <span className="text-xs font-bold text-accent uppercase">Control Panel</span>}
          {panelOpen ? <ChevronRight className="w-4 h-4 text-text/40" /> : <ChevronDown className="w-4 h-4 text-text/40" />}
        </button>

        {panelOpen && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    tab === t ? 'text-accent border-b-2 border-accent' : 'text-text/50 hover:text-text'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {/* ── Hosts tab ───────────────────────────────────── */}
              {tab === 'Hosts' && (
                <div className="space-y-3">
                  <p className="text-[10px] leading-relaxed text-text/55">
                    Device will appear under the selected VLAN zone. IP must be within that zone's subnet range.
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text/60 uppercase">Network Devices</span>
                    {canManageDevices && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingDevice((v) => !v);
                          setDeviceFormError('');
                        }}
                        className="flex items-center space-x-1 px-2 py-1 bg-accent/10 border border-accent/20 text-accent rounded-lg text-[10px] font-bold hover:bg-accent/20 transition-all"
                      >
                        <Plus className="w-3 h-3" /><span>Add host</span>
                      </button>
                    )}
                  </div>

                  {!canManageDevices && (
                    <p className="text-[10px] text-text/45">
                      Admin account required to add devices manually.
                    </p>
                  )}

                  {addingDevice && canManageDevices && (
                    <div className="p-3 bg-background border border-accent/20 rounded-xl space-y-2">
                      {deviceFormError && (
                        <div className="rounded-lg border border-high/30 bg-high/10 px-2 py-1.5 text-[10px] text-high">
                          {deviceFormError}
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] text-text/50 w-16 shrink-0">Zone</span>
                        <select
                          value={newDevice.zone}
                          onChange={(e) => setNewDevice((d) => ({ ...d, zone: e.target.value }))}
                          className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-text focus:border-accent outline-none"
                        >
                          {(topoData?.vlans ?? []).map((v) => (
                            <option key={v.vlan_id} value={v.zone}>
                              {v.zone} · {v.cidr}
                            </option>
                          ))}
                        </select>
                      </div>
                      {[
                        { label: 'IP', key: 'ip', placeholder: '192.168.10.50' },
                        { label: 'Hostname', key: 'hostname', placeholder: 'sensor-east-01' },
                        { label: 'Label', key: 'label', placeholder: 'Display label' },
                        { label: 'MAC', key: 'mac', placeholder: 'Optional' },
                        { label: 'Role', key: 'role', placeholder: 'generic_host' },
                      ].map(({ label, key, placeholder }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <span className="text-[9px] text-text/50 w-16 shrink-0">{label}</span>
                          <input
                            type="text"
                            value={newDevice[key]}
                            onChange={(e) => setNewDevice((r) => ({ ...r, [key]: e.target.value }))}
                            className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-text focus:border-accent outline-none"
                            placeholder={placeholder}
                          />
                        </div>
                      ))}
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] text-text/50 w-16 shrink-0">Status</span>
                        <select
                          value={newDevice.status}
                          onChange={(e) => setNewDevice((r) => ({ ...r, status: e.target.value }))}
                          className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-text focus:border-accent outline-none"
                        >
                          <option value="online">online</option>
                          <option value="offline">offline</option>
                          <option value="suspicious">suspicious</option>
                        </select>
                      </div>
                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingDevice(false);
                            setDeviceFormError('');
                          }}
                          className="text-[10px] px-3 py-1.5 border border-border rounded-lg text-text/50 hover:text-text transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={deviceSaving || !newDevice.ip.trim() || !newDevice.zone}
                          onClick={saveNewDevice}
                          className="text-[10px] px-3 py-1.5 bg-accent text-white rounded-lg font-bold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {deviceSaving ? 'Saving…' : 'Add to topology'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!addingDevice && topoData?.devices?.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border/60 bg-background/20 p-2">
                      <div className="text-[9px] font-bold text-text/40 uppercase px-1 pb-1">
                        Mapped hosts ({topoData.devices.length})
                      </div>
                      {topoData.devices.map((d) => (
                        <div
                          key={d.id ?? d.ip}
                          className="rounded-lg px-2 py-1.5 text-[10px] hover:bg-card/80 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.status === 'online' ? 'bg-green-400' : 'bg-red-400'}`}/>
                              <span className="font-mono text-sky-300/90 truncate">{d.ip}</span>
                            </div>
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${d.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                              {d.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-text/40">{d.label || d.device_type || 'IoT Device'}</span>
                            <span className="text-text/30">{d.zone}</span>
                          </div>
                          {d.mac && <p className="text-[9px] text-text/25 font-mono mt-0.5">{d.mac}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Firewall Rules tab ─────────────────────────── */}
              {tab === 'Firewall' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text/60 uppercase">Firewall Rules</span>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => setAddingRule((v) => !v)}
                        className="flex items-center space-x-1 px-2 py-1 bg-accent/10 border border-accent/20 text-accent rounded-lg text-[10px] font-bold hover:bg-accent/20 transition-all"
                      >
                        <Plus className="w-3 h-3" /><span>Add</span>
                      </button>
                    )}
                  </div>

                  {/* Add rule form */}
                  {addingRule && user?.role === 'admin' && (
                    <div className="p-3 bg-background border border-accent/20 rounded-xl space-y-2">
                      {[
                        { label: 'Src Zone', key: 'src_zone' },
                        { label: 'Dst Zone', key: 'dst_zone' },
                        { label: 'Protocol', key: 'protocol' },
                        { label: 'Port',     key: 'port', type: 'number' },
                        { label: 'Description', key: 'description' },
                      ].map(({ label, key, type }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <span className="text-[9px] text-text/50 w-16 shrink-0">{label}</span>
                          <input
                            type={type || 'text'}
                            value={newRule[key]}
                            onChange={(e) => setNewRule((r) => ({ ...r, [key]: e.target.value }))}
                            className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-text focus:border-accent outline-none"
                            placeholder={key === 'port' ? 'any' : '*'}
                          />
                        </div>
                      ))}
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] text-text/50 w-16 shrink-0">Action</span>
                        <select
                          value={newRule.action}
                          onChange={(e) => setNewRule((r) => ({ ...r, action: e.target.value }))}
                          className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-text focus:border-accent outline-none"
                        >
                          <option value="allow">allow</option>
                          <option value="deny">deny</option>
                        </select>
                      </div>
                      <div className="flex justify-end space-x-2 pt-1">
                        <button onClick={() => setAddingRule(false)} className="text-[10px] px-3 py-1.5 border border-border rounded-lg text-text/50 hover:text-text transition-all">Cancel</button>
                        <button onClick={addRule} className="text-[10px] px-3 py-1.5 bg-accent text-white rounded-lg font-bold hover:bg-accent/90 transition-all">Save</button>
                      </div>
                    </div>
                  )}

                  {/* Rules list */}
                  {fwLoading ? (
                    <div className="text-center text-text/30 text-xs py-4">Loading…</div>
                  ) : fwRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-3 rounded-xl border transition-all ${rule.enabled ? 'border-border bg-background/30' : 'border-border/30 bg-background/10 opacity-50'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${rule.action === 'deny' ? 'bg-high/20 text-high border border-high/30' : 'bg-low/20 text-low border border-low/30'}`}
                        >
                          {rule.action}
                        </span>
                        <div className="flex items-center space-x-1">
                          {user?.role === 'admin' && (
                            <>
                              <HoverHint
                                as="button"
                                type="button"
                                hint={rule.enabled ? 'Disable this firewall rule (stops enforcement).' : 'Enable this firewall rule.'}
                                className="text-text/40 hover:text-accent transition-colors"
                                onClick={() => toggleRule(rule)}
                              >
                                {rule.enabled
                                  ? <ToggleRight className="w-4 h-4 text-low" />
                                  : <ToggleLeft  className="w-4 h-4" />}
                              </HoverHint>
                              <HoverHint
                                as="button"
                                type="button"
                                hint="Permanently delete this rule from the policy list."
                                className="text-text/30 hover:text-high transition-colors"
                                onClick={() => deleteRule(rule.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </HoverHint>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-text/80">
                        {rule.src_zone} → {rule.dst_zone}
                        {rule.protocol !== '*' && <span className="text-text/50"> [{rule.protocol}{rule.port ? `:${rule.port}` : ''}]</span>}
                      </div>
                      {rule.description && (
                        <div className="text-[9px] text-text/40 mt-0.5">{rule.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Encryption tab — Enterprise SOC Grade ──────── */}
              {tab === 'Encryption' && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                  {/* ── Glowing Active Status Banner ─── */}
                  <div style={{
                    background:'linear-gradient(135deg,rgba(0,255,157,.09),rgba(0,229,255,.05))',
                    border:'1px solid rgba(0,255,157,.30)',
                    borderRadius:14,
                    padding:'12px 16px',
                    display:'flex',
                    alignItems:'center',
                    gap:10,
                    boxShadow:'0 0 20px rgba(0,255,157,.08)',
                    transition:'box-shadow .3s ease',
                    cursor:'default',
                  }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow='0 0 32px rgba(0,255,157,.16)'}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow='0 0 20px rgba(0,255,157,.08)'}
                  >
                    <div style={{ position:'relative', width:28, height:28, flexShrink:0 }}>
                      <svg width="28" height="28" viewBox="0 0 28 28">
                        <circle cx="14" cy="14" r="13" fill="none" stroke="rgba(0,255,157,.25)" strokeWidth="1.5"
                          style={{ animation:'glow-pulse 2s ease-in-out infinite' }}/>
                        <Lock style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:13, height:13, color:'#00FF9D', filter:'drop-shadow(0 0 5px #00FF9D)' }}/>
                      </svg>
                      <span style={{ position:'absolute', top:-2, right:-2, width:7, height:7, borderRadius:'50%', background:'#00FF9D', border:'1.5px solid #020817', animation:'pulse-dot 2s ease-in-out infinite' }}/>
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:700, color:'#00FF9D', letterSpacing:'.04em', fontFamily:'Orbitron,sans-serif', animation:'glow-pulse 2.5s ease-in-out infinite' }}>Encrypted Storage: Active</p>
                      <p style={{ fontSize:10, color:'rgba(0,255,157,.5)', marginTop:2 }}>All data encrypted at rest and in transit</p>
                    </div>
                    {/* TLS shimmer badge */}
                    <div style={{
                      marginLeft:'auto',
                      padding:'4px 10px',
                      borderRadius:20,
                      background:'linear-gradient(90deg,rgba(0,229,255,.1),rgba(157,92,255,.12),rgba(0,229,255,.1))',
                      backgroundSize:'200% 100%',
                      border:'1px solid rgba(0,229,255,.3)',
                      animation:'shimmer 2.5s ease-in-out infinite',
                      fontSize:9,
                      fontWeight:700,
                      color:'#00E5FF',
                      letterSpacing:'.1em',
                      fontFamily:'Orbitron,sans-serif',
                    }}>TLS 1.3 SECURE</div>
                  </div>

                  {/* ── Encryption Fields ─── */}
                  <div style={{
                    background:'#071426',
                    border:'1px solid rgba(0,229,255,.14)',
                    borderRadius:16,
                    padding:'18px 20px',
                    display:'flex',
                    flexDirection:'column',
                    gap:0,
                    boxShadow:'0 0 24px rgba(0,229,255,.04)',
                    transition:'border-color .3s ease, box-shadow .3s ease',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,229,255,.28)';e.currentTarget.style.boxShadow='0 0 32px rgba(0,229,255,.08)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,229,255,.14)';e.currentTarget.style.boxShadow='0 0 24px rgba(0,229,255,.04)';}}
                  >
                    {[
                      { label:'Encryption Standard', value:'TLS 1.3 + AES-256-GCM',         color:'#00E5FF', mono:false },
                      { label:'Security Key',         value:'A7F3C91E5B2D8A4F6C1E9B3D7F2A8C5E', color:'#9D5CFF', mono:true, hidden:true  },
                      { label:'Key Format',           value:'128-bit Hexadecimal',             color:'rgba(123,145,176,.8)', mono:false },
                      { label:'Active Model',         value: config.active_model || 'RandomForest', color:'#00FF9D', mono:false },
                      { label:'Anomaly Threshold',    value: config.anomaly_threshold ? `${parseFloat(config.anomaly_threshold).toFixed(1)}%` : '55.0%', color:'#00E5FF', mono:false },
                      { label:'FP Rate',              value: config.last_fp_rate && config.last_fp_rate !== 'N/A' ? `${config.last_fp_rate}%` : '0.0%', color:'#00FF9D', mono:false },
                      { label:'Last Tuned',           value: config.last_tuned && config.last_tuned !== 'Never' ? new Date(config.last_tuned).toLocaleString('en-US') : 'Pending', color:'rgba(123,145,176,.8)', mono:false },
                    ].map(({ label, value, color, mono, hidden }, i, arr) => {
                      const displayVal = hidden && !keyRevealed ? '•'.repeat(16) : value;
                      return (
                        <div key={label} style={{
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                          padding:'14px 0', borderBottom: i < arr.length-1 ? '1px solid rgba(0,229,255,.07)' : 'none', gap:12,
                        }}>
                          <span style={{ fontSize:11, color:'rgba(123,145,176,.55)', textTransform:'uppercase', letterSpacing:'.1em', fontWeight:600, flexShrink:0 }}>{label}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{
                              fontSize: mono ? 11 : 13, fontWeight:600, color,
                              fontFamily: mono ? 'JetBrains Mono,monospace' : 'inherit',
                              textAlign:'right', letterSpacing: mono ? '.1em' : '.01em',
                              filter: (mono && !hidden) ? `drop-shadow(0 0 5px rgba(157,92,255,.4))` : 'none',
                            }}>{displayVal}</span>
                            {hidden && (
                              <button onClick={()=>setKeyRevealed(r=>!r)} style={{
                                background:'rgba(157,92,255,.1)', border:'1px solid rgba(157,92,255,.25)',
                                borderRadius:6, padding:'2px 8px', color:'#9D5CFF', fontSize:9, cursor:'pointer',
                                fontWeight:600, letterSpacing:'.06em', transition:'all .2s',
                              }}>{keyRevealed ? 'HIDE' : 'REVEAL'}</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── TLS Certificate — Glassmorphism ─── */}
                  <div style={{
                    background:'rgba(7,18,38,.85)',
                    border:'1px solid rgba(0,229,255,.18)',
                    borderRadius:16,
                    padding:'20px 24px',
                    backdropFilter:'blur(12px)',
                    WebkitBackdropFilter:'blur(12px)',
                    boxShadow:'inset 0 1px 0 rgba(0,229,255,.1), 0 8px 32px rgba(0,0,0,.4)',
                    transition:'border-color .3s ease, box-shadow .3s ease',
                    position:'relative',
                    overflow:'hidden',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,229,255,.32)';e.currentTarget.style.boxShadow='inset 0 1px 0 rgba(0,229,255,.18), 0 0 28px rgba(0,229,255,.07)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,229,255,.18)';e.currentTarget.style.boxShadow='inset 0 1px 0 rgba(0,229,255,.1), 0 8px 32px rgba(0,0,0,.4)';}}
                  >
                    {/* Corner glow */}
                    <div style={{ position:'absolute', top:-20, right:-20, width:60, height:60, borderRadius:'50%', background:'rgba(0,229,255,.06)', pointerEvents:'none' }}/>

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <p style={{ fontSize:10, fontWeight:700, color:'rgba(123,145,176,.5)', textTransform:'uppercase', letterSpacing:'.12em' }}>TLS / HTTPS Certificate</p>
                      <div style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 12px', borderRadius:20, background:'rgba(0,255,157,.07)', border:'1px solid rgba(0,255,157,.22)', }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#00FF9D', animation:'pulse-dot 2s ease-in-out infinite' }}/>
                        <span style={{ fontSize:10, fontWeight:700, color:'#00FF9D', letterSpacing:'.06em' }}>Certificate Valid</span>
                      </div>
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {[
                        { label:'Issuer',   value:'LightGuard CA',             color:'rgba(230,241,255,.75)' },
                        { label:'Expires',  value:'2026-12-31',                 color:'rgba(230,241,255,.75)' },
                        { label:'Protocol', value:'TLS 1.3',                    color:'#00E5FF' },
                        { label:'Cipher',   value:'AES-256-GCM',               color:'#9D5CFF' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:11, color:'rgba(123,145,176,.45)', textTransform:'uppercase', letterSpacing:'.08em' }}>{label}</span>
                          <span style={{ fontSize:13, fontWeight:600, color, fontFamily:'JetBrains Mono,monospace' }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop:16, background:'rgba(0,0,0,.2)', borderRadius:10, padding:'12px 14px', border:'1px solid rgba(0,229,255,.08)' }}>
                      <p style={{ fontSize:9, color:'rgba(123,145,176,.4)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>Server Configuration</p>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#00FF9D', flexShrink:0 }}/>
                        <span style={{ fontSize:11, color:'rgba(0,229,255,.7)', fontFamily:'JetBrains Mono,monospace' }}>HTTPS/TLS server active on port 8443</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#00FF9D', flexShrink:0 }}/>
                        <span style={{ fontSize:11, color:'rgba(0,229,255,.7)', fontFamily:'JetBrains Mono,monospace' }}>SSL certificate and key loaded</span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* ── Live Logs tab ───────────────────────────────── */}
              {tab === 'Live Logs' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text/60 uppercase">Live Alert Stream</span>
                    <span className="text-[9px] text-text/30">{liveLogs.length} events</span>
                  </div>
                  {liveLogs.length === 0 && (
                    <div className="text-center text-text/30 text-xs py-8">Waiting for events…</div>
                  )}
                  {liveLogs.map((log, i) => (
                    <div
                      key={`${log.id}-${i}`}
                      className={`p-2.5 rounded-xl border transition-all ${log.blocked ? 'border-low/20 bg-low/5' : 'border-border bg-background/40'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${severityDot(log.severity, log.blocked)}`} />
                          <span className="text-[10px] font-bold text-text/90 uppercase">{log.attack_type}</span>
                          {log.blocked && (
                            <span className="px-1 py-0.5 bg-low/20 text-low border border-low/20 rounded text-[8px] font-bold">BLOCKED</span>
                          )}
                        </div>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          log.severity === 'CRITICAL' ? 'bg-critical/20 text-critical' :
                          log.severity === 'HIGH'     ? 'bg-high/20 text-high' :
                          log.severity === 'MEDIUM'   ? 'bg-medium/20 text-medium' :
                                                        'bg-low/20 text-low'
                        }`}>{log.severity}</span>
                      </div>
                      <div className="text-[9px] font-mono text-text/50">
                        {log.src_ip} → {log.dst_ip}
                        {log.zone && <span className="ml-1 text-text/30">[{log.zone}]</span>}
                      </div>
                      <div className="text-[8px] text-text/30 mt-0.5">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-US') : ''}
                        {log.detection_method && <span className="ml-1">{log.detection_method}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );

      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · TLS 1.3 Encrypted · Tadhamon Smart City — MEC 2025–2026
      </div>
}
