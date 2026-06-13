import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import Alerts from "./pages/Alerts";
import Logs from "./pages/Logs";
import Scenarios from "./pages/Scenarios";
import FogNodes from "./pages/FogNodes";
import Settings from "./pages/Settings";
import Topology from "./pages/Topology";
import Users from "./pages/Users";
import Sidebar from "./components/Sidebar";
import AIChat from "./components/AIChat";
import LivePackets from "./pages/LivePackets";
import ToastNotifier from "./components/ToastNotifier";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [alerts, setAlerts] = useState(0);

  useEffect(() => {
    const s = localStorage.getItem("user");
    if (s) {
      try {
        setUser(JSON.parse(s));
      } catch {}
    }
    setReady(true);
  }, []);

  const login = (u) => {
    setUser(u);
    localStorage.setItem("user", JSON.stringify(u));
    localStorage.setItem("token", u.access_token);
  };
  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  const Layout = ({ children }) => {
    if (!ready) return null;
    if (!user) return <Navigate to="/login" />;
    return (
      <div
        style={{ display: "flex", minHeight: "100vh", background: "#020817" }}
      >
        <Sidebar user={user} onLogout={logout} alertCount={alerts} />
        <main
          style={{
            flex: 1,
            marginLeft: 260,
            minWidth: 0,
            padding: "24px 28px",
            overflowX: "hidden",
            transition: "margin-left .3s",
          }}
          className="bg-main"
        >
          {children}
          {/* Enterprise Footer */}
          <footer
            style={{
              marginTop: 32,
              paddingTop: 14,
              borderTop: "1px solid rgba(0,229,255,.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
                  color: "rgba(123,145,176,.3)",
                }}
              >
                LightGuard IDS v3.0
              </span>
              <span style={{ color: "rgba(123,145,176,.2)" }}>·</span>
              <span style={{ fontSize: 10, color: "rgba(0,229,255,.35)" }}>
                Detection Engine Active
              </span>
              <span style={{ color: "rgba(123,145,176,.2)" }}>·</span>
              <span style={{ fontSize: 10, color: "rgba(0,255,157,.35)" }}>
                Fernet Encrypted
              </span>
            </div>
            <span
              style={{
                fontSize: 9,
                fontFamily: "JetBrains Mono",
                color: "rgba(123,145,176,.2)",
              }}
            >
              Tadhamon Smart City · MEC 2025–2026
            </span>
          </footer>
        </main>
        <AIChat />
      </div>
    );
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" /> : <Login onLogin={login} />}
        />
        <Route
          path="/"
          element={
            <Layout>
              <Dashboard user={user} />
            </Layout>
          }
        />
        <Route
          path="/devices"
          element={
            <Layout>
              <Devices user={user} />
            </Layout>
          }
        />
        <Route
          path="/scenarios"
          element={
            <Layout>
              <Scenarios user={user} />
            </Layout>
          }
        />
        <Route
          path="/alerts"
          element={
            <Layout>
              <Alerts user={user} />
            </Layout>
          }
        />
        <Route
          path="/logs"
          element={
            <Layout>
              <Logs user={user} />
            </Layout>
          }
        />
        <Route
          path="/fog-nodes"
          element={
            <Layout>
              <FogNodes user={user} />
            </Layout>
          }
        />
        <Route
          path="/topology"
          element={
            <Layout>
              <Topology user={user} />
            </Layout>
          }
        />
        <Route
          path="/users"
          element={
            <Layout>
              <Users user={user} />
            </Layout>
          }
        />
        <Route
          path="/settings"
          element={
            <Layout>
              <Settings user={user} />
            </Layout>
          }
        />
        <Route
          path="/live-packets"
          element={
            <Layout>
              <LivePackets user={user} />
            </Layout>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <ToastNotifier />
    </Router>
  );
}
