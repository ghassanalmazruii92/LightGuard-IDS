import { useState, useEffect, useRef } from "react";
import HoverHint from "../components/HoverHint";
import {
  Activity,
  Wifi,
  Shield,
  AlertTriangle,
  Clock,
  Trash2,
} from "lucide-react";
import api from "../lib/api";

const C = {
  cyan: "#00E5FF",
  blue: "#009DFF",
  green: "#00FF9D",
  purple: "#9D5CFF",
  orange: "#FFB020",
  red: "#FF3D71",
  muted: "#7B91B0",
};

const SEV_STYLE = {
  CRITICAL: {
    bg: "rgba(255,61,113,.12)",
    border: "rgba(255,61,113,.35)",
    color: "#FF3D71",
    rowBorder: "rgba(255,61,113,.3)",
  },
  HIGH: {
    bg: "rgba(255,176,32,.12)",
    border: "rgba(255,176,32,.35)",
    color: "#FFB020",
    rowBorder: "rgba(255,176,32,.25)",
  },
  MEDIUM: {
    bg: "rgba(245,158,11,.12)",
    border: "rgba(245,158,11,.35)",
    color: "#F59E0B",
    rowBorder: "rgba(245,158,11,.2)",
  },
  LOW: {
    bg: "rgba(0,255,157,.10)",
    border: "rgba(0,255,157,.30)",
    color: "#00FF9D",
    rowBorder: "rgba(0,255,157,.15)",
  },
};
const PROTO_C = {
  TCP: "#378ADD",
  UDP: "#9D5CFF",
  ICMP: "#FF7A9D",
  ARP: "#FFB020",
};
const MAX_BUFFER = 500;
const PAGE_SIZE = 50;

const statusLabel = (s) => {
  if (!s) return "Logged";
  return s
    .replace(/blocked/gi, "Logged")
    .replace(/IPS/gi, "IDS")
    .replace(/prevention/gi, "Detection")
    .replace(/mitigation/gi, "Suggested Response");
};

export default function LivePackets() {
  const [packets, setPackets] = useState([]);
  const [filter, setFilter] = useState({ severity: "ALL", protocol: "" });
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ total: 0, attacks: 0, flagged: 0 });
  const wsRef = useRef(null);

  const normalizePacket = (d) => ({
    id: d.id || Date.now(),
    timestamp: d.timestamp
      ? new Date(d.timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString(),
    src_ip: d.src_ip || "—",
    dst_ip: d.dst_ip || "—",
    protocol: d.protocol || "TCP",
    port: d.dst_port || d.port || "—",
    attack_type:
      (d.attack_type || "Traffic Packet")
        .replace(/blocked/gi, "Detected")
        .replace(/mock/gi, "")
        .trim() || "Traffic Packet",
    severity: d.severity || "LOW",
    flags:
      d.flags ||
      (d.attack_type?.includes("Scan")
        ? "SYN"
        : d.protocol === "ICMP"
          ? "ECHO"
          : "—"),
    status:
      d.source === "GNS3" || d.source === "Packet Capture"
        ? d.source
        : d.is_simulation
          ? "Simulation"
          : d.source || "Packet Event",
    action:
      statusLabel(d.action_taken) ||
      (d.attack_type ? "Alert Correlated" : "Observed"),
    zone: d.zone || "—",
    score: d.anomaly_score != null ? d.anomaly_score : null,
    confidence: d.confidence != null ? d.confidence : null,
    length: d.length || 0,
    source: d.source || "Packet Capture",
  });

  useEffect(() => {
    api
      .get("/api/packets/live?limit=100")
      .then((r) => {
        const list = (r.data || []).map(normalizePacket);
        setPackets(list);
        setStats({
          total: list.length,
          attacks: list.filter((p) => p.severity !== "LOW").length,
          flagged: list.filter(
            (p) => p.severity === "CRITICAL" || p.severity === "HIGH",
          ).length,
        });
        setConnectionError("");
      })
      .catch(() => {
        setConnectionError(
          "Backend offline or authentication expired. Live packet history could not be loaded.",
        );
      });
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host =
      window.location.hostname === "localhost"
        ? "localhost:8000"
        : window.location.host;
    const token = localStorage.getItem("token") || "";
    const ws = new WebSocket(
      `${proto}://${host}/ws/packets?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      setConnectionError("");
    };
    ws.onclose = () => {
      setConnected(false);
      setConnectionError(
        "Live packet WebSocket is disconnected. The table is showing the last buffered events.",
      );
    };
    ws.onerror = () => {
      setConnected(false);
      setConnectionError(
        "Live packet WebSocket failed. Check backend status and login token.",
      );
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const pkt = normalizePacket(d);
        setPackets((p) => [pkt, ...p].slice(0, MAX_BUFFER));
        setPage(1);
        setStats((p) => ({
          total: p.total + 1,
          attacks: p.attacks + (pkt.severity !== "LOW" ? 1 : 0),
          flagged:
            p.flagged +
            (pkt.severity === "CRITICAL" || pkt.severity === "HIGH" ? 1 : 0),
        }));
      } catch {}
    };
    return () => ws.close();
  }, []);

  const filtered = packets.filter((p) => {
    const s = filter.severity === "ALL" || p.severity === filter.severity;
    const r =
      !filter.protocol ||
      p.protocol.toLowerCase().includes(filter.protocol.toLowerCase());
    return s && r;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const statCards = [
    { label: "Total Events", value: stats.total, color: C.cyan, icon: Wifi },
    {
      label: "Suspicious Events",
      value: stats.attacks,
      color: C.orange,
      icon: AlertTriangle,
    },
    {
      label: "High/Critical IDS",
      value: stats.flagged,
      color: C.red,
      icon: Shield,
    },
  ];

  return (
    <div className="p-6 space-y-5 page-enter">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            className="page-title text-title-grad"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Activity style={{ width: 24, height: 24, color: C.cyan }} />
            Live Traffic Analysis
          </h1>
          <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            Real-time IDS monitoring — Tadhamon Smart City Detection Platform
          </p>
        </div>
        <span
          className="pill"
          style={{
            background: connected
              ? "rgba(0,255,157,.08)"
              : "rgba(255,61,113,.08)",
            border: `1px solid ${connected ? "rgba(0,255,157,.28)" : "rgba(255,61,113,.28)"}`,
            color: connected ? C.green : C.red,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? C.green : C.red,
              animation: connected
                ? "pulse-dot 2s ease-in-out infinite"
                : "none",
            }}
          />
          {connected ? "Live Feed Active" : "Reconnecting…"}
        </span>
      </div>

      {connectionError && (
        <div
          className="glass-card"
          style={{
            padding: "12px 16px",
            border: "1px solid rgba(255,176,32,.28)",
            background: "rgba(255,176,32,.06)",
            color: C.orange,
            fontSize: 12,
          }}
        >
          {connectionError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 16,
        }}
      >
        {statCards.map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className="glass-card"
            style={{
              padding: 18,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: `${color}15`,
                border: `1px solid ${color}25`,
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
                  color,
                  filter: `drop-shadow(0 0 6px ${color})`,
                }}
              />
            </div>
            <div>
              <p className="kpi-number-sm" style={{ color }}>
                {value}
              </p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="glass-card"
        style={{
          padding: "14px 18px",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={filter.severity}
          onChange={(e) =>
            setFilter((f) => ({ ...f, severity: e.target.value }))
          }
          className="input-glass"
          style={{ fontSize: 12, padding: "8px 12px", minWidth: 130 }}
        >
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
            <option key={s} style={{ background: "#071426" }}>
              {s}
            </option>
          ))}
        </select>
        <input
          placeholder="Filter by protocol (TCP, UDP…)"
          value={filter.protocol}
          onChange={(e) =>
            setFilter((f) => ({ ...f, protocol: e.target.value }))
          }
          className="input-glass"
          style={{ fontSize: 12, padding: "8px 12px", minWidth: 200 }}
        />
        <span style={{ fontSize: 11, color: C.muted }}>
          Showing {pageRows.length} of {filtered.length} filtered events ·
          buffer limit {MAX_BUFFER}
        </span>
        <button
          onClick={() => {
            setPackets([]);
            setStats({ total: 0, attacks: 0, flagged: 0 });
            setPage(1);
          }}
          className="btn-cyber"
          style={{ height: 36, fontSize: 11, marginLeft: "auto", gap: 6 }}
          title="Clear all captured packets from the current session view"
        >
          <Trash2
            style={{ width: 13, height: 13 }}
            title="Clear packet history from display"
          />{" "}
          Clear
        </button>
      </div>

      <div className="glass-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
          >
            <thead>
              <tr
                style={{
                  background: "rgba(0,229,255,.04)",
                  borderBottom: "1px solid rgba(0,229,255,.1)",
                }}
              >
                {[
                  "Time",
                  "Src IP",
                  "Dst IP",
                  "Proto",
                  "Port",
                  "Flags",
                  "Bytes",
                  "Zone",
                  "Attack Pattern",
                  "Severity",
                  "Source",
                  "Action Taken",
                ].map((h) => (
                  <th
                    key={h}
                    className="section-title"
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      color: "rgba(123,145,176,.6)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    style={{
                      textAlign: "center",
                      padding: "48px 12px",
                      color: C.muted,
                    }}
                  >
                    <Clock
                      style={{
                        width: 32,
                        height: 32,
                        margin: "0 auto 8px",
                        opacity: 0.3,
                      }}
                    />
                    <p style={{ fontSize: 13 }}>Waiting for network events…</p>
                  </td>
                </tr>
              )}
              {pageRows.map((p, i) => {
                const sev = SEV_STYLE[p.severity] || SEV_STYLE.LOW;
                return (
                  <tr
                    key={`${p.id}-${i}`}
                    style={{
                      borderBottom: "1px solid rgba(0,229,255,.05)",
                      borderLeft: `3px solid ${sev.rowBorder}`,
                      transition: "background .15s ease",
                      animation: "slide-down .3s ease both",
                      animationDelay: `${Math.min(i * 20, 200)}ms`,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(0,229,255,.025)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td
                      className="mono-ip"
                      style={{
                        padding: "9px 12px",
                        color: "rgba(123,145,176,.55)",
                      }}
                    >
                      {p.timestamp}
                    </td>
                    <td
                      className="mono-ip"
                      style={{ padding: "9px 12px", color: C.cyan }}
                    >
                      {p.src_ip}
                    </td>
                    <td
                      className="mono-ip"
                      style={{ padding: "9px 12px", color: "#85B7EB" }}
                    >
                      {p.dst_ip}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: `${PROTO_C[p.protocol] || "#888"}18`,
                          border: `1px solid ${PROTO_C[p.protocol] || "#888"}40`,
                          color: PROTO_C[p.protocol] || "#888",
                          fontFamily: "JetBrains Mono,monospace",
                        }}
                      >
                        {p.protocol}
                      </span>
                    </td>
                    <td
                      className="mono-ip"
                      style={{ padding: "9px 12px", color: C.muted }}
                    >
                      {p.port}
                    </td>
                    <td
                      className="mono-ip"
                      style={{
                        padding: "9px 12px",
                        color: "rgba(123,145,176,.5)",
                        fontSize: 11,
                      }}
                    >
                      {p.flags}
                    </td>
                    <td
                      className="mono-ip"
                      style={{
                        padding: "9px 12px",
                        color: "rgba(123,145,176,.5)",
                        fontSize: 11,
                      }}
                    >
                      {p.length || "—"}
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        color: C.muted,
                        fontSize: 11,
                      }}
                    >
                      {p.zone}
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        color: "#E6F1FF",
                        fontSize: 12,
                        maxWidth: 190,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.attack_type}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: sev.bg,
                          border: `1px solid ${sev.border}`,
                          color: sev.color,
                        }}
                      >
                        {p.severity}
                      </span>
                    </td>
                    <td className="mono-ip" style={{ padding: "9px 12px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background:
                            p.source === "GNS3"
                              ? "rgba(157,92,255,.12)"
                              : "rgba(0,229,255,.08)",
                          color: p.source === "GNS3" ? C.purple : C.cyan,
                          border: `1px solid ${p.source === "GNS3" ? "rgba(157,92,255,.25)" : "rgba(0,229,255,.2)"}`,
                        }}
                      >
                        {p.source}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        fontSize: 11,
                        color: C.muted,
                      }}
                    >
                      {p.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="glass-card"
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: C.muted }}>
          Page {safePage} / {totalPages}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-cyber"
            style={{ height: 32, fontSize: 11 }}
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="btn-cyber"
            style={{ height: 32, fontSize: 11 }}
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · Fernet Encrypted ·
        Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
}
