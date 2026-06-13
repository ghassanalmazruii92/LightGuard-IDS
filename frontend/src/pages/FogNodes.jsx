import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Cpu,
  Wifi,
  WifiOff,
  Activity,
  Play,
  RefreshCw,
  Car,
  Zap,
  Shield,
  Server,
  ArrowRight,
  Database,
} from "lucide-react";
import axios from "axios";
import HoverHint from "../components/HoverHint";

const C = {
  cyan: "#00E5FF",
  blue: "#009DFF",
  green: "#00FF9D",
  purple: "#9D5CFF",
  orange: "#FFB020",
  red: "#FF3D71",
  muted: "#7B91B0",
};

const NODE_META = {
  zone_a: {
    label: "Zone A — Transportation",
    tagline: "Transportation & traffic IoT",
    icon: Car,
    color: C.cyan,
    vlan: "VLAN 10",
    deviceTypes: ["traffic_sensor", "security_camera"],
  },
  zone_b: {
    label: "Zone B — Energy Grid",
    tagline: "Grid & utility telemetry",
    icon: Zap,
    color: C.orange,
    vlan: "VLAN 20",
    deviceTypes: ["energy_meter", "env_sensor"],
  },
  zone_c: {
    label: "Zone C — Public Safety",
    tagline: "Public safety sensors",
    icon: Shield,
    color: C.red,
    vlan: "VLAN 50",
    deviceTypes: ["security_camera", "env_sensor"],
  },
};

const MOCK_NODES = Object.keys(NODE_META).map((id, i) => ({
  id,
  status: "online",
  alerts_forwarded: 12 + i * 4,
  alerts_local: 31 + i * 8,
  last_heartbeat: new Date(Date.now() - (i + 1) * 18000).toISOString(),
  cpu_pct: 14 + i * 7,
  ram_pct: 28 + i * 5,
}));

function MiniGraph({ color, label }) {
  const [pts, setPts] = useState(() =>
    Array.from({ length: 12 }, () => 20 + Math.random() * 60),
  );
  useEffect(() => {
    const iv = setInterval(
      () =>
        setPts((p) => {
          const n = [...p.slice(1), 15 + Math.random() * 65];
          return n;
        }),
      2000,
    );
    return () => clearInterval(iv);
  }, []);
  const max = Math.max(...pts, 1),
    min = Math.min(...pts, 0);
  const norm = (v) => 40 - ((v - min) / (max - min + 0.01)) * 36;
  const d = pts
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * 220} ${norm(v)}`,
    )
    .join(" ");
  return (
    <div style={{ marginBottom: 4 }}>
      <p
        style={{
          fontSize: 9,
          color: C.muted,
          textTransform: "uppercase",
          letterSpacing: ".1em",
          marginBottom: 3,
        }}
      >
        {label}
      </p>
      <svg
        width="100%"
        viewBox="0 0 220 42"
        preserveAspectRatio="none"
        style={{ height: 36 }}
      >
        <defs>
          <linearGradient id={`g${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={d + ` L220 42 L0 42 Z`} fill={`url(#g${label})`} />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p
        style={{
          fontFamily: "Rajdhani,sans-serif",
          fontSize: 16,
          fontWeight: 700,
          color,
          marginTop: 2,
        }}
      >
        {pts[pts.length - 1].toFixed(0)}%
      </p>
    </div>
  );
}

export default function FogNodes() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState({});
  const [fogError, setFogError] = useState(false);
  const [flowStep, setFlowStep] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setFlowStep((s) => (s + 1) % 3), 800);
    return () => clearInterval(iv);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await axios.get("/fog/status", { timeout: 3000 });
      setNodes(r.data.nodes || MOCK_NODES);
      setFogError(false);
    } catch {
      setNodes(MOCK_NODES);
      setFogError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 8000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const simulate = async (id) => {
    setSimulating((p) => ({ ...p, [id]: true }));
    try {
      await axios.post(`/fog/simulate/${id}`, { packets: 20 });
    } catch {
    } finally {
      setTimeout(() => {
        setSimulating((p) => ({ ...p, [id]: false }));
        fetchStatus();
      }, 2500);
    }
  };

  const fmtHb = (ts) => {
    if (!ts) return "Unknown";
    const diff = (Date.now() - new Date(ts)) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(ts).toLocaleTimeString();
  };

  const ARCH = [
    {
      label: "IoT Devices",
      items: [
        "traffic_sensor",
        "energy_meter",
        "security_camera",
        "env_sensor",
      ],
      color: C.cyan,
      bg: "rgba(0,229,255,.08)",
      border: "rgba(0,229,255,.22)",
      icon: Server,
    },
    {
      label: "Edge Processing",
      items: ["Fog Nodes :8001"],
      color: C.orange,
      bg: "rgba(255,176,32,.08)",
      border: "rgba(255,176,32,.25)",
      icon: Cpu,
    },
    {
      label: "Cloud / IDS Server",
      items: ["LightGuard IDS :8000"],
      color: C.green,
      bg: "rgba(0,255,157,.08)",
      border: "rgba(0,255,157,.25)",
      icon: Database,
    },
  ];

  return (
    <div className="p-6 space-y-6 page-enter">
      <div>
        <h1
          className="page-title text-title-grad"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <Server style={{ width: 22, height: 22, color: C.cyan }} />
          Fog Nodes — Network Health
        </h1>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          Edge processing nodes — Tadhamon Smart City IoT→Fog→Cloud Architecture
        </p>
      </div>

      {/* Architecture Diagram */}
      <div className="glass-card" style={{ padding: "22px 24px" }}>
        <HoverHint hint="LOW/MEDIUM alerts are processed at the Fog edge node. Only HIGH/CRITICAL events are forwarded to the central LightGuard IDS cloud server — reducing bandwidth by up to 70%.">
          <p
            className="section-title"
            style={{ color: C.muted, marginBottom: 18 }}
          >
            IoT → Fog → Cloud Architecture
          </p>
        </HoverHint>
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            overflowX: "auto",
            minHeight: 110,
          }}
        >
          {ARCH.map((block, bi) => {
            const Icon = block.icon;
            const isActive = flowStep === bi;
            return (
              <React.Fragment key={bi}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 140,
                    background: block.bg,
                    border: `1px solid ${isActive ? block.color : block.border}`,
                    borderRadius: 14,
                    padding: "14px 16px",
                    transition: "all .4s ease",
                    boxShadow: isActive ? `0 0 18px ${block.color}22` : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: `${block.color}18`,
                        border: `1px solid ${block.color}30`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        style={{
                          width: 14,
                          height: 14,
                          color: block.color,
                          filter: isActive
                            ? `drop-shadow(0 0 5px ${block.color})`
                            : "none",
                        }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: block.color,
                        textTransform: "uppercase",
                        letterSpacing: ".1em",
                      }}
                    >
                      {block.label}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {block.items.map((it) => (
                      <span
                        key={it}
                        style={{
                          fontSize: 9,
                          padding: "3px 8px",
                          background: "rgba(0,0,0,.3)",
                          border: `1px solid ${block.color}25`,
                          borderRadius: 6,
                          color: "rgba(230,241,255,.7)",
                          fontFamily: "JetBrains Mono,monospace",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it}
                      </span>
                    ))}
                  </div>
                </div>
                {bi < ARCH.length - 1 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 10px",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <ArrowRight
                      style={{
                        width: 16,
                        height: 16,
                        color: flowStep === bi ? C.cyan : C.muted,
                        transition: "color .4s ease",
                        filter:
                          flowStep === bi
                            ? `drop-shadow(0 0 4px ${C.cyan})`
                            : "none",
                      }}
                    />
                    {bi === 1 && (
                      <span
                        style={{
                          fontSize: 8,
                          color: C.orange,
                          letterSpacing: ".06em",
                          textAlign: "center",
                        }}
                      >
                        HIGH/CRIT
                      </span>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Error — hidden Arabic, clean English only */}
      {fogError && (
        <div
          style={{
            background: "rgba(0,229,255,.04)",
            border: "1px solid rgba(0,229,255,.15)",
            borderRadius: 14,
            padding: "12px 18px",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: C.orange,
              animation: "pulse-dot 2s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
          <p style={{ fontSize: 12, color: C.muted, flex: 1 }}>
            Fog server offline — displaying simulated node data. Start backend
            fog node to connect live.
          </p>
          <button
            onClick={fetchStatus}
            className="btn-cyber"
            style={{ height: 30, fontSize: 10, gap: 5, flexShrink: 0 }}
          >
            <RefreshCw style={{ width: 10, height: 10 }} /> Refresh
          </button>
        </div>
      )}

      {/* Node Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 20,
        }}
      >
        {(loading ? [null, null, null] : nodes).map((node, idx) => {
          if (!node)
            return (
              <div
                key={idx}
                className="skeleton"
                style={{ minHeight: 340, borderRadius: 20 }}
              />
            );
          const meta = NODE_META[node.id] || {
            label: node.id,
            icon: Server,
            color: C.cyan,
            vlan: "VLAN",
            deviceTypes: [],
          };
          const Icon = meta.icon;
          const online = node.status === "online" || node.status === "unknown";
          const cpu = node.cpu_pct ?? 14 + idx * 7;
          const ram = node.ram_pct ?? 28 + idx * 5;
          const latency = (1.2 + idx * 1.8).toFixed(1);
          return (
            <div
              key={node.id}
              style={{
                background: "#071426",
                border: `1px solid ${online ? `${meta.color}25` : "rgba(255,61,113,.2)"}`,
                borderRadius: 20,
                padding: 22,
                transition: "all .3s ease",
                boxShadow: online ? `0 0 20px ${meta.color}08` : "none",
                animationDelay: `${idx * 80}ms`,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.boxShadow = `0 0 32px ${meta.color}15`)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = online
                  ? `0 0 20px ${meta.color}08`
                  : "none")
              }
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 13,
                      background: `${meta.color}12`,
                      border: `1px solid ${meta.color}25`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      style={{
                        width: 20,
                        height: 20,
                        color: meta.color,
                        filter: `drop-shadow(0 0 6px ${meta.color})`,
                      }}
                    />
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#E6F1FF",
                      }}
                    >
                      {meta.label}
                    </p>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {meta.tagline}
                    </p>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: `${meta.color}15`,
                        border: `1px solid ${meta.color}28`,
                        color: meta.color,
                        fontFamily: "JetBrains Mono,monospace",
                        display: "inline-block",
                        marginTop: 4,
                      }}
                    >
                      {meta.vlan}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 999,
                    background: online
                      ? "rgba(0,255,157,.08)"
                      : "rgba(255,61,113,.08)",
                    border: `1px solid ${online ? "rgba(0,255,157,.28)" : "rgba(255,61,113,.28)"}`,
                    color: online ? C.green : C.red,
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: online ? C.green : C.red,
                      animation: online
                        ? "pulse-dot 2s ease-in-out infinite"
                        : "none",
                    }}
                  />
                  {online ? "Online" : "Offline"}
                  {online ? (
                    <Wifi style={{ width: 11, height: 11 }} />
                  ) : (
                    <WifiOff style={{ width: 11, height: 11 }} />
                  )}
                </div>
              </div>

              {/* Forwarded / Local */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,176,32,.07)",
                    border: "1px solid rgba(255,176,32,.15)",
                    borderRadius: 12,
                    padding: "11px 14px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "Rajdhani,sans-serif",
                      fontSize: 28,
                      fontWeight: 700,
                      color: C.orange,
                      lineHeight: 1,
                    }}
                  >
                    {node.alerts_forwarded || 0}
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: ".12em",
                      marginTop: 4,
                    }}
                  >
                    Forwarded
                  </p>
                </div>
                <div
                  style={{
                    background: "rgba(0,255,157,.05)",
                    border: "1px solid rgba(0,255,157,.12)",
                    borderRadius: 12,
                    padding: "11px 14px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "Rajdhani,sans-serif",
                      fontSize: 28,
                      fontWeight: 700,
                      color: C.green,
                      lineHeight: 1,
                    }}
                  >
                    {node.alerts_local || 0}
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: ".12em",
                      marginTop: 4,
                    }}
                  >
                    Local Logs
                  </p>
                </div>
              </div>

              {/* Resource Graphs */}
              {online && (
                <div
                  style={{
                    background: "rgba(0,0,0,.2)",
                    border: "1px solid rgba(0,229,255,.06)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <MiniGraph color={C.orange} label="CPU %" />
                  <MiniGraph color={C.blue} label="RAM %" />
                  <div style={{ gridColumn: "1/-1" }}>
                    <p
                      style={{
                        fontSize: 9,
                        color: C.muted,
                        textTransform: "uppercase",
                        letterSpacing: ".1em",
                        marginBottom: 3,
                      }}
                    >
                      Latency
                    </p>
                    <p
                      style={{
                        fontFamily: "Rajdhani,sans-serif",
                        fontSize: 16,
                        fontWeight: 700,
                        color: C.cyan,
                      }}
                    >
                      {latency}ms
                    </p>
                  </div>
                </div>
              )}

              {/* Heartbeat */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                <Activity
                  style={{
                    width: 11,
                    height: 11,
                    color: online ? C.green : C.red,
                    animation: online
                      ? "heartbeat 1.5s ease-in-out infinite"
                      : "none",
                  }}
                />
                <span style={{ fontSize: 11, color: C.muted }}>
                  Last heartbeat:{" "}
                  <span style={{ color: "rgba(230,241,255,.65)" }}>
                    {fmtHb(node.last_heartbeat)}
                  </span>
                </span>
              </div>

              {/* Device types */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 16,
                }}
              >
                {meta.deviceTypes.map((dt) => (
                  <span
                    key={dt}
                    style={{
                      fontSize: 9,
                      padding: "2px 8px",
                      background: "rgba(0,0,0,.3)",
                      border: "1px solid rgba(0,229,255,.1)",
                      borderRadius: 6,
                      color: C.muted,
                      fontFamily: "JetBrains Mono,monospace",
                    }}
                  >
                    {dt}
                  </span>
                ))}
              </div>

              {/* Simulate */}
              <HoverHint
                hint={`Inject ${20} simulated attack packets into ${meta.label} — triggers live IDS detection pipeline`}
              >
                <button
                  onClick={() => simulate(node.id)}
                  disabled={simulating[node.id]}
                  title={`Send ${node.id === "zone_a" ? "Transportation" : node.id === "zone_b" ? "Energy Grid" : "Public Safety"} zone simulated IoT traffic through the fog node to trigger detection. HIGH/CRITICAL alerts are forwarded to the IDS cloud server.`}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    cursor: simulating[node.id] ? "wait" : "pointer",
                    background: simulating[node.id]
                      ? `${meta.color}0A`
                      : `linear-gradient(135deg,${meta.color}18,${meta.color}08)`,
                    border: `1px solid ${meta.color}${simulating[node.id] ? "28" : "45"}`,
                    color: meta.color,
                    fontFamily: "Orbitron,sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".1em",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    transition: "all .25s ease",
                    boxShadow: simulating[node.id]
                      ? "none"
                      : `0 0 0 0 ${meta.color}`,
                  }}
                  onMouseEnter={(e) =>
                    !simulating[node.id] &&
                    (e.currentTarget.style.boxShadow = `0 0 18px ${meta.color}35`)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.boxShadow = "none")
                  }
                >
                  {simulating[node.id] ? (
                    <>
                      <RefreshCw
                        style={{
                          width: 12,
                          height: 12,
                          animation: "spin-slow 1s linear infinite",
                        }}
                      />{" "}
                      Simulating…
                    </>
                  ) : (
                    <>
                      <Play style={{ width: 12, height: 12 }} /> Simulate
                      Traffic
                    </>
                  )}
                </button>
              </HoverHint>
            </div>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 11,
          color: "rgba(123,145,176,.3)",
          textAlign: "center",
        }}
      >
        LOW / MEDIUM alerts logged locally · HIGH / CRITICAL forwarded to
        LightGuard IDS cloud server
      </p>
      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · Fernet Encrypted ·
        Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
}
