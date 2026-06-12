#!/usr/bin/env python3
"""
LightGuard IDS — One-Click Startup Script
=========================================
Usage:
  python3 run.py              # Mock mode (default, no GNS3 needed)
  python3 run.py --real       # Real mode (requires GNS3 running)
  python3 run.py --port 9000  # Custom port
  python3 run.py --reload     # Auto-reload on code changes (dev)
"""
import sys, os, argparse

ROOT    = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")

for p in (BACKEND, ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

# ── Load config/lightguard.env ──────────────────────────────────────────────
env_file = os.path.join(ROOT, "config", "lightguard.env")
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"'))

# ── CLI args ────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser(description="LightGuard IDS Startup")
p.add_argument("--host",   default="0.0.0.0",   help="Bind host (default: 0.0.0.0)")
p.add_argument("--port",   type=int, default=8000, help="Port (default: 8000)")
p.add_argument("--reload", action="store_true",  help="Auto-reload on file change")
p.add_argument("--real",   action="store_true",  help="GNS3 real network mode")
args = p.parse_args()

# ── Environment setup ────────────────────────────────────────────────────────
if args.real:
    # Real GNS3 mode: scan actual Tadhamon VLANs, longer interval to not flood
    os.environ["MOCK_MODE"]     = "false"
    os.environ["NETWORK_CIDR"]  = "192.168.99.0/24"   # Start with Control Center VLAN
    os.environ["SCAN_INTERVAL"] = "300"                # 5 min between scans
else:
    # Mock mode: no packet capture, no network scanning — safe for demo
    os.environ["MOCK_MODE"]     = "true"
    os.environ["NETWORK_CIDR"]  = "192.168.99.0/24"   # Small subnet = fast startup
    os.environ["SCAN_INTERVAL"] = "3600"               # Only scan once per hour

# ── Banner ───────────────────────────────────────────────────────────────────
mode_str = "REAL (GNS3)" if args.real else "MOCK (Demo)"
print()
print("╔══════════════════════════════════════════════════════════╗")
print("║        LightGuard IDS — Tadhamon Smart City             ║")
print("╠══════════════════════════════════════════════════════════╣")
print(f"║  Dashboard  →  http://localhost:{args.port:<5}                  ║")
print(f"║  API Docs   →  http://localhost:{args.port}/docs           ║")
print(f"║  Mode       →  {mode_str:<42}║")
print("║                                                          ║")
print("║  Login: admin / lightguard123                           ║")
print("╚══════════════════════════════════════════════════════════╝")
print()

# ── Start ─────────────────────────────────────────────────────────────────────
import uvicorn
uvicorn.run(
    "main:app",
    host=args.host,
    port=args.port,
    reload=args.reload,
    log_level="info",
)
