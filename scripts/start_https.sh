#!/bin/bash
# LightGuard HTTPS Startup — generates TLS cert then starts Uvicorn with SSL
set -e
SSL_DIR="ssl"
CERT="$SSL_DIR/cert.pem"
KEY="$SSL_DIR/key.pem"
mkdir -p "$SSL_DIR"
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[LightGuard] Generating TLS certificate..."
    if command -v mkcert &>/dev/null; then
        mkcert -install
        mkcert -cert-file "$CERT" -key-file "$KEY" localhost 127.0.0.1 ::1
        echo "[LightGuard] mkcert certificate generated"
    else
        openssl req -x509 -newkey rsa:4096 -keyout "$KEY" -out "$CERT" \
            -days 365 -nodes \
            -subj "/C=OM/ST=Muscat/L=Muscat/O=LightGuard/CN=localhost"
        echo "[LightGuard] Self-signed certificate generated"
    fi
fi
echo "[LightGuard] Starting HTTPS on https://localhost:8000"
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 \
    --ssl-certfile "../$CERT" --ssl-keyfile "../$KEY" --reload
