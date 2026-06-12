#!/usr/bin/env python3
"""
Start the LightGuard Fog Node simulation server on port 8001.

Usage:
    python start_fog_node.py

The fog node simulates distributed edge processing for Tadhamon Smart City zones.
It runs independently of the main LightGuard server (port 8000).
"""
import os
import sys

# Ensure project root is in path so backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv("config/lightguard.env")

import uvicorn

if __name__ == "__main__":
    print("=" * 60)
    print("  LightGuard Fog Node — Tadhamon Smart City")
    print("  Port : 8001")
    print("  Main : http://localhost:8000")
    print("=" * 60)
    uvicorn.run(
        "backend.fog.fog_node:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info",
    )
