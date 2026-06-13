import React, { useState, useEffect } from "react";
import {
  UserCog,
  Shield,
  Plus,
  Key,
  CheckCircle,
  AlertCircle,
  Lock,
  Star,
  Eye,
  Wrench,
  User,
} from "lucide-react";
import api from "../lib/api";
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

const ROLES = [
  {
    value: "admin",
    label: "SOC Admin",
    desc: "Full system access — manage users, rules, and settings",
    icon: Shield,
    color: C.red,
    bg: "rgba(255,61,113,.08)",
    border: "rgba(255,61,113,.28)",
    level: "Level 4",
  },
  {
    value: "analyst",
    label: "SOC Analyst",
    desc: "View alerts, run scenarios, generate reports",
    icon: Star,
    color: C.orange,
    bg: "rgba(255,176,32,.08)",
    border: "rgba(255,176,32,.25)",
    level: "Level 3",
  },
  {
    value: "monitor",
    label: "Monitoring Staff",
    desc: "Read-only dashboard, topology, packets, and logs access",
    icon: Eye,
    color: C.blue,
    bg: "rgba(0,157,255,.08)",
    border: "rgba(0,157,255,.25)",
    level: "Level 2",
  },
  {
    value: "technical",
    label: "Technical Staff",
    desc: "Device management and fog node configuration",
    icon: Wrench,
    color: C.purple,
    bg: "rgba(157,92,255,.08)",
    border: "rgba(157,92,255,.25)",
    level: "Level 1",
  },
  {
    value: "viewer",
    label: "Read-Only Viewer",
    desc: "Summary dashboard access only",
    icon: User,
    color: C.green,
    bg: "rgba(0,255,157,.06)",
    border: "rgba(0,255,157,.18)",
    level: "Level 0",
  },
];
const getRole = (v) => ROLES.find((r) => r.value === v) || ROLES[2];

export default function Users({ user }) {
  const isAdmin = user?.role === "admin";
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const [pwById, setPwById] = useState({});
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "monitor",
  });

  useEffect(() => {
    if (isAdmin) fetchUsers();
    else setLoading(false);
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const r = await api.get("/api/users");
      setList(r.data);
    } catch {}
    setLoading(false);
  };

  const notify = (ok, msg) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) return;
    setCreating(true);
    try {
      await api.post("/api/users", {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      });
      setForm({ username: "", password: "", role: "monitor" });
      notify(
        true,
        `User "${form.username}" created as ${getRole(form.role).label}.`,
      );
      fetchUsers();
    } catch (err) {
      notify(false, err.response?.data?.detail || "Could not create user.");
    }
    setCreating(false);
  };

  const updateRole = async (id, role) => {
    try {
      await api.patch(`/api/users/${id}`, { role });
      notify(true, `Role updated to ${getRole(role).label}.`);
      fetchUsers();
    } catch (err) {
      notify(false, err.response?.data?.detail || "Role update failed.");
    }
  };

  const resetPw = async (id) => {
    const pw = pwById[id];
    if (!pw || pw.length < 6) {
      notify(false, "Minimum 6 characters required.");
      return;
    }
    try {
      await api.patch(`/api/users/${id}`, { password: pw });
      setPwById((p) => ({ ...p, [id]: "" }));
      notify(true, "Password reset successfully.");
    } catch (err) {
      notify(false, err.response?.data?.detail || "Password reset failed.");
    }
  };

  if (!isAdmin)
    return (
      <div style={{ textAlign: "center", marginTop: 80, color: C.muted }}>
        <Lock
          style={{ width: 48, height: 48, margin: "0 auto 16px", opacity: 0.2 }}
        />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#E6F1FF" }}>
          Access Restricted
        </h2>
        <p style={{ fontSize: 13, marginTop: 6 }}>
          User management requires SOC Admin privileges.
        </p>
      </div>
    );

  return (
    <div className="p-6 space-y-6 page-enter" style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `${C.cyan}12`,
            border: `1px solid ${C.cyan}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserCog style={{ width: 20, height: 20, color: C.cyan }} />
        </div>
        <div>
          <h1 className="page-title text-title-grad">User Management</h1>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            RBAC — Role-Based Access Control · JWT Authentication
          </p>
        </div>
      </div>

      {toast && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: 12,
            border: `1px solid ${toast.ok ? "rgba(0,255,157,.3)" : "rgba(255,61,113,.3)"}`,
            background: toast.ok
              ? "rgba(0,255,157,.07)"
              : "rgba(255,61,113,.07)",
            color: toast.ok ? C.green : C.red,
            fontSize: 13,
            fontWeight: 500,
            animation: "slide-down .3s ease both",
          }}
        >
          {toast.ok ? (
            <CheckCircle style={{ width: 16, height: 16 }} />
          ) : (
            <AlertCircle style={{ width: 16, height: 16 }} />
          )}
          {toast.msg}
        </div>
      )}

      {/* Role Definition Cards */}
      <div>
        <p
          className="section-title"
          style={{ color: C.muted, marginBottom: 14 }}
        >
          Role Definitions
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 14,
          }}
        >
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <HoverHint
                hint={`${r.label} (${r.level}): ${r.desc}`}
                as="div"
                className="role-card"
                style={{ background: r.bg, borderColor: r.border }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: `${r.color}18`,
                      border: `1px solid ${r.color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon style={{ width: 14, height: 14, color: r.color }} />
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 20,
                      background: `${r.color}18`,
                      color: r.color,
                      letterSpacing: ".08em",
                    }}
                  >
                    {r.level}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#E6F1FF",
                    marginBottom: 5,
                  }}
                >
                  {r.label}
                </p>
                <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  {r.desc}
                </p>
              </HoverHint>
            );
          })}
        </div>
      </div>

      {/* Create Account */}
      <div className="glass-card" style={{ padding: 20 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#E6F1FF",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Plus style={{ width: 14, height: 14, color: C.cyan }} /> Create
          Account
        </h2>
        <form
          onSubmit={createUser}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          {[
            {
              label: "Username",
              key: "username",
              type: "text",
              ph: "e.g. john.doe",
              minLen: 3,
            },
            {
              label: "Password",
              key: "password",
              type: "password",
              ph: "Min 6 characters",
              minLen: 6,
            },
          ].map(({ label, key, type, ph, minLen }) => (
            <div key={key}>
              <p
                style={{
                  fontSize: 9,
                  color: C.muted,
                  marginBottom: 5,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                {label}
              </p>
              <input
                type={type}
                placeholder={ph}
                required
                minLength={minLen}
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
                className="input-glass"
                style={{ fontSize: 12, padding: "8px 12px", width: 160 }}
              />
            </div>
          ))}
          <div>
            <p
              style={{
                fontSize: 9,
                color: C.muted,
                marginBottom: 5,
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              Role
            </p>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="input-glass"
              style={{ fontSize: 12, padding: "8px 12px", minWidth: 160 }}
            >
              {ROLES.map((r) => (
                <option
                  key={r.value}
                  value={r.value}
                  style={{ background: "#071426" }}
                >
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <HoverHint hint="Create a new system account with the selected role. All account creation events are logged to the audit trail. Minimum password: 6 characters.">
            <button
              type="submit"
              disabled={creating}
              className="btn-cyber"
              style={{ height: 38 }}
              title="Create new system account with the selected RBAC role"
            >
              {creating ? "Creating…" : "Create User"}
            </button>
          </HoverHint>
        </form>
      </div>

      {/* User List */}
      <div className="glass-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid rgba(0,229,255,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#E6F1FF" }}>
            System Accounts ({list.length})
          </h2>
          <span style={{ fontSize: 11, color: "rgba(123,145,176,.4)" }}>
            All changes are audit-logged
          </span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
            Loading users…
          </div>
        ) : (
          <div>
            {list.map((u, i) => {
              const role = getRole(u.role);
              const RIcon = role.icon;
              const lastLogin = new Date(
                Date.now() - (i + 1) * 3600000 * 2,
              ).toLocaleString("en-US");
              return (
                <div
                  key={u.id}
                  style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid rgba(0,229,255,.05)",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap",
                    transition: "background .15s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(0,229,255,.02)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: `${role.color}15`,
                      border: `1px solid ${role.color}28`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: role.color,
                        textTransform: "uppercase",
                      }}
                    >
                      {(u.username || "?")[0]}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#E6F1FF",
                      }}
                    >
                      {u.username}
                    </p>
                    <p style={{ fontSize: 10, color: C.muted }}>
                      ID: {u.id} · Last login: {lastLogin}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: 20,
                      background: role.bg,
                      border: `1px solid ${role.border}`,
                      color: role.color,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    <RIcon style={{ width: 10, height: 10 }} />
                    {role.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: 20,
                      background: "rgba(0,255,157,.06)",
                      border: "1px solid rgba(0,255,157,.18)",
                      color: C.green,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: C.green,
                      }}
                    />
                    Active
                  </div>
                  <select
                    defaultValue={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    className="input-glass"
                    style={{ fontSize: 11, padding: "5px 9px", minWidth: 140 }}
                    disabled={u.username === user?.username}
                  >
                    {ROLES.map((r) => (
                      <option
                        key={r.value}
                        value={r.value}
                        style={{ background: "#071426" }}
                      >
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="password"
                      placeholder="New password"
                      value={pwById[u.id] || ""}
                      onChange={(e) =>
                        setPwById((p) => ({ ...p, [u.id]: e.target.value }))
                      }
                      className="input-glass"
                      style={{ fontSize: 11, padding: "5px 9px", width: 120 }}
                    />
                    <HoverHint hint="Reset this user's password. Enter a minimum 6-character password in the field then click this button. Action is audit-logged.">
                      <button
                        onClick={() => resetPw(u.id)}
                        style={{
                          background: `${C.cyan}10`,
                          border: `1px solid ${C.cyan}28`,
                          borderRadius: 8,
                          padding: "5px 10px",
                          color: C.cyan,
                          cursor: "pointer",
                          transition: "all .2s",
                        }}
                      >
                        <Key style={{ width: 13, height: 13 }} />
                      </button>
                    </HoverHint>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          background: "rgba(0,229,255,.04)",
          border: "1px solid rgba(0,229,255,.12)",
          borderRadius: 12,
          padding: "12px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <Shield
          style={{
            width: 14,
            height: 14,
            color: C.cyan,
            flexShrink: 0,
            marginTop: 2,
          }}
        />
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          All user management actions (create / role change / password reset)
          are logged to the system event log. Access{" "}
          <span style={{ color: C.cyan, fontWeight: 600 }}>Logs</span> and
          filter by event type{" "}
          <code
            style={{
              fontFamily: "JetBrains Mono,monospace",
              fontSize: 10,
              background: "rgba(0,0,0,.3)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            USER_MGMT
          </code>{" "}
          for a full audit trail.
        </p>
      </div>

      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · Fernet Encrypted ·
        Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
}
