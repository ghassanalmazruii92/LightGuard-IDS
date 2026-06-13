import HoverHint from "../components/HoverHint";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  SlidersHorizontal,
  Cpu,
  Lock,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  QrCode,
} from "lucide-react";
import api from "../lib/api";

const Settings = ({ user }) => {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingModel, setSavingModel] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const isAdmin = user?.role === "admin";
  const [mfaStep, setMfaStep] = useState("idle"); // idle | loading | scanned | verifying | done | error
  const [mfaQR, setMfaQR] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMsg, setMfaMsg] = useState("");
  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/detection-config");
      setConfig(res.data);
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const switchModel = async (modelName) => {
    if (!isAdmin) return;
    setSavingModel(true);
    setSaveResult(null);
    try {
      await api.patch("/api/detection-config/model", { model: modelName });
      setConfig((prev) => ({ ...prev, active_model: modelName }));
      setSaveResult({ ok: true, message: `Model switched to ${modelName}` });
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err.response?.data?.detail || "Failed to switch model",
      });
    } finally {
      setSavingModel(false);
      setTimeout(() => setSaveResult(null), 4000);
    }
  };

  const handleMFASetup = async () => {
    setMfaStep("loading");
    setMfaMsg("");
    try {
      const res = await api.post("/auth/mfa/setup");
      setMfaQR(res.data.qr_code_png_base64);
      setMfaSecret(res.data.secret);
      setMfaStep("scanned");
    } catch (err) {
      setMfaMsg(err.response?.data?.detail || "Failed to generate QR code.");
      setMfaStep("error");
    }
  };

  const handleMFAVerify = async () => {
    if (mfaCode.length !== 6) return;
    setMfaStep("verifying");
    setMfaMsg("");
    try {
      await api.post("/auth/mfa/verify", { totp_code: mfaCode });
      setMfaMsg("MFA enabled successfully!");
      setMfaStep("done");
    } catch (err) {
      setMfaMsg(err.response?.data?.detail || "Invalid code. Try again.");
      setMfaStep("error");
    }
  };

  const activeModel = config.active_model || "randomforest";
  const threshold = parseFloat(config.anomaly_threshold || "75.0").toFixed(1);
  const fpRate =
    config.last_fp_rate && config.last_fp_rate !== "N/A"
      ? `${config.last_fp_rate}%`
      : "N/A";
  const lastTuned =
    config.last_tuned && config.last_tuned !== "Never"
      ? new Date(config.last_tuned).toLocaleString("en-US")
      : "Pending first cycle";

  return (
    <div className="p-6 space-y-6 max-w-3xl page-enter">
      <div>
        <h1 className="page-title text-title-grad">System Settings</h1>
        <p className="text-text/50 text-sm mt-1">
          Detection engine configuration — LightGuard IDS
        </p>
      </div>

      {/* Detection Model Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center space-x-3">
          <Cpu className="w-5 h-5 text-accent" />
          <div>
            <div className="font-bold">Detection Model</div>
            <div className="text-xs text-text/50">
              Switch between the RandomForest and TFLite (edge-optimised) model
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="animate-pulse h-20 bg-background rounded-lg" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: "randomforest",
                    label: "RandomForest",
                    desc: "Scikit-learn ensemble model trained on NSL-KDD. Best accuracy for server-side detection.",
                    badge: "Standard",
                  },
                  {
                    id: "tflite",
                    label: "TFLite",
                    desc: "Lightweight neural network converted to TensorFlow Lite. Optimised for fog/edge nodes.",
                    badge: "Edge",
                  },
                ].map((m) => {
                  const isActive = activeModel === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => !isActive && switchModel(m.id)}
                      disabled={!isAdmin || savingModel || isActive}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        isActive
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50 hover:bg-card"
                      } disabled:cursor-default`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">{m.label}</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[9px] px-1.5 py-0.5 bg-background border border-border rounded uppercase tracking-wider font-bold text-text/50">
                            {m.badge}
                          </span>
                          {isActive && (
                            <CheckCircle className="w-4 h-4 text-accent" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-text/50">{m.desc}</p>
                    </button>
                  );
                })}
              </div>

              {!isAdmin && (
                <p className="text-xs text-text/40 flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>
                    Admin access required to change the detection model.
                  </span>
                </p>
              )}

              {saveResult && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-center space-x-2 text-sm p-3 rounded-lg border ${
                    saveResult.ok
                      ? "bg-low/10 border-low/30 text-low"
                      : "bg-critical/10 border-critical/30 text-critical"
                  }`}
                >
                  {saveResult.ok ? (
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{saveResult.message}</span>
                </motion.div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Adaptive Optimizer Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center space-x-3">
          <SlidersHorizontal className="w-5 h-5 text-accent" />
          <div>
            <div className="font-bold">Adaptive Optimization Engine</div>
            <div className="text-xs text-text/50">
              Auto-tunes anomaly threshold every 30 minutes based on false
              positive feedback
            </div>
          </div>
          <button
            onClick={fetchConfig}
            className="ml-auto p-1.5 text-text/40 hover:text-text transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-background rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-accent">{threshold}%</div>
              <div className="text-[10px] text-text/50 uppercase tracking-wider mt-1">
                Anomaly Threshold
              </div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-medium">{fpRate}</div>
              <div className="text-[10px] text-text/50 uppercase tracking-wider mt-1">
                False Positive Rate
              </div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center">
              <div className="text-sm font-bold text-text/70">{lastTuned}</div>
              <div className="text-[10px] text-text/50 uppercase tracking-wider mt-1">
                Last Tuned
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-text/40 space-y-1">
            <div className="flex items-center space-x-2">
              <ChevronRight className="w-3.5 h-3.5 text-high" />
              <span>
                FP rate {">"} 20% → raise threshold by 5% (reduce sensitivity)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <ChevronRight className="w-3.5 h-3.5 text-low" />
              <span>
                FP rate {"<"} 5% → lower threshold by 5% (increase sensitivity)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <ChevronRight className="w-3.5 h-3.5 text-text/30" />
              <span>
                Mark alerts as False Positive in the Alerts page to feed this
                engine
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Encryption Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center space-x-3">
          <Lock className="w-5 h-5 text-low" />
          <div>
            <div className="font-bold">Data Encryption at Rest</div>
            <div className="text-xs text-text/50">
              Alert payload data is encrypted with AES-128 (Fernet) before being
              stored in the database
            </div>
          </div>
          <div className="ml-auto px-3 py-1 bg-low/10 text-low rounded-full text-xs font-bold">
            Active
          </div>
        </div>
        <div className="p-5 text-xs text-text/50 space-y-2">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-3.5 h-3.5 text-low" />
            <span>Fernet symmetric encryption (cryptography library)</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-3.5 h-3.5 text-low" />
            <span>
              Key auto-generated and stored in{" "}
              <code className="font-mono bg-background px-1 rounded">
                config/lightguard.env
              </code>
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-3.5 h-3.5 text-low" />
            <span>
              Legacy unencrypted rows are decoded gracefully (backward
              compatible)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-3.5 h-3.5 text-low" />
            <span>For HTTPS: see README → HTTPS Setup section</span>
          </div>
        </div>
      </motion.div>
      {/* MFA Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center space-x-3">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <div>
            <div className="font-bold">Two-Factor Authentication (MFA)</div>
            <div className="text-xs text-text/50">
              Protect your account with a TOTP authenticator app (Google
              Authenticator, Authy)
            </div>
          </div>
          {mfaStep === "done" && (
            <div className="ml-auto px-3 py-1 bg-low/10 text-low rounded-full text-xs font-bold">
              Enabled
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Step idle — show setup button */}
          {(mfaStep === "idle" || mfaStep === "error") && (
            <div className="space-y-3">
              <p className="text-xs text-text/50">
                Click the button below to generate a QR code. Scan it with your
                authenticator app, then enter the 6-digit code to confirm.
              </p>
              <button
                onClick={handleMFASetup}
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-xs font-bold rounded-lg transition-colors"
              >
                <QrCode className="w-4 h-4" />
                Generate QR Code
              </button>
              {mfaStep === "error" && mfaMsg && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {mfaMsg}
                </p>
              )}
            </div>
          )}

          {/* Step loading */}
          {mfaStep === "loading" && (
            <div className="animate-pulse h-10 bg-background rounded-lg" />
          )}

          {/* Step scanned — show QR + input */}
          {(mfaStep === "scanned" || mfaStep === "verifying") && (
            <div className="space-y-4">
              <p className="text-xs text-text/50">
                Scan this QR code with Google Authenticator or Authy, then enter
                the 6-digit code below.
              </p>
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${mfaQR}`}
                  alt="MFA QR Code"
                  className="w-44 h-44 rounded-lg border border-border"
                />
              </div>
              <div className="text-center">
                <p className="text-xs text-text/30 mb-1">Manual entry key:</p>
                <code className="text-xs font-mono bg-background px-2 py-1 rounded text-accent">
                  {mfaSecret}
                </code>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold tracking-widest text-text/40 uppercase">
                  6-Digit Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  className="input-glass w-full text-center text-xl tracking-[10px] font-mono"
                />
              </div>
              <button
                onClick={handleMFAVerify}
                disabled={mfaCode.length !== 6 || mfaStep === "verifying"}
                className="w-full px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
              >
                {mfaStep === "verifying"
                  ? "VERIFYING…"
                  : "CONFIRM & ENABLE MFA →"}
              </button>
              {mfaMsg && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {mfaMsg}
                </p>
              )}
            </div>
          )}

          {/* Step done */}
          {mfaStep === "done" && (
            <div className="flex items-center gap-3 p-3 bg-low/10 border border-low/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-low flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-low">
                  MFA successfully enabled
                </p>
                <p className="text-xs text-text/50 mt-0.5">
                  Your account is now protected. You will be asked for a TOTP
                  code on every login.
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · Fernet Encrypted ·
        Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
};

export default Settings;
