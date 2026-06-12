import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  Lock,
  User,
  AlertCircle,
  EyeOff,
  Activity,
  Wifi,
  Shield,
} from "lucide-react";
import api from "../lib/api";

function CyberCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let W = (c.width = window.innerWidth),
      H = (c.height = window.innerHeight);
    const onResize = () => {
      W = c.width = window.innerWidth;
      H = c.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    const pts = Array.from({ length: 90 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.2 + 0.4,
    }));
    let raf,
      t = 0;
    const draw = () => {
      t += 0.005;
      ctx.fillStyle = "rgba(2,8,23,.14)";
      ctx.fillRect(0, 0, W, H);
      /* hex grid */
      const s = 55;
      for (let row = 0; row < H / s + 2; row++)
        for (let col = 0; col < W / s + 2; col++) {
          const hx = col * s + (row % 2) * s * 0.5,
            hy = row * s * 0.866;
          const alpha = 0.02 + 0.015 * Math.sin(t + hx * 0.007 + hy * 0.007);
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k;
            ctx.lineTo(hx + s * 0.5 * Math.cos(a), hy + s * 0.5 * Math.sin(a));
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(0,180,255,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      /* particles */
      pts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      });
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x,
            dy = pts[i].y - pts[j].y,
            d = Math.sqrt(dx * dx + dy * dy);
          if (d < 80) {
            ctx.strokeStyle = `rgba(0,229,255,${0.1 * (1 - d / 80)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        const a = 0.3 + 0.3 * Math.sin(t * 2 + i);
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,255,${a})`;
        ctx.fill();
      }
      /* Scan line */
      const sy = ((t * 50) % (H + 100)) - 50;
      const sg = ctx.createLinearGradient(0, sy, 0, sy + 50);
      sg.addColorStop(0, "transparent");
      sg.addColorStop(0.5, "rgba(0,229,255,.025)");
      sg.addColorStop(1, "transparent");
      ctx.fillStyle = sg;
      ctx.fillRect(0, sy, W, 50);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");

  const STEPS = [
    "VERIFYING CREDENTIALS…",
    "LOADING CLEARANCE LEVEL…",
    "ESTABLISHING SECURE TUNNEL…",
    "ACCESS GRANTED",
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    let si = 0;
    const iv = setInterval(() => {
      setStep(STEPS[si] || STEPS[0]);
      si++;
    }, 480);
    try {
      const p = new URLSearchParams();
      p.append("username", username);
      p.append("password", password);
      const res = await api.post("/auth/login", p, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      clearInterval(iv);
      if (res.data.mfa_required) {
        setTempToken(res.data.temp_token);
        setMfaRequired(true);
        setStep("");
      } else {
        setStep("ACCESS GRANTED");
        setTimeout(() => {
          onLogin({ ...res.data, username });
          navigate("/", { replace: true });
        }, 650);
      }
    } catch (err) {
      clearInterval(iv);
      setStep("");
      setError(err.response?.data?.detail || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleMFASubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login/verify", {
        temp_token: tempToken,
        totp_code: totpCode,
      });
      setStep("ACCESS GRANTED");
      setTimeout(() => {
        onLogin({ ...res.data, username });
        navigate("/", { replace: true });
      }, 650);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid MFA code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020817",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <CyberCanvas />
      {/* Glow orbs */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "20%",
          width: 600,
          height: 600,
          background:
            "radial-gradient(circle,rgba(0,90,255,.055) 0%,transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "20%",
          right: "20%",
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle,rgba(157,92,255,.04) 0%,transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Status bar */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 460,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "7px 16px",
            background: "rgba(6,16,31,.85)",
            border: "1px solid rgba(0,229,255,.1)",
            borderRadius: 14,
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { icon: Activity, l: "IDS ACTIVE", c: "#00FF9D" },
              { icon: Wifi, l: "SECURE", c: "#00E5FF" },
              { icon: Shield, l: "FOG ONLINE", c: "#9D5CFF" },
            ].map(({ icon: Icon, l, c }) => (
              <div
                key={l}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <Icon style={{ width: 10, height: 10, color: c }} />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".14em",
                    color: c,
                  }}
                >
                  {l}
                </span>
              </div>
            ))}
          </div>
          <span
            style={{
              fontSize: 9,
              fontFamily: "JetBrains Mono",
              color: "rgba(123,145,176,.4)",
            }}
          >
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Login card — 460px width per spec */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 460,
        }}
      >
        {/* Corner brackets */}
        {[
          { t: -9, l: -9, bt: "borderTop", bl: "borderLeft" },
          { t: -9, r: -9, bt: "borderTop", bl: "borderRight" },
          { b: -9, l: -9, bt: "borderBottom", bl: "borderLeft" },
          { b: -9, r: -9, bt: "borderBottom", bl: "borderRight" },
        ].map((pos, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 22,
              height: 22,
              ...Object.fromEntries(
                Object.entries(pos)
                  .filter(([k]) => !["bt", "bl"].includes(k))
                  .map(([k, v]) => [
                    k === "t"
                      ? "top"
                      : k === "b"
                        ? "bottom"
                        : k === "l"
                          ? "left"
                          : "right",
                    v,
                  ]),
              ),
              [pos.bt]: "2px solid rgba(0,229,255,.55)",
              [pos.bl]: "2px solid rgba(0,229,255,.55)",
              borderRadius: 3,
            }}
          />
        ))}

        <div
          style={{
            background:
              "linear-gradient(155deg,rgba(2,8,23,.98),rgba(5,11,24,1))",
            border: "1px solid rgba(0,229,255,.14)",
            borderRadius: 22,
            padding: "36px 40px",
            boxShadow:
              "0 36px 90px rgba(0,0,0,.85),0 0 70px rgba(0,229,255,.03)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "14%",
              right: "14%",
              height: "1px",
              background:
                "linear-gradient(90deg,transparent,rgba(0,229,255,.55),rgba(0,157,255,.38),transparent)",
            }}
          />

          {/* Logo area */}
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div
              style={{
                position: "relative",
                display: "inline-block",
                marginBottom: 18,
              }}
            >
              <div
                className="animate-spin-slow"
                style={{
                  position: "absolute",
                  inset: -12,
                  borderRadius: "50%",
                  border: "1.5px solid transparent",
                  borderTopColor: "rgba(0,229,255,.6)",
                  borderRightColor: "rgba(157,92,255,.3)",
                }}
              />
              <div
                className="animate-spin-rev"
                style={{
                  position: "absolute",
                  inset: -5,
                  borderRadius: "50%",
                  border: "1px dashed rgba(0,229,255,.18)",
                }}
              />
              <div
                className="animate-float"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 22,
                  background:
                    "linear-gradient(145deg,rgba(0,65,160,.65),rgba(0,15,55,.92))",
                  border: "1px solid rgba(0,229,255,.42)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 30px rgba(0,229,255,.18)",
                }}
              >
                <Eye
                  style={{
                    width: 34,
                    height: 34,
                    color: "#00E5FF",
                    filter: "drop-shadow(0 0 8px rgba(0,229,255,.95))",
                  }}
                />
              </div>
              <div
                className="animate-ping"
                style={{
                  position: "absolute",
                  inset: -5,
                  borderRadius: 25,
                  border: "1px solid rgba(0,229,255,.16)",
                  animationDuration: "2.8s",
                }}
              />
            </div>
            <h1
              className="font-display"
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "2px",
                margin: "0 0 6px",
                background:
                  "linear-gradient(135deg,#fff 0%,#B8D4FF 45%,#00E5FF 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              LIGHTGUARD
            </h1>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "2.5px",
                color: "rgba(0,200,255,.42)",
                textTransform: "uppercase",
                margin: "0 0 18px",
                fontWeight: 600,
              }}
            >
              Tadhamon Smart City · Intrusion Detection System
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background:
                    "linear-gradient(90deg,transparent,rgba(0,100,255,.28))",
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(0,200,255,.32)",
                  letterSpacing: ".22em",
                }}
              >
                USER AUTHENTICATION
              </span>
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background:
                    "linear-gradient(90deg,rgba(0,100,255,.28),transparent)",
                }}
              />
            </div>
          </div>

          {/* Auth step indicator */}
          {loading && step && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 16px",
                background: "rgba(0,229,255,.04)",
                border: "1px solid rgba(0,229,255,.16)",
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(0,229,255,.3)",
                    borderTopColor: "#00E5FF",
                    borderRadius: "50%",
                    animation: "spin-slow .5s linear infinite",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "JetBrains Mono",
                    color: "#00E5FF",
                    letterSpacing: ".08em",
                  }}
                >
                  {step}
                </span>
              </div>
              <div
                style={{
                  height: 2,
                  background: "rgba(0,50,120,.5)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: "65%",
                    background: "linear-gradient(90deg,#009DFF,#00E5FF)",
                    borderRadius: 2,
                    boxShadow: "0 0 8px rgba(0,229,255,.55)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 16px",
                background: "rgba(255,61,113,.06)",
                border: "1px solid rgba(255,61,113,.2)",
                borderRadius: 12,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <AlertCircle
                style={{
                  width: 15,
                  height: 15,
                  color: "#FF3D71",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#FF3D71",
                    letterSpacing: ".1em",
                    margin: "0 0 3px",
                  }}
                >
                  ACCESS DENIED
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(252,165,165,.8)",
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* MFA Step */}
          {mfaRequired && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginBottom: 8,
              }}
            >
              <div style={{ textAlign: "center", marginBottom: 6 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".18em",
                    color: "rgba(0,229,255,.7)",
                    margin: "0 0 4px",
                  }}
                >
                  TWO-FACTOR AUTHENTICATION
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(123,145,176,.6)",
                    margin: 0,
                  }}
                >
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".18em",
                    color: "rgba(0,180,255,.42)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  TOTP CODE
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  className="input-glass"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: 22,
                    letterSpacing: "10px",
                    fontFamily: "JetBrains Mono",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleMFASubmit}
                disabled={loading || totpCode.length !== 6}
                className="btn-cyber"
                style={{ marginTop: 4, width: "100%" }}
              >
                {loading ? "VERIFYING…" : "VERIFY CODE →"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaRequired(false);
                  setTotpCode("");
                  setTempToken("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(123,145,176,.4)",
                  fontSize: 11,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                ← Back to login
              </button>
            </div>
          )}

          {/* Form */}
          {!mfaRequired && (
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".18em",
                    color: "rgba(0,180,255,.42)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  OPERATOR ID
                </label>
                <div style={{ position: "relative" }}>
                  <User
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 15,
                      height: 15,
                      color: "rgba(0,180,255,.42)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="admin"
                    className="input-glass"
                    style={{ width: "100%", paddingLeft: 44 }}
                  />
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".18em",
                    color: "rgba(0,180,255,.42)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  ACCESS CODE
                </label>
                <div style={{ position: "relative" }}>
                  <Lock
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 15,
                      height: 15,
                      color: "rgba(0,180,255,.42)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="input-glass"
                    style={{ width: "100%", paddingLeft: 44, paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "rgba(123,145,176,.4)",
                      transition: "color .2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "rgba(0,229,255,.7)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "rgba(123,145,176,.4)")
                    }
                  >
                    {showPw ? (
                      <EyeOff style={{ width: 15, height: 15 }} />
                    ) : (
                      <Eye style={{ width: 15, height: 15 }} />
                    )}
                  </button>
                </div>
              </div>
              {/* Login button — 52px height per spec */}
              <button
                type="submit"
                disabled={loading}
                className="btn-cyber"
                style={{ marginTop: 8, width: "100%" }}
              >
                {loading ? "PROCESSING…" : "AUTHENTICATE →"}
              </button>
            </form>
          )}

          {/* Secure auth feedback */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid rgba(0,100,255,.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              {["SECURE", "ENCRYPTED", "REAL-TIME"].map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: ".14em",
                    color: "rgba(0,150,255,.2)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#00FF9D",
                  boxShadow: "0 0 5px rgba(0,255,157,.7)",
                  animation: "pulse 2s infinite",
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(0,255,157,.5)",
                  letterSpacing: ".1em",
                }}
              >
                SECURE AUTHENTICATION
              </span>
            </div>
          </div>
          <p
            style={{
              textAlign: "center",
              marginTop: 10,
              fontSize: 10,
              fontFamily: "JetBrains Mono",
              color: "rgba(123,145,176,.22)",
            }}
          >
            admin / lightguard123
          </p>
        </div>
      </div>
    </div>
  );
}
